/**
 * Brain card 92 ($0) — precondition-overtype-floor (Option 1 deterministic guard). FROZEN fixtures only;
 * flag flipped in-test (like caution-floor). NO commit/push/paid run. deriveVerdict UNTOUCHED.
 *
 * Proves: a time-curable precondition mis-typed no_one_can_move (no co-stated window) is re-typed to
 * bidder_controls so it is NOT a false NO_BID; the REAL universal impossibility (temporal_conflict) survives;
 * structural bars + co-stated-conflict findings are NEVER downgraded; the temporal_conflict finding is never
 * mutated; flag OFF preserves the legacy bug byte-for-byte.
 *
 * Run: npx tsx scripts/audit-ai/test-precondition-overtype-floor.ts
 */
import { readFileSync } from "node:fs";
import { applyTemporalConflict, applyPreconditionOvertypeFloor, applyCautionFloor, deriveVerdict } from "../../src/lib/audit-decide";
import { highSignalSweep } from "../../src/lib/audit-grounding-sweep";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };
const FROZEN = "tests/fixtures/frozen";
const frozen = (file: string) => (JSON.parse(readFileSync(`${FROZEN}/${file}`, "utf8")).findings as TypedFinding[]).map((f) => ({ ...f, grounded: true }));

// decide: DERIVE the temporal arm (Option-1, sharedAroGate ON → high-confidence CAUTION, never NO_BID) → overtype
// guard at the chosen flag state → caution-floor → derive. The temporal_conflict basis is now DERIVED live from the
// regenerated sweep findings (not baked into the fixture), matching the orchestrator order P1.6 → P4.4 → P4.5.
const decide = (findings: TypedFinding[], preOn: boolean): string => {
  let f = applyTemporalConflict(findings, { enabled: true, sharedAroGate: true });
  f = applyPreconditionOvertypeFloor(f, { enabled: preOn });
  f = applyCautionFloor(f, { enabled: true });
  const inp: VerdictInputs = { findings: f, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true };
  return deriveVerdict(inp).verdict;
};
const survivingNoMove = (findings: TypedFinding[], preOn: boolean) =>
  applyPreconditionOvertypeFloor(findings, { enabled: preOn }).filter((f) => f.controllability === "no_one_can_move");
const mk = (over: Partial<TypedFinding>): TypedFinding => ({
  requirement: "", citation: "§F", excerpt: "", kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko", ...over,
});

// ── FROZEN #6 FA860126Q00260001 ──────────────────────────────────────────────
const complete = frozen("fa8601-complete.json");
const noWin = frozen("fa8601-no-window.json");

console.log("[overtype ON — the fix · Option-1 doctrine: temporal nets to high-confidence CAUTION, never NO_BID]");
ok(decide(complete, true) === "BID_WITH_CAUTION", `complete → ${decide(complete, true)} (BID_WITH_CAUTION — the bare precondition is downgraded; the surviving basis is the DERIVED temporal CAUTION, not a NO_BID)`);
// the bare precondition (former_ko) is downgraded by overtype → 0 surviving no_one_can_move; the surviving BASIS is
// the DERIVED temporal_conflict, now bidder_controls + cautionFloor (the Option-1 high-confidence CAUTION floor).
const survAfterOvertype = survivingNoMove(complete, true);
ok(survAfterOvertype.length === 0,
  `bare precondition downgraded → 0 surviving no_one_can_move after overtype → [${[...new Set(survAfterOvertype.map((f) => f.lens))].join(", ") || "none"}]`);
const tcBasis = applyTemporalConflict(complete, { enabled: true, sharedAroGate: true }).filter((f) => f.lens === "temporal_conflict");
ok(tcBasis.length >= 1 && tcBasis.every((f) => f.controllability === "bidder_controls" && f.cautionFloor === true),
  `surviving CAUTION basis = DERIVED temporal_conflict (bidder_controls + cautionFloor) → keeps complete at BID_WITH_CAUTION, never NO_BID`);
ok(decide(noWin, true) !== "NO_BID", `no-window → ${decide(noWin, true)} (feasible precondition + no window → not NO_BID)`);

console.log("[overtype OFF — bare precondition NOT downgraded → its model-asserted no_one_can_move surfaces as the legacy false-NO_BID]");
ok(decide(complete, false) === "NO_BID", `complete → ${decide(complete, false)} (overtype OFF leaves the former_ko bare precondition no_one_can_move → NO_BID; the temporal CAUTION alone cannot floor a surviving show-stopper — this is exactly why overtype is needed)`);
ok(decide(noWin, false) === "NO_BID", `no-window → ${decide(noWin, false)} (overtype OFF → bare precondition false-NO_BID preserved)`);

// ── PREDICATE / BOUNDARY (synthetic findings — predicate tests, NOT verdict fixtures) ─────────────────
console.log("[predicate + boundary]");
const barePre = mk({ requirement: "First Article Testing is explicitly NON-WAIVABLE: the CO shall not authorize production or delivery until first article approval is granted.", excerpt: "First article testing is a non-waivable precondition to production and delivery." });
ok(applyPreconditionOvertypeFloor([barePre], { enabled: true })[0].controllability === "bidder_controls", "FIRES: bare precondition, no co-stated window → downgraded to bidder_controls");

const conflictPre = mk({ requirement: "First article testing minimum SIXTY (60) calendar days cannot complete inside the THIRTY (30) day delivery window ARO — no bidder can comply.", excerpt: "60-day FAT cannot complete inside the 30-day delivery window ARO." });
ok(applyPreconditionOvertypeFloor([conflictPre], { enabled: true })[0].controllability === "no_one_can_move", "DOES NOT FIRE: precondition that CO-STATES a window conflict → NOT downgraded");
ok(decide([conflictPre], true) === "NO_BID", "co-stated-conflict precondition STILL drives NO_BID (guard does not over-reach)");

const qpl = mk({ requirement: "Qualified Products List (QPL) membership is required and the qualification lead time exceeds the response window.", excerpt: "QPL listing required; lead time exceeds the window.", curableInWindow: false });
ok(applyPreconditionOvertypeFloor([qpl], { enabled: true })[0].controllability === "no_one_can_move", "DOES NOT FIRE: QPL structural bar → NOT downgraded");
ok(decide([qpl], true) === "NO_BID", "QPL structural bar STILL NO_BID");

const soleSource = mk({ requirement: "Sole-source to the named OEM DGMT1002; no substitute or or-equal is permitted.", excerpt: "Sole source to named OEM; no substitute permitted.", curableInWindow: false });
ok(applyPreconditionOvertypeFloor([soleSource], { enabled: true })[0].controllability === "no_one_can_move", "DOES NOT FIRE: sole-source-to-named-OEM structural bar → NOT downgraded");

const tc = mk({ lens: "temporal_conflict", requirement: "Universal delivery impossibility: a non-waivable First Article precondition cannot complete inside the production delivery window.", excerpt: "non-waivable FAT precondition" });
ok(applyPreconditionOvertypeFloor([tc], { enabled: true })[0].controllability === "no_one_can_move", "NEVER MUTATES the derived temporal_conflict finding");

ok(applyPreconditionOvertypeFloor([barePre], { enabled: false })[0].controllability === "no_one_can_move", "flag OFF → byte-for-byte unchanged");

// ── STRUCTURAL-BAR negative control over a FROZEN fixture (card 92: use one if it exists, else report) ──
const STRUCT = /\bsole[-\s]?source\b|\bQPL\b|\bQML\b|security clearance|facility (?:clearance|certification)/i;
const fixtureStructural = [complete, noWin, frozen("aocssb-with-qual.json"), frozen("1240lp-bid.json")]
  .flat().filter((f) => f.controllability === "no_one_can_move" && STRUCT.test(`${f.requirement} ${f.excerpt}`));
console.log(`[structural-bar fixture availability] frozen no_one_can_move structural bars found: ${fixtureStructural.length}`);
if (fixtureStructural.length === 0) console.log("  → NO structural-bar fixture available — flag-ON negative control proven on synthetic predicate findings above (not fabricated as a verdict fixture, per card 92).");

// ── ORDERING GUARD (Brain Ruling 1) — HARD-asserted (this gated suite process.exits on failure). Overtype WITHOUT
// the temporal arm FALSE-BIDs an uncertain-window package; the temporal arm must fire BEFORE/WITH overtype to
// establish the CAUTION floor. Under Option 1 only the FLOOR moved (NO_BID → CAUTION) — the guard is NOT moot. ──
console.log("[ordering guard — Ruling 1]");
{
  const src6 = readFileSync("scripts/audit-ai/gold-sets/FA860126Q00260001-FULL-SOURCE.v2.complete.txt", "utf8");
  const sweep6 = highSignalSweep(src6);                                  // fat_precondition(60) + delivery_window(30), $0
  const bareFat = complete.find((f) => f.lens === "former_ko" && f.controllability === "no_one_can_move")!;
  const pkg = [bareFat, ...sweep6];
  const decideTO = (findings: TypedFinding[], temporalOn: boolean, overtypeOn: boolean): string => {
    let f = applyTemporalConflict(findings, { enabled: temporalOn, sharedAroGate: temporalOn });
    f = applyPreconditionOvertypeFloor(f, { enabled: overtypeOn });
    f = applyCautionFloor(f, { enabled: true });
    return deriveVerdict({ findings: f, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true } as VerdictInputs).verdict;
  };
  ok(decideTO(pkg, false, true) === "BID", `overtype-ON + temporal-OFF → ${decideTO(pkg, false, true)} (the FALSE-BID an uncertain-window package would slip through — exactly what the ordering guards against)`);
  ok(decideTO(pkg, true, true) === "BID_WITH_CAUTION", `overtype-ON + temporal-ON → ${decideTO(pkg, true, true)} (temporal establishes the CAUTION floor — Ruling 1; guard NOT moot, floor moved NO_BID→CAUTION)`);
}

// ── ANCHOR: decide(complete) == registry-resolved frozen gold-key verdict (#6 = BID_WITH_CAUTION under Option 1) ──
const reg = JSON.parse(readFileSync("scripts/audit-ai/gold-sets/gold-set-registry.json", "utf8"));
const goldVerdict = (sol: string): string => JSON.parse(readFileSync(`scripts/audit-ai/gold-sets/${reg.keys[sol].file}`, "utf8")).expectedVerdict.verdict;
console.log("[anchor]");
ok(decide(complete, true) === goldVerdict("FA860126Q00260001"), `#6 decide(complete, flag ON) = ${decide(complete, true)} == gold-key ${goldVerdict("FA860126Q00260001")}`);

console.log("");
if (fail) { console.error(`✗ ${fail} check(s) FAILED`); process.exit(1); }
console.log("✓ ALL GREEN — precondition-overtype-floor (Option-1): bare precondition downgraded (fix), the DERIVED temporal_conflict CAUTION (bidder_controls+cautionFloor) keeps complete at BID_WITH_CAUTION (never NO_BID), structural/co-stated-conflict MODEL bars NEVER downgraded (still NO_BID — model judgment, not the deterministic temporal arm), temporal_conflict never mutated, overtype-OFF legacy false-NO_BID preserved, anchor = BID_WITH_CAUTION. $0.");
process.exit(0);
