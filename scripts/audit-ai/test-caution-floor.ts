// Brain card 78-R1 ($0) — REPLAY the deterministic caution-floor over STORED graduation findings + a
// synthetic archetype + FLOOR-only safety. NO paid audit. NO flag flip (flag passed explicitly here).
//   npx tsx scripts/audit-ai/test-caution-floor.ts
import { readFileSync } from "node:fs";
import { applyCautionFloor, deriveVerdict, isCautionArchetype } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile, VerdictInputs } from "../../src/lib/audit-findings";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };

const loadFindings = (sol: string): TypedFinding[] =>
  (JSON.parse(readFileSync(`ceo/proofs/v3-${sol}-result.json`, "utf8")).findings as TypedFinding[])
    .map((f) => ({ ...f, grounded: true }));

const decide = (findings: TypedFinding[], profile: BidderProfile | null, enabled: boolean): string => {
  const floored = applyCautionFloor(findings, { enabled });
  const inputs: VerdictInputs = { findings: floored, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true };
  return deriveVerdict(inputs).verdict;
};
const firedCount = (findings: TypedFinding[]) => applyCautionFloor(findings, { enabled: true }).filter((f) => f.cautionFloor).length;

console.log("── Brain card 78-R1: caution-floor replay ──\n");

// ── STORED #4 (AOCSSB26R0023) — Brain EXPECTED floor to fire on the conservator quals → CAUTION ──
const f4 = loadFindings("AOCSSB26R0023");
const f4Fired = firedCount(f4);
const f4On = decide(f4, null, true);
const f4Off = decide(f4, null, false);
console.log("[#4 AOCSSB26R0023 — STORED 23 findings]");
console.log(`  archetype matches in stored findings: ${f4Fired}`);
ok(f4Off === "BID", `flag OFF → ${f4Off} (current behavior, unchanged)`);
// HONEST: the quals were NEVER GROUNDED in the stored run (0/23) → floor cannot fire on them → stays BID.
ok(f4Fired === 0, `flag ON → floor fires on ${f4Fired} stored findings — the conservator quals are ABSENT from the grounded set (engine grounding gap), so the floor has nothing to floor`);
ok(f4On === "BID", `flag ON → ${f4On} (NOT the CAUTION Brain expected — because the quals were never grounded, not because the floor is wrong)`);

// ── POSITIVE: synthetic archetype (the actual #4 conservator-quals text) → floor FIRES → CAUTION ──
const synthQuals: TypedFinding = {
  requirement: "Key personnel qualifications: Senior Conservators shall have a minimum of twenty (20) years of successful experience; Conservators shall have a minimum Ten (10) years; Architectural Conservator shall review reference documents.",
  citation: "§C Statement of Work", excerpt: "Senior Conservators shall have a minimum of twenty (20) years ... Conservators shall have a minimum Ten (10) years", kind: "submission", controllability: "bidder_controls", grounded: true, lens: "former_ko",
};
console.log("\n[POSITIVE — synthetic conservator-quals archetype]");
ok(isCautionArchetype(synthQuals).fires, `predicate fires (archetype=${isCautionArchetype(synthQuals).archetype})`);
ok(decide([synthQuals], null, true) === "BID_WITH_CAUTION", `flag ON → ${decide([synthQuals], null, true)} (floor works when the quals ARE grounded)`);
ok(decide([synthQuals], null, false) === "BID", `flag OFF → ${decide([synthQuals], null, false)} (unchanged)`);

// ── REGRESSION: STORED #2 (1240LP26Q0067, BID) → floor must NOT fire ──
const f2 = loadFindings("1240LP26Q0067");
console.log("\n[#2 1240LP26Q0067 — STORED findings, regression]");
ok(firedCount(f2) === 0, `flag ON → floor fires on ${firedCount(f2)} findings (must be 0)`);
ok(decide(f2, null, true) === "BID", `flag ON → ${decide(f2, null, true)} (stays BID)`);
ok(decide(f2, null, false) === "BID", `flag OFF → ${decide(f2, null, false)} (unchanged)`);

// ── FLOOR-ONLY SAFETY ──
console.log("\n[FLOOR-only safety]");
// never downgrades a NO_BID (universal show-stopper untouched even if it also matched an archetype)
const universal: TypedFinding = { requirement: "QPL listing required; lead time exceeds window for every bidder", citation: "§E", excerpt: "Qualified Products List (QPL) membership required", kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko", curableInWindow: false };
ok(decide([universal], null, true) === "NO_BID", `NO_BID (no_one_can_move) + floor ON → ${decide([universal], null, true)} (never downgraded)`);
// never upgrades to INELIGIBLE under a NON-NULL profile (floor marks, does not create a profile-checked bar)
const profile: BidderProfile = { satisfiedAttributes: [] };
ok(decide([synthQuals], profile, true) === "BID_WITH_CAUTION", `archetype + NON-NULL profile + floor ON → ${decide([synthQuals], profile, true)} (CAUTION, never INELIGIBLE)`);
// generic "qualified personnel" (no quantified minimum) must NOT fire
const generic: TypedFinding = { requirement: "Contractor shall provide qualified, experienced, knowledgeable personnel to perform the work.", citation: "§C", excerpt: "qualified and experienced personnel", kind: "submission", controllability: "bidder_controls", grounded: true, lens: "former_ko" };
ok(!isCautionArchetype(generic).fires, "generic 'qualified/experienced personnel' (no quantified minimum) → does NOT fire");
// SAM/responsibility cert must NOT fire
const samCert: TypedFinding = { requirement: "Offeror must certify (52.209-5) responsibility and maintain active SAM registration.", citation: "52.209-5", excerpt: "certify that it and its principals", kind: "eligibility_bar", controllability: "bidder_controls", grounded: true, lens: "contracts_attorney" };
ok(!isCautionArchetype(samCert).fires, "SAM/responsibility certification boilerplate → does NOT fire");

console.log("");
if (fail) { console.error(`✗ ${fail} check(s) FAILED`); process.exit(1); }
console.log("✓ ALL CHECKS PASS — predicate correct, floor works on grounded archetype, FLOOR-only safe (no downgrade, no INELIGIBLE), flag-off unchanged. KEY FINDING: #4's stored findings do NOT contain the conservator quals (engine grounding gap) → floor can't fire on them.");
