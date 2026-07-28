// $0 GATE — banking the real groundingSource must be BEHAVIOURALLY INERT.
// Run: npx tsx src/lib/audit-run-record-grounding-bank.test.ts
//
// WHAT CHANGED. audit-executor-v3.ts now passes the run-time `groundingSource` (:537) into the banked
// RunRecordInput. Until now it was never banked, so every value in the record cache was written afterwards by
// _groundfixture-backfill.ts as a literal COPY of fullSource — a value that cannot differ from its original at
// any rate, which made the corpus structurally unable to express the divergence and guaranteed every
// "grounding changed nothing" result came out clean before it was measured.
//
// WHAT THIS GATE PROVES. That the ONLY effect is a bigger, truer file:
//   1. buildRunRecord's computed snapshot (formatDetected · procurementPart · manifest · coreMissing) is
//      byte-identical with and without the field — its ctx (audit-run-record.ts:99) reads fullSource/sections
//      only, and that must stay true.
//   2. replayRunRecord's ENTIRE output is byte-identical with and without it. The field does reach replay's ctx
//      (:193), but replay grounds via findingProvenance(ctx.fullSource), so it must not move. This is the
//      claim most likely to rot if someone later wires groundingSource into the replay's grounding math — at
//      which point this gate SHOULD fail and force the question to be asked deliberately.
//   3. The value round-trips VERBATIM — not normalized, not truncated, not silently swapped for fullSource.
//
// AND THE POINT OF THE CHANGE: a divergent groundingSource must actually survive as divergent, or the bank has
// reproduced the backfill's defect in a new place.
//
// FALSIFICATION FIRST — the asserter self-checks that it can register AND render a failure, with output
// captured so a passing run never prints the glyph the repo's green gate (card214-greens.sh:20-24) greps for.
import { buildRunRecord, replayRunRecord, type RunRecord, type RunRecordInput } from "./audit-run-record";
import type { AuditResult } from "./audit-orchestrator";

let failures = 0;
let sink: string[] | null = null;
const assert = (cond: boolean, msg: string) => {
  const line = `${cond ? "✅" : "❌"} ${msg}`;
  if (sink) sink.push(line); else console.log(line);
  if (!cond) failures++;
};

console.log("— harness self-check —");
sink = [];
assert(false, "a deliberately false claim");
const captured = sink; sink = null;
if (failures !== 1 || captured.length !== 1 || !captured[0].startsWith("❌")) {
  console.error(`\nHARNESS INERT — the asserter did not both record and render a known-false claim (failures=${failures}). No result below is trustworthy.\n`);
  process.exit(1);
}
failures = 0;
console.log("✅ harness registers AND renders failures — the gate can fail\n");

// ── FIXTURE · the real two-corpus shape, multi-doc so fullSource carries delimiters groundingSource lacks ──
const DOC_A = "SECTION B - SUPPLIES OR SERVICES AND PRICE\nThe contractor shall furnish all labor and equipment for grounds maintenance.\nSECTION C - DESCRIPTION/SPECS\nWork shall be performed at the medical center.\nSECTION L - INSTRUCTIONS TO OFFERORS\nQuotations shall be submitted electronically not later than 2:00 PM Central Time.\nSECTION M - EVALUATION FACTORS FOR AWARD\nAward will be made on a lowest priced technically acceptable basis.\n";
const DOC_B = "ATTACHMENT 2 - WAGE DETERMINATION\nWAGE DETERMINATION NO. 2015-5271 REVISION NO. 24\n";
const FULL_SOURCE = `\n\n==== DOCUMENT: Solicitation.pdf ====\n\n${DOC_A}\n\n==== DOCUMENT: Attachment 2.pdf ====\n\n${DOC_B}`.trim()
  + "\n==== VISION-CONFIRMED WAGE RATES (Attachment 2.pdf) ====\n11210 Laborer, Grounds Maintenance ... 18.47\n";
const GROUNDING_SOURCE = [DOC_A, DOC_B].join("\n\n");   // audit-executor-v3.ts:537 — delimiter-less, no appended block

const FINDING = { id: "ko#0", requirement: "deadline", citation: "§L", excerpt: "Quotations shall be submitted electronically not later than 2:00 PM Central Time", kind: "submission", controllability: "bidder_controls", grounded: true, lens: "ko" };
const RESULT = {
  decision: { verdict: "NEEDS_HUMAN_REVIEW", eligible: null, reason: "fixture" },
  // The persisted decision inputs replay re-derives the verdict from — the real shape, not an empty object,
  // so replayRunRecord exercises deriveVerdict for real rather than throwing before it can compare anything.
  inputs: { findings: [FINDING], bidderProfile: null, coverageComplete: false, verifierSound: true, conflict: false },
  findings: [FINDING],
  coverage: { required: [], covered: [], missing: [], attestations: [], coreMissing: [] },
  perLens: {}, conflict: false, sectionsRead: ["B", "C", "L", "M"], trace: {},
} as unknown as AuditResult;

const META = { runId: "gate", startedAt: "2026-07-28T00:00:00Z", flags: {}, flagEnv: {}, sol: "GATE-001" };
const baseInput = (): RunRecordInput => ({
  fullSource: FULL_SOURCE, bidderProfile: null, naics: null, setAside: null, manifestComplete: true,
});

const build = (input: RunRecordInput): RunRecord =>
  buildRunRecord({ meta: META as never, input, result: RESULT, billing: { honestFail: false, billable: true } });

const withOut = build(baseInput());
const withIn = build({ ...baseInput(), groundingSource: GROUNDING_SOURCE });

// 0 — the fixture must actually be divergent, or every assertion below is vacuous.
assert(FULL_SOURCE !== GROUNDING_SOURCE, "fixture: the two corpora genuinely differ");
assert(!FULL_SOURCE.includes(GROUNDING_SOURCE), "fixture: groundingSource is not a plain substring of fullSource (delimiters + appended block)");

// 1 — the computed snapshot must not move.
assert(JSON.stringify(withOut.format) === JSON.stringify(withIn.format),
  `computed snapshot byte-identical (format/manifest/coreMissing)`);
assert(JSON.stringify(withOut.result) === JSON.stringify(withIn.result), "banked result byte-identical");

// 2 — replay must not move. If someone wires groundingSource into replay's grounding math, THIS fails first.
const rOut = JSON.stringify(replayRunRecord(withOut));
const rIn = JSON.stringify(replayRunRecord(withIn));
assert(rOut === rIn, "replayRunRecord output byte-identical with and without the banked groundingSource");

// 3 — the value survives verbatim, and is NOT quietly the fullSource copy the backfill wrote.
assert(withIn.input.groundingSource === GROUNDING_SOURCE, "groundingSource round-trips VERBATIM");
assert(withIn.input.groundingSource !== withIn.input.fullSource, "banked groundingSource is NOT a copy of fullSource — the corpus can now express divergence");
assert(withOut.input.groundingSource === undefined, "absent input stays absent (legacy records keep falling back)");

// 4 — it survives the actual serialization the bank performs (JSON round-trip through storage).
const rehydrated = JSON.parse(JSON.stringify(withIn)) as RunRecord;
assert(rehydrated.input.groundingSource === GROUNDING_SOURCE, "survives the JSON round-trip the bank writes to storage");

console.log(failures === 0 ? "\n✅ groundingSource bank gate: PASS\n" : `\n${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
