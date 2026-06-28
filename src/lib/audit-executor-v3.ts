// AGENTIC V3 PRIMARY — the graduated engine OWNS the entire customer report.
//
// When AUDIT_AGENTIC_V3_PRIMARY=true, executeAudit early-returns into THIS
// function and V1's runAudit never executes ("V1 retired here"). Fully
// self-contained so the legacy path carries zero risk: build one fullSource
// string from the intake docs → run the proven auditPackage engine → map its
// GATE verdict onto the columns the list/email read → persist the engine's
// grounded output under compliance_json.v3 with an `engine:"agentic_v3"` marker
// the report + PDF routes branch on. Honest-fail (INCOMPLETE / NEEDS_HUMAN_REVIEW)
// is surfaced transparently as the verdict — never a false green, flagged
// honest_fail so downstream billing can skip it.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditExecutionInput, AuditExecutionResult } from "./audit-executor";
import { buildAgenticDocs, assembleFullSource } from "./agentic-executor";
import { isEnvOn } from "./env-flags";
import { auditPackage } from "./audit-package";
import { buildV3Payload } from "./audit-v3-report";

/** Flag-gate — the agentic engine OWNS the report (V1 retired) only when set.
 *  Also requires AUDIT_AGENTIC_V3=true (auditPackage's own gate). */
export const AGENTIC_V3_PRIMARY_ENABLED = isEnvOn(process.env.AUDIT_AGENTIC_V3_PRIMARY);

// Two-flag dependency guard: PRIMARY routes audits into auditPackage, which itself
// hard-throws unless AUDIT_AGENTIC_V3=true. Setting one without the other would
// hard-fail EVERY audit at the engine gate — warn loudly at boot rather than let it
// surface only as per-audit failures.
if (AGENTIC_V3_PRIMARY_ENABLED && !isEnvOn(process.env.AUDIT_AGENTIC_V3)) {
  console.error("[AGENTIC-V3-PRIMARY] MISCONFIG: AUDIT_AGENTIC_V3_PRIMARY is ON but AUDIT_AGENTIC_V3 is OFF — every audit will hard-fail at the engine gate. Set AUDIT_AGENTIC_V3=true.");
}

/** Map the engine's GATE verdict onto the EXACT recommendation vocabulary V1 writes
 *  to the `audits.recommendation` column — PROCEED / PROCEED_WITH_CAUTION / DECLINE —
 *  so every downstream consumer (home dashboard pill, Past-Audits list, Telegram
 *  pipeline count, bidding kanban, watcher email) renders agentic verdicts correctly.
 *  (Using GO/CAUTION/DECLINE mis-rendered a BID as amber and dropped it from counts.)
 *  Honest-fail poles → PROCEED_WITH_CAUTION (non-committal; the report shows the true
 *  INCOMPLETE/NEEDS_HUMAN_REVIEW banner, and compliance_json.honest_fail is persisted). */
function verdictToRecommendation(v: string): "PROCEED" | "PROCEED_WITH_CAUTION" | "DECLINE" {
  switch (v) {
    case "BID": return "PROCEED";
    case "NO_BID":
    case "INELIGIBLE": return "DECLINE";
    default: return "PROCEED_WITH_CAUTION"; // BID_WITH_CAUTION · NEEDS_HUMAN_REVIEW · INCOMPLETE
  }
}

const HONEST_FAIL = new Set(["INCOMPLETE", "NEEDS_HUMAN_REVIEW"]);

async function markStage(supabase: SupabaseClient, auditId: string, stage: string): Promise<void> {
  try {
    await supabase.from("audits").update({ current_stage: stage, stage_updated_at: new Date().toISOString() }).eq("id", auditId);
  } catch { /* never block on a stage write */ }
}

export async function executeAgenticPrimary(
  supabase: SupabaseClient,
  auditId: string,
  input: AuditExecutionInput,
  solicitation: AuditExecutionInput["solicitation"],
  agency: string | null,
): Promise<AuditExecutionResult> {
  await markStage(supabase, auditId, "extraction");

  // GAP A — assemble the engine's single fullSource string from the intake docs
  // (primary + every attachment). Reuses the same extraction the shadow path uses.
  const primaryBytes = input.pdfBuffer ?? (input.pdfBase64 ? Buffer.from(input.pdfBase64, "base64") : null);
  const docs = await buildAgenticDocs({
    primaryName: input.primaryDocName ?? "primary solicitation",
    primaryBytes,
    primaryText: input.extractedText ?? null,
    attachments: input.attachmentPdfs?.map((a) => ({ name: a.name, base64: a.base64 })) ?? null,
  });
  const fullSource = assembleFullSource(docs);
  if (fullSource.replace(/\s/g, "").length < 200) {
    // Nothing readable was ingested — honest hard-fail (no false report). Throw
    // so the worker routes it to a terminal 'failed' the report page exits to.
    throw new Error(`agentic engine: no readable source assembled (${fullSource.length} chars, ${docs.length} docs)`);
  }

  await markStage(supabase, auditId, "verdict");

  // GAP B — run the proven engine. bidderProfile null = unknown firm (the live
  // customer path carries no firm attributes) → residual caution, never a blind bar.
  const res = await auditPackage({ fullSource, bidderProfile: null });
  const generatedAt = new Date().toISOString();
  const payload = buildV3Payload(res.decision, res.coverage, res.findings, generatedAt);

  // FAIL-SAFE — reconcile what we READ against SAM's posted manifest (input.ingestion,
  // carried by both the sync route and the worker). The deterministic "all files
  // fetched" guarantee the report surfaces. THREE cases, none silent:
  //   • manifest present  → reconcile; complete only when every posted doc was read,
  //                         else the missing files are named loudly.
  //   • SAM sol, NO manifest → manifest-assembly failed and we fell back to a single
  //                         document; we CANNOT claim completeness → reconciled:false,
  //                         a loud "could not confirm the full set" banner (this was the
  //                         silent-partial hole the panel caught).
  //   • genuine upload    → no SAM manifest expected → no banner (null).
  const ing = input.ingestion;
  const isSamSol = !!solicitation?.noticeId && /^[a-f0-9]{32}$/i.test(solicitation.noticeId);
  payload.documents = ing
    ? {
        reconciled: true,
        posted: ing.files_total,
        read: ing.files_ingested,
        complete: ing.files_total > 0 && ing.files_ingested >= ing.files_total && !ing.overflow,
        missing: (ing.files ?? []).filter((f) => !f.ingested).map((f) => ({ name: f.name, ...(f.reason ? { reason: f.reason } : {}) })),
        ...(ing.overflow ? { note: ing.overflow } : {}),
      }
    : isSamSol
      ? { reconciled: false, posted: docs.length, read: docs.length, complete: false, missing: [] }
      : null;
  const docsIncomplete = !!payload.documents && (!payload.documents.reconciled || !payload.documents.complete);
  const recommendation = verdictToRecommendation(res.decision.verdict);
  const honestFail = HONEST_FAIL.has(res.decision.verdict);

  await markStage(supabase, auditId, "assembly");

  // GAP C+D — persist into the columns the report + list read. compliance_score
  // stays NULL (the engine emits no 0-100 score — the report page already has an
  // unscored path). The report + PDF routes branch on compliance_json.engine.
  const stopperCount = (payload.showStoppers.length ? payload.showStoppers : payload.findings.filter((f) => f.disposition === "disqualifying")).length;
  const completeUpdate = {
    overview_summary: `Agentic verdict: ${res.decision.verdict.replace(/_/g, " ")}.`,
    overview_json: { engine: "agentic_v3" },
    compliance_summary: res.decision.reason.slice(0, 600),
    risks_summary: stopperCount ? `${stopperCount} show-stopper bar(s) drive this verdict.` : "No non-curable bars found.",
    risks_json: { engine: "agentic_v3", show_stoppers: stopperCount },
    compliance_score: null,
    recommendation,
    bid_recommendation: res.decision.reason.slice(0, 600),
    status: "complete",
    current_stage: "assembly",
    completed_at: generatedAt,
    compliance_json: {
      engine: "agentic_v3",
      analysis_phase: "done",
      honest_fail: honestFail,
      // Deterministic manifest-reconciliation flag — false when a posted SAM
      // document could not be ingested (the report flags it loudly; whether a
      // partial package should also cap the verdict/charge is a domain decision).
      documents_complete: !docsIncomplete,
      generated_at: generatedAt,
      source_chars: fullSource.length,
      doc_count: docs.length,
      v3: payload,
    },
  };

  // Retry the persist in-process: the agentic run already SUCCEEDED (paid Opus/Sonnet
  // work). A transient DB blip must not discard a finished audit — retry the write
  // rather than fail the run (which would re-spend the engine on the worker's re-run).
  let persistErr: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.from("audits").update(completeUpdate).eq("id", auditId);
    if (!error) { persistErr = null; break; }
    persistErr = error.message;
    console.warn(`[AGENTIC-V3-PRIMARY] persist attempt ${attempt}/3 failed for ${auditId}: ${error.message}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
  }
  if (persistErr) throw new Error(`agentic persist failed after 3 attempts: ${persistErr}`);
  console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: verdict=${res.decision.verdict} → recommendation=${recommendation} honest_fail=${honestFail} docs_complete=${!docsIncomplete} (${payload.documents?`${payload.documents.read}/${payload.documents.posted}`:"n/a"}) findings=${res.findings.length} src=${(fullSource.length / 1024).toFixed(0)}KB`);

  return { recommendation, compliance_score: null, bid_recommendation: completeUpdate.bid_recommendation };
}
