// $0 proof for the card #472 SEAM FILL — decision-layer showStoppers under-fill on the GATE_V2 coverage-NHR pole.
// Run:  AUDIT_GATE_V2=true npx tsx src/lib/audit-decide-coverage-nhr-stopper.test.ts
//
// TRACE (6439ac27): a §L conditional-TINA false-NHR fired the GATE_V2 coverage cap (deriveVerdict step 1) and returned
// showStoppers=[], STRANDING three grounded bidder_cannot_move eligibility bars in dispositions[] → they rendered in the
// P2 advisory band, not the V4 show-stopper band (which sources EXCLUSIVELY from persisted showStoppers[], card-293).
// FIX: on the coverage-NHR cap, lift grounded site-visit/eligibility bars into showStoppers[] (flag
// AUDIT_COVERAGE_NHR_STOPPER_FILL, default-OFF), reusing the card-429 siteVisitEligStoppers filter. INVARIANTS:
//   (1) FLAG-OFF byte-identical: showStoppers stays [] (reproduces the bug — proves the fill is what changes it).
//   (2) FLAG-ON: the three grounded eligibility bars populate showStoppers[], floored P0; verdict STAYS NHR (honest-fail,
//       eligible not asserted) — a coverage gap is still a coverage gap; the bars render CONDITIONAL (card 432), not committal.
//   (3) INCOMPLETE cap is NEVER filled (unreadable ⇒ findings untrustworthy) — only the NHR cap.
//   (4) A NON-eligibility disqualifier is NOT promoted (the filter stays tight — no laundering a generic bar onto the pole).
export {};
process.env.AUDIT_GATE_V2 = "true"; // GATE_V2_ENABLED is a module-load const — set BEFORE the dynamic import.

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { deriveVerdict } = await import("./audit-decide");
  type Inp = Parameters<typeof deriveVerdict>[0];

  // Three GROUNDED bidder_cannot_move eligibility bars — the 6439ac27 disqualifying set (BOA-holder · concluded
  // site-visit · vehicle-holder). eligibility_bar + bidder_cannot_move ⇒ disposeFinding → "disqualifying".
  const bars = [
    { id: "f21", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "contract:MAC-BOA-holder", requirement: "Order available ONLY to current MAC BOA holders.", excerpt: "ONLY available to current BOA holders" },
    { id: "f39", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, requirement: "Mandatory site visit was held/concluded; attendance is non-retroactive and bars award unless confirmed.", excerpt: "site visit ... concluded ... bars award" },
    { id: "f40", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, requirement: "Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA).", excerpt: "restricted to vehicle holders only" },
  ];
  // A generic non-eligibility disqualifier (must NEVER be promoted by the tight filter).
  const genericBar = { id: "fX", kind: "requirement", controllability: "bidder_cannot_move", curableInWindow: false, requirement: "Delivery in 3 days is physically impossible.", excerpt: "3 days" };

  // The §L conditional-TINA obligation that (pre-#1) reads as an uncovered disqualifier → GATE_V2 NHR cap.
  const coverageV2_NHR = {
    unreadable: [], ungroundedRead: [],
    disqualifierUncovered: [{ section: "L", obligation: "403-1 apply, the offeror shall be required to submit certified cost or pricing data." }],
    ungroundedNonBarSignal: [], coveredFraction: 0.9,
  };
  const coverageV2_INCOMPLETE = { unreadable: ["C"], ungroundedRead: [], disqualifierUncovered: [], ungroundedNonBarSignal: [], coveredFraction: 0.5 };

  const base = (findings: unknown[], coverageV2: unknown): Inp => ({
    findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false,
    documentsComplete: true, manifestComplete: true, source: "x", coverageV2,
  } as unknown as Inp);

  // ── PIN 1: FLAG-OFF → reproduces the bug (empty showStoppers on the coverage-NHR pole).
  process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL = "false";
  const off = deriveVerdict(base(bars, coverageV2_NHR));
  ok("PIN1 FLAG-OFF: verdict is NEEDS_HUMAN_REVIEW (GATE_V2 §L cap)", off.verdict === "NEEDS_HUMAN_REVIEW");
  ok("PIN1 FLAG-OFF: showStoppers EMPTY (the 6439ac27 under-fill, byte-identical)", off.showStoppers.length === 0);
  ok("PIN1 FLAG-OFF: bars still present in dispositions (stranded)", off.dispositions.filter((d) => d.disposition === "disqualifying").length === 3);

  // ── PIN 2: FLAG-ON → the three grounded eligibility bars fill showStoppers[], floored P0; verdict STAYS NHR.
  process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL = "true";
  const on = deriveVerdict(base(bars, coverageV2_NHR));
  ok("PIN2 FLAG-ON: verdict STAYS NEEDS_HUMAN_REVIEW (coverage gap unchanged)", on.verdict === "NEEDS_HUMAN_REVIEW");
  ok("PIN2 FLAG-ON: showStoppers now filled with the 3 grounded bars", on.showStoppers.length === 3);
  ok("PIN2 FLAG-ON: all filled bars floored to P0", on.showStoppers.every((s) => s.severity === "P0"));
  ok("PIN2 FLAG-ON: eligible NOT asserted true (honest-fail)", on.eligible !== true);

  // ── PIN 3: INCOMPLETE cap is NEVER filled (unreadable ⇒ findings untrustworthy).
  const inc = deriveVerdict(base(bars, coverageV2_INCOMPLETE));
  ok("PIN3 INCOMPLETE cap → showStoppers stays [] even flag-ON", inc.verdict === "INCOMPLETE" && inc.showStoppers.length === 0);

  // ── PIN 4: tight filter — a generic (non-eligibility) disqualifier is NOT promoted onto the pole.
  const generic = deriveVerdict(base([genericBar], coverageV2_NHR));
  ok("PIN4 non-elig disqualifier NOT promoted (filter stays tight)", generic.verdict === "NEEDS_HUMAN_REVIEW" && generic.showStoppers.length === 0);

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
