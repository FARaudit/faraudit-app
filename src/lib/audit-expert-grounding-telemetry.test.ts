// $0 GATE — the grounding-backstop telemetry must DISCRIMINATE, not merely count.
// Run: npx tsx src/lib/audit-expert-grounding-telemetry.test.ts
//
// WHY THIS GATE EXISTS. `dropped` has always been returned and never read, so backstop deletions left no trace
// anywhere. Surfacing a bare `dropped` would NOT answer the question worth asking, because it conflates:
//   • a model INVENTING an excerpt        — healthy; the backstop doing its job;
//   • the backstop deleting a finding whose excerpt is VERBATIM in the source the lens was handed — the
//     divergence class (isGrounded checks groundingSource only and never falls back, audit-expert.ts:36-39),
//     which is how arc-B's VISION-CONFIRMED WAGE RATES block (audit-executor-v3.ts:412) gets its own findings
//     deleted after being appended "for grounding".
// So `droppedInReadSource` must be 1 in the first case and 0 in the second. A counter that simply mirrors
// `dropped` passes a single-case test and is useless — hence case 2 below, which is the real gate.
//
// FALSIFICATION FIRST. The harness self-checks before any real case runs: it feeds the asserter a statement it
// KNOWS to be false and requires a recorded failure. A test file that cannot register a failure certifies
// nothing, and this arc has shipped inert checks before.
import { runAgenticExpert, type CallModel, type RawFinding } from "./audit-expert";
import { findInSource, normalizeForSearch, phrasePresentInNormalized, type AuditToolContext } from "./audit-tools";

let failures = 0;
// `sink` captures output instead of printing it. This exists for the self-check below: the repo's green gate
// (scripts/audit-ai/card214-greens.sh:20-24) decides PASS/FAIL by grepping each test's stdout for the failure
// glyph, so a self-check that PRINTS a deliberate failure would mark this file — and the whole gate — RED on
// every passing run, training the operator to ignore a gate that is crying wolf. Capture it instead.
let sink: string[] | null = null;
const assert = (cond: boolean, msg: string) => {
  const line = `${cond ? "✅" : "❌"} ${msg}`;
  if (sink) sink.push(line); else console.log(line);
  if (!cond) failures++;
};

// ── FALSIFICATION SELF-CHECK — the REAL asserter, output captured ───────────────────────────────────
console.log("— harness self-check —");
sink = [];
assert(false, "a deliberately false claim");
const captured = sink; sink = null;
if (failures !== 1 || captured.length !== 1 || !captured[0].startsWith("❌")) {
  console.error(`\nHARNESS INERT — the asserter did not both record and render a known-false claim (failures=${failures}, rendered=${JSON.stringify(captured)}). No result below is trustworthy.\n`);
  process.exit(1);
}
failures = 0;
console.log("✅ harness registers AND renders failures — the gate can fail\n");

// ── FIXTURE · the production two-corpus shape ───────────────────────────────────────────────────────
const DOC_TEXT = "SECTION L - INSTRUCTIONS TO OFFERORS\nQuotations shall be submitted electronically not later than 2:00 PM Central Time.\n";
const APPENDED = "\n==== VISION-CONFIRMED WAGE RATES (Attachment 2.pdf) ====\n11210 Laborer, Grounds Maintenance ................ 18.47\n";
// fullSource carries content the grounding corpus does not — exactly audit-executor-v3.ts:302 + :412 vs :537.
const FULL = DOC_TEXT + APPENDED;
const GROUNDING = DOC_TEXT;

const IN_READ_SOURCE_ONLY = "11210 Laborer, Grounds Maintenance ................ 18.47";  // appended → fullSource only
const IN_BOTH = "Quotations shall be submitted electronically not later than 2:00 PM Central Time";
const IN_NEITHER = "The contractor shall provide a certified nuclear safety officer at all times";  // invented

const finding = (excerpt: string): RawFinding =>
  ({ requirement: "r", citation: "c", excerpt, kind: "other", controllability: "bidder_controls" });

const run = async (excerpts: string[], groundingSource?: string) => {
  const ctx: AuditToolContext = { fullSource: FULL, ...(groundingSource ? { groundingSource } : {}) };
  const callModel: CallModel = async () => ({ toolCalls: [], findings: excerpts.map(finding) });
  return runAgenticExpert({ key: "pricing_analyst", system: "gate" }, ctx, { callModel });
};

(async () => {
  // CASE 0 — the fast presence test must answer EXACTLY as findInSource, or the counter measures something
  // subtly different from the gate it is reporting on. Asserted, not assumed: the counter uses
  // normalizeForSearch + phrasePresentInNormalized to avoid rebuilding findInSource's offset map per finding.
  const normed = normalizeForSearch(FULL);
  for (const phrase of [IN_READ_SOURCE_ONLY, IN_BOTH, IN_NEITHER, "  QUOTATIONS   SHALL be submitted ", "ab", ""]) {
    const viaFind = findInSource({ fullSource: FULL }, phrase).hits.length > 0;
    const viaFast = phrasePresentInNormalized(normed, phrase);
    assert(viaFind === viaFast, `presence agrees with findInSource for ${JSON.stringify(phrase.slice(0, 40))} (${viaFind})`);
  }

  // CASE 1 — the divergence class. Excerpt is in what the lens READ but not in the grounding corpus.
  const c1 = await run([IN_READ_SOURCE_ONLY], GROUNDING);
  assert(c1.findings.length === 0, "divergence: the finding is dropped");
  assert(c1.dropped === 1, `divergence: dropped === 1 (got ${c1.dropped})`);
  assert(c1.droppedInReadSource === 1, `divergence: droppedInReadSource === 1 (got ${c1.droppedInReadSource})`);

  // CASE 2 — THE DISCRIMINATOR. An invented excerpt is in NEITHER corpus. `dropped` counts it; the new counter
  // must NOT. A counter that merely mirrors `dropped` fails exactly here and nowhere else.
  const c2 = await run([IN_NEITHER], GROUNDING);
  assert(c2.dropped === 1, `invention: dropped === 1 (got ${c2.dropped})`);
  assert(c2.droppedInReadSource === 0, `invention: droppedInReadSource === 0 — NOT a mirror of dropped (got ${c2.droppedInReadSource})`);

  // CASE 3 — healthy grounded finding. Neither counter moves.
  const c3 = await run([IN_BOTH], GROUNDING);
  assert(c3.findings.length === 1, "grounded: the finding survives");
  assert(c3.dropped === 0 && c3.droppedInReadSource === 0, `grounded: both counters 0 (got ${c3.dropped}/${c3.droppedInReadSource})`);

  // CASE 4 — mixed batch, so the counters are proven independent rather than coincidentally equal.
  const c4 = await run([IN_READ_SOURCE_ONLY, IN_NEITHER, IN_BOTH], GROUNDING);
  assert(c4.findings.length === 1, `mixed: exactly the grounded finding survives (got ${c4.findings.length})`);
  assert(c4.dropped === 2, `mixed: dropped === 2 (got ${c4.dropped})`);
  assert(c4.droppedInReadSource === 1, `mixed: droppedInReadSource === 1, strictly less than dropped (got ${c4.droppedInReadSource})`);

  // CASE 5 — NO divergence (groundingSource absent ⇒ isGrounded falls through to fullSource). The appended text
  // is now reachable, so nothing is dropped. Confirms the counter tracks the corpora, not some fixed property
  // of the excerpt.
  const c5 = await run([IN_READ_SOURCE_ONLY]);
  assert(c5.findings.length === 1, "no divergence: the same excerpt now survives");
  assert(c5.dropped === 0 && c5.droppedInReadSource === 0, `no divergence: both counters 0 (got ${c5.dropped}/${c5.droppedInReadSource})`);

  console.log(failures === 0 ? "\n✅ grounding-backstop telemetry gate: PASS\n" : `\n❌ ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
