// OPTION (C) VETO NARROWING — build battery + ADVERSARIAL PASS (Brain ruling 2026-07-23, card #693 steps 1–2)
//
// RED-TEAM CHARGE: can either exclusion class swallow a GENUINE bar? Specifically — can a real eligibility bar be
// phrased as a responsibility-recital or as evaluation-methodology prose and thereby be RELEASED from the veto?
// RULE: any executed specimen where the narrowing releases a genuine register-shape bar ⇒ FORK to Brain.
//
// The predicate is RELEASE-SIDE, so the burden is asymmetric: a missed exclusion merely preserves today's
// over-fire (safe), while a wrongly-released bar is a false-BID pathway (fatal). Every adversarial specimen below
// is therefore a KEEP expectation, and they outnumber the DEMOTE specimens deliberately.
// Run: npx tsx src/lib/audit-gate-v2-veto-narrow.test.ts
export {};

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  ✅" : "  ❌"} ${m}`); if (!c) fail++; };
const withFlag = <T>(v: string, fn: () => T): T => {
  const p = process.env.AUDIT_VETO_NARROW_UNIVERSAL; process.env.AUDIT_VETO_NARROW_UNIVERSAL = v;
  try { return fn(); } finally { if (p === undefined) delete process.env.AUDIT_VETO_NARROW_UNIVERSAL; else process.env.AUDIT_VETO_NARROW_UNIVERSAL = p; }
};

(async () => {
  const m = await import("./audit-gate-v2");
  const { isNarrowedUniversalNonBar, gateV2Outcome } = m;
  const rel = (t: string) => withFlag("true", () => isNarrowedUniversalNonBar(t));

  // ── THE TWO TARGETS (measured on SP3300-26-Q-0165 — the veto's only unique catch, a false positive twice) ──
  console.log("\n── TARGETS · must be RELEASED ──────────────────────────────────────────────────────────────");
  ok(rel("Quoters must be determined to be responsible according to the standards of FAR Part 9 to be eligible for"),
     "FAR Part 9 responsibility recital is released");
  ok(rel("The Government will evaluate the quoter’s Past Performance to determine acceptability of the quote in"),
     "government evaluation-methodology prose is released");

  // ── ADVERSARIAL · genuine bars dressed in the excluded prose. ALL must be KEPT. ──
  console.log("\n── ADVERSARIAL · genuine bars dressed as the excluded classes · must be KEPT ───────────────");
  const ATTACKS: Array<[string, string]> = [
    ["responsibility + bid guarantee riding along", "Quoters must be determined to be responsible under FAR Part 9 and shall furnish a bid guarantee of 20 percent of the bid price."],
    ["responsibility + nonmanufacturer rule", "A determination of responsibility will be made in accordance with FAR Part 9; the offeror must be a small business manufacturer or obtain an SBA nonmanufacturer waiver."],
    ["responsibility CONDITIONED on a clearance", "The Contracting Officer will determine the offeror responsible only if the offeror holds an active TOP SECRET facility clearance at time of award."],
    ["responsibility + colon-introduced bar", "Quoters must be determined to be responsible: an active SECRET clearance is required."],
    ["responsibility recital + SAM registration duty", "The offeror must be determined to be responsible and must be registered in SAM at time of award."],
    ["responsibility conditioned via 'provided that'", "The offeror will be determined responsible provided that it holds a current FAA Part 145 certificate."],
    ["eval methodology + ineligibility consequence", "The Government will evaluate whether the offeror possesses an active SECRET facility clearance; offerors without one are ineligible for award."],
    ["eval methodology naming a CMMC gate", "The Government will assess each quoter’s CMMC Level 2 certification status to determine acceptability."],
    ["eval methodology + 8(a) set-aside", "The Government will evaluate past performance; only SBA-certified 8(a) concerns may submit an offer."],
    ["eval methodology with 'unacceptable' consequence", "Proposals will be evaluated and those from offerors lacking an active CMMC Level 2 certification will be rated technically unacceptable."],
    ["eval methodology + must-possess", "The Government will evaluate technical approach; offerors must possess an active TOP SECRET facility clearance."],
    ["eval methodology + rejection consequence", "The Government will consider past performance; quotes without a bid guarantee will be rejected."],
  ];
  for (const [n, t] of ATTACKS) ok(!rel(t), `KEPT — ${n}`);

  // ── THE FOUR VETO-PROTECTED REGISTERS. The narrowing exists to preserve these; losing one voids its rationale. ──
  console.log("\n── REGISTERS · the 4 veto-protected shapes · must be KEPT ──────────────────────────────────");
  const REGISTERS: Array<[string, string]> = [
    ["R1 enumerated eligibility list", "To be eligible for award, an offeror must: (1) be registered in SAM; (2) possess an active TOP SECRET facility clearance at the time of proposal submission; (3) hold a current FAA Part 145 certificate."],
    ["R3 CMMC acceptability gate", "An active CMMC Level 2 certification is required for award; proposals from offerors without one will be rated technically unacceptable."],
    ["R4b DD-254 modal-verb", "The contractor shall comply with the attached DD Form 254; a SECRET facility clearance is required."],
    ["R4b DD-254 verb-less", "DD Form 254, block 1 — Facility Clearance Required: SECRET."],
  ];
  for (const [n, t] of REGISTERS) ok(!rel(t), `KEPT — ${n}`);

  // ── FLAG-OFF BYTE-IDENTITY + CAP BEHAVIOUR ──
  console.log("\n── FLAG-OFF BYTE-IDENTITY & CAP ───────────────────────────────────────────────────────────");
  {
    const cov = (obs: string[]): any => ({ unreadable: [], ungroundedRead: ["M"], coverageGrade: 0.5,
      disqualifierUncovered: obs.map((o) => ({ section: "M", obligation: o })), ungroundedNonBarSignal: [] });
    const TARGETS = ["Quoters must be determined to be responsible according to the standards of FAR Part 9 to be eligible for",
                     "The Government will evaluate the quoter’s Past Performance to determine acceptability of the quote in"];
    const REAL = "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.";

    for (const t of ["false", "true"]) process.env.AUDIT_RETIRE_VERBATIM_VETO = "false";
    const offBoth = withFlag("false", () => gateV2Outcome(cov(TARGETS)));
    const onBoth  = withFlag("true",  () => gateV2Outcome(cov(TARGETS)));
    ok(offBoth.cap === "NEEDS_HUMAN_REVIEW", "flag-OFF: the two universal recitals still fire the veto (today's behaviour)");
    ok(onBoth.cap === null, "flag-ON: an all-universal bucket no longer fires ⇒ the committal verdict flows");

    const mixedOff = withFlag("false", () => gateV2Outcome(cov([...TARGETS, REAL])));
    const mixedOn  = withFlag("true",  () => gateV2Outcome(cov([...TARGETS, REAL])));
    ok(mixedOff.cap === "NEEDS_HUMAN_REVIEW" && mixedOn.cap === "NEEDS_HUMAN_REVIEW",
       "a REAL bar co-resident with universal recitals still fires in BOTH flag states (the safety case)");
    ok(mixedOn.reason.includes("Bid Guarantee") || mixedOn.reason.includes("bid guarantee"),
       "flag-ON the banner quotes the REAL bar, not the released boilerplate");

    const realOnly = cov([REAL]);
    ok(withFlag("false", () => gateV2Outcome(realOnly)).reason === withFlag("true", () => gateV2Outcome(realOnly)).reason,
       "a bucket with no universal recital is byte-identical across flag states (no churn)");
    ok(cov(TARGETS).disqualifierUncovered.length === 2, "the bucket itself is never mutated — entries retained as ledger input");
    delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
  }

  console.log(`\n${fail ? "❌" : "✅"} VETO-NARROW BATTERY: ${fail} failure(s) · ${ATTACKS.length} adversarial + ${REGISTERS.length} register specimens`);
  process.exit(fail ? 1 : 0);
})();
