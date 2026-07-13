// $0 regression lock for ruling #1 (Brain card #475) — the deterministic bid-guarantee grounding emitter. Run:
//   npx tsx src/lib/audit-bid-guarantee-grounding.test.ts
//
// 8f56ecc4: the §4.3 "Bid Guarantee (Bond): … required IAW FAR 28.101-1" is a real §L requirement a 40+-finding run
// left ungrounded (bar-POSITIVE → held §L missing even under the revised broad ledger). highSignalSweep now grounds it
// deterministically (Rule-64 verbatim), tagged §L (a furnish-with-your-offer submission instruction), controllability
// bidder_controls (a bond is obtained — gate_to_clear, NEVER a show-stopper). With the bond grounded + the broad ledger,
// §L clears. PROVEN on the real source (coverage.missing → []); this is the self-contained repeat.
export {};
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_LEDGER_BROAD_AMBIGUOUS = "true";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { highSignalSweep } = await import("./audit-grounding-sweep");
  const { completenessOf } = await import("./audit-orchestrator");
  type Ctx = Parameters<typeof completenessOf>[0];

  // §L: the format litany (ambiguous+bar-negative) + the real §4.3 bid-guarantee requirement (bar-POSITIVE).
  const L_WITH_BOND =
    "SECTION L - INSTRUCTIONS, CONDITIONS, AND NOTICES TO OFFERORS.\n\n" +
    "Offerors shall submit the proposal by email. Page size shall be 8.5 by 11 inches. Font shall be no less than Arial 12 points. Pages shall be numbered sequentially.\n\n" +
    "4.3. Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.101-1. Failure to furnish a bid guarantee may be cause for rejection.";
  const L_NO_BOND =
    "SECTION L - INSTRUCTIONS TO OFFERORS.\n\nOfferors shall submit the proposal by email. Page size shall be 8.5 by 11 inches. Font shall be no less than Arial 12 points.";

  const sweepBonds = (src: string) => highSignalSweep(src).filter((f) => (f as { sweepArchetype?: string }).sweepArchetype === "bid_guarantee");

  // ── PIN 1 FLAG-ON: the emitter grounds ONE bid_guarantee finding, §L, verbatim, bidder_controls.
  process.env.AUDIT_BID_GUARANTEE_EMIT = "true";
  const bonds = sweepBonds(L_WITH_BOND);
  ok("PIN1 exactly one bid_guarantee finding emitted", bonds.length === 1);
  ok("PIN1 finding is cited to §L (grounds the §L obligation)", /§L\b/.test(bonds[0]?.citation ?? ""));
  ok("PIN1 controllability bidder_controls (gate-to-clear, NEVER a show-stopper)", bonds[0]?.controllability === "bidder_controls");
  ok("PIN1 excerpt is a verbatim source span (Rule-64)", !!bonds[0]?.excerpt && L_WITH_BOND.includes(bonds[0]!.excerpt!));
  ok("PIN1 excerpt carries the bid-guarantee requirement text", /bid guarantee/i.test(bonds[0]?.excerpt ?? ""));

  // ── PIN 2: with the bond grounded + broad ledger, §L → COVERED (the last residual clears).
  const withBond = highSignalSweep(L_WITH_BOND).map((f, i) => ({ ...f, id: `sweep#${i}` }));
  const cov = completenessOf({ fullSource: L_WITH_BOND, sections: { L: L_WITH_BOND } } as unknown as Ctx, ["L"], withBond as never, new Set(["L"]));
  ok("PIN2 §L → COVERED once the bid-bond is grounded", cov.covered.includes("L") && !cov.missing.includes("L"));

  // ── PIN 3 OVER-FIRE GUARD: a §L with no bid-guarantee requirement → no finding.
  ok("PIN3 no-bond §L → zero bid_guarantee findings", sweepBonds(L_NO_BOND).length === 0);

  // ── PIN 4 FLAG-OFF byte-identical: no bid_guarantee finding emitted at all.
  process.env.AUDIT_BID_GUARANTEE_EMIT = "false";
  ok("PIN4 FLAG-OFF: zero bid_guarantee findings (byte-identical)", sweepBonds(L_WITH_BOND).length === 0);

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
