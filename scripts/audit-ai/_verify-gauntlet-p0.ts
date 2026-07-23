export {};
import { applyStampedConfig } from "./_instrument";
applyStampedConfig("live");
process.env.AUDIT_VETO_NARROW_UNIVERSAL = "true";
(async () => {
  const m = await import("../../src/lib/audit-gate-v2");
  const CASES: Array<[string,string]> = [
    ["RA1 shared-modal coordination + bid guarantee","Quoters must be determined to be responsible and furnish a bid guarantee of 20 percent of the quoted price"],
    ["RA2 'and be registered' (SAM)","The offeror must be determined to be responsible and be registered in the System for Award Management at the time of quote submission"],
    ["RA3 relative clause + TS facility clearance","Offerors must be determined to be responsible, which requires an active Top Secret facility clearance at the time of award"],
    ["RA6 FAR 9.104-2 SPECIAL STANDARD of responsibility","To be determined to be responsible the offeror must demonstrate five years of depot-level aircraft maintenance experience as a special standard of responsibility"],
    ["RA9 comma-splice DCAA accounting system","Quoters must be determined to be responsible, quoters lacking an active DCAA-approved accounting system will be found nonresponsible"],
    ["EA1 'Schedule' collision = GSA Schedule vehicle","The Government will evaluate quotes from vendors holding a current GSA Schedule contract for these services"],
    ["EA3 TS/SCI personnel access","The Government will evaluate whether proposed personnel are cleared for access to Top Secret information"],
  ];
  let released = 0;
  for (const [n,t] of CASES) {
    const r = m.isNarrowedUniversalNonBar(t);
    const cov: any = { unreadable: [], ungroundedRead:["M"], disqualifierUncovered:[{section:"M",obligation:t}], ungroundedNonBarSignal:[], coverageGrade:0.5 };
    const cap = m.gateV2Outcome(cov).cap;
    if (r) released++;
    console.log(`${r?"❌ RELEASED":"✅ kept    "}  cap=${String(cap).padEnd(18)} imp=${String(m.importanceOf(t)).padEnd(12)} barSig=${String(m.hasBarSignal(t)).padEnd(5)} ${n}`);
  }
  console.log(`\nINDEPENDENTLY CONFIRMED: ${released}/${CASES.length} adversarial genuine-bar sentences are RELEASED by the narrowing.`);
})();
