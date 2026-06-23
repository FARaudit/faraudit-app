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
import { runJudgment } from "./audit-judgment";
import { buildCoverageLedger, resolveAmendments, type CoverageLedger, type ResolvedLedger, type PackageFileInput } from "./agentic-ingest";
import { mapDocument, mergeExtracts, selectMapTargets, type MappedFacts, type MapCoverage, type DocExtract } from "./agentic-map";

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
  /** Cancellation — aborts in-flight per-doc MAP reads when an upstream budget fires. */
  signal?: AbortSignal;
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
    contractType: scalars.contractType ?? null,
    setAside: scalars.setAside ?? null,
    naicsCode: scalars.naicsCode ?? null,
    solicitorNumber: scalars.solicitorNumber ?? null,
    offerDueDate: scalars.offerDueDate ?? null,
    issuingOffice: scalars.issuingOffice ?? null,
    extractionWarnings: mapped.extractionWarnings,
    workStatementText: mapped.workStatementText ?? undefined,
    periodOfPerformance: scalars.periodOfPerformance ?? null,
  };
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
}

export async function runAgenticMap(input: AgenticAuditInput): Promise<AgenticMapResult> {
  // 1) manifest + coverage ledger (deterministic)
  const files: PackageFileInput[] = input.docs.map((d) => ({ name: d.name, bytes: d.bytes }));
  const baseLedger = buildCoverageLedger(files);

  // 2) amendment-resolution (flag-only; supersedes nothing — all versions read)
  const ledger = resolveAmendments(baseLedger, input.amendmentText ?? deriveAmendmentText(input, baseLedger));

  // 3) MAP — read each operative/unresolved doc in its own context (cheap model).
  //    selectMapTargets is the single source of truth for the selection rule.
  //    Resilient per-doc: a read failure is FLAGGED (coverage partial), never hidden.
  const { read: readEntries, skipped } = selectMapTargets(ledger);
  const readNames = new Set(readEntries.map((e) => e.name));
  const readDocs = input.docs.filter((d) => readNames.has(d.name));
  const extracts: DocExtract[] = [];
  const readFailures: string[] = [];
  // A doc with no extractable text (silent OCR failure that didn't throw) is a
  // READ FAILURE, not a success — it must NEVER count toward "Audited N of N in
  // full." Filter those into readFailures before the model ever sees them.
  const MIN_TEXT_CHARS = 50;
  const mappable = readDocs.filter((d) => {
    const ok = d.text.replace(/\s/g, "").length >= MIN_TEXT_CHARS;
    if (!ok) readFailures.push(d.name);
    return ok;
  });
  const concurrency = 4;
  for (let i = 0; i < mappable.length; i += concurrency) {
    const batch = mappable.slice(i, i + concurrency);
    if (input.signal?.aborted) {
      // Budget fired — every not-yet-attempted doc is an HONEST read-failure, not a
      // silent drop. Without this they'd vanish from the denominator (total = read +
      // readFailures) and coverage could report "Audited 8 of 8 · complete" after a
      // mid-run abort. Push the whole remaining tail before breaking.
      for (const d of mappable.slice(i)) readFailures.push(d.name);
      break;
    }
    const settled = await Promise.allSettled(batch.map((d) => mapDocument(d.name, d.text, input.mapModel, input.signal)));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") extracts.push(r.value);
      else readFailures.push(batch[j].name);
    });
  }
  const merged = mergeExtracts(extracts);
  // read = docs that ACTUALLY produced an extract — never `mappable`, which still
  // includes docs whose MAP call later failed (those are in readFailures; counting
  // them as read too would double-count and inflate the "N of N" headline).
  const mapCoverage: MapCoverage = { read: extracts.map((e) => e.docName), skipped };
  // Docs that produced an extract but were over the char cap (trimmed) — read, but
  // NOT in full; they keep coverage from claiming completeness.
  const truncatedDocs = extracts.filter((e) => e.truncated).map((e) => e.docName);

  // 4) compose facts (deterministic SAM scalars + mapped analysis) + coverage report
  const facts = composeExtractedFacts(input.scalars, merged);
  const coverage = buildCoverageReport(ledger, mapCoverage, readFailures, truncatedDocs);
  // assembled MAP text = the text of docs that ACTUALLY produced an extract (the
  // grounding source for V2's fabrication guards on the agentic-primary path). Built
  // from `extracts`, NOT `mappable` — mappable still includes docs whose MAP call
  // failed; including their text would let V2 surface clauses from a doc the agentic
  // facts don't cover, widening the facts↔grounding mismatch.
  const extractNames = new Set(extracts.map((e) => e.docName));
  const assembledText = mappable.filter((d) => extractNames.has(d.name)).map((d) => d.text).join("\n\n");
  return { facts, coverage, ledger, assembledText };
}

/** Run a full agentic audit (MAP + judgment). Live. Behind the review gate. */
export async function runAgenticAudit(input: AgenticAuditInput): Promise<AgenticAuditResult> {
  const { facts, coverage, ledger } = await runAgenticMap(input);
  const judgment = await runJudgment(facts, undefined, input.judgeModel);
  return { judgment, facts, ledger, coverage };
}

/** Flag-gate. OFF until the full build passes /code-review + expert panels and
 *  one CEO live run actualizes the cost + proves all docs digested. */
export const AGENTIC_ORCHESTRATOR_ENABLED = process.env.AUDIT_AGENTIC === "true";
