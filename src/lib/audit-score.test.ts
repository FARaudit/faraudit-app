// FA-E2E Fix 1 determinism test. Run: npx tsx src/lib/audit-score.test.ts
//
// Locks in the AI-driven severity derivation: a high-risk solicitation (P0
// disqualifiers + detected DFARS traps) and a clean one (no traps, a couple of
// context items) MUST produce DIFFERENT severity scores - and therefore
// DIFFERENT composite scores. This is the regression guard against the old bug
// where severity was frozen at the constant 5 and the score collapsed to
// ~50 everywhere regardless of risk substance.

import { deriveSeverityScore, type PrioritizedRisk, type DFARSFlag } from "./audit-engine";

let pass = 0;
let fail = 0;
const run = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  " + detail}`);
};

const risk = (priority: "P0" | "P1" | "P2", category = "Compliance"): PrioritizedRisk => ({
  text: "x",
  priority,
  category,
  provenance: "verified"
});
const trap = (detected: boolean): DFARSFlag => ({
  clause: "252.223-7008",
  title: "Hex chrome",
  detected,
  severity: "P0"
});

// HIGH-RISK: 2 disqualifiers + 1 P1 + 2 detected traps
const highRisk = [
  risk("P0", "Disqualification"),
  risk("P0", "DFARS trap"),
  risk("P1")
];
const highTraps = [trap(true), trap(true)];
const highSeverity = deriveSeverityScore(highRisk, highTraps);
// 2x4 + 2x2 + 1x1 = 13 -> clamped to 10
run("T1 - high-risk solicitation -> severity clamps to 10", highSeverity === 10, `got ${highSeverity}`);

// CLEAN: clean set-aside, no traps, two P2 context items
const cleanRisk = [risk("P2"), risk("P2")];
const cleanTraps: DFARSFlag[] = [trap(false)];
const cleanSeverity = deriveSeverityScore(cleanRisk, cleanTraps);
// 2x0.5 = 1
run("T2 - clean solicitation -> low severity (<=2)", cleanSeverity <= 2, `got ${cleanSeverity}`);

// THE KEY ASSERTION: high vs clean produce DIFFERENT scores.
run(
  "T3 - high-risk and clean produce DIFFERENT severity (score is not frozen)",
  highSeverity !== cleanSeverity,
  `high=${highSeverity} clean=${cleanSeverity}`
);

// Composite-score level: 100 - complexityPenalty - severity*5.
const complexityPenalty = 5; // hold constant
const highScore = Math.max(0, Math.min(100, Math.round(100 - complexityPenalty - highSeverity * 5)));
const cleanScore = Math.max(0, Math.min(100, Math.round(100 - complexityPenalty - cleanSeverity * 5)));
run(
  "T4 - composite scores differ (high < clean)",
  highScore < cleanScore,
  `high=${highScore} clean=${cleanScore}`
);

// Determinism: same input -> same output across repeated calls.
run(
  "T5 - deterministic, repeated calls return identical severity",
  deriveSeverityScore(highRisk, highTraps) === highSeverity &&
    deriveSeverityScore(cleanRisk, cleanTraps) === cleanSeverity,
  ""
);

// Detected-trap-only escalation.
const trapOnly = deriveSeverityScore([], [trap(true), trap(true)]);
run("T6 - two detected traps alone -> severity >= 4", trapOnly >= 4, `got ${trapOnly}`);

// Empty / undefined inputs degrade to 0, not a crash.
run("T7 - empty inputs -> severity 0", deriveSeverityScore([], undefined) === 0);

console.log(`\n--------------  ${pass} pass - ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
