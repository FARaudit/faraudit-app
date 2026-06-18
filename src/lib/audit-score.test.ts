// score-recalibration determinism + SPREAD test.
// Run: npx tsx src/lib/audit-score.test.ts
//
// Locks in the recalibrated AI-driven severity derivation. The regression this
// guards against has TWO failure modes:
//   (A) the ORIGINAL bug - severity frozen at the constant 5, score ~50 everywhere.
//   (B) the OVER-CORRECTION - the additive +4/P0 +2/trap formula saturated the
//       0..10 clamp on virtually every DoD register, pinning the score at 25 /
//       NO-BID for EVERYTHING.
// The fix must make the composite score SPREAD across realistic solicitations:
//   a clean low-risk set-aside lands high (PROCEED), a genuinely hard pursuit
//   lands mid (CAUTION), and only a true disqualifier lands low (NO-BID).

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

// Mirror of the composite score block in audit-engine.ts (score-recalibration).
// score = clamp(0..100, 100 - min(12, material x 0.8) - severity x 4.6),
//         then if a genuine disqualifier fired, cap into the NO-BID band (<= 25).
const DISQ_RE = /disqualif|no[-\s]?bid|sole[-\s]?source|market[-\s]?structure/i;
const compositeScore = (
  risks: PrioritizedRisk[],
  traps: DFARSFlag[],
  certCount: number
): number => {
  const severity = deriveSeverityScore(risks, traps);
  const dfarsTrapCount = traps.filter((f) => f.detected).length;
  const materialCount = dfarsTrapCount + certCount;
  const complexityPenalty = Math.min(12, materialCount * 0.8);
  const riskPenalty = severity * 4.6;
  let score = Math.max(0, Math.min(100, Math.round(100 - complexityPenalty - riskPenalty)));
  const disqualifierFired = risks.some((r) => DISQ_RE.test(r.category || ""));
  if (disqualifierFired) score = Math.min(score, 25);
  return score;
};
const bandOf = (s: number) => (s >= 70 ? "PROCEED" : s >= 40 ? "CAUTION" : "NO-BID");

// Realistic fixtures, ordered easiest to hardest.

// CLEAN 8(a) set-aside: no traps, one minor P1, a few P2 context items, 1 cert.
const cleanSetAside = {
  risks: [risk("P1"), risk("P2"), risk("P2"), risk("P2")],
  traps: [trap(false)],
  certs: 1
};

// Civilian construction IFB: a few P1 compliance items, several P2, no traps.
const civilianIFB = {
  risks: [risk("P1"), risk("P1"), risk("P1"), risk("P2"), risk("P2"), risk("P2"), risk("P2")],
  traps: [trap(false)],
  certs: 2
};

// Clearance-heavy services: a couple P0 trap clauses + detected traps + several P1.
const clearanceHeavy = {
  risks: [
    risk("P0", "DFARS trap"),
    risk("P0", "DFARS trap"),
    risk("P1"), risk("P1"), risk("P1"), risk("P1"), risk("P1"),
    risk("P2"), risk("P2"), risk("P2")
  ],
  traps: [trap(true), trap(true)],
  certs: 5
};

// Hard DoD pursuit: multiple P0 traps + several detected traps + many P1.
const hardPursuit = {
  risks: [
    risk("P0", "DFARS trap"), risk("P0", "DFARS trap"), risk("P0", "DFARS trap"),
    risk("P1"), risk("P1"), risk("P1"), risk("P1"), risk("P1"), risk("P1"),
    risk("P2"), risk("P2"), risk("P2"), risk("P2")
  ],
  traps: [trap(true), trap(true), trap(true)],
  certs: 7
};

// TRUE disqualified pursuit: genuine sole-source / disqualification finding.
const disqualified = {
  risks: [
    risk("P0", "Disqualification"),
    risk("P0", "sole-source"),
    risk("P0", "DFARS trap"), risk("P0", "DFARS trap"),
    risk("P1"), risk("P1"), risk("P1")
  ],
  traps: [trap(true), trap(true)],
  certs: 8
};

const sClean = compositeScore(cleanSetAside.risks, cleanSetAside.traps, cleanSetAside.certs);
const sIFB = compositeScore(civilianIFB.risks, civilianIFB.traps, civilianIFB.certs);
const sClear = compositeScore(clearanceHeavy.risks, clearanceHeavy.traps, clearanceHeavy.certs);
const sHard = compositeScore(hardPursuit.risks, hardPursuit.traps, hardPursuit.certs);
const sDisq = compositeScore(disqualified.risks, disqualified.traps, disqualified.certs);

console.log("\n-- composite score spread --");
for (const [l, s] of [
  ["clean 8(a) set-aside  ", sClean],
  ["civilian construction ", sIFB],
  ["clearance-heavy svcs   ", sClear],
  ["hard DoD pursuit       ", sHard],
  ["true disqualified      ", sDisq]
] as Array<[string, number]>) {
  console.log(`  ${l} ${String(s).padStart(3)}/100  ${bandOf(s)}`);
}
console.log("");

// Assertions.

// 1. Clean fixture lands HIGH - PROCEED (>= 65 per the recalibration spec).
run("T1 - clean set-aside >= 65 (PROCEED)", sClean >= 65, `got ${sClean}`);

// 2. Civilian IFB also PROCEED-band but DISTINCT from the cleanest.
run("T2 - civilian IFB >= 65 (PROCEED)", sIFB >= 65, `got ${sIFB}`);
run("T2b - civilian IFB strictly below clean (spread within PROCEED)", sIFB < sClean, `IFB=${sIFB} clean=${sClean}`);

// 3. Heavy fixture lands LOW - <= 40 per the spec.
run("T3 - true disqualified <= 40 (NO-BID)", sDisq <= 40, `got ${sDisq}`);
run("T3b - true disqualified < 30 (genuine no-go)", sDisq < 30, `got ${sDisq}`);

// 4. The mid fixtures land in DISTINCT bands - not all the same value.
run("T4 - clearance-heavy above hard pursuit", sClear > sHard, `clear=${sClear} hard=${sHard}`);
run("T4b - hard pursuit in CAUTION band (40-69)", sHard >= 40 && sHard < 70, `got ${sHard}`);

// 5. CORE REGRESSION GUARD: a real spread - at least 4 distinct values, wide range.
const scores = [sClean, sIFB, sClear, sHard, sDisq];
const distinct = new Set(scores).size;
run("T5 - at least 4 distinct composite scores (no saturation)", distinct >= 4, `scores=${JSON.stringify(scores)} distinct=${distinct}`);
run("T5b - spread >= 40 points between cleanest and hardest", sClean - sDisq >= 40, `clean=${sClean} disq=${sDisq} spread=${sClean - sDisq}`);

// 6. Monotonic ordering: easier pursuits never score below harder ones.
run("T6 - monotonic clean >= IFB >= clearance >= hard >= disqualified",
  sClean >= sIFB && sIFB >= sClear && sClear >= sHard && sHard >= sDisq,
  `${sClean} ${sIFB} ${sClear} ${sHard} ${sDisq}`);

// 7. Bands actually differ - not all PROCEED, not all NO-BID.
const bands = new Set(scores.map(bandOf));
run("T7 - at least 3 distinct recommendation bands present", bands.size >= 3, `bands=${JSON.stringify([...bands])}`);

// 8. Diminishing returns: 8 P0-traps must NOT score wildly below 3 P0-traps.
const sev3 = deriveSeverityScore(
  [risk("P0", "DFARS trap"), risk("P0", "DFARS trap"), risk("P0", "DFARS trap")],
  []
);
const sev8 = deriveSeverityScore(
  Array.from({ length: 8 }, () => risk("P0", "DFARS trap")),
  []
);
run("T8 - diminishing returns: 8 P0-traps within +1.5 severity of 3 P0-traps", sev8 - sev3 <= 1.5, `sev3=${sev3} sev8=${sev8}`);
run("T8b - graded P0-traps alone never reach the disqualifier floor (< 9)", sev8 < 9, `sev8=${sev8}`);

// 9. Determinism: identical inputs produce identical outputs.
run("T9 - deterministic across repeated calls",
  deriveSeverityScore(disqualified.risks, disqualified.traps) === deriveSeverityScore(disqualified.risks, disqualified.traps) &&
    compositeScore(cleanSetAside.risks, cleanSetAside.traps, cleanSetAside.certs) === sClean);

// 10. Empty / undefined inputs degrade to 0, not a crash.
run("T10 - empty inputs -> severity 0", deriveSeverityScore([], undefined) === 0);

// 11. A genuine disqualifier sets the hard floor regardless of other risks.
const loneDisq = deriveSeverityScore([risk("P0", "sole-source")], []);
run("T11 - lone genuine disqualifier -> severity >= 9 (hard floor)", loneDisq >= 9, `got ${loneDisq}`);

console.log(`\n--------------  ${pass} pass - ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
