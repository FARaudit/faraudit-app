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
import { type PdfSource } from "@/lib/audit-engine"; // shared type only — V1 runAudit/runAuditV2 are RETIRED
import { isNoticedescUrl, resolveSamDescription, type ResolvedDescription } from "@/lib/sam-description";
import { MAX_DOCS, type IngestionMeta } from "@/lib/sam-attachments";
import { executeAgenticPrimary } from "@/lib/audit-executor-v3";
import type { BidderProfile } from "@/lib/audit-findings";

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
  // N5 — the auditing firm's self-asserted capability profile (open-world; socioeconomic
  // certs only) for the agentic eligibility lane. null/absent = unknown firm (conservative
  // path, unchanged). ONLY consulted by the agentic-V3 primary engine.
  bidderProfile?: BidderProfile | null;
  // Overall wall-clock budget (ms) for the agentic V3 run. Absent → env / 270s default.
  // The watcher passes a tighter value so its SAM/PDF prologue fits under the 300s cron.
  agenticBudgetMs?: number;
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

  // ━━ AGENTIC V3 — the SOLE engine. It OWNS the entire report. There is NO V1/V2 fallback
  // (deleted 2026-06-28: 100% agentic — honest success or honest failure, never a legacy path).
  // OVERALL WALL-CLOCK BUDGET — the engine returns above the platform maxDuration(300s) hard-kill;
  // withBudget aborts the signal on breach → auditPackage lenses/skeptic cancel in-flight calls →
  // a clean terminal Error. Caller budget wins (the watcher passes a tighter one for its prologue).
  const agenticBudgetMs = input.agenticBudgetMs ?? (Number(process.env.AGENTIC_V3_PRIMARY_BUDGET_MS) || 270000);
  return await withBudget(
    (signal) => executeAgenticPrimary(supabase, auditId, input, solicitation, agency, signal),
    agenticBudgetMs,
    `agentic V3 primary overall budget (${agenticBudgetMs / 1000}s) exceeded — engine stalled`
  );
}
