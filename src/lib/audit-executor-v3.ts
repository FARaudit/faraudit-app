// AGENTIC V3 PRIMARY — the graduated engine OWNS the entire customer report.
//
// When AUDIT_AGENTIC_V3_PRIMARY=true, executeAudit early-returns into THIS
// function and V1's runAudit never executes ("V1 retired here"). Fully
// self-contained so the legacy path carries zero risk: build one fullSource
// string from the intake docs → run the proven auditPackage engine → map its
// GATE verdict onto the columns the list/email read → persist the engine's
// grounded output under compliance_json.v3 with an `engine:"agentic_v3"` marker
// the report + PDF routes branch on. Honest-fail (INCOMPLETE / NEEDS_HUMAN_REVIEW)
// is surfaced transparently as the verdict — never a false green. Two flags carry
// completeness to the consumers that gate on it: compliance_json.honest_fail and
// compliance_json.documents_complete are read by shouldGateExport (blocks PDF/web
// export of an incomplete report). The watcher email ALSO fails safe to amber on
// these flags (defense-in-depth) — but note the watcher AUTO-AUDIT currently runs the
// LEGACY V1 engine (watcher-tick.ts → runAudit), NOT this agentic path, so it does not
// yet set these flags; the amber-forcing activates only if the watcher is migrated to
// executeAgenticPrimary. The customer-initiated sync + worker paths DO run this engine.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditExecutionInput, AuditExecutionResult } from "./audit-executor";
import { buildAgenticDocs, assembleFullSourceBudgeted } from "./agentic-executor";
import { auditPackage } from "./audit-package";
import { buildV3Payload } from "./audit-v3-report";
import type { IngestionMeta } from "./sam-attachments";

/** The agentic V3 engine is the SOLE engine. V1/V2 are DELETED (2026-06-28) — there is no
 *  fallback path in the code at all, and no env flag can switch engines. `executeAudit` calls
 *  `executeAgenticPrimary` unconditionally. This constant stays only because the report route +
 *  worker gate the bidder-profile fetch on it; it is permanently `true`. The old
 *  AUDIT_AGENTIC_V3 / AUDIT_AGENTIC_V3_PRIMARY / AUDIT_LEGACY_FALLBACK env vars are inert and
 *  may be removed from the deployment. */
export const AGENTIC_V3_PRIMARY_ENABLED = true;
console.log("[ENGINE] agentic V3 is the SOLE engine (V1/V2 deleted; no fallback).");

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

/** Pre-run manifest-completeness for the VERDICT cap (limit N8 + the null-SAM false-green
 *  BLOCKER the panel caught). MUST agree with the documents-path completeness below, else
 *  the verdict column + watcher email go green while the report banner says "partial":
 *   • truncation (whole docs dropped)        → false (incomplete);
 *   • manifest present                       → complete iff every posted doc ingested + no overflow;
 *   • null ingestion + SAM sol               → false (manifest assembly FAILED → single-doc fallback);
 *   • null ingestion + genuine upload        → true  (user supplied the docs; no manifest expected). */
export function agenticManifestComplete(
  ingestion: IngestionMeta | null | undefined,
  truncated: boolean,
  isSamSol: boolean,
): boolean {
  if (truncated) return false;
  if (ingestion) return ingestion.files_total > 0 && ingestion.files_ingested >= ingestion.files_total && !ingestion.overflow;
  return !isSamSol;
}

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
  signal?: AbortSignal,
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
  // Budgeted assembly (limit N3/N4) — bounds a pathological multi-MB package by
  // dropping WHOLE overflow docs (named, never a silent mid-doc cut). `truncated`
  // feeds documents_complete=false below so an over-budget read is honest-incomplete.
  const assembled = assembleFullSourceBudgeted(docs);
  const fullSource = assembled.source;
  if (assembled.truncated) {
    console.warn(`[AGENTIC-V3-PRIMARY] ${auditId}: source over budget — kept ${assembled.keptDocs}/${docs.length} docs, dropped [${assembled.droppedDocs.join(", ")}] → documents_complete=false`);
  }
  if (fullSource.replace(/\s/g, "").length < 200) {
    // Nothing readable was ingested — honest hard-fail (no false report). Throw
    // so the worker routes it to a terminal 'failed' the report page exits to.
    throw new Error(`agentic engine: no readable source assembled (${fullSource.length} chars, ${docs.length} docs)`);
  }

  await markStage(supabase, auditId, "verdict");

  // GAP B — run the proven engine. bidderProfile is the firm's OPEN-WORLD capability
  // profile (N5; socioeconomic certs only) when the auditing user has a capability
  // statement, else null = unknown firm. Open-world means a listed cert can CLEAR a
  // matching set-aside bar, but silence never proves "fails" → never a false INELIGIBLE.
  const bidderProfile = input.bidderProfile ?? null;
  // A SAM solicitation (32-hex notice id) vs a genuine upload. Decisive for the cap below:
  // a null ingestion means OPPOSITE things for the two — upload = user supplied the docs
  // (complete); SAM = manifest assembly FAILED → single-doc fallback (INCOMPLETE).
  const isSamSol = !!solicitation?.noticeId && /^[a-f0-9]{32}$/i.test(solicitation.noticeId);
  // N8 — feed the DETERMINISTIC manifest-reconciliation truth into the VERDICT (not just
  // the post-hoc export gate). false → caps a no-bar BID/CAUTION to INCOMPLETE — the
  // engine's own honest output, never a confident verdict on a read it knows was partial.
  // This MUST match the documents-path completeness logic below (else the verdict column
  // and watcher email go green while the report banner says "partial" — the panel BLOCKER):
  //   • manifest present → complete only if every posted doc ingested + no overflow;
  //   • SAM sol, NO manifest → assembly failed → single-doc fallback → INCOMPLETE (!isSamSol=false);
  //   • genuine upload (no manifest expected) → complete (!isSamSol=true);
  //   • any over-budget truncation → INCOMPLETE.
  const manifestComplete = agenticManifestComplete(input.ingestion, assembled.truncated, isSamSol);
  const res = await auditPackage({ fullSource, bidderProfile, signal, manifestComplete });
  // If the overall budget aborted mid-run, never write a "complete" row — that late
  // write would overwrite the terminal-failed status the wrapper already set and strand
  // a half-finished verdict as if it were final. Reject so the worker's terminal path owns it.
  if (signal?.aborted) throw new Error("agentic engine aborted after verdict (overall budget) — not persisting a late-complete row");
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
  payload.documents = ing
    ? {
        // A 0-file manifest can't be reconciled — route it to the "not confirmed"
        // banner rather than the incoherent "read N of 0 documents" partial copy.
        reconciled: ing.files_total > 0,
        posted: ing.files_total,
        read: ing.files_ingested,
        complete: ing.files_total > 0 && ing.files_ingested >= ing.files_total && !ing.overflow,
        missing: (ing.files ?? []).filter((f) => !f.ingested).map((f) => ({ name: f.name, ...(f.reason ? { reason: f.reason } : {}) })),
        ...(ing.overflow ? { note: ing.overflow } : {}),
      }
    : isSamSol
      ? { reconciled: false, posted: docs.length, read: docs.length, complete: false, missing: [] }
      : null;
  // An over-budget source (whole docs dropped) is ALSO an incomplete read — fold it
  // in so documents_complete=false and the dropped docs surface in the report banner.
  if (assembled.truncated && payload.documents) {
    payload.documents.complete = false;
    for (const name of assembled.droppedDocs) payload.documents.missing.push({ name, reason: "dropped: source over size budget" });
  }
  const docsIncomplete = assembled.truncated || (!!payload.documents && (!payload.documents.reconciled || !payload.documents.complete));
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
      // document could not be ingested (the report flags it loudly). CEO 2026-06-28:
      // a partial package ALSO gates export (shouldGateExport reads this) — a report
      // we couldn't fully ground never leaves as a clean PDF.
      documents_complete: !docsIncomplete,
      generated_at: generatedAt,
      source_chars: fullSource.length,
      doc_count: docs.length,
      source_truncated: assembled.truncated,
      ...(assembled.droppedDocs.length ? { dropped_docs: assembled.droppedDocs } : {}),
      v3: payload,
    },
  };

  // Retry the persist in-process: the agentic run already SUCCEEDED (paid Opus/Sonnet
  // work). A transient DB blip must not discard a finished audit — retry the write
  // rather than fail the run (which would re-spend the engine on the worker's re-run).
  // Re-check the budget IMMEDIATELY before the persist write: the abort can fire during
  // the awaited markStage("assembly")/payload work above. Without this a run aborted at
  // ~270s could still write a "complete" row over the terminal-failed status (code-review #2).
  if (signal?.aborted) throw new Error("agentic engine aborted before persist (overall budget) — not writing a late-complete row");
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
