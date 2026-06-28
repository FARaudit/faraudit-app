// $0 gate for the FROZEN grading bar (Brain cards 41+42) — N-run asymmetric consensus, TWO decoy tiers.
// COMPLETENESS (verdict + must-raise concepts + Tier-2 disposition-misfiles) = majority consensus;
// CORRECTNESS (fabrications + Tier-1 disqualifying-misfires) = unanimity/zero-tolerance (one in ANY run fails).
//   npx tsx scripts/audit-ai/test-consensus-grading.ts
import { gradeConsensus, type JudgmentResult, type JudgmentKey } from "./judgment-score";

const KEY = { namedGates: [{ token: "A", mustRaise: true }, { token: "B", mustRaise: true }] } as unknown as JudgmentKey;

// disqual → decoyHardFails (Tier 1, zero-tolerance); misfile → dispositionMisfiles (Tier 2, consensus).
const run = (o: { verdictOk: boolean; surfaced: string[]; fabricated?: string[]; disqual?: string[]; misfile?: string[] }): JudgmentResult => ({
  pass: false, failures: [], partClassification: { expected: "", actual: "", ok: true },
  verdict: { expected: "BID", actual: o.verdictOk ? "BID" : "BID_WITH_CAUTION", ok: o.verdictOk },
  namedGates: ["A", "B"].map((t) => ({ token: t, surfaced: o.surfaced.includes(t), dispositionOk: true })),
  dispositionAdvisories: [], showStoppers: [],
  fabricated: o.fabricated ?? [], decoyHardFails: o.disqual ?? [], dispositionMisfiles: o.misfile ?? [], clauseRecallReported: null,
});

let pass = 0; const fails: string[] = [];
const check = (label: string, got: boolean, exp: boolean) => { if (got === exp) pass++; else fails.push(`${label}: got ${got} exp ${exp}`); };

// 1) PASS — verdict ok 2/3, concepts 3/3, no correctness errors, no misfiles.
check("clean → PASS",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: false, surfaced: ["A", "B"] })], KEY).pass, true);

// 2) Tier-1 zero-tolerance — 1/3 fabrication → FAIL.
check("1/3 fabrication → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"], fabricated: ["52.219-14"] }), run({ verdictOk: true, surfaced: ["A", "B"] })], KEY).pass, false);

// 3) Tier-1 zero-tolerance — 1/3 DISQUALIFYING-misfire (decoy in show_stoppers) → FAIL.
check("1/3 disqualifying-misfire → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"], disqual: ["100% set-aside (raised as disqualifying)"] }), run({ verdictOk: true, surfaced: ["A", "B"] })], KEY).pass, false);

// 4) Tier-2 consensus — disposition-misfile in MINORITY (1/3) → PASS (tolerated; not zero-tolerance).
check("1/3 disposition-misfile → PASS",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A", "B"], misfile: ["100% set aside"] }), run({ verdictOk: true, surfaced: ["A", "B"] })], KEY).pass, true);

// 5) Tier-2 consensus — disposition-misfile in MAJORITY (2/3, SYSTEMATIC) → FAIL (the guard).
check("2/3 disposition-misfile → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"], misfile: ["100% set aside"] }), run({ verdictOk: true, surfaced: ["A", "B"], misfile: ["100% set aside"] }), run({ verdictOk: true, surfaced: ["A", "B"] })], KEY).pass, false);

// 6) COMPLETENESS — concept B surfaced 1/3 → FAIL.
check("concept 1/3 → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: true, surfaced: ["A"] }), run({ verdictOk: true, surfaced: ["A"] })], KEY).pass, false);

// 7) COMPLETENESS — verdict ok 1/3 → FAIL.
check("verdict 1/3 → FAIL",
  gradeConsensus([run({ verdictOk: true, surfaced: ["A", "B"] }), run({ verdictOk: false, surfaced: ["A", "B"] }), run({ verdictOk: false, surfaced: ["A", "B"] })], KEY).pass, false);

console.log(`consensus-grading gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — Tier-1 disqualifying=zero-tolerance, Tier-2 disposition-misfile=majority consensus (Brain cards 41+42).");
