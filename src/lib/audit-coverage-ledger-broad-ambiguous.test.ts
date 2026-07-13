// $0 regression lock for ROOT ruling #3 (Brain card #474) — the ledger broad-ambiguous demotion. Run:
//   npx tsx src/lib/audit-coverage-ledger-broad-ambiguous.test.ts
//
// 8f56ecc4 investigation: the boundary detector read §L (22,146 chars) and §M (14,468) at high confidence, but the
// #472 "stricter belt" ledger held both false-missing because ~40 §L + 20 §M ungrounded obligations are benign
// proposal-prep mechanics (page size/font/pagination, "responsible offeror shall meet spec", OPR terms) that classify
// ambiguous+bar-NEGATIVE and weren't demoted. AUDIT_LEDGER_BROAD_AMBIGUOUS demotes that class (matching gradeCoverageV2).
// INVARIANTS: §M (all bar-negative) → covered; §L held by EXACTLY the bid-bond (bar-POSITIVE) until grounded; a real
// eligibility bar still blocks; flag-OFF ⇒ #472 belt byte-identical.
export {};
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }
const broadOn = () => { process.env.AUDIT_LEDGER_BROAD_AMBIGUOUS = "true"; };
const broadOff = () => { process.env.AUDIT_LEDGER_BROAD_AMBIGUOUS = "false"; };

(async () => {
  const { completenessOf } = await import("./audit-orchestrator");
  type Ctx = Parameters<typeof completenessOf>[0];

  // §L: real page-format / font / pagination litany (ambiguous+bar-negative) + plain boilerplate + the bid-bond (bar-POSITIVE).
  const L_FORMAT = "SECTION L INSTRUCTIONS. Offerors shall submit the proposal by email. Page size shall be 8.5 by 11 inches. Font shall be no less than Arial 12 points. When both sides of a sheet display printed material, it shall be counted as two pages. Pages shall be numbered sequentially by volume. These page format restrictions shall apply.";
  const BIDBOND = " Bid Guarantee (Bond): a bid guarantee of a minimum of 20% of the proposal is required IAW FAR 28.";
  // §M: only OPR/eval ambiguous mechanics (all bar-negative, none a real bar).
  const M_OPR = "SECTION M EVALUATION. The responsible offeror shall meet requirement specification listed in section 2. Offerors are required to meet all OPR requirements, to include terms and conditions. To be determined technically acceptable at the factor level, the offeror must be rated acceptable.";
  const REAL_BAR = " Offerors must possess a Top Secret facility clearance for award.";

  const run = (sections: Record<string, string>) =>
    completenessOf({ fullSource: "x", sections } as unknown as Ctx, ["L", "M"], [], new Set(["L", "M"]));
  const statusOf = (r: ReturnType<typeof run>, s: string) => r.attestations.find((a) => a.section === s)?.status;

  // ── FLAG-OFF (#472 belt): the page-format litany is NOT demoted → §L and §M both missing (reproduces 8f56ecc4).
  broadOff();
  const off = run({ L: L_FORMAT + BIDBOND, M: M_OPR });
  ok("FLAG-OFF: §L missing (#472 belt — format litany undemoted)", off.missing.includes("L"));
  ok("FLAG-OFF: §M missing (#472 belt)", off.missing.includes("M"));

  // ── FLAG-ON: §M → COVERED (all bar-negative demote); §L → STILL missing (bid-bond bar-POSITIVE blocks — invariant).
  broadOn();
  const on = run({ L: L_FORMAT + BIDBOND, M: M_OPR });
  ok("FLAG-ON: §M → COVERED (bar-negative litany demotes)", on.covered.includes("M") && !on.missing.includes("M"));
  ok("FLAG-ON: §L STILL missing — bid-bond (bar-positive) blocks (invariant)", on.missing.includes("L") && statusOf(on, "L") === "obligations_ungrounded");
  ok("FLAG-ON: the bid-bond is retained in §L ungrounded (not laundered)",
     (on.attestations.find((a) => a.section === "L")?.ungrounded.some((u) => /bid guarantee|bond/i.test(u))) === true);

  // ── FLAG-ON, §L WITHOUT the bid-bond → COVERED (format litany was the only blocker; proves it was the litany).
  const onNoBond = run({ L: L_FORMAT, M: M_OPR });
  ok("FLAG-ON: §L (format litany only, no bid-bond) → COVERED", onNoBond.covered.includes("L") && !onNoBond.missing.includes("L"));

  // ── INVARIANT: a real eligibility bar (bar-positive) still blocks §M even flag-ON.
  const onBar = run({ L: L_FORMAT, M: M_OPR + REAL_BAR });
  ok("FLAG-ON: §M with a real clearance bar → STILL missing (invariant)", onBar.missing.includes("M"));

  // ── #472 MIXED-SECTION PIN RE-ASSERTED UNDER THE BROADENED LEDGER (Brain card #475 ruling #1 carried condition):
  //    ONE real ungrounded disqualifier among a CROWD of demotables (format-litany + govt-eval + conditional-TINA +
  //    boilerplate) → the section STAYS missing and the bar STILL escalates, even with the broad path ON. Enable the
  //    demotion families so the crowd genuinely demotes; the lone real bar must still fail the .every.
  process.env.AUDIT_CONDITIONAL_TINA_DEMOTION = "true";
  const CROWD =
    L_FORMAT +                                                                                   // format-litany (ambiguous+bar-negative)
    " The certified cost or pricing data shall be evaluated to support a determination of price reasonableness." + // govt-eval non-bar
    " If none of the exceptions in FAR 15.403-1 apply, the offeror shall be required to submit certified cost or pricing data." + // conditional-TINA
    REAL_BAR;                                                                                    // the ONE real bar: Top Secret facility clearance
  const mixed = run({ L: CROWD, M: M_OPR });
  ok("MIXED (broad ON): §L with 1 real clearance bar among a crowd of demotables → STILL missing", mixed.missing.includes("L"));
  ok("MIXED (broad ON): §L status stays obligations_ungrounded (bar escalates)", statusOf(mixed, "L") === "obligations_ungrounded");
  ok("MIXED (broad ON): the real clearance bar is RETAINED in §L ungrounded (not laundered by the crowd)",
     (mixed.attestations.find((a) => a.section === "L")?.ungrounded.some((u) => /clearance/i.test(u))) === true);

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
