// $0 gate for the FROZEN grading bar (Brain card 41) — N-run asymmetric consensus.
// COMPLETENESS (verdict + must-raise concepts) = majority consensus; CORRECTNESS (fabrications +
// disqualifying-misclassifications) = unanimity/zero-tolerance (one in ANY run fails).
//   npx tsx scripts/audit-ai/test-consensus-grading.ts
import { gradeConsensus, type JudgmentResult, type JudgmentKey } from "./judgment-score";

// minimal key: two must-raise concepts.
const KEY = { namedGates: [{ token: "A", mustRaise: true }, { token: "B", mustRaise: true }] } as unknown as JudgmentKey;

// build a synthetic run result with the fields gradeConsensus reads.
const run = (opts: { verdictOk: boolean; surfaced: string[]; fabricated?: string[]; decoy?: string[] }): JudgmentResult => ({
  pass: false, failures: [], partClassification: { expected: "", actual: "", ok: true },
  verdict: { expected: "BID", actual: opts.verdictOk ? "BID" : "BID_WITH_CAUTION", ok: opts.verdictOk },
  namedGates: ["A", "B"].map((t) => ({ token: t, surfaced: opts.surfaced.includes(t), dispositionOk: true })),
  dispositionAdvisories: [], showStoppers: [],
  fabricated: opts.fabricated ?? [], decoyHardFails: opts.decoy ?? [], clauseRecallReported: null,
});

let pass = 0; const fails: string[] = [];
const check = (label: string, got: boolean, exp: boolean) => { if (got === exp) pass++; else fails.push(`${label}: got ${got} exp ${exp}`); };

// 1) PASS — verdict ok 2/3 (majority), both concepts surfaced 3/3, zero correctness errors.
check("clean 2/3 verdict + concepts → PASS",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: false, surfaced: ["A", "B"] })], KEY).pass, true);

// 2) CORRECTNESS zero-tolerance — 1 of 3 runs fabricates → FAIL even though 2/3 are clean.
check("1/3 fabrication → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"], fabricated: ["52.219-14"] }), run({ verdictOk: true, surfaced: ["A", "B"] })], KEY).pass, false);

// 3) CORRECTNESS — 1 of 3 runs has a disqualifying-misclassification (decoy) → FAIL.
check("1/3 decoy misclassification → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"], decoy: ["100% set-aside as disqualifying"] }), run({ verdictOk: true, surfaced: ["A", "B"] })], KEY).pass, false);

// 4) COMPLETENESS consensus — concept B surfaced only 1/3 (< majority) → FAIL.
check("concept 1/3 surfaced → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A"] }), run({ verdictOk: true, surfaced: ["A"] })], KEY).pass, false);

// 5) COMPLETENESS — verdict ok only 1/3 (< majority) → FAIL (the stuck BID_WITH_CAUTION case).
check("verdict 1/3 ok → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: false, surfaced: ["A", "B"] }), run({ verdictOk: false, surfaced: ["A", "B"] })], KEY).pass, false);

// 6) Edge — concept surfaced exactly majority (2/3) → PASS (consensus tolerates a 1-run miss).
check("concept exactly 2/3 → PASS",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A"] })], KEY).pass, true);

console.log(`consensus-grading gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — completeness=majority consensus, correctness=zero-tolerance unanimity (Brain card 41).");
