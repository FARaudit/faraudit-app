// END-GAUNTLET red-team probe — AUDIT_VETO_NARROW_UNIVERSAL release-side attacks + B3/B4 interactions.
// Run: npx tsx scripts/audit-ai/_gauntlet-endround-veto-narrow.ts   (from repo root)
export {};
process.env.AUDIT_VETO_NARROW_UNIVERSAL = "true";

(async () => {
  const m = await import("../../src/lib/audit-gate-v2");
  const { isNarrowedUniversalNonBar, isResponsibilityDeterminationRecital, isGovtEvalMethodologyGeneralNonBar,
          importanceOf, hasBarSignal, gateV2Outcome } = m as any;

  // obligationsOf gate replica (audit-orchestrator.ts:306) — a specimen is production-reachable only if it passes.
  const oblig = (s: string) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s);

  console.log("=== ATTACK 1 · isResponsibilityDeterminationRecital (release path a) ===");
  const RESP: Array<[string, string]> = [
    ["RA1 shared-modal VP coordination (bare verb after 'and')",
     "Quoters must be determined to be responsible and furnish a bid guarantee of 20 percent of the quoted price"],
    ["RA2 'and be registered' — 'be' not in modal list",
     "The offeror must be determined to be responsible and be registered in the System for Award Management at the time of quote submission"],
    ["RA3 relative clause 'which requires' a TS facility clearance",
     "Offerors must be determined to be responsible, which requires an active Top Secret facility clearance at the time of award"],
    ["RA4 'contingent upon' (conditional-vocab gap) + FAA Part 145",
     "A favorable determination of responsibility is contingent upon the offeror holding the required FAA Part 145 repair station certificate"],
    ["RA5 'only when' (conditional-vocab gap) + bonding capacity",
     "Quoters will be determined to be responsible only when the quoter demonstrates the required aggregate bonding capacity of $500,000"],
    ["RA6 definitive responsibility criterion (special standard)",
     "To be determined to be responsible the offeror must demonstrate five years of depot-level aircraft maintenance experience as a special standard of responsibility"],
    ["RA7 'and the apparent successful quoter shall' — 'the'+2 words defeats SECOND_CLAUSE_RE",
     "Quoters must be determined to be responsible and the apparent successful quoter shall furnish a bid guarantee of 20 percent"],
    ["RA8 'and each offeror must' — non-'the' determiner defeats SECOND_CLAUSE_RE",
     "Offerors must be determined to be responsible and each offeror must furnish an acceptable subcontracting plan prior to award"],
    ["RA9 comma-splice second duty (no conjunction)",
     "Quoters must be determined to be responsible, quoters lacking an active DCAA-approved accounting system will be found nonresponsible"],
  ];
  for (const [n, t] of RESP) {
    const released = isNarrowedUniversalNonBar(t);
    console.log(`${released ? "🔴 RELEASED" : "🟢 kept    "} | oblig=${oblig(t)} imp=${importanceOf(t)} bar=${hasBarSignal(t)} | ${n}`);
  }

  console.log("\n=== ATTACK 2 · isGovtEvalMethodologyGeneralNonBar (release path b) ===");
  const EVAL: Array<[string, string]> = [
    ["EA1 GSA 'Schedule' vehicle bar — EVAL_FACTOR token collision",
     "The Government will consider a quote only from vendors holding a current GSA Federal Supply Schedule contract for the required items"],
    ["EA2 SAM-registration nonresponsive gate ('registered' ≠ 'registration'; 'nonresponsive' not in consequence list)",
     "Quotations will be evaluated for price, and a quote received from a firm not registered in the System for Award Management will be considered nonresponsive"],
    ["EA3 TS/SCI personnel access gate ('cleared'/'access' not credential vocab)",
     "Proposals will be evaluated for price and past performance, and only offerors able to provide personnel holding active Top Secret/SCI access may submit a proposal"],
    ["EA4 bid-guarantee rejection ('no further consideration' not in consequence list)",
     "Quotations will be evaluated for price, and a quote received without the required bid guarantee of 20 percent of the quoted price will receive no further consideration"],
    ["EA5 delivery-capability restriction ('only from sources' not caught)",
     "The Government will consider a quote only from sources that can meet the required delivery schedule of ten days after receipt of order"],
    ["EA6 surety/bonding rider ('surety'/'bonds' not credential vocab)",
     "Proposals will be evaluated for price and schedule, and the apparent low bidder must furnish payment and performance bonds from an approved corporate surety"],
    ["EA7 AS9100 without the word 'certification'",
     "Quotations will be evaluated on price and quality, and award is limited to firms registered to AS9100 for the required aerospace processes"],
  ];
  for (const [n, t] of EVAL) {
    const released = isNarrowedUniversalNonBar(t);
    console.log(`${released ? "🔴 RELEASED" : "🟢 kept    "} | oblig=${oblig(t)} imp=${importanceOf(t)} bar=${hasBarSignal(t)} | ${n}`);
  }

  console.log("\n=== FULL-PATH · a bucket containing ONLY a released genuine bar → cap? ===");
  const cov = (obs: string[]): any => ({ unreadable: [], ungroundedRead: ["M"], coverageGrade: 0.5,
    disqualifierUncovered: obs.map((o) => ({ section: "M", obligation: o })), ungroundedNonBarSignal: [] });
  const FULLPATH = [RESP[0][1], RESP[3][1], RESP[5][1], EVAL[0][1], EVAL[1][1], EVAL[3][1]];
  for (const t of FULLPATH) {
    const out = gateV2Outcome(cov([t]));
    console.log(`cap=${String(out.cap).padEnd(19)} | ${t.slice(0, 90)}…`);
  }

  console.log("\n=== B3 · rankDisqualifiers purity + cap-invariance ===");
  {
    process.env.AUDIT_BANNER_BAR_RANKING = "true";
    const entries = [
      { section: "L", obligation: "Offerors shall submit proposals in three volumes with a page limit of 50 pages" },
      { section: "M", obligation: "An active CMMC Level 2 certification is required for award; offerors without one are ineligible" },
    ];
    const covR: any = { unreadable: [], ungroundedRead: ["M"], coverageGrade: 0.5, disqualifierUncovered: entries, ungroundedNonBarSignal: [] };
    const before = JSON.stringify(covR.disqualifierUncovered);
    const findings = [{ kind: "eligibility_bar", requirement: "An active CMMC Level 2 certification is required for award", excerpt: "" }];
    const on = gateV2Outcome(covR, { findings });
    const after = JSON.stringify(covR.disqualifierUncovered);
    process.env.AUDIT_BANNER_BAR_RANKING = "false";
    const off = gateV2Outcome(covR, { findings });
    console.log(`purity (bucket unmutated): ${before === after ? "PASS" : "FAIL — MUTATED"}`);
    console.log(`cap invariance on/off: ${on.cap === off.cap ? "PASS" : `FAIL on=${on.cap} off=${off.cap}`}`);
    console.log(`ON  quotes: ${on.reason.slice(0, 130)}`);
    console.log(`OFF quotes: ${off.reason.slice(0, 130)}`);
  }

  console.log("\n=== INTERACTION · B3 ON + B4 ON — banner prose contradiction ===");
  {
    process.env.AUDIT_BANNER_BAR_RANKING = "true";
    process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM = "true";
    const entries = [
      { section: "L", obligation: "Offerors shall submit proposals in three volumes with a page limit of 50 pages" },
      { section: "M", obligation: "An active CMMC Level 2 certification is required for award; offerors without one are ineligible" },
    ];
    const covR: any = { unreadable: [], ungroundedRead: ["M"], coverageGrade: 0.5, disqualifierUncovered: entries, ungroundedNonBarSignal: [] };
    const findings = [{ kind: "eligibility_bar", requirement: "An active CMMC Level 2 certification is required for award", excerpt: "" }];
    const out = gateV2Outcome(covR, { findings });
    console.log(`B3+B4 reason: ${out.reason}`);
    delete process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM;
    process.env.AUDIT_BANNER_BAR_RANKING = "false";
  }

  console.log("\n=== INTERACTION · narrow ON + retire-verbatim ON — ledger count uses full bucket ===");
  {
    process.env.AUDIT_RETIRE_VERBATIM_VETO = "true";
    const out = gateV2Outcome(cov([
      "Quoters must be determined to be responsible according to the standards of FAR Part 9 to be eligible for",
      "Bid Guarantee: a bid guarantee of 20 percent of the quoted price is required with quote submission",
    ]));
    console.log(`retire+narrow: cap=${out.cap} reason=${out.reason}`);
    delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
  }
})();
