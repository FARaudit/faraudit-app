/**
 * Brain card 96 ($0) — flag-activation interaction harness. FROZEN fixtures + deterministic decide() ONLY.
 * UNCOMMITTED helper. No flag flip (defaults stay OFF — flags passed explicitly), no commit, no paid run.
 *
 * Exercises the DECIDE-STAGE flags (temporal P1.6 → precondition-overtype P4.4 → caution-floor P4.5) in the
 * orchestrator's fixed order. grounding-sweep (P1.5) is finding-generation from SOURCE — its outputs are
 * already baked into the captured fixtures (so it is not re-applied here). persona-diversity is LENS-stage
 * (audit-package.ts:62, live model) — NOT exercisable against frozen findings; reported, not run.
 *
 * Run: npx tsx scripts/audit-ai/test-flag-stack-interaction.ts
 */
import { readFileSync } from "node:fs";
import { applyTemporalConflict, applyPreconditionOvertypeFloor, applyCautionFloor, deriveVerdict, isCautionArchetype } from "../../src/lib/audit-decide";
import { highSignalSweep } from "../../src/lib/audit-grounding-sweep";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const FROZEN = "tests/fixtures/frozen";
const load = (file: string) => (JSON.parse(readFileSync(`${FROZEN}/${file}`, "utf8")).findings as TypedFinding[] | undefined)?.map((f) => ({ ...f, grounded: true }));
const FIX = ["aocssb-with-qual", "aocssb-no-qual", "aocssb-sweep-novel", "fa8601-complete", "fa8601-no-precondition", "fa8601-no-window", "1240lp-bid"];

const verdict = (findings: TypedFinding[]): string => deriveVerdict({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true } as VerdictInputs).verdict;
// orchestrator-order decide stage: temporal(P1.6) → overtype(P4.4) → caution-floor(P4.5).
// temporal `t` runs the Option-1 arm (sharedAroGate) → the FAT-gate-vs-window tension nets to a high-confidence
// CAUTION (bidder_controls + cautionFloor), NEVER NO_BID (Brain card 141/143). Derived live on the sweep findings.
const decide = (findings: TypedFinding[], t: boolean, o: boolean, c: boolean): string => {
  let f = applyTemporalConflict(findings, { enabled: t, sharedAroGate: t });
  f = applyPreconditionOvertypeFloor(f, { enabled: o });
  f = applyCautionFloor(f, { enabled: c });
  return verdict(f);
};
// REVERSED override order: caution-floor BEFORE overtype (to test order-independence of the override pair)
const decideRev = (findings: TypedFinding[], t: boolean, o: boolean, c: boolean): string => {
  let f = applyTemporalConflict(findings, { enabled: t, sharedAroGate: t });
  f = applyCautionFloor(f, { enabled: c });
  f = applyPreconditionOvertypeFloor(f, { enabled: o });
  return verdict(f);
};

console.log("══ (3) STACKED RUN — each-flag-alone vs all-decide-stage-ON, per frozen fixture ══");
console.log("fixture                | base | +temporal | +overtype | +caution | STACKED | divergence");
let anyDivergence = false;
for (const name of FIX) {
  const F = load(`${name}.json`); if (!F) continue;
  const base = decide(F, false, false, false);
  const aT = decide(F, true, false, false);
  const aO = decide(F, false, true, false);
  const aC = decide(F, false, false, true);
  const stk = decide(F, true, true, true);
  // a "surprising" divergence = stacked differs from what each-alone predicts (i.e., a cross-flag interaction
  // beyond the union of single-flag effects). Single-flag effect = the alone verdict that differs from base.
  const singleEffects = [aT, aO, aC].filter((v) => v !== base);
  // Option-1 expected composition: overtype lifts the bare-precondition show-stopper to BID, and the temporal arm
  // supplies the CAUTION floor → BID_WITH_CAUTION. That is the intended overtype+temporal compose, NOT a defect.
  const expectedFloorCompose = stk === "BID_WITH_CAUTION" && aO === "BID";
  const surprising = stk !== base && !singleEffects.includes(stk) && !expectedFloorCompose;
  if (surprising) anyDivergence = true;
  console.log(`${name.padEnd(22)} | ${base.padEnd(4)} | ${aT.padEnd(9)} | ${aO.padEnd(9)} | ${aC.padEnd(8)} | ${stk.padEnd(7)} | ${surprising ? "⚠ SURPRISING (cross-flag)" : "none beyond single-flag"}`);
}
console.log(anyDivergence ? "⚠ a stacked verdict diverged BEYOND single-flag effects" : "✓ every stacked verdict = union of single-flag effects (no surprising cross-flag interaction)");

console.log("\n══ (3) ANCHORS under the full stack ══");
const a4 = decide(load("aocssb-with-qual.json")!, true, true, true);
const a6 = decide(load("fa8601-complete.json")!, true, true, true);
console.log(`  #4 with-qual STACKED → ${a4}  (gold BID_WITH_CAUTION) ${a4 === "BID_WITH_CAUTION" ? "✓" : "✗"}`);
console.log(`  #6 complete  STACKED → ${a6}  (gold BID_WITH_CAUTION — Option-1: overtype lifts the bare precondition, temporal supplies the CAUTION floor) ${a6 === "BID_WITH_CAUTION" ? "✓" : "✗"}`);

console.log("\n══ (5) ORDER-INDEPENDENCE — override pair (overtype↔caution) on every fixture ══");
let orderDefect = false;
for (const name of FIX) {
  const F = load(`${name}.json`); if (!F) continue;
  const fwd = decide(F, true, true, true);
  const rev = decideRev(F, true, true, true);
  if (fwd !== rev) { orderDefect = true; console.log(`  ${name}: fwd=${fwd} rev=${rev} ⚠ ORDER-DEPENDENT`); }
}
console.log(orderDefect ? "⚠ ORDER-DEPENDENT on a real fixture" : "✓ no real fixture changes verdict under override reordering");

console.log("\n══ (4) COLLISION — a finding BOTH overtype-DOWN (no_one_can_move precondition) AND caution-UP (archetype) ══");
// search every fixture for a finding that is both candidates simultaneously
let foundReal = false;
for (const name of FIX) {
  const F = load(`${name}.json`); if (!F) continue;
  for (const f of F) if (f.controllability === "no_one_can_move" && isCautionArchetype(f).fires) { foundReal = true; console.log(`  REAL collision finding in ${name}: ${f.requirement.slice(0, 60)}`); }
}
if (!foundReal) console.log("  → NO existing fixture finding is BOTH (caution-floor SKIPS no_one_can_move; overtype acts ONLY on no_one_can_move — mutually exclusive on a single finding EXCEPT via sequencing). Not fabricated.");
// CONSTRUCT from existing fixture content (not a fabricated verdict): the real #6 FAT-precondition finding
// + the real #4 conservator-qual text → a no_one_can_move precondition that ALSO fires the caution archetype.
const pre = load("fa8601-complete.json")!.find((f) => f.controllability === "no_one_can_move" && f.lens === "former_ko")!;
const qual = load("aocssb-with-qual.json")!.find((f) => isCautionArchetype(f).fires)!;
const collision: TypedFinding = { ...pre, requirement: `${pre.requirement} ${qual.requirement}`, excerpt: `${pre.excerpt} ${qual.excerpt}` };
console.log(`  constructed (from #6 precondition + #4 qual): no_one_can_move + isCautionArchetype.fires=${isCautionArchetype(collision).fires}`);
const fwdC = decide([collision], false, true, true);     // orchestrator order: overtype → caution
const revC = decideRev([collision], false, true, true);  // reversed: caution → overtype
console.log(`  orchestrator order (overtype→caution): ${fwdC}`);
console.log(`  reversed order (caution→overtype):     ${revC}`);
console.log(fwdC !== revC
  ? `  ⚠ ORDER-DEPENDENT: ${fwdC} vs ${revC}. Orchestrator's FIXED order yields ${fwdC} (the safe/higher-caution result). LATENT — no real fixture exhibits it. (item 5 defect — named, NOT fixed.)`
  : `  ✓ order-independent on the constructed collision (${fwdC})`);

console.log("\n══ (7) TEMPORAL is the SAFETY NET for overtype — source-grounded sweep (deterministic, $0) ══");
// Reconstruct a REAL impossible-window package the way production would at P1.5/P1.6: the deterministic
// sweep grounds fat_precondition(60) + delivery_window(30) WITH durations from the #6 source, and the lens
// over-typed the bare precondition no_one_can_move (no window co-stated). This is what the frozen
// finding-fixture could NOT show — its captured fat/delivery excerpts dropped the raw durations.
const src6 = readFileSync("scripts/audit-ai/gold-sets/FA860126Q00260001-FULL-SOURCE.complete.txt", "utf8");
const sweep6 = highSignalSweep(src6); // fat_precondition + delivery_window, grounded with 60/30 durations
const bareOvertype = load("fa8601-complete.json")!.find((f) => f.lens === "former_ko" && f.controllability === "no_one_can_move")!;
const realPkg: TypedFinding[] = [bareOvertype, ...sweep6];
const tOnOoN = decide(realPkg, true, true, false);   // temporal ON  + overtype ON → temporal re-derives [21]
const tOffOoN = decide(realPkg, false, true, false);  // temporal OFF + overtype ON → bare precondition downgraded, no [21]
console.log(`  sweep grounded archetypes: [${[...new Set(sweep6.map((f) => f.sweepArchetype))].join(", ")}]`);
console.log(`  overtype ON + temporal ON  → ${tOnOoN}  (temporal re-derives the FAT-gate-vs-window tension as a high-confidence CAUTION floor — Option 1)`);
console.log(`  overtype ON + temporal OFF → ${tOffOoN}  (no derived tension; bare precondition downgraded → clean BID)`);
console.log(tOnOoN === "BID_WITH_CAUTION" && tOffOoN === "BID"
  ? "  ⇒ ORDERING GUARD HOLDS (Ruling 1): overtype WITHOUT temporal FALSE-BIDs an uncertain-window package; temporal must fire BEFORE/WITH overtype to establish the CAUTION floor — NEVER overtype alone. (Only the floor moved NO_BID → CAUTION; the guard is NOT moot.)"
  : `  ⇒ (unexpected safety-net result: ON=${tOnOoN} OFF=${tOffOoN})`);

console.log("\n(analysis only — nothing asserted as pass/fail; deterministic, $0)");
