// Item-A before/after headline artifact on the FA813726R0033 live shape (verbatim strings). $0.
export {};
process.env.AUDIT_GATE_V2 = "true";
process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL = "true";
async function main() {
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  const REPS = "The offeror shall provide a statement the offeror has completed the annual representations and certification electronica";
  const BOA = "This order proposal request is ONLY available to current BOA holders.";
  const covNHR = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [{ section: "L", obligation: REPS }], coverageGrade: 0.9 };
  const boaBar: any = { requirement: BOA, citation: "SF 1442 / OPR cover page", excerpt: BOA, kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko", severity: "P0", requiredAttribute: "boa_holder", curableInWindow: false };
  const inp: any = { findings: [boaBar], bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: BOA + " magnitude 500000 to 1000000", coverageV2: covNHR };
  delete process.env.AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST;
  const before = deriveVerdict(inp);
  process.env.AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST = "true";
  const after = deriveVerdict(inp);
  console.log("VERDICT before:", before.verdict, "| after:", after.verdict, "| POLE UNCHANGED:", before.verdict === after.verdict);
  console.log("\nBEFORE (flag-OFF — what the customer saw live):\n  " + before.reason);
  console.log("\nAFTER (item A armed — grounded gate leads):\n  " + after.reason);
}
main();
