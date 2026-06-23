// FA-116 — shared audit execution core.
//
// Extracted verbatim from src/app/api/audit/route.ts's try-block so the sync
// route and the resident audit-worker run the IDENTICAL pipeline: V1 3-call
// engine → persist complete → V2 shadow (inline-bytes or metadata-only,
// errors swallowed) → best-effort corpus inserts. Any future change to audit
// persistence lands in both consumers automatically — the alternative
// (worker re-implementing the block) is the V2-drift class that bit
// agents/audit-ai/audit-engine.ts (vendored copy lacks runAuditV2).
//
// Error contract:
//   - Engine/SAM/content errors THROW — caller marks the audits row failed.
//   - The complete-update persist failure throws AuditPersistError — the sync
//     route preserves its historical behavior (500 with auditId, row left in
//     'processing'); the worker treats it like any failure.
//   - V2 shadow + corpus failures are swallowed (parity with route).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSolicitationByNoticeId, type Solicitation } from "@/lib/sam";
import {
  runAudit,
  runAuditV2,
  runAuditV2Metadata,
  AUDIT_V2_ENABLED,
  isOversizeError,
  type PdfSource,
  type ExternalBoundFacts
} from "@/lib/audit-engine";
import { fetchNaicsAppealAnchor, UNKNOWN_ANCHOR } from "@/lib/sam-history";
import { isNoticedescUrl, resolveSamDescription, type ResolvedDescription } from "@/lib/sam-description";
import { MAX_DOCS, classifySectionRoles, type IngestionMeta } from "@/lib/sam-attachments";
import { runAgenticShadow, AGENTIC_SHADOW_ENABLED, buildAgenticFacts, AGENTIC_PRIMARY_ENABLED } from "@/lib/agentic-executor";

export class AuditPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditPersistError";
  }
}

// FA-147 — a structurally collapsed run must never persist as complete.
export class DegradedRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DegradedRunError";
  }
}

// FA-147 — minimum-shape assertion, the net for degradation modes we haven't
// met yet. THRESHOLD RATIONALE: this is deliberately the UNAMBIGUOUS
// structural floor — each of the three call outputs must exist as parsed,
// non-empty JSON. callWithRetry already retried (Sonnet → Opus escalation)
// before falling back to {}, so an empty object here means BOTH models failed
// to produce parseable output for that call: never a legitimate product, on
// any arm (full-doc, image, text, and the deliberate metadata-only path all
// populate all three). Anything stricter — minimum risk counts, clause-list
// floors, checklist lengths — would be a PRODUCT judgment about acceptable
// thinness and is explicitly NOT made here (Brain call, per FA-147 filing).
export function assertMinimumAuditShape(result: {
  overview: { json: object | null };
  compliance: { json: object | null };
  risks: { json: object | null };
}, opts?: {
  // FA-137 — when call-3 collapsed, the run completes WITH the explicit
  // call3_collapsed marker + §05 banner instead of tripping this floor.
  allowCollapsedRisks?: boolean;
}): void {
  const collapsed: string[] = [];
  const calls = opts?.allowCollapsedRisks ? (["overview", "compliance"] as const) : (["overview", "compliance", "risks"] as const);
  for (const call of calls) {
    const j = result[call].json;
    if (!j || typeof j !== "object" || Object.keys(j).length === 0) collapsed.push(call);
  }
  if (collapsed.length > 0) {
    throw new DegradedRunError(
      `degraded_run_shape: call output collapsed for [${collapsed.join(", ")}] — refusing to persist a thin report as complete`
    );
  }
}

export interface AuditExecutionInput {
  solicitation: Solicitation;
  agency: string | null;
  pdfBuffer: Buffer | null;
  pdfBase64: string | null;
  pdfFileId: string | null;
  imageBase64: string | null;
  imageMediaType: "image/jpeg" | "image/png" | null;
  extractedText: string | null;
  extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null;
  pdfSource: PdfSource;
  pdfUnavailableReason: string | null;
  // FA-136 — multi-attachment plan results (inline-pdf arms): further
  // documents in deterministic order + the ingestion-completeness meta
  // persisted to compliance_json.ingestion. Absent on single-doc/upload
  // arms (ingestion null → no banner, pre-FA-136 behavior).
  attachmentPdfs?: Array<{ name: string; base64: string; buffer: Buffer }> | null;
  primaryDocName?: string | null;
  ingestion?: IngestionMeta | null;
}

export interface AuditExecutionResult {
  recommendation: string;
  compliance_score: number | null;
  bid_recommendation: string | null;
}

// FA-160 — write current_stage to audits for the real-time progress UI.
// Best-effort: a stage-write failure must never block or fail the audit.
async function markStage(
  supabase: SupabaseClient,
  auditId: string,
  stage: "retrieval" | "extraction" | "verdict" | "assembly"
): Promise<void> {
  try {
    await supabase
      .from("audits")
      .update({ current_stage: stage, stage_updated_at: new Date().toISOString() })
      .eq("id", auditId);
  } catch {
    /* never block the audit on a stage write */
  }
}

// ━━ RC7 PART B (2026-06-19) — WALL-CLOCK BUDGETS for the pre-V2 phases ━━
//
// PROBLEM (panel-diagnosed): audit #2 (AOCSSB26R0039, the most-attachment run)
// took ~13-14 min and FELT broken. The V2 agentic layer already has a hard
// 4-min Promise.race budget (V2_OVERALL_BUDGET_MS, below). But total wall-clock
// also includes the PRE-V2 phases — and those had NO ceiling:
//   • the FACTS SAM cross-ref call (fetchSolicitationByNoticeId) — one network
//     round-trip with no timeout; a hung SAM endpoint stalls the whole run.
//   • the V1 three-call engine (runAudit) — the three calls run in PARALLEL
//     (Promise.all), each AbortSignal.timeout(CLAUDE_TIMEOUT_MS≈300s) with a
//     Sonnet→Opus retry, so the realistic worst case is ~one timeout + one
//     retry ≈ up to ~600s for the slowest call. Pathological (overloaded API +
//     full retries) it can sit near that ceiling, contributing the bulk of the
//     "feels dead" wait with only a frozen spinner on screen.
//
// FIX: mirror the existing V2 Promise.race pattern and put a sane ceiling on
// each pre-V2 phase. Budgets are deliberately set ABOVE the normal success
// envelope so a currently-succeeding audit can NEVER be made to fail — they cap
// only the pathological long tail. What's dropped is LOGGED + flagged, never
// silent.
//
//   FACTS_SAM_BUDGET_MS — one SAM call. Normal latency is ~1-15s; 30s is a
//     generous ceiling. On breach we degrade EXACTLY like the pre-existing
//     `.catch(() => null)` path already does (proceed without SAM facts → leave
//     them to extraction / honest-unknown). Pure win: a hang now degrades
//     gracefully instead of stalling.
//
//   V1_OVERALL_BUDGET_MS — the parallel three-call runAudit. A clean run lands
//     in ~1-3 min; with one slow call + Opus retry it can reach ~9-10 min. 11
//     min is above even that retry-heavy envelope, so a normal/slow-but-
//     succeeding run never trips it. A run still in V1 past 11 min is genuinely
//     pathological (stuck/abandoned upstream call), NOT "succeeding" — so a
//     breach throws a plain Error → the worker's decideRunFailureMode routes it
//     to terminal 'fail' (NOT DegradedRunError, which would RE-RUN the same
//     pathological hang up to the 3-attempt cap). This converts a silent
//     multi-minute (effectively forever) stall into a prompt, diagnosable
//     terminal failure the report page can exit to.
//
// NOTE / HONEST SCOPE LIMIT: the heavy multi-file INGESTION
// (assembleSamDocumentSet — many fetch + Files-API uploads, genuinely
// unbounded) runs UPSTREAM of executeAudit, in src/app/api/audit/route.ts and
// agents/audit-worker/worker.ts — neither in this task's edit scope. By the
// time bytes reach executeAudit they are already in input.attachmentPdfs. What
// executeAudit CAN bound is the cost those already-fetched attachments impose
// on the phases it owns (V1 + V2 each process every attachment): see the
// ATTACHMENT_SET degrade below. The true network-ingestion ceiling must be
// added at those two upstream call sites (flagged for follow-up).
const FACTS_SAM_BUDGET_MS = 30 * 1000;
const V1_OVERALL_BUDGET_MS = 11 * 60 * 1000;

// Attachment-set degrade ceiling. The V1 engine + V2 shadow each ingest EVERY
// member of input.attachmentPdfs; an abnormally large set is the in-executor
// half of the long-tail cost. assembleSamDocumentSet already applies a doc /
// byte / page budget upstream (MAX_DOCS etc.), so under normal operation the
// set is already small and this NEVER trips. It's a defensive backstop against
// a pathological set slipping through: keep the first N (deterministic order is
// preserved upstream — form first, then tier order), drop the rest, and flag it
// LOUDLY on compliance_json.ingestion (no silent truncation).
//
// P0 fix (2026-06-20): MUST stay AT/ABOVE the upstream attachment count so this
// backstop never re-truncates a normal set. Upstream MAX_DOCS bounds TOTAL docs
// (primary + attachments); the primary is split out before this runs, so a
// normal set carries up to MAX_DOCS-1 attachments. Pinning the backstop to
// MAX_DOCS keeps it strictly above that (was hardcoded 8 — which, after MAX_DOCS
// rose to 12, would have silently dropped the very ELIN/SOW/SLS docs the upstream
// ranking fix just promoted).
const ATTACHMENT_SET_MAX = MAX_DOCS;

// Race a promise against a wall-clock budget. On breach the returned promise
// REJECTS with `new Error(label)` — callers decide whether that degrades
// (catch → fallback) or fails (propagate). Mirrors the inline V2 race already
// in this file; factored out so all three budget sites share one timer-cleanup-
// correct implementation (the timer is always cleared, win or lose).
async function withBudget<T>(workFactory: (signal: AbortSignal) => Promise<T>, budgetMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    return await Promise.race([
      workFactory(controller.signal),
      new Promise<never>((_, reject) => {
        // Abort the in-flight work on timeout so it stops spending, THEN reject.
        timer = setTimeout(() => { controller.abort(); reject(new Error(label)); }, budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Deterministic solicitation-number sniff for uploads. FACTS (agency / NAICS /
// set-aside / deadline) must auto-populate from the system of record, not be
// inferred by the AI (CEO architectural law). Federal sol numbers carry an
// embedded FY+type signature (…26R…, …16Q…), so a filename token is accepted
// ONLY when it matches that shape — never a random alphanumeric run. An existing
// solicitation number (already on the row) always wins.
function sniffSolicitationNumber(
  filename: string | null | undefined,
  existing: string | null | undefined
): string | null {
  const fromExisting = typeof existing === "string" && existing.trim().length >= 6 ? existing.trim() : null;
  if (fromExisting) return fromExisting;
  if (!filename) return null;
  const base = filename.replace(/\.[a-z0-9]+$/i, "").toUpperCase();
  // Federal sol-number shape: prefix(2-8) + 2-digit FY + 1-2 type letters +
  // 3-5 digit serial, optional internal hyphens (W912DY-24-R-0012). Lookarounds
  // (not \b) so a trailing "_sectionM" / "-attachment" is excluded — underscore
  // is a \w char and would defeat \b. Verified against AOCSSB26R0039,
  // FA301626Q0068, W912DY-24-R-0012, SPRRA126Q0034, N0001925R0123, 36C24625R0099;
  // rejects "RFP final draft", GSA schedule prefixes (47QTCA).
  const m = base.match(/(?<![A-Z0-9])[A-Z0-9]{2,8}-?\d{2}-?[A-Z]{1,2}-?\d{3,5}(?![A-Z0-9])/g) || [];
  return m[0] || null;
}

// SAM's fullParentPathName is a dot-joined org path that frequently repeats a
// segment (e.g. "ARCHITECT OF THE CAPITOL.ARCHITECT OF THE CAPITOL.ACQUISITION &
// MATERIAL MAN DIV"). Written raw to audits.agency it shows the duplicate in the
// masthead. Drop duplicate segments (case-insensitive), preserving order and the
// dot separator the customer-hierarchy split still relies on.
function dedupeAgencyPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of raw.split(".").map((s) => s.trim()).filter(Boolean)) {
    const key = seg.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(seg);
    }
  }
  return out.join(".") || null;
}

export async function executeAudit(
  supabase: SupabaseClient,
  auditId: string,
  input: AuditExecutionInput
): Promise<AuditExecutionResult> {
  const {
    agency,
    pdfBuffer,
    pdfBase64,
    pdfFileId,
    imageBase64,
    imageMediaType,
    extractedText,
    extractedFormat,
    pdfSource,
    pdfUnavailableReason
  } = input;
  let solicitation = input.solicitation;

  // ━━ FA-148 — resolve the REAL notice description before any engine call ━━
  // SAM v2 search hands us a noticedesc URL, not text. Resolving here (the
  // single point both the sync route and the worker pass through) means the
  // real text flows everywhere description already flows: solText for all
  // engine calls + classifier (via JSON.stringify(solicitation)), the FA-113
  // facts digest, and the V2 metadata arm's input.description. Best-effort:
  // failure proceeds exactly as pre-FA-148 (URL-only), loudly marked below.
  let resolvedDescription: ResolvedDescription | null = null;
  if (isNoticedescUrl(solicitation.description)) {
    resolvedDescription = await resolveSamDescription(solicitation.noticeId, solicitation.description);
    if (resolvedDescription.fetched) {
      solicitation = { ...solicitation, description: resolvedDescription.text };
    } else {
      console.warn(`[FA-148] description fetch failed for ${solicitation.noticeId} — proceeding URL-only: ${resolvedDescription.reason}`);
    }
  }

  // ━━ FACTS-FIRST — authoritative facts from SAM.gov, never the AI ━━
  // Architectural law (CEO directive): agency / NAICS / set-aside / deadline are
  // FACTS, not analysis. On uploads (synthetic pdf-… notice, no SAM record behind
  // it) these arrived null and the masthead blanked. But the solicitation number
  // is printed on the doc — usually in the filename. When we can read it, pull the
  // authoritative facts from the system of record and write them to the columns
  // the masthead already reads (audit.naics_code / set_aside / response_deadline /
  // agency — all pre-existing, no migration). The view-model uses those columns as
  // the deterministic fallback when the AI metadata_brief is empty, so this fills
  // the blanks WITHOUT touching the analysis layer. Best-effort: one ~15s SAM call,
  // gated to runs that are actually missing a fact; never blocks the audit.
  if (!solicitation.naicsCode || !solicitation.typeOfSetAside || !(input.agency && String(input.agency).trim())) {
    const solNum = sniffSolicitationNumber(input.primaryDocName, solicitation.solicitationNumber);
    if (solNum) {
      // RC7 PART B — bound the single SAM cross-ref call. A hung SAM endpoint
      // previously stalled the whole audit here with no ceiling; on timeout we
      // degrade to the SAME path the pre-existing .catch already takes (null →
      // "leave facts to extraction / honest-unknown" below). Best-effort fact
      // enrichment, never a blocker.
      const samFacts = await withBudget(
        () => fetchSolicitationByNoticeId(solNum),
        FACTS_SAM_BUDGET_MS,
        `FACTS SAM cross-ref budget (${FACTS_SAM_BUDGET_MS / 1000}s) exceeded`
      ).catch((e) => {
        console.warn(`[FACTS] SAM cross-ref for ${solNum} failed/timed out (non-fatal): ${e instanceof Error ? e.message : e}`);
        return null;
      });
      if (samFacts) {
        // A SAM record with no set-aside is DEFINITIVELY full & open — record that
        // as a known fact, never leave it blank/unknown.
        const resolvedSetAside = solicitation.typeOfSetAside || samFacts.typeOfSetAside || "Full & Open";
        const samAgency = dedupeAgencyPath(samFacts.fullParentPathName) || samFacts.department || null;
        solicitation = {
          ...solicitation,
          solicitationNumber: solicitation.solicitationNumber || samFacts.solicitationNumber,
          naicsCode: solicitation.naicsCode || samFacts.naicsCode,
          typeOfSetAside: resolvedSetAside,
          responseDeadLine: solicitation.responseDeadLine || samFacts.responseDeadLine,
          fullParentPathName: solicitation.fullParentPathName || samFacts.fullParentPathName,
          department: solicitation.department || samFacts.department,
          subTier: solicitation.subTier || samFacts.subTier,
        };
        const factCols: Record<string, unknown> = { set_aside: resolvedSetAside };
        if (samFacts.naicsCode) factCols.naics_code = samFacts.naicsCode;
        // The masthead subject is a FACT too — SAM's official title (e.g.
        // "Facilities Management, Maintenance and Support Services") beats both the
        // upload filename and the AI's summary sentence. Only overwrites the
        // filename-derived upload title (this whole block is gated to fact-missing
        // upload runs), so a real SAM-fetched title is never disturbed.
        if (samFacts.title && samFacts.title.trim()) factCols.title = samFacts.title.trim();
        if (samFacts.responseDeadLine) factCols.response_deadline = samFacts.responseDeadLine;
        if ((!input.agency || !String(input.agency).trim() || /^unknown$/i.test(String(input.agency).trim())) && samAgency) {
          factCols.agency = samAgency;
        }
        try {
          await supabase.from("audits").update(factCols).eq("id", auditId);
          console.log(`[FACTS] SAM cross-ref ${solNum} → naics=${samFacts.naicsCode ?? "-"} set_aside="${resolvedSetAside}" agency=${samAgency ?? "(kept)"}`);
        } catch (e) {
          console.warn("[FACTS] column write failed (non-fatal):", e instanceof Error ? e.message : e);
        }
      } else {
        console.log(`[FACTS] no SAM record for ${solNum} — leaving facts to extraction / honest-unknown`);
      }
    }
  }

  // ━━ Run three-call audit (engine sanitizes text + applies SECURITY_DIRECTIVE) ━━
  // RC7 PART B — attachment-set degrade. The V1 engine AND the V2 shadow each
  // ingest EVERY member of attachmentPdfs; an abnormally large set is the
  // in-executor half of the long-tail cost. Upstream assembly already enforces
  // doc/byte/page budgets so under normal operation this is a no-op, but if a
  // pathological set slips through we keep the first ATTACHMENT_SET_MAX (the
  // upstream order is deterministic — primary already split out, attachments in
  // tier order) and DROP the rest, flagged loudly (no silent truncation). This
  // is intentionally a complete-but-fewer-docs DEGRADE, never a hard fail.
  const inputAttachments = input.attachmentPdfs ?? null;
  let attachmentSetDegrade: { kept: number; dropped: number; dropped_names: string[] } | null = null;
  let attachmentPdfs = inputAttachments;
  if (inputAttachments && inputAttachments.length > ATTACHMENT_SET_MAX) {
    const kept = inputAttachments.slice(0, ATTACHMENT_SET_MAX);
    const droppedDocs = inputAttachments.slice(ATTACHMENT_SET_MAX);
    attachmentSetDegrade = {
      kept: kept.length,
      dropped: droppedDocs.length,
      dropped_names: droppedDocs.map((d) => d.name),
    };
    attachmentPdfs = kept;
    console.warn(
      `[RC7] attachment-set degrade for ${auditId}: ${inputAttachments.length} attachments > cap ${ATTACHMENT_SET_MAX} — kept ${kept.length}, dropped ${droppedDocs.length} [${attachmentSetDegrade.dropped_names.join(", ")}]`
    );
  }

  await markStage(supabase, auditId, "extraction");

  // ━━ Fix 3 — TRIM-AND-RUN ladder (never hard-fail a PAID audit) ━━━━━━━━━━━━
  // N4008526R0065 hard-failed with "[call:compliance] prompt is too long" —
  // a terminal fail on a paid audit. The engine's per-call token guard (Fix 2)
  // now keeps each request under the model context, so this ladder should rarely
  // fire, but it is the customer-first safety net: if an oversize error still
  // surfaces (e.g. an image-only PDF whose vision tokens alone overflow), step
  // DOWN the document set deterministically rather than failing —
  //   rung 0: full set
  //   rung 1: primary + §C/§L/§M attachments only (drop the rest)
  //   rung 2: primary only
  // Each step is recorded in compliance_json.ingestion.overflow (honest, never
  // silent). The §C/§L/§M tiering reuses the deterministic name classifier.
  const baseAttachments = attachmentPdfs?.map((a) => ({ name: a.name, base64: a.base64 })) ?? null;
  const coreAttachments = baseAttachments
    ? baseAttachments.filter((a) => classifySectionRoles(a.name).length > 0)
    : null;
  type Rung = { label: string; attachments: typeof baseAttachments };
  const ladder: Rung[] = [{ label: "full set", attachments: baseAttachments }];
  if (coreAttachments && baseAttachments && coreAttachments.length < baseAttachments.length) {
    ladder.push({ label: "primary + §C/§L/§M attachments only", attachments: coreAttachments });
  }
  if (baseAttachments && baseAttachments.length > 0) {
    ladder.push({ label: "primary only", attachments: null });
  }

  let result: Awaited<ReturnType<typeof runAudit>> | null = null;
  const oversizeLadder: string[] = [];
  for (let rung = 0; rung < ladder.length; rung++) {
    const step = ladder[rung];
    try {
      // RC7 PART B — overall wall-clock ceiling on the parallel three-call V1
      // engine. Mirrors the V2 Promise.race pattern below. Set ABOVE the realistic
      // success envelope (incl. a slow call + Opus retry), so a normal/slow-but-
      // succeeding run never trips it; a breach is a genuinely-pathological stall
      // and rejects → propagates as a plain Error → terminal 'fail' in the worker
      // (NOT a re-runnable DegradedRunError, which would replay the same hang up to
      // the attempt cap). Converts a silent multi-minute stall into a prompt,
      // diagnosable terminal failure the report page can exit to.
      result = await withBudget(
        () => runAudit({
          solicitation, pdfBase64, pdfFileId, imageBase64, imageMediaType, extractedText, extractedFormat, pdfSource, pdfUnavailableReason,
          attachmentPdfs: step.attachments,
          primaryDocName: input.primaryDocName ?? null
        }),
        V1_OVERALL_BUDGET_MS,
        `V1 engine overall budget (${V1_OVERALL_BUDGET_MS / 60000}min) exceeded — pre-V2 phase stalled`
      );
      break; // succeeded at this rung
    } catch (err) {
      // Only an OVERSIZE failure steps the ladder; every other error (timeout,
      // 5xx, collapse) propagates unchanged so the existing worker paths handle it.
      if (!isOversizeError(err) || rung === ladder.length - 1) throw err;
      const next = ladder[rung + 1];
      const note = `oversize at "${step.label}" — retrying "${next.label}"`;
      oversizeLadder.push(note);
      console.warn(`[token-ladder] ${auditId}: ${note} (${err instanceof Error ? err.message : err})`);
    }
  }
  if (!result) throw new Error("trim-and-run ladder exhausted without a result");

  await markStage(supabase, auditId, "verdict");

  // FA-147 — refuse to persist a structurally collapsed run as complete.
  // Throws DegradedRunError; the worker routes it to the FA-149 release path
  // (re-run, bounded by the attempt cap), the sync route surfaces a failure.
  // FA-137 — call-3 collapse is EXEMPT from the generic floor: it completes
  // WITH the explicit call3_collapsed marker + §05 degradation banner instead
  // (overview + compliance are intact and customer-valuable; failing the
  // whole run over the risks call would discard them — the marker makes the
  // degradation loud, never silent). Overview/compliance collapse still
  // throws here.
  if (result.call3.outcome === "collapsed") {
    console.error(`[FA-137] call3_collapsed for audit ${auditId} — persisting WITH degradation marker (not clean): ${result.call3.reason}`);
  }
  assertMinimumAuditShape(result, { allowCollapsedRisks: result.call3.outcome === "collapsed" });

  // audit-engine 13f4743 emits score_confidence + is_not_solicitation on
  // the result root. Fold them into compliance_json so the renderer can
  // read them directly instead of falling back to its own derivation.
  // Persisted alongside compliance_score per the engine's honesty flags.
  //
  // Also fold notice_type (from the SAM v2 Solicitation interface — e.g.
  // "Sources Sought", "Presolicitation", "Solicitation") so the view-
  // model's prelim-mode classifier can read it. No new column needed.
  // FA-153 — capture the NAICS-appeal anchor from SAM version history.
  // posted_date is the LATEST version's date (amendments overwrite it); the
  // 10-day OHA clock runs from ORIGINAL issuance, restarting only for
  // NAICS/size-standard amendments (FAR 19.103(a)(1)). Best-effort: failure
  // yields nulls, and the view-model then says "verify issuance date on
  // SAM.gov" — it never falls back to posted_date.
  const appealAnchor = await fetchNaicsAppealAnchor(solicitation.noticeId).catch(() => UNKNOWN_ANCHOR);

  await markStage(supabase, auditId, "assembly");
  const persistedComplianceJson = {
    ...result.compliance.json,
    score_confidence: result.score_confidence ?? null,
    is_not_solicitation: result.is_not_solicitation ?? false,
    notice_type: solicitation.type ?? null,
    // FA-153 — JSON copy needs no migration; audits.original_posted_date is
    // the queryable column once 20260612150000 is applied.
    naics_appeal: {
      original_posted_date: appealAnchor.originalPostedDate,
      anchor_date: appealAnchor.anchorDate,
      naics_changed_by_amendment: appealAnchor.naicsChangedByAmendment,
      version_count: appealAnchor.versionCount,
      fetched_at: new Date().toISOString()
    },
    // FA-148 — description provenance, row-diagnosable: was the engine fed
    // real notice text (sam_description) or did the fetch fail loudly
    // (noticedesc_url_unfetched + reason)? null = field wasn't a noticedesc
    // URL (PDF uploads, legacy inline text).
    sam_description: resolvedDescription
      ? { provenance: resolvedDescription.provenance, fetched: resolvedDescription.fetched, chars: resolvedDescription.chars, ...(resolvedDescription.reason ? { reason: resolvedDescription.reason } : {}) }
      : null,
    // FA-137 — call-3 outcome telemetry: {outcome: ok|retried_ok|collapsed,
    // saved_by?, reason?}. The stress suite reads this per run; the view-model
    // renders the §05 degradation banner when outcome === "collapsed".
    call3: result.call3,
    // FA-136 — ingestion-completeness state: {files_total, files_ingested,
    // form_identified, form_name, overflow?, portfolio_detected?, files[]}.
    // null = single-doc/upload arm (no manifest — pre-FA-136 semantics).
    // The view-model renders the loud partial-ingestion banner when
    // files_ingested < files_total or !form_identified.
    // RC7 PART B — if the attachment-set degrade dropped members, reflect it in
    // the SAME ingestion meta the partial-ingestion banner already reads, so the
    // drop is surfaced (never silent). attachment_set_degrade carries the detail;
    // overflow gets an appended note so the existing banner copy fires too. When
    // no degrade occurred, this is exactly the prior `input.ingestion ?? null`.
    // Fix 3 — the trim-and-run ladder note (honest, never silent): if an
    // oversize error stepped us down to fewer docs, fold the rungs that fired
    // into the SAME overflow string the partial-ingestion banner reads.
    ingestion: (() => {
      const ladderNote = oversizeLadder.length > 0
        ? `Token-safety ladder fired: ${oversizeLadder.join(" → ")} (some lower-priority documents dropped to fit the model context — full files on SAM.gov)`
        : null;
      if (attachmentSetDegrade) {
        // A degrade implies a multi-file (SAM/upload) arm, which always
        // carries an IngestionMeta; fall back to a complete minimal shape if
        // it were somehow absent, so the persisted object is always valid.
        const base = input.ingestion ?? {
          files_total: attachmentSetDegrade.kept + attachmentSetDegrade.dropped + 1,
          files_ingested: attachmentSetDegrade.kept + 1,
          form_identified: false,
          form_name: null,
          files: [],
        };
        const rc7 = `RC7 attachment cap: dropped ${attachmentSetDegrade.dropped} of ${attachmentSetDegrade.kept + attachmentSetDegrade.dropped} attachment(s) over the ${ATTACHMENT_SET_MAX}-doc executor ceiling [${attachmentSetDegrade.dropped_names.join(", ")}]`;
        const overflow = [base.overflow, rc7, ladderNote].filter(Boolean).join(" · ");
        return { ...base, attachment_set_degrade: attachmentSetDegrade, overflow } as IngestionMeta & { attachment_set_degrade: typeof attachmentSetDegrade };
      }
      if (ladderNote) {
        const base = input.ingestion ?? {
          files_total: (baseAttachments?.length ?? 0) + 1,
          files_ingested: (result.compliance ? (baseAttachments?.length ?? 0) + 1 : 0),
          form_identified: false,
          form_name: input.primaryDocName ?? null,
          files: [],
        };
        return { ...base, overflow: [base.overflow, ladderNote].filter(Boolean).join(" · ") } as IngestionMeta;
      }
      return input.ingestion ?? null;
    })(),
    // Progressive-render flag. "finalizing" tells the report page the V2 agentic
    // layer (agency / work-statement / Capture Play) is still running, so it
    // renders those sections in a "finalizing analysis…" state and auto-refreshes
    // until v2_shadow lands (a streaming render — the core report shows in ~3 min,
    // the deep-analysis sections fill in live). Set "finalizing" ONLY when V2 will
    // actually run on this arm; "done" otherwise (image/text/no-buffer arms have
    // no agentic layer to wait for, so their absence is genuine, not pending).
    analysis_phase:
      AUDIT_V2_ENABLED &&
      (pdfBuffer ||
        pdfBase64 ||
        (pdfSource === "sam_unavailable" &&
          typeof solicitation.description === "string" &&
          solicitation.description.length > 50))
        ? "finalizing"
        : "done"
  };

  // FA-166: PDF uploads carry no SAM solicitation number, but the engine often
  // extracts the canonical one from the document text. Backfill it (only when
  // the input had none, so a real SAM number is never overwritten) so the
  // masthead + ledger show a real ID instead of blank / "pdf-<ts>".
  // The canonical solicitation number the engine extracted from the document can
  // land in EITHER overview_json or compliance_json. On HM047626R0039 it sat in
  // overview_json only, so the compliance_json-only lookup missed it and
  // audits.solicitation_number stayed null — breaking list/search and the SAM
  // cross-ref that keys off the printed number. Check both blobs.
  const overviewJsonForSol = (result.overview?.json ?? {}) as Record<string, unknown>;
  const solCanonical =
    (typeof persistedComplianceJson.solicitation_number_canonical === "string" &&
      persistedComplianceJson.solicitation_number_canonical.trim()) ||
    (typeof overviewJsonForSol.solicitation_number_canonical === "string" &&
      (overviewJsonForSol.solicitation_number_canonical as string).trim()) ||
    null;
  // Persist the best resolved number whenever the input lacked one. Prefer the
  // authoritative SAM/input number (already on solicitation), else the canonical
  // the engine read off the page. Guarded so a real input number is never lost.
  const resolvedSolNumber = solicitation.solicitationNumber || solCanonical || null;

  const completeUpdate = {
    ...(resolvedSolNumber ? { solicitation_number: resolvedSolNumber } : {}),
    overview_summary: result.overview.summary,
    overview_json: result.overview.json,
    compliance_summary: result.compliance.summary,
    compliance_json: persistedComplianceJson,
    risks_summary: result.risks.summary,
    risks_json: result.risks.json,
    compliance_score: result.compliance_score,
    recommendation: result.recommendation,
    bid_recommendation: result.bid_recommendation,
    // 2026-06-19: persist the REAL model the engine ran. Previously this column
    // was never written by the worker path, so it sat on the migration-012 DB
    // default ('claude-sonnet-4-6') for every audit — a telemetry lie that made
    // an Opus run look like Sonnet. Now it reflects the engine's actual model.
    model_used: result.model_used,
    document_type: result.classification.document_type,
    document_type_rationale: result.classification.rationale,
    document_type_confidence: result.classification.confidence,
    // Mark complete the moment the core audit (V1) is ready — the user sees the
    // board-room report in ~3 min instead of waiting ~6 for everything. The V2
    // agentic layer (agency, work-statement, the Capture Play) runs right after
    // and merges into compliance_json.v2_shadow. The report page renders those
    // sections in a "finalizing analysis…" state and refreshes itself the moment
    // they land — a progressive, streaming render (like a live AI response),
    // never the degraded blank-agency view that gating-on-V2 traded a long wait
    // to avoid. `analysis_phase` tells the renderer V2 is still in flight.
    status: "complete",
    current_stage: "complete",
    completed_at: new Date().toISOString(),
    stage_updated_at: new Date().toISOString()
  };

  let { error: updateError } = await supabase
    .from("audits")
    .update({ ...completeUpdate, original_posted_date: appealAnchor.originalPostedDate })
    .eq("id", auditId);

  // PGRST204 = column not in schema cache — migration 20260612150000 not yet
  // applied. Retry without the column so the audit still completes; the JSON
  // copy in compliance_json.naics_appeal carries the same fact.
  if (updateError && updateError.code === "PGRST204") {
    console.warn("[FA-153] audits.original_posted_date missing (migration pending) — persisting JSON copy only");
    ({ error: updateError } = await supabase.from("audits").update(completeUpdate).eq("id", auditId));
  }

  if (updateError) {
    throw new AuditPersistError(updateError.message);
  }

  // ━━ V2 shadow wire-up (AUDIT_ENGINE_V2=true, inline-bytes arms) ━━
  // Runs runAuditV2 after V1 success and persists structured V2 output
  // into compliance_json.v2_shadow. ZERO impact on V1 user response —
  // every error is swallowed; the client has already received V1's JSON
  // shape downstream. Visible in DB for inspection.
  //
  // Hotfix Jun 7 2026 — extended gate to include sam_fetched (the bulk of
  // prod traffic). Original gate only matched user uploads via pdfBuffer;
  // SAM-fetched PDFs land in pdfBase64 and skipped V2 entirely. Now we
  // derive a V2-eligible Buffer from whichever inline arm has bytes locally.
  // FA-130 (Jun 11 2026) — sam_pdf_via_files_api callers now retain the
  // fetched buffer and pass it as pdfBuffer, so that arm reaches V2 too.
  // FA-132 (Jun 12 2026) — uploaded_pdf_via_files_api on the async worker now
  // reaches V2 as well: the worker downloads the bytes back from the Files
  // API at claim time (see worker buildInput). Still out-of-scope: image and
  // text arms (no PDF bytes exist).
  const v2Buffer: Buffer | null = pdfBuffer ?? (pdfBase64 ? Buffer.from(pdfBase64, "base64") : null);
  // DIAGNOSTIC (why no agentic surfaces?): record the V2 gate decision when V2
  // won't run on a doc-bearing audit — distinguishes "skipped" (no buffer /
  // disabled) from "failed" (v2_error, set in the catch). Best-effort.
  if (!(AUDIT_V2_ENABLED && v2Buffer) && pdfSource !== "sam_unavailable") {
    const why = !AUDIT_V2_ENABLED ? "disabled" : !v2Buffer ? `no_v2_buffer (pdfBuffer=${!!pdfBuffer} pdfBase64=${!!pdfBase64} pdfFileId=${!!pdfFileId} src=${pdfSource})` : "unknown";
    console.warn(`[V2-SHADOW] SKIPPED for ${auditId}: ${why}`);
    try {
      await supabase.from("audits").update({ compliance_json: { ...persistedComplianceJson, v2_skipped: why, v2_skipped_at: new Date().toISOString() } }).eq("id", auditId);
    } catch { /* diagnostic write best-effort */ }
  }
  if (AUDIT_V2_ENABLED && v2Buffer) {
    let v2Start = Date.now();
    try {
      // FA-131 — V1 vision output + SAM notice metadata are both in scope
      // here; pass them so V2's judgment never sees "unknown" for a fact
      // either source already bound (image-scan PDFs yield zero local facts).
      const v2External: ExternalBoundFacts = {
        v1: {
          solicitorNumber:
            result.overview.json.solicitation_number_canonical ??
            (typeof persistedComplianceJson.solicitation_number_canonical === "string"
              ? persistedComplianceJson.solicitation_number_canonical
              : null),
          contractType: result.overview.json.contract_type ?? null,
          issuingOffice: result.overview.json.customer ?? null,
          setAside:
            (typeof persistedComplianceJson.set_aside_type === "string" && persistedComplianceJson.set_aside_type
              ? persistedComplianceJson.set_aside_type
              : null) ?? persistedComplianceJson.set_aside_text ?? null,
          periodOfPerformance: result.overview.json.period_of_performance ?? null,
        },
        sam: {
          title: solicitation.title,
          solicitorNumber: solicitation.solicitationNumber,
          naicsCode: solicitation.naicsCode,
          setAside: solicitation.typeOfSetAside,
          offerDueDate: solicitation.responseDeadLine,
          issuingOffice: agency,
        },
        // FA-139 — V1 vision's STRUCTURED lists fill V2 list gaps the same
        // way the scalars above do. Without this, image-scan PDFs leave V2's
        // clins/clauses/§L/§M empty → judgment vnotes contradict the rendered
        // report and §09 collapses to the 1-item due-date fallback.
        v1Structured: {
          clins: Array.isArray(persistedComplianceJson.clins) ? persistedComplianceJson.clins : [],
          // ROOT FIX (2026-06-20): do NOT feed the V1 AI clause list back into V2.
          // The AI vision call ("be EXHAUSTIVE") hallucinates clauses, drifts
          // run-to-run, and over-sweeps the whole PDF. Threading it into
          // v1Structured.clauses let it RE-CONTAMINATE V2's deterministic facts
          // (bindExternalFacts fills facts.clauses from v1s.clauses when the
          // deterministic parse is empty). V2 now derives clauses deterministically
          // (extractClauses §I UNION full-text sweep) and that list is the source
          // of truth for the persisted far_clauses/dfars_clauses below. The AI list
          // survives only as the persistence-time fallback when V2's is empty.
          clauses: [],
          submissionRequirements: Array.isArray(result.overview.json.submission_requirements_raw)
            ? result.overview.json.submission_requirements_raw
            : [],
          evaluationFactors: Array.isArray(result.overview.json.evaluation_factors_raw)
            ? result.overview.json.evaluation_factors_raw
            : [],
        },
      };
      // FA-136 — V2 sees the same assembled document set as V1 (attachment
      // text appended to the form's text layer before section detection).
      // RELIABILITY: the multi-file V2 call is heavy (5 full docs) and can hit
      // the Claude timeout / a transient overload. Without a retry, a single
      // slow response silently dropped the ENTIRE agentic layer (agency,
      // work-statement, Capture Play). Retry once, then surface loudly.
      // ━━ AGENTIC PRIMARY (AUDIT_AGENTIC_PRIMARY=true) ━━━━━━━━━━━━━━━━━━━━━━━
      // Produce full-coverage facts via the per-document MAP (every doc model-read,
      // no overflow, coverage ledger) and feed them to runAuditV2 as factsOverride,
      // so every rendered V2 surface reflects the agentic extraction. OFF by default.
      // BOUNDED (own wall-clock budget) + non-fatal: timeout/error → null → V2 falls
      // back to its own single-pass extractor (a paid audit can never break or hang
      // on the agentic path). Uses attachmentPdfs (the RC7-capped set), not the
      // uncapped pre-degrade set. The V2 budget clock is RESET after, so the MAP's
      // time is not charged against runAuditV2's 4-min budget.
      let agenticMap: Awaited<ReturnType<typeof buildAgenticFacts>> = null;
      if (AGENTIC_PRIMARY_ENABLED) {
        const mapBudgetMs = Number(process.env.AGENTIC_MAP_BUDGET_MS) || 300000;
        try {
          agenticMap = await withBudget(
            (signal) => buildAgenticFacts({
              auditId,
              solicitation,
              agency,
              primaryName: input.primaryDocName ?? "primary solicitation",
              primaryBytes: v2Buffer,
              primaryText: extractedText ?? null,
              // FULL pre-degrade set (not the RC7-capped attachmentPdfs): the agentic
              // engine is DESIGNED to read every doc via the cheap per-document MAP
              // with no overflow — capping it would defeat the full-coverage premise
              // and make the coverage ledger report "partial". Cost/wall-clock are
              // bounded by the MAP budget above + Haiku's cheap per-doc rate.
              attachments: inputAttachments,
            }, signal),
            mapBudgetMs,
            `agentic MAP budget (${mapBudgetMs / 60000}min) exceeded`
          );
        } catch (e) {
          console.error(`[AGENTIC-PRIMARY] ${auditId} MAP bounded-abort (non-fatal, V2 fallback):`, e instanceof Error ? e.message : e);
          agenticMap = null;
        }
        v2Start = Date.now(); // give runAuditV2 its full budget; don't charge it the MAP time
      }
      let v2Result: Awaited<ReturnType<typeof runAuditV2>> | null = null;
      let v2LastErr: unknown = null;
      // FA-E2E re-verify Fix E (2026-06-18): HARD overall budget on the V2
      // agentic layer. The 5-doc audit could hang for ~10 min (two retries x a
      // long per-call timeout), leaving the report stuck in "finalizing" forever.
      // Race each runAuditV2 attempt against a 4-minute deadline measured from
      // v2Start; a blown deadline rejects → flows into the existing retry/degrade
      // machinery (catch below writes analysis_phase:"done" + v2_error), so the
      // report renders degraded-but-complete instead of spinning.
      const V2_OVERALL_BUDGET_MS = 4 * 60 * 1000;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const remainingMs = V2_OVERALL_BUDGET_MS - (Date.now() - v2Start);
        if (remainingMs <= 0) {
          v2LastErr = new Error(`V2 overall budget (${V2_OVERALL_BUDGET_MS / 1000}s) exhausted before attempt ${attempt}`);
          break;
        }
        let budgetTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          v2Result = await Promise.race([
            runAuditV2(
              v2Buffer,
              v2External,
              attachmentPdfs?.map((a) => ({ name: a.name, buffer: a.buffer })) ?? null,
              agenticMap?.facts ?? null, // AGENTIC PRIMARY: full-coverage facts drive the V2 surfaces
              agenticMap?.assembledText ?? null // ground V2's fabrication guards against the MAP's text
            ),
            new Promise<never>((_, reject) => {
              budgetTimer = setTimeout(
                () => reject(new Error(`V2 overall budget (${V2_OVERALL_BUDGET_MS / 1000}s) exceeded`)),
                remainingMs
              );
            }),
          ]);
          if (attempt > 1) console.warn(`[V2-SHADOW] runAuditV2 recovered on retry (attempt ${attempt}) for ${auditId}`);
          break;
        } catch (e) {
          v2LastErr = e;
          console.warn(`[V2-SHADOW] runAuditV2 attempt ${attempt}/2 failed for ${auditId}: ${e instanceof Error ? e.message : e}`);
          // Don't sleep+retry past the overall budget — degrade promptly.
          if (attempt < 2 && V2_OVERALL_BUDGET_MS - (Date.now() - v2Start) > 3000) {
            await new Promise((r) => setTimeout(r, 3000));
          } else if (attempt < 2) {
            break;
          }
        } finally {
          if (budgetTimer) clearTimeout(budgetTimer);
        }
      }
      if (!v2Result) throw v2LastErr ?? new Error("runAuditV2 failed after retry");
      const v2Shadow = {
        path: "pdf",
        judgment: v2Result.judgment,
        surfaces: {
          work_statement: v2Result.work_statement,
          work_statement_unknown: v2Result.work_statement_unknown,
          matrix_rollup: v2Result.matrix_rollup,
          submission_checklist_filtered: v2Result.submission_checklist_filtered,
          l02_catches: v2Result.l02_catches,
          confidence_notes: v2Result.confidence_notes,
          has_incumbent: v2Result.has_incumbent,
          incumbent_name: v2Result.incumbent_name ?? null,
          metadata_brief: v2Result.metadata_brief ?? null,
          submission_preflight: v2Result.submission_preflight ?? null,
          recompete_signal: v2Result.recompete_signal ?? null,
          price_anchor: v2Result.price_anchor ?? null,
        },
        extraction: {
          sections_detected: Object.keys(v2Result.sectionBag.sections),
          missing_sections: v2Result.sectionBag.missingSections,
          warnings: v2Result.warnings,
          extraction_warnings: v2Result.facts.extractionWarnings,
          // AGENTIC PRIMARY: the honest coverage line (Audited N of M · superseded ·
          // skipped · read failures) — null when not on the agentic-primary path.
          agentic_coverage: agenticMap?.coverage.statement ?? null,
          agentic_facts_source: agenticMap ? "agentic_map" : null,
        },
        rendered_at: new Date().toISOString(),
        engine_ms: Date.now() - v2Start,
      };
      // RC2 (2026-06-19) — SET-ASIDE backfill. On all PDF-source arms, the V1
      // set-aside post-processor scans only `solText` (≈4KB SAM-metadata JSON +
      // attachment manifest); the PDF body rides on the vision/Files-API
      // document block, so "8(A)" / "100% set-aside under the 8(a) program"
      // printed in the form body is never seen → top-level set_aside_type stays
      // empty when SAM metadata carries none. V2 DOES read the real PDF text and
      // binds set-aside via applySetAsideRegex over doc.rawText. When V1 came up
      // empty AND V2 read a set-aside FROM THE DOCUMENT (provenance "document" /
      // "v1_vision" — never "sam_metadata", which would just echo the same SAM
      // blank), backfill the deterministic top-level value. Honesty preserved:
      // positive regex match only; absent set-aside (AOCSSB/LoC) stays null.
      const v1SetAside =
        typeof persistedComplianceJson.set_aside_type === "string"
          ? persistedComplianceJson.set_aside_type.trim()
          : "";
      const v2Brief = v2Result.metadata_brief ?? null;
      const v2SetAside =
        v2Brief && typeof v2Brief.set_aside === "string" ? v2Brief.set_aside.trim() : "";
      const v2SetAsideProvenance = v2Brief?.set_aside_provenance ?? null;
      // FA-176: the V2 model can mis-read SF-1449 Block 10 — the UNCHECKED
      // "SERVICE-DISABLED (SDVOSB)" label — as the set-aside on a 100% 8(a) buy
      // (HM047626R0039: backfilled "SDVOSB", provenance=document, over a real 8(a)).
      // The deterministic SAM-sourced value (solicitation.typeOfSetAside, e.g. "8A")
      // is authoritative — the V2 doc-reading must NEVER override or backfill over it
      // (facts-vs-analysis law, same as the masthead precedence fix). Backfill from
      // V2 ONLY when neither V1 nor the SAM cross-ref produced a set-aside at all.
      const deterministicSetAside =
        typeof solicitation.typeOfSetAside === "string" ? solicitation.typeOfSetAside.trim() : "";
      const setAsideBackfill =
        !v1SetAside &&
        !deterministicSetAside &&
        v2SetAside &&
        (v2SetAsideProvenance === "document" || v2SetAsideProvenance === "v1_vision")
          ? v2SetAside
          : null;
      if (setAsideBackfill) {
        console.log(
          `[V2-SHADOW] RC2 set-aside backfill for ${auditId}: "${setAsideBackfill}" (provenance=${v2SetAsideProvenance})`
        );
      }
      // ROOT FIX (2026-06-20) — DETERMINISTIC clause list is the SOURCE OF TRUTH.
      // V2's farClausesDet/dfarsClausesDet come from extractClauses (§I) UNION a
      // full-text sweep of the assembled document — same input → same output, no
      // hallucination/drift/over-sweep. Overwrite the rendered far_clauses /
      // dfars_clauses with the deterministic lists WHEN non-empty; otherwise keep
      // the V1 AI list as the fallback (image-scan/no-text-layer arms). Agency-
      // local clauses (NGA 5X52.*, AFFARS 5352.*) — which the renderer would
      // otherwise drop — are folded into the FAR bucket the view-model iterates,
      // appended after the FAR clauses so they surface instead of vanishing.
      const farDet = Array.isArray(v2Result.farClausesDet) ? v2Result.farClausesDet : [];
      const dfarsDet = Array.isArray(v2Result.dfarsClausesDet) ? v2Result.dfarsClausesDet : [];
      const agencyDet = Array.isArray(v2Result.agencyClausesDet) ? v2Result.agencyClausesDet : [];
      const farForRender = [...farDet, ...agencyDet];
      const clauseOverride: { far_clauses?: string[]; dfars_clauses?: string[] } = {};
      if (farForRender.length > 0) clauseOverride.far_clauses = farForRender;
      if (dfarsDet.length > 0) clauseOverride.dfars_clauses = dfarsDet;
      if (farForRender.length > 0 || dfarsDet.length > 0) {
        console.log(
          `[V2-SHADOW] deterministic clause override for ${auditId}: far=${farForRender.length} (incl ${agencyDet.length} agency-local) dfars=${dfarsDet.length}`
        );
      }
      const { error: shadowError } = await supabase
        .from("audits")
        .update({
          compliance_json: {
            ...persistedComplianceJson,
            ...(setAsideBackfill ? { set_aside_type: setAsideBackfill } : {}),
            ...clauseOverride,
            analysis_phase: "done",
            v2_shadow: v2Shadow,
          },
        })
        .eq("id", auditId);
      if (shadowError) {
        console.error("[V2-SHADOW] db update failed (non-fatal):", shadowError.message);
      } else {
        console.log("[V2-SHADOW] stored for audit", auditId, "engine_ms=", v2Shadow.engine_ms);
      }
    } catch (err) {
      // Loud: this is non-fatal to the V1 audit, but it DEGRADES the report —
      // no agentic surfaces (agency / work-statement / Capture Play) for this
      // run. Surfaced so a recurring V2 failure can't hide behind "non-fatal".
      const v2ErrMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[V2-SHADOW] runAuditV2 FAILED AFTER RETRY for ${auditId} — report degraded (no agentic surfaces):`, v2ErrMsg);
      // INSTRUMENT (diagnostic): persist the failure reason onto the audit row so
      // the cause is diagnosable from the record itself — the worker logs aren't
      // reachable. Best-effort; never blocks. compliance_json.v2_error = why V2
      // produced no agentic surfaces this run.
      try {
        await supabase
          .from("audits")
          .update({ compliance_json: { ...persistedComplianceJson, analysis_phase: "done", v2_error: v2ErrMsg, v2_error_at: new Date().toISOString() } })
          .eq("id", auditId);
      } catch { /* diagnostic write is best-effort */ }
    }
  } else if (AUDIT_V2_ENABLED && pdfSource === "sam_unavailable" && solicitation.description && solicitation.description.length > 50) {
    // ━━ Fix 8 — V2 metadata-only shadow path ━━
    // Fires when SAM returned a notice but no PDF was retrievable. Pure
    // deterministic synthesis: eligibility + deadline math + synopsis +
    // CO contact + missing-intel list. Zero LLM cost. Same v2_shadow
    // envelope as the PDF path so downstream consumers see one shape.
    const v2Start = Date.now();
    try {
      const v2Result = await runAuditV2Metadata({
        noticeId: solicitation.noticeId,
        title: solicitation.title,
        description: solicitation.description,
        naicsCode: solicitation.naicsCode,
        typeOfSetAside: solicitation.typeOfSetAside,
        postedDate: solicitation.postedDate,
        responseDeadLine: solicitation.responseDeadLine,
        noticeType: solicitation.type,
        agency,
      });
      const v2Shadow = {
        path: "metadata_only",
        judgment: v2Result.judgment,
        surfaces: {
          work_statement: null,
          work_statement_unknown: null,
          matrix_rollup: v2Result.matrix_rollup,
          submission_checklist_filtered: v2Result.submission_checklist_filtered,
          l02_catches: v2Result.l02_catches,
          confidence_notes: v2Result.confidence_notes,
          has_incumbent: false,
          metadata_brief: v2Result.metadata_brief ?? null,
          submission_preflight: v2Result.submission_preflight ?? null,
          recompete_signal: v2Result.recompete_signal ?? null,
          price_anchor: v2Result.price_anchor ?? null,
        },
        extraction: {
          sections_detected: [] as string[],
          missing_sections: [] as string[],
          warnings: v2Result.warnings,
          extraction_warnings: v2Result.facts.extractionWarnings,
        },
        rendered_at: new Date().toISOString(),
        engine_ms: Date.now() - v2Start,
      };
      const { error: shadowError } = await supabase
        .from("audits")
        .update({ compliance_json: { ...persistedComplianceJson, analysis_phase: "done", v2_shadow: v2Shadow } })
        .eq("id", auditId);
      if (shadowError) {
        console.error("[V2-SHADOW-META] db update failed (non-fatal):", shadowError.message);
      } else {
        console.log("[V2-SHADOW-META] stored for audit", auditId, "engine_ms=", v2Shadow.engine_ms);
      }
    } catch (err) {
      console.error("[V2-SHADOW-META] runAuditV2Metadata failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // (The audit was already marked complete after V1 above — the user has had the
  // core board-room report for the ~2-3 min the V2 layer took. The V2 merge
  // writes above flipped compliance_json.analysis_phase to "done" and added
  // v2_shadow, so the report page's next auto-refresh swaps the "finalizing"
  // sections for the full agentic surfaces. No second status write needed.)

  // Best-effort intelligence-corpus write — every audit teaches the engine
  // what trap clauses fire on what document types. Failure here doesn't
  // disrupt the audit response.
  // FA-149 — delete-before-insert so a reclaimed run that re-executes after
  // a worker death cannot duplicate corpus rows (the table has no unique
  // constraint to upsert against). Every other write in this pipeline is an
  // UPDATE keyed on auditId and tolerates retry; this insert was the one
  // non-idempotent step.
  try {
    const flags = (result.compliance.json.dfars_flags ?? []).filter((f) => f.detected);
    if (flags.length > 0) {
      await supabase.from("fa_intelligence_corpus").delete().eq("audit_id", auditId);
      await supabase.from("fa_intelligence_corpus").insert(
        flags.map((f) => ({
          audit_id: auditId,
          solicitation_id: solicitation.noticeId,
          trap_type: f.clause,
          was_caught: true,
          outcome: result.recommendation,
          metadata: { document_type: result.classification.document_type, severity: f.severity }
        }))
      );
    }
  } catch {
    /* silent — corpus is best-effort */
  }

  // ━━ Agentic engine SHADOW (AUDIT_AGENTIC=true) — non-fatal, never affects the
  //    live result. Runs the agentic path on the FULL package (inputAttachments,
  //    pre-degrade — agentic handles large sets without the ladder), logs its
  //    honest coverage line, and earns its way to primary behind the review gate.
  // Mutual exclusion: suppress the shadow ONLY when the PRIMARY path actually ran
  // the MAP — i.e. primary flag AND the V2 arm executed (AUDIT_V2_ENABLED && v2Buffer).
  // If primary is flagged but V2 was off / no buffer (image/text-only arms), the
  // primary MAP never ran, so the shadow must still cover it (no double-MAP, no gap).
  const _primaryRanMap = AGENTIC_PRIMARY_ENABLED && AUDIT_V2_ENABLED && !!v2Buffer;
  if (AGENTIC_SHADOW_ENABLED && !_primaryRanMap) {
    const primaryBytes = pdfBuffer ?? (pdfBase64 ? Buffer.from(pdfBase64, "base64") : null);
    // BOUNDED + non-fatal: the shadow makes live model calls, so it gets the same
    // wall-clock ceiling as the V1/V2 engines. An unbounded await here could hang
    // executeAudit past the worker timeout → DegradedRunError replay → the exact
    // full-Opus retry cost-bleed the V1 budget exists to prevent. The report is
    // already marked complete above, so a shadow timeout never affects the result.
    const shadowBudgetMs = Number(process.env.AGENTIC_SHADOW_BUDGET_MS) || 300000;
    try {
      await withBudget(
        () => runAgenticShadow({
          auditId,
          solicitation,
          agency,
          primaryName: input.primaryDocName ?? "primary solicitation",
          primaryBytes,
          primaryText: extractedText ?? null,
          attachments: inputAttachments,
        }),
        shadowBudgetMs,
        `agentic shadow budget (${shadowBudgetMs / 60000}min) exceeded`
      );
    } catch (e) {
      console.error(`[AGENTIC-SHADOW] ${auditId} bounded-abort (non-fatal):`, e instanceof Error ? e.message : e);
    }
  }

  return {
    recommendation: result.recommendation,
    compliance_score: result.compliance_score,
    bid_recommendation: result.bid_recommendation
  };
}
