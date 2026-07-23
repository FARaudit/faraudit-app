// VERDICT ARC (move 3, Brain #664) — INCOMPLETE precedence over the coverage-pole NHR ($0 suite).
// Run: npx tsx src/lib/audit-decide-incomplete-precedence.test.ts
//
// The #664 defect: a posted binding DOCUMENT that could not be confirmed read in full (documentsComplete=false)
// was SUBORDINATE to a coverage-pole NHR grading the SAME unread content — the engine reported "findings not
// trustworthy" (NHR) when the honest label is "we could not read the document" (INCOMPLETE). AUDIT_GATE_V2 must be
// set BEFORE importing the module (GATE_V2_ENABLED is a load-time const), so this uses a dynamic import.
export {}; // force MODULE scope (no top-level import stmt here — env must be set before the dynamic import below)
process.env.AUDIT_GATE_V2 = "true";
type TypedFinding = import("./audit-findings").TypedFinding;
type VerdictInputs = import("./audit-findings").VerdictInputs;

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

async function main() {
const { deriveVerdict } = await import("./audit-decide");

const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
const finding = (): TypedFinding => ({
  requirement: "Offeror shall submit a technical approach.", citation: "§ L.3",
  excerpt: "The offeror shall submit a technical approach.", kind: "technical_spec",
  controllability: "bidder_controls", grounded: true, lens: "proposal_manager", curableInWindow: true,
});
// A coverageV2 that makes gateV2Outcome return NEEDS_HUMAN_REVIEW (an uncovered disqualifier).
const covNHR = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [{ section: "L", obligation: "Offeror must hold an active facility clearance at time of award." }], coverageGrade: 0.9 };
const mk = (over: Partial<VerdictInputs>): VerdictInputs => ({ findings: [finding()], ...base, coverageV2: covNHR, ...over });

console.log("\n── 1 · defect repro: documentsComplete=false + coverage-pole NHR, FLAG OFF ⇒ NHR (subordinate cap, today's behavior) ──");
{
  delete process.env.AUDIT_INCOMPLETE_PRECEDENCE;
  const d = deriveVerdict(mk({ documentsComplete: false }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `flag-OFF ⇒ coverage-pole NHR still wins (got ${d.verdict}) — byte-identical`);
}

console.log("\n── 2 · RULED CORRECTION (Brain, card #687): an UNCOVERED DISQUALIFIER outranks the INCOMPLETE hoist ──");
{
  // ⚠ THIS SECTION PREVIOUSLY ASSERTED THE BUG. It fixed `covNHR` (which carries an uncovered disqualifier) and
  // demanded INCOMPLETE — so the suite was GREEN *because* it encoded the over-reach, while the corpus gate
  // failed at 26/28. That is the L40 pattern in its purest form: a unit suite can only ever confirm the
  // behaviour its author assumed. Brain ruled reading (a) — REGRESSION — on 2026-07-22:
  //   an uncovered disqualifier is READ content (the engine ENUMERATED the obligation and failed to GROUND it;
  //   found-but-unverifiable ≠ unread), so #664's own intent — "a real bar on read content wins" — routes it to
  //   NHR. Customer-safety tiebreak: the coverage-NHR reason NAMES a potential eligibility bar needing human
  //   verification; the INCOMPLETE reason hides it behind a manifest complaint.
  // This expectation was changed by RULING, never silently.
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const d = deriveVerdict(mk({ documentsComplete: false }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `flag-ON + uncovered disqualifier ⇒ coverage-NHR wins (got ${d.verdict})`);
  assert(!/document set not complete/i.test(d.reason), "reason must NAME the bar, not hide it behind a manifest complaint");
}

console.log("\n── 2b · #664 PROPER SCOPE PRESERVED: unread binding content with NO uncovered disqualifier ⇒ INCOMPLETE ──");
{
  // The hoist still does its original job — this is the case #664 was actually created for.
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const covClean = { unreadable: ["C"], ungroundedRead: [], disqualifierUncovered: [], coverageGrade: 0.5 };
  const d = deriveVerdict({ findings: [finding()], ...base, coverageV2: covClean, documentsComplete: false });
  assert(d.verdict === "INCOMPLETE", `unread binding doc, no uncovered disqualifier ⇒ INCOMPLETE (got ${d.verdict})`);
  assert(/document set not complete/i.test(d.reason), "reason names the completeness gap");
}

console.log("\n── 2c · CORPUS-INTERACTION PIN (suite-design addendum, Brain #687) ──");
{
  // L40 SUITE-DESIGN ADDENDUM: a unit suite MUST carry at least one pin reproducing the CORPUS interaction that
  // its branch participates in — otherwise it can be green while the gate fails, which is exactly what happened
  // here. These are the shapes of the two real gold-set specimens (FA8137 6439ac27 / be69ce16) that caught it.
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const bothStates = [true, false].map((precedence) => {
    if (precedence) process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true"; else delete process.env.AUDIT_INCOMPLETE_PRECEDENCE;
    return deriveVerdict(mk({ documentsComplete: false })).verdict;
  });
  assert(bothStates[0] === "NEEDS_HUMAN_REVIEW" && bothStates[1] === "NEEDS_HUMAN_REVIEW",
    `corpus shape: uncovered disqualifier + incomplete docs ⇒ NHR in BOTH flag states (got on=${bothStates[0]} off=${bothStates[1]})`);
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
}

console.log("\n── 3 · FLAG ON but documentsComplete=true ⇒ the hoist does NOT bite ⇒ coverage-pole NHR unchanged ──");
{
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const d = deriveVerdict(mk({ documentsComplete: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `documentsComplete=true ⇒ coverage-pole NHR still fires (got ${d.verdict})`);
}

console.log("\n── 4 · FLAG ON + documentsComplete=false + NO coverage NHR ⇒ INCOMPLETE (was already 1b INCOMPLETE; unchanged) ──");
{
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const clean = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [], coverageGrade: 0.99 };
  const d = deriveVerdict({ findings: [finding()], ...base, coverageV2: clean, documentsComplete: false });
  assert(d.verdict === "INCOMPLETE", `no coverage NHR ⇒ INCOMPLETE either way (got ${d.verdict})`);
}

console.log("\n── 5 · FLAG ON + documentsComplete undefined ⇒ hoist inert (=== false only) ⇒ coverage-pole NHR unchanged ──");
{
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const d = deriveVerdict(mk({}));  // documentsComplete omitted
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `undefined documentsComplete ⇒ no hoist (got ${d.verdict})`);
}

delete process.env.AUDIT_INCOMPLETE_PRECEDENCE;
console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`} — #664 INCOMPLETE precedence`);
if (failures) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
