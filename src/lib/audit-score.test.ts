// score-ai-driven test (2026-06-18).
// Run: npx tsx src/lib/audit-score.test.ts
//
// The audit SCORE is now the MODEL'S reasoned judgment, not a TS formula. The
// overview LLM call emits a calibrated 0-100 fit_score (overviewJson.fit_score)
// against an explicit band rubric; TS takes that as rawScore and applies only
// two overrides: (1) a fired genuine disqualifier floors the score into the
// NO-BID band (<=25), and (2) a FAIRNESS GUARD that prevents an OPEN, far-
// deadline, no-disqualifier solicitation from being reflexively NO-BID.
//
// This test mirrors that composite logic and asserts:
//   - the AI score FLOWS THROUGH unchanged on the normal path;
//   - five different AI scores produce five different composite scores (SPREAD,
//     not the saturated 25-42 cluster the old formula produced);
//   - a genuine disqualifier still floors to NO-BID regardless of AI optimism;
//   - the fairness guard lifts a winnable open sol out of auto-DECLINE but
//     NEVER lifts a disqualifier or a closed/imminent deadline;
//   - deriveSeverityScore (still exported, now a fallback) keeps its
//     determinism + diminishing-returns + disqualifier-floor properties.

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

// Faithful mirror of the score-ai-driven composite block in audit-engine.ts.
//   rawScore = aiScore ?? formulaScore (formula = fallback only)
//   if disqualifier fired -> rawScore = min(rawScore, 25)
//   if no disqualifier AND deadline comfortable AND rawScore < 40 -> rawScore = 40
const DISQ_RE = /disqualif|no[-\s]?bid|sole[-\s]?source|market[-\s]?structure/i;
const compositeScore = (
  risks: PrioritizedRisk[],
  traps: DFARSFlag[],
  certCount: number,
  aiScore: number | null,
  deadlineDays: number | null
): number => {
  // formula fallback (unchanged math, used only when aiScore is null)
  const severity = deriveSeverityScore(risks, traps);
  const dfarsTrapCount = traps.filter((f) => f.detected).length;
  const materialCount = dfarsTrapCount + certCount;
  const complexityPenalty = Math.min(12, materialCount * 0.8);
  const riskPenalty = severity * 4.6;
  const formulaScore = Math.max(0, Math.min(100, Math.round(100 - complexityPenalty - riskPenalty)));

  const ai =
    typeof aiScore === "number" && Number.isFinite(aiScore)
      ? Math.max(0, Math.min(100, Math.round(aiScore)))
      : null;
  let score = ai ?? formulaScore;

  const disqualifierFired = risks.some((r) => DISQ_RE.test(r.category || ""));
  if (disqualifierFired) score = Math.min(score, 25);

  const deadlineComfortable = deadlineDays == null || deadlineDays >= 10;
  if (!disqualifierFired && deadlineComfortable && score < 40) score = 40;

  return score;
};
const bandOf = (s: number) => (s >= 70 ? "PROCEED" : s >= 40 ? "CAUTION" : "NO-BID");

// ── Realistic fixtures: five DIFFERENT solicitations, each with the AI score
//    the model would reason for it. The old formula crushed ALL of these into
//    25-42 / NO-BID; the AI score spreads them. ──────────────────────────────

// Clean 8(a) set-aside, open, deadline 45 days out. Model: strong fit.
const cleanSetAside = { risks: [risk("P1"), risk("P2"), risk("P2")], traps: [trap(false)], certs: 1, ai: 88, days: 45 };
// Civilian construction IFB, open, 30 days. Model: workable.
const civilianIFB = { risks: [risk("P1"), risk("P1"), risk("P2"), risk("P2")], traps: [trap(false)], certs: 2, ai: 74, days: 30 };
// Clearance-heavy services, open, 21 days. Model: caution.
const clearanceHeavy = { risks: [risk("P0", "DFARS trap"), risk("P1"), risk("P1"), risk("P2")], traps: [trap(true)], certs: 5, ai: 58, days: 21 };
// Hard DoD pursuit, open, 14 days. Model: hard but pursuable.
const hardPursuit = { risks: [risk("P0", "DFARS trap"), risk("P0", "DFARS trap"), risk("P1"), risk("P1")], traps: [trap(true), trap(true)], certs: 7, ai: 44, days: 14 };
// TRUE disqualified pursuit — sole-source named vendor. Model may still score
// it 50 (optimistic), but the disqualifier floor MUST crush it to NO-BID.
const disqualified = { risks: [risk("P0", "Disqualification"), risk("P0", "sole-source"), risk("P1")], traps: [trap(true)], certs: 8, ai: 50, days: 20 };

const sClean = compositeScore(cleanSetAside.risks, cleanSetAside.traps, cleanSetAside.certs, cleanSetAside.ai, cleanSetAside.days);
const sIFB = compositeScore(civilianIFB.risks, civilianIFB.traps, civilianIFB.certs, civilianIFB.ai, civilianIFB.days);
const sClear = compositeScore(clearanceHeavy.risks, clearanceHeavy.traps, clearanceHeavy.certs, clearanceHeavy.ai, clearanceHeavy.days);
const sHard = compositeScore(hardPursuit.risks, hardPursuit.traps, hardPursuit.certs, hardPursuit.ai, hardPursuit.days);
const sDisq = compositeScore(disqualified.risks, disqualified.traps, disqualified.certs, disqualified.ai, disqualified.days);

console.log("\n-- AI-driven composite score spread --");
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

// ── 1. The AI score FLOWS THROUGH unchanged on the normal path (no disqualifier,
//       comfortable deadline, score already >= 40). ──────────────────────────
run("T1 - AI score flows through (clean 88 -> 88)", sClean === 88, `got ${sClean}`);
run("T1b - AI score flows through (IFB 74 -> 74)", sIFB === 74, `got ${sIFB}`);
run("T1c - AI score flows through (clearance 58 -> 58)", sClear === 58, `got ${sClear}`);
run("T1d - AI score flows through (hard 44 -> 44)", sHard === 44, `got ${sHard}`);

// ── 2. SPREAD: five sols -> five distinct scores, wide range (regression guard
//       against the old 25-42 NO-BID-for-everything cluster). ─────────────────
const scores = [sClean, sIFB, sClear, sHard, sDisq];
run("T2 - at least 5 distinct composite scores (no saturation)", new Set(scores).size >= 5, `scores=${JSON.stringify(scores)}`);
run("T2b - spread >= 50 points cleanest..hardest", sClean - sDisq >= 50, `clean=${sClean} disq=${sDisq}`);

// ── 3. Bands actually differ: PROCEED, CAUTION, and NO-BID all present. ──────
const bands = new Set(scores.map(bandOf));
run("T3 - >= 3 distinct recommendation bands", bands.size >= 3, `bands=${JSON.stringify([...bands])}`);
run("T3b - cleanest is PROCEED", bandOf(sClean) === "PROCEED", `got ${bandOf(sClean)}`);

// ── 4. DISQUALIFIER FLOOR: a genuine disqualifier crushes the AI's optimistic
//       50 into the NO-BID band, regardless of what the model scored. ─────────
run("T4 - genuine disqualifier floored to NO-BID (<=25)", sDisq <= 25, `got ${sDisq}`);
const disqOptimistic = compositeScore(disqualified.risks, disqualified.traps, disqualified.certs, 95, 60);
run("T4b - disqualifier floor holds even at AI score 95", disqOptimistic <= 25, `got ${disqOptimistic}`);

// ── 5. FAIRNESS GUARD: an OPEN, far-deadline, no-disqualifier sol the model
//       UNDER-scored (e.g. 30) must NOT auto-DECLINE — floored to CAUTION. ────
const underScoredOpen = compositeScore([risk("P1"), risk("P2")], [trap(false)], 2, 30, 45);
run("T5 - under-scored open sol lifted out of NO-BID (>=40)", underScoredOpen >= 40, `got ${underScoredOpen}`);
run("T5b - fairness guard floors to exactly 40 (low CAUTION, not invented PROCEED)", underScoredOpen === 40, `got ${underScoredOpen}`);

// ── 6. The fairness guard NEVER lifts a real disqualifier... ────────────────
const underScoredDisq = compositeScore([risk("P0", "sole-source")], [trap(false)], 2, 30, 45);
run("T6 - fairness guard does NOT lift a disqualifier", underScoredDisq <= 25, `got ${underScoredDisq}`);

// ── 7. ...nor a CLOSED / IMMINENT deadline. A low AI score with a 3-day
//       deadline stays low (no comfortable-deadline floor). ──────────────────
const lowImminent = compositeScore([risk("P1")], [trap(false)], 1, 28, 3);
run("T7 - imminent deadline (3d) NOT lifted by fairness guard", lowImminent === 28, `got ${lowImminent}`);

// ── 8. FALLBACK: when the model returns no score (null), the formula still
//       produces a number (engine never crashes / never blanks). ────────────
const fellBack = compositeScore([risk("P1"), risk("P2")], [trap(false)], 1, null, 45);
run("T8 - null AI score falls back to formula (a finite number)", Number.isFinite(fellBack) && fellBack > 0, `got ${fellBack}`);

// ── 9. deriveSeverityScore (now a FALLBACK) keeps its core properties. ──────
const sev3 = deriveSeverityScore([risk("P0", "DFARS trap"), risk("P0", "DFARS trap"), risk("P0", "DFARS trap")], []);
const sev8 = deriveSeverityScore(Array.from({ length: 8 }, () => risk("P0", "DFARS trap")), []);
run("T9 - diminishing returns: 8 P0-traps within +1.5 severity of 3", sev8 - sev3 <= 1.5, `sev3=${sev3} sev8=${sev8}`);
run("T9b - graded P0-traps alone never reach the disqualifier floor (<9)", sev8 < 9, `sev8=${sev8}`);
run("T9c - deterministic across repeated calls",
  deriveSeverityScore(disqualified.risks, disqualified.traps) === deriveSeverityScore(disqualified.risks, disqualified.traps));
run("T9d - empty inputs -> severity 0 (no crash)", deriveSeverityScore([], undefined) === 0);
run("T9e - lone genuine disqualifier -> severity >= 9 (hard floor)", deriveSeverityScore([risk("P0", "sole-source")], []) >= 9, `got ${deriveSeverityScore([risk("P0", "sole-source")], [])}`);

// ── 10. Determinism of the whole composite. ─────────────────────────────────
run("T10 - composite deterministic", compositeScore(cleanSetAside.risks, cleanSetAside.traps, cleanSetAside.certs, cleanSetAside.ai, cleanSetAside.days) === sClean);

console.log(`\n--------------  ${pass} pass - ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
