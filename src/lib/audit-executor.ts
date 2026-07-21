// FA-116 — shared audit execution core.
//
// The one pipeline the sync route, the resident audit-worker, and the watcher all
// run, so their behavior can never drift. executeAudit() routes into the AGENTIC V3
// engine (executeAgenticPrimary) — persist complete → best-effort corpus inserts.
// (T3 truth fix 2026-07-07: the old header described a "V1 3-call engine → persist →
// V2 shadow" pipeline; V1/V2 are RETIRED — V3 is the sole engine.)
//
// Error contract:
//   - Engine/SAM/content errors THROW — caller marks the audits row failed.
//   - Corpus failures are swallowed (parity with route).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSolicitationByNoticeId, type Solicitation } from "@/lib/sam";
import { type PdfSource } from "@/lib/audit-engine"; // shared type only — V1 runAudit/runAuditV2 are RETIRED
import { isNoticedescUrl, resolveSamDescription, type ResolvedDescription } from "@/lib/sam-description";
import { MAX_DOCS, type IngestionMeta } from "@/lib/sam-attachments";
import { executeAgenticPrimary } from "@/lib/audit-executor-v3";
import type { BidderProfile } from "@/lib/audit-findings";
import { aggregate, type UsageCall } from "@/lib/audit-cost";
import { recordAuditCost, decrementAuditQuota } from "@/lib/audit-billing";

// T2-2 (engine line-audit 2026-07-07) — REMOVED three retired-engine phantoms:
//   • AuditPersistError — a class that was caught (route.ts) + advertised in the
//     comment above but NEVER thrown anywhere (dead catch arm removed too).
//   • assertMinimumAuditShape — asserted the RETIRED V1/V2 3-call shape
//     (overview/compliance/risks json) the live V3 engine never produces (it had
//     zero real callers — only a stale comment mentioned it).
//   • DegradedRunError — its ONLY thrower was assertMinimumAuditShape, so deleting
//     that orphaned it (the worker's instanceof branches went with it).
// The live anti-false-COMPLETE net is V3's compliance_json.honest_fail +
// documents_complete + the 9 Tier-0 verdict-integrity fixes — not these.

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

// T3 (2026-07-07) — removed the dead executor.ts markStage: the live V3 path has
// its own markStage in audit-executor-v3.ts; this copy had zero callers.

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
// (T3 2026-07-07 — removed the dead V1_OVERALL_BUDGET_MS const + its V1/V2-era
//  commentary; the parallel three-call runAudit it bounded is retired. Only the
//  live FACTS SAM cross-ref budget below survives.)
const FACTS_SAM_BUDGET_MS = 30 * 1000;

// T2-2 — ATTACHMENT_SET_MAX (the V1/V2 attachment-set degrade ceiling `= MAX_DOCS`)
// removed: zero callers, an advertised backstop that never ran on the V3 path.
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
      // PRE-PANEL TIMING (card #567) — SAM facts cross-ref is a network fetch OUTSIDE the 270s engine budget; timing it
      // proves whether retrieval latency (vs the in-budget engine) drives wall-clock. Log-only, flag AUDIT_TIMING_PREPANEL.
      const _tSam = Date.now();
      const samFacts = await withBudget(
        () => fetchSolicitationByNoticeId(solNum),
        FACTS_SAM_BUDGET_MS,
        `FACTS SAM cross-ref budget (${FACTS_SAM_BUDGET_MS / 1000}s) exceeded`
      ).catch((e) => {
        console.warn(`[FACTS] SAM cross-ref for ${solNum} failed/timed out (non-fatal): ${e instanceof Error ? e.message : e}`);
        return null;
      });
      if (process.env.AUDIT_TIMING_PREPANEL === "true") console.log(`[timing] prepanel:sam-facts-fetch ${Date.now() - _tSam}ms · ${samFacts ? "hit" : "miss/timeout"}`);
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
  // COGS-on-fail (Brain card #623-B) — capture spend if the run ABORTS (budget stall). usageSink collects every
  // priced model call; on the happy path executeAgenticPrimary records cost itself and this catch never fires.
  const usageSink: UsageCall[] = [];
  try {
    return await withBudget(
      (signal) => executeAgenticPrimary(supabase, auditId, input, solicitation, agency, signal, usageSink),
      agenticBudgetMs,
      `agentic V3 primary overall budget (${agenticBudgetMs / 1000}s) exceeded — engine stalled`
    );
  } catch (err) {
    // The run aborted before executeAgenticPrimary's own recordAuditCost, but real tokens were spent (in usageSink).
    // Record the partial COGS as a no-charge ESTIMATED usage_events row so the stall's spend shows in the cost
    // cockpit. Best-effort + fail-safe: NEVER mask the engine error, NEVER throw from here. decrementAuditQuota
    // upserts the row (keyed by audit_id) so recordAuditCost's UPDATE has a row to write.
    try {
      if (usageSink.length) {
        await decrementAuditQuota(supabase, auditId, { billable: false, honestFail: true, verdict: "FAILED-STALL (ESTIMATED)" });
        const { perModel, totals } = aggregate(usageSink);
        await recordAuditCost(supabase, auditId, { perModel, totals, source: "customer" });
        console.warn(`[COST] ${auditId}: recorded ESTIMATED $${totals.usd.toFixed(4)} COGS on aborted run (${usageSink.length} calls) — Brain #623-B`);
      }
    } catch (costErr) {
      console.warn(`[COST] ${auditId}: fail-path COGS record skipped (fail-safe): ${costErr instanceof Error ? costErr.message : String(costErr)}`);
    }
    throw err;
  }
}
