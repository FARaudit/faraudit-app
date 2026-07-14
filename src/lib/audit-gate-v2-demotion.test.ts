// $0 GAUNTLET for ARC-D-1c — the AMBIGUOUS-SIGNAL DEMOTION (Brain card #459/#460, flag AUDIT_AMBIGUOUS_SIGNAL_DEMOTION).
// Run: npx tsx src/lib/audit-gate-v2-demotion.test.ts
//
// Ruling: disqualifier→escalate · ambiguous+bar-signal-POSITIVE→escalate (belt) · ambiguous+bar-signal-NEGATIVE→DEMOTE
// to ungroundedNonBarSignal (visible in the ledger, NEVER in disqualifierUncovered, NEVER dropped). Plus the two card
// #460 narrowings: (#5) §M "acceptable or unacceptable" rating description no longer trips BAR_SIGNAL; (#3/#4) a
// government-eval-methodology cost/pricing-DATA sentence demotes; but a bid-bond, a TINA SUBMISSION duty, and any real
// bar keep escalating (ruling #3). Flag-OFF ⇒ ambiguous ALWAYS escalates ⇒ byte-identical.
process.env.GATE_V2 = "true";
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";

import type { SectionAttestation } from "./audit-orchestrator";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const att = (section: string, ungrounded: string[]): SectionAttestation =>
  ({ section, status: "obligations_ungrounded", obligations: ungrounded, citedFindingIds: [], ungrounded });

// helpers to re-import the module fresh per flag (the demotion flag is read at module load).
async function grade(flag: boolean, attestations: SectionAttestation[]) {
  if (flag) process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true"; else delete process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION;
  const mod = await import(`./audit-gate-v2?d=${flag}`);
  return mod.gradeCoverageV2(attestations);
}

const BENIGN_NONBAR = "All rates shall be rounded to four decimal places to the right of the decimal point."; // ambiguous, no bar signal
const REAL_BAR = "The offeror must possess an active Top Secret facility clearance for award.";                 // ambiguous + bar signal → escalate
const GOVT_EVAL = "If requested by the PCO, data other than certified cost and pricing data shall be evaluated to support a determination of reasonable pricing."; // demote
const RATING_DESC = "Proposals shall be evaluated to determine whether the proposal is acceptable or unacceptable, using the ratings below."; // #5 → demote
const BID_BOND = "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.";  // ruling #3 → escalate
const TINA_DUTY = "Where the thresholds of FAR 15.403-1 apply, the offeror shall be required to submit certified cost or pricing data."; // ruling #3 → escalate
const REAL_UNACCEPTABLE = "If the offeror fails to correct the deficiency, its proposal will be deemed unacceptable and ineligible for award."; // real bar → escalate

(async () => {
  const inDisq = (cov: any, ob: string) => cov.disqualifierUncovered.some((d: any) => d.obligation === ob);
  const inDemoted = (cov: any, ob: string) => (cov.ungroundedNonBarSignal ?? []).some((d: any) => d.obligation === ob);

  // ── 1 · FLAG-OFF byte-identical: ambiguous ALWAYS escalates, nothing demoted ──
  console.log("\n── 1 · FLAG-OFF byte-identical ──");
  {
    const cov = await grade(false, [att("L", [BENIGN_NONBAR, REAL_BAR, GOVT_EVAL, RATING_DESC])]);
    assert(inDisq(cov, BENIGN_NONBAR) && inDisq(cov, REAL_BAR) && inDisq(cov, GOVT_EVAL) && inDisq(cov, RATING_DESC),
      "flag OFF: every non-boilerplate ungrounded obligation escalates (disqualifierUncovered) — prior behavior");
    assert((cov.ungroundedNonBarSignal ?? []).length === 0, "flag OFF: ungroundedNonBarSignal is empty (no demotion path)");
  }

  // ── 2 · FLAG-ON: benign non-bar demotes; real bar escalates ──
  console.log("\n── 2 · FLAG-ON: belt splits ambiguous by bar signal ──");
  {
    const cov = await grade(true, [att("L", [BENIGN_NONBAR, REAL_BAR])]);
    assert(inDemoted(cov, BENIGN_NONBAR) && !inDisq(cov, BENIGN_NONBAR), "flag ON: benign non-bar obligation DEMOTES (ungrounded_nonbar_signal, not disqualifierUncovered)");
    assert(inDisq(cov, REAL_BAR) && !inDemoted(cov, REAL_BAR), "flag ON: real clearance bar ESCALATES (belt, bar-signal-positive)");
  }

  // ── 3 · FLAG-ON narrowings (card #460): govt-eval + rating-desc demote; bid-bond + TINA-duty + real-unacceptable escalate ──
  console.log("\n── 3 · FLAG-ON: the two narrowings + ruling #3 (bond/TINA stay) ──");
  {
    const cov = await grade(true, [att("M", [GOVT_EVAL, RATING_DESC, BID_BOND, TINA_DUTY, REAL_UNACCEPTABLE])]);
    assert(inDemoted(cov, GOVT_EVAL), "#3/#4: government-eval cost/pricing-data methodology → DEMOTE");
    assert(inDemoted(cov, RATING_DESC), "#5: §M 'acceptable or unacceptable' rating description → DEMOTE (narrowed token)");
    assert(inDisq(cov, BID_BOND), "ruling #3: bid guarantee (bond) → ESCALATE (belt stays)");
    assert(inDisq(cov, TINA_DUTY), "ruling #3: TINA submission DUTY → ESCALATE (not eval-framed)");
    assert(inDisq(cov, REAL_UNACCEPTABLE), "real 'deemed unacceptable' bar → ESCALATE (consequence-framed token still fires)");
  }

  // ── 4 · GOVT-EVAL guard: a real bar COMPOUNDED with cost-data eval must NOT be demoted ──
  console.log("\n── 4 · GOVT-EVAL guard: compound real bar stays escalated ──");
  {
    const compound = "The offeror must hold a facility clearance, and certified cost or pricing data shall be evaluated for the effort.";
    const cov = await grade(true, [att("M", [compound])]);
    assert(inDisq(cov, compound) && !inDemoted(cov, compound), "compound (clearance bar + cost-data eval) → ESCALATE (govt-eval exception must not demote a real bar)");
  }

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
