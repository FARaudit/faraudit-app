// Agentic orchestrator — the conductor (flag-gated OFF).
//
// Ties the agentic engine together the way Claude Code worked the package:
//   manifest+ledger → amendment-resolution → per-document MAP (cheap model) →
//   compose ExtractedFacts → EXISTING runJudgment reduce (Opus) → coverage-gated
//   report. Nothing is stuffed into one context; nothing is silently trimmed; the
//   completeness claim is GATED on what was actually read.
//
// Deterministic seams (composeExtractedFacts, buildCoverageReport) are unit-tested
// without the API. The live wiring (runAgenticAudit) runs only on the agentic path,
// behind the review gate. Scalars (NAICS/set-aside/deadline) arrive deterministically
// from SAM — facts-vs-analysis law — never from the model.

import type { ExtractedFacts } from "./section-extractors";
import type { AuditJudgment } from "./audit-judgment";
import { classifyBindingContent, type CoverageLedger, type ResolvedLedger } from "./agentic-ingest";
import { type MappedFacts, type MapCoverage, type DocExtract, type DocExtractCache } from "./agentic-map";
import { type LensSurfaces } from "./agentic-lenses";

export type ScalarFacts = Partial<
  Pick<ExtractedFacts, "contractType" | "setAside" | "naicsCode" | "solicitorNumber" | "offerDueDate" | "issuingOffice" | "periodOfPerformance">
>;

export interface AgenticDoc {
  name: string;
  bytes: Buffer;   // for content-hash dedup
  text: string;    // extracted text (native or OCR) for the MAP
}

export interface AgenticAuditInput {
  docs: AgenticDoc[];
  scalars: ScalarFacts;     // deterministic SAM facts
  amendmentText?: string | null; // override; else derived from SF-30 cover docs
  mapModel?: string;
  judgeModel?: string;
  lensModel?: string;      // Stage 2 — overview/compliance/risks lenses (else registry "lens")
  crossDocModel?: string;  // Stage 2.5 — cross-doc pass (else registry "crossdoc")
  /** Cancellation — aborts in-flight per-doc MAP reads when an upstream budget fires. */
  signal?: AbortSignal;
  /** #7 — content-addressed MAP extract cache. When provided, a doc already mapped (by content
   *  hash) is served from cache for $0 (re-runs + corpus-wide reuse of standard attachments).
   *  Omitted ⇒ every doc is read live (behavior unchanged). */
  docCache?: DocExtractCache;
}

export interface CoverageReport {
  totalFiles: number;
  read: string[];
  skipped: Array<{ name: string; reason: string }>;
  superseded: string[];
  unresolvedVersionGroups: number;
  readFailures: string[];
  /** TRUE only when every target document was read in full (no read failures).
   *  Unresolved version groups do NOT break completeness — they are read in full;
   *  they're a COST note (resolution would trim redundant reads). */
  complete: boolean;
  statement: string;
}

export interface AgenticAuditResult {
  judgment: AuditJudgment;
  facts: ExtractedFacts;
  ledger: ResolvedLedger;
  coverage: CoverageReport;
  /** Stage 2 — the overview/compliance/risks/cross-doc surfaces, produced by the
   *  lenses over the COMPACT MATRIX (no 925k Opus stuff). Render-compatible subsets
   *  of the legacy OverviewJSON/ComplianceJSON/RisksJSON. */
  surfaces: LensSurfaces;
  /** The compact matrix the lenses consumed — kept for observability + Stage-5 grounding. */
  matrix: string;
}

/** Compose the full ExtractedFacts from deterministic SAM scalars + the MAP's
 *  analysis arrays. Pure — the merge point of facts-vs-analysis. */
export function composeExtractedFacts(scalars: ScalarFacts, mapped: MappedFacts): ExtractedFacts {
  return {
    clins: mapped.clins,
    delivery: mapped.delivery,
    clauses: mapped.clauses,
    submissionRequirements: mapped.submissionRequirements,
    evaluationFactors: mapped.evaluationFactors,
    performanceRequirements: mapped.performanceRequirements,
    amendmentChanges: mapped.amendmentChanges,
    contractType: scalars.contractType ?? null,
    setAside: scalars.setAside ?? null,
    naicsCode: scalars.naicsCode ?? null,
    solicitorNumber: scalars.solicitorNumber ?? null,
    offerDueDate: scalars.offerDueDate ?? null,
    issuingOffice: scalars.issuingOffice ?? null,
    extractionWarnings: mapped.extractionWarnings,
    // Every work-statement body, each headed by its source doc (append-all). The
    // judge consumes this single string today; Stage 2 moves to the compact matrix.
    // Per-doc cap keeps a multi-SOW package from blowing the judge prompt — capped
    // bodies are marked, never silently dropped (the structured performanceRequirements
    // above carry the obligations regardless).
    workStatementText: composeWorkStatementText(mapped.workStatements),
    periodOfPerformance: scalars.periodOfPerformance ?? null,
  };
}

// Per-document body cap (chars). Generous — most SOW/PWS bodies fit. A body over
// this is marked truncated in-band (visible to the judge), never silently dropped.
const WORK_STATEMENT_PER_DOC_CAP = 40_000;

function composeWorkStatementText(workStatements: MappedFacts["workStatements"]): string | undefined {
  if (!workStatements.length) return undefined;
  return workStatements
    .map((w) => {
      const body = w.text.length > WORK_STATEMENT_PER_DOC_CAP
        ? `${w.text.slice(0, WORK_STATEMENT_PER_DOC_CAP)}\n[…work-statement body truncated for the judge prompt — full obligations captured as performanceRequirements…]`
        : w.text;
      return `=== ${w.docName} ===\n${body}`;
    })
    .join("\n\n");
}

/** A MAP extract carries NO content — every fact array empty AND no work-statement prose.
 *  (warnings don't count — a doc can warn yet extract nothing.) Pure. */
function isVacuousExtract(e: DocExtract): boolean {
  return (
    e.clauses.length === 0 && e.clins.length === 0 && e.delivery.length === 0 &&
    e.submissionRequirements.length === 0 && e.evaluationFactors.length === 0 &&
    e.performanceRequirements.length === 0 && e.amendmentChanges.length === 0 &&
    !(e.workStatementText && e.workStatementText.trim())
  );
}

/** Split MAP extracts into the ones that count as READ vs BINDING docs that produced a
 *  vacuous (zero-content) extract — the latter are extraction FAILURES, not reads (Stage 3
 *  honest-fail). A binding doc (classifyBindingContent.mustFullRead — WD/CBA/PWS/SOW/§L/§M/
 *  SF-30/spec/CDRL) that vanished to nothing is OCR noise / a scanned form the map couldn't
 *  parse / an empty-but-valid JSON — counting it "read in full" would let coverage claim
 *  completeness on the single MOST important class of document while it contributed nothing.
 *  A vacuous NON-binding doc (a pure-data inventory/pricing template) is a legitimate empty
 *  read and stays valid — only binding content that disappeared is suspicious. Keyed on the
 *  source TEXT so a doc whose text was present but un-extractable is caught (the upstream
 *  MIN_TEXT_CHARS filter only catches docs with no text at all). Pure + exported so the
 *  deterministic gate proves it without the API.
 *
 *  IMPORTANT — only demote a POSITIVELY-identified binding doc (classification.source ===
 *  "type" or "obligation"): a never-summarize doc type (WD/CBA/PWS/§M/spec…) or one with
 *  obligation language in the body. classifyBindingContent ALSO returns mustFullRead:true for
 *  its conservative "default" fallback (a generically-named file not provably inert) — a
 *  legitimately-empty cover sheet / blank form would hit that default, and demoting it would
 *  flip a VALID package to PARTIAL/no-charge (breaking "valid package still ships complete").
 *  So the default fallback is NOT enough to call a vanished extract a read-failure. */
export function partitionVacuousBindings(
  extracts: DocExtract[],
  docTextByName: Map<string, string>
): { valid: DocExtract[]; vacuousBindingNames: string[] } {
  const valid: DocExtract[] = [];
  const vacuousBindingNames: string[] = [];
  for (const ex of extracts) {
    const cls = classifyBindingContent(ex.docName, docTextByName.get(ex.docName) ?? null);
    const positivelyBinding = cls.source === "type" || cls.source === "obligation";
    if (isVacuousExtract(ex) && positivelyBinding) {
      vacuousBindingNames.push(ex.docName);
    } else {
      valid.push(ex);
    }
  }
  return { valid, vacuousBindingNames };
}

/** Build the honest coverage report. Pure. The completeness claim is gated on
 *  read failures, not asserted. */
export function buildCoverageReport(ledger: ResolvedLedger, mapCoverage: MapCoverage, readFailures: string[], truncatedDocs: string[] = []): CoverageReport {
  const superseded = ledger.entries.filter((e) => e.status === "superseded").map((e) => e.name);
  const duplicatesSkipped = mapCoverage.skipped.filter((s) => s.reason.includes("duplicate")).length;
  // A truncated doc was NOT read in full (over MAP_INPUT_CHAR_LIMIT, trimmed for the
  // prompt) — it cannot count toward "Audited N of N in full" any more than a read
  // failure can. Completeness requires zero read failures AND zero truncations.
  const complete = readFailures.length === 0 && truncatedDocs.length === 0;
  const readN = mapCoverage.read.length;
  const total = readN + readFailures.length; // honest denominator — failures are visible, not hidden
  const statement = complete
    ? `Audited ${readN} of ${total} operative documents in full · ` +
      `${superseded.length} superseded version(s) excluded with proof · ${duplicatesSkipped} byte-identical duplicate(s) skipped · ` +
      `${ledger.versionGroups} unresolved version group(s) read in full (amendment-resolution would reduce cost, not coverage).`
    : `⚠ INCOMPLETE — read ${readN} of ${total} operative documents` +
      (readFailures.length ? `; ${readFailures.length} could not be read: ${readFailures.join(", ")}` : "") +
      (truncatedDocs.length ? `; ${truncatedDocs.length} too large to read in full (trimmed): ${truncatedDocs.join(", ")}` : "") +
      `. Coverage is PARTIAL; this is NOT a full review.`;
  return {
    totalFiles: ledger.entries.length,
    read: mapCoverage.read,
    skipped: mapCoverage.skipped,
    superseded,
    unresolvedVersionGroups: ledger.versionGroups,
    readFailures,
    complete,
    statement,
  };
}

/** Derive the SF-30 Item-14 text from the package (the amendment cover docs). */
function deriveAmendmentText(input: AgenticAuditInput, ledger: CoverageLedger): string {
  const sf30Names = new Set(ledger.entries.filter((e) => e.isSf30).map((e) => e.name));
  return input.docs.filter((d) => sf30Names.has(d.name)).map((d) => d.text).join("\n\n");
}

/** The MAP half of an agentic audit — everything EXCEPT the judgment: manifest →
 *  amendment-resolution → per-document MAP (cheap model, full coverage) → composed
 *  facts → coverage report. The graduate-to-primary path feeds these facts straight
 *  into the V2 pipeline (which does the judging), so the MAP is never double-billed
 *  for a judgment. Live (model MAP). */
export interface AgenticMapResult {
  facts: ExtractedFacts;
  coverage: CoverageReport;
  ledger: ResolvedLedger;
  /** The text the MAP actually read (operative docs, concatenated). Passed to
   *  runAuditV2 so its fabrication guards ground the agentic facts against THEIR
   *  source — not V2's weaker single-pass extraction. */
  assembledText: string;
  /** finding-key → source-doc citation map from the MAP merge — powers the matrix's
   *  per-line citations in Stage 2 (and any downstream provenance surface). */
  provenance: Record<string, string>;
}

/** Run `mapOne` over every item with a CONCURRENT burst, then a SERIAL retry of any first-pass
 *  failures, and only THEN record a failure. A doc whose analysis call errors during the burst
 *  (Haiku 429/overload/abort under load) is NOT unreadable — it maps fine on a calm serial retry
 *  (proven 2026-06-25: N4008526R0065's CIRS form, 15,966 chars, dropped to "could not be read" in the
 *  6E burst, maps in 10.7s → 5 reqs + 8 perfReqs in isolation). Dropping it on the first blip is a
 *  FALSE PARTIAL on a good package. `mapOne` is INJECTED so this is deterministically gate-testable
 *  (a stub that throws once-then-succeeds proves recovery) with ZERO live spend. Returns the
 *  extracts + the names of docs that failed EVEN the retry (genuine analysis-failures). */
export async function mapWithResilience<T extends { name: string }>(
  items: T[],
  mapOne: (item: T) => Promise<DocExtract>,
  opts: { concurrency?: number; aborted?: () => boolean } = {},
): Promise<{ extracts: DocExtract[]; failures: string[] }> {
  const concurrency = opts.concurrency ?? 4;
  const extracts: DocExtract[] = [];
  const failures: string[] = [];
  const firstPassFailures: T[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    if (opts.aborted?.()) { for (const d of items.slice(i)) failures.push(d.name); return { extracts, failures }; }
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(mapOne));
    settled.forEach((r, j) => { if (r.status === "fulfilled") extracts.push(r.value); else firstPassFailures.push(batch[j]); });
  }
  for (const d of firstPassFailures) {
    if (opts.aborted?.()) { failures.push(d.name); continue; }
    try { extracts.push(await mapOne(d)); } catch { failures.push(d.name); }
  }
  return { extracts, failures };
}

// [V1/shadow purged 2026-06-28 — A4] runAgenticMap() removed — engine is 100% agentic (executeAgenticPrimary → auditPackage). See git history.

/** Run a full agentic audit: MAP → compact matrix → LENSES + cross-doc (Stage 2) and
 *  the JUDGE (call 4, unchanged) in parallel. Live. Behind the review gate.
 *
 *  This is where calls 1–3 are REBORN: instead of stuffing ~925k tokens into Opus
 *  three times, the overview/compliance/risks surfaces are produced by small
 *  judge-model lens calls over the deterministic compact matrix, and a cross-doc pass
 *  restores the cross-document reasoning the per-doc MAP can't see — at a fraction of
 *  the cost and with ~zero context rot. The matrix is the shared CACHED prefix across
 *  the four lens calls (prime-then-parallel inside runLenses). */
// [V1/shadow purged 2026-06-28 — A4] runAgenticAudit() removed — engine is 100% agentic (executeAgenticPrimary → auditPackage). See git history.

