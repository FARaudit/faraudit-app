// $0 GAUNTLET for card #572 — BENIGN-IN-SOURCE RECITAL TRIAGE (flag AUDIT_BENIGN_RECITAL_COVERED, default-OFF).
// Run: npx tsx src/lib/audit-gate-v2-benign-recital.test.ts
//
// Ruling (binding): grounding precision ONLY. A benign POSITIVE-SHAPE recital that is VERIFIABLY PRESENT in source →
// benignCoveredRecital (skipped, never disqualifierUncovered). A bid-consequential ungrounded obligation escalates
// UNCHANGED. Positive shape/allowlist (never a blocklist). fail-toward-disqualifier intact (ambiguity → NHR). New
// default-OFF flag; flag-OFF byte-identical (proven here by JSON.stringify equality + key-set assertion).
process.env.GATE_V2 = "true";

import type { SectionAttestation } from "./audit-orchestrator";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const att = (section: string, ungrounded: string[]): SectionAttestation =>
  ({ section, status: "obligations_ungrounded", obligations: ungrounded, citedFindingIds: [], ungrounded });

// Re-import fresh per flag combo; the flag is read at CALL time so a query-param cache-bust is belt-and-suspenders.
async function mod(benign: boolean) {
  if (benign) process.env.AUDIT_BENIGN_RECITAL_COVERED = "true"; else delete process.env.AUDIT_BENIGN_RECITAL_COVERED;
  return import(`./audit-gate-v2?b572=${benign}`);
}
// A source-presence fn wired like the orchestrator (uses the REAL verifyRecitalInSource against a supplied source).
async function grade(benign: boolean, attestations: SectionAttestation[], source: string) {
  const m = await mod(benign);
  return m.gradeCoverageV2(attestations, { verifyRecitalPresence: (ob: string) => m.verifyRecitalInSource(source, ob) });
}

// ── the demotion recitals (real autopsy text) + a source that contains them. NOTE: ARM-1 is INSURANCE-anchored
// (Gauntlet F6) so R_MAINTAIN demotes via its insurance clause; the SAM-registration recital is NOT here — its ARM
// was dropped (Gauntlet F8) and it now escalates (see BAR_SAM_MAINTAIN below). ──
const R_MAINTAIN = "Maintain licensing requirements, certifications, accreditations, and the required insurance coverage during the entire performance period with proof being submitted to the CO upon request.";
const R_REPS = "Offerors are required to meet all OPR requirements, to include terms and conditions, representations and certifications, and Statement of Work requirements, in accordance with the RFP.";
const R_EXCISE = "The offeror elects no exemption [Offeror must select one] from the excise tax.";
const R_RSVP = "Your RSVP email must be received within 5 calendar days from the posting of this project.";
const R_PROTEST = "The copy of any protest must be received in the office designated above within one day of filing a protest with the GAO.";
const BENIGN_SOURCE = [R_MAINTAIN, R_REPS, R_EXCISE, R_RSVP, R_PROTEST].join("\n\n");

// ── real bid-consequential bars (must ESCALATE) ──
const BAR_BOND = "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.";
const BAR_SAM_AWARD = "If at the time of award an Offeror is not actively and successfully registered in the SAM database, the Government reserves the right to award to the next prospective Offeror.";
const BAR_CMMC = "CMMC Level 1 (Self) is required prior to award for each contractor information system that will process or store CUI.";
const BAR_SAM_MAINTAIN = "REGISTRATIONS: Offerors shall have and shall maintain an active registration in the System for Award Management (SAM) database at http://www.sam.gov to be eligible for a Government contract award."; // ARM-6 dropped (F8) → escalates
const BAR_COMPOUND_CLEARANCE = "The offeror shall maintain the required insurance coverage during the entire performance period and shall hold an active Secret facility clearance."; // Gauntlet F1 — residue belt
const BAR_8A_BRACKET = "The offeror represents that it is a certified 8(a) program participant [Offeror must select one]."; // Gauntlet F2 — excise bracket must co-occur with excise context
const BAR_PART145 = "The contractor must maintain FAA Part 145 certification during the entire performance period."; // Gauntlet F6 — #557 firm-inherent credential, insurance-anchor excludes it
const BAR_SOURCE = [BAR_BOND, BAR_SAM_AWARD, BAR_CMMC, BAR_SAM_MAINTAIN, BAR_COMPOUND_CLEARANCE, BAR_8A_BRACKET, BAR_PART145].join("\n\n");

(async () => {
  const inDisq = (cov: any, ob: string) => cov.disqualifierUncovered.some((d: any) => d.obligation === ob);
  const inBenign = (cov: any, ob: string) => (cov.benignCoveredRecital ?? []).some((d: any) => d.obligation === ob);

  // ── 1 · FLAG-OFF byte-identity ──
  console.log("\n── 1 · FLAG-OFF byte-identical ──");
  {
    const attns = [att("L", [R_MAINTAIN, R_REPS, R_EXCISE, BAR_BOND])];
    const off = await grade(false, attns, BENIGN_SOURCE);
    assert(off.benignCoveredRecital === undefined, "flag OFF: benignCoveredRecital key ABSENT from returned coverageV2 (byte-identical serialization)");
    const keys = Object.keys(off).sort().join(",");
    assert(keys === "coverageGrade,disqualifierUncovered,ungroundedNonBarSignal,ungroundedRead,unreadable",
      `flag OFF: coverageV2 has exactly the pre-#572 key set (got: ${keys})`);
    assert(off.disqualifierUncovered.length === 4, "flag OFF: all four ungrounded obligations escalate (prior behavior — nothing demoted)");
  }

  // ── 2 · FLAG-ON demotion arm: the four bar-negative benign recitals → benignCoveredRecital, none in disqualifierUncovered ──
  console.log("\n── 2 · FLAG-ON: benign recitals demote to benignCoveredRecital ──");
  {
    const cov = await grade(true, [att("L", [R_REPS, R_EXCISE, R_RSVP, R_PROTEST])], BENIGN_SOURCE);
    for (const r of [R_REPS, R_EXCISE, R_RSVP, R_PROTEST])
      assert(inBenign(cov, r) && !inDisq(cov, r), `benign-covered: ${r.slice(0, 42)}…`);
    assert(cov.disqualifierUncovered.length === 0, "FLAG-ON: zero benign recitals leaked to disqualifierUncovered");
  }

  // ── 3 · FLAG-ON escalation arm (cardinal): real bars still escalate, never claimed. R_MAINTAIN (the bar-positive
  //        flagship class, ARM-1 dropped) is here — it now correctly ESCALATES; deferred to Brain. ──
  console.log("\n── 3 · FLAG-ON: real bars STILL escalate (no leak) ──");
  {
    const bars = [BAR_BOND, BAR_SAM_AWARD, BAR_CMMC, BAR_SAM_MAINTAIN, BAR_COMPOUND_CLEARANCE, BAR_8A_BRACKET, BAR_PART145, R_MAINTAIN];
    const cov = await grade(true, [att("L", bars)], BAR_SOURCE + "\n\n" + R_MAINTAIN);
    for (const b of bars)
      assert(inDisq(cov, b) && !inBenign(cov, b), `escalates (not benign): ${b.slice(0, 42)}…`);
  }

  // ── 4 · SOURCE-PRESENCE is load-bearing: an arm match NOT present in source must NOT demote ──
  console.log("\n── 4 · source-presence load-bearing ──");
  {
    // R_PROTEST matches ARM-2 by shape, but the supplied source does NOT contain it ⇒ no benign claim ⇒ escalate.
    const cov = await grade(true, [att("L", [R_PROTEST])], "An unrelated source with no such recital text at all.");
    assert(!inBenign(cov, R_PROTEST) && inDisq(cov, R_PROTEST), "arm-matching recital ABSENT from source escalates (source-presence is the gate)");
  }

  // ── 5 · CONTINUATION-WINDOW TAIL VETO actually fires (fragmentation defense is not dead code) ──
  console.log("\n── 5 · tail-veto fires on a severed bar tail ──");
  {
    const m = await mod(true);
    // A benign ARM-3 reps-certs head whose OWN sentence (in source) continues into a bar. The head matches the arm +
    // is present, but the severed tail carries an eligibility bar ("shall hold an active Secret facility clearance").
    const head = "Offerors are required to meet the representations and certifications";
    const sourceWithBarTail = `Section K: ${head} and shall hold an active Secret facility clearance prior to award. End.`;
    const ver = m.verifyRecitalInSource(sourceWithBarTail, head);
    assert(!!ver?.present, "tail-veto setup: benign head is present in source");
    assert(m.recitalTailVeto(ver.continuation), "tail-veto FIRES: severed tail carrying 'prior to award'/'ineligible' refuses the benign claim");
    // and through the full loop it must escalate, not demote:
    const cov = await grade(true, [att("L", [head])], sourceWithBarTail);
    assert(!inBenign(cov, head) && inDisq(cov, head), "full loop: tail-vetoed recital ESCALATES");
  }

  // ── 6 · MIXED section: benign recital demotes WHILE a co-resident real bar still escalates (verdict-safety) ──
  console.log("\n── 6 · mixed section — benign demotes, co-resident bar escalates ──");
  {
    const cov = await grade(true, [att("L", [R_PROTEST, BAR_BOND])], `${BENIGN_SOURCE}\n\n${BAR_BOND}`);
    assert(inBenign(cov, R_PROTEST) && inDisq(cov, BAR_BOND) && !inDisq(cov, R_PROTEST),
      "mixed: R_PROTEST benign-covered AND the co-resident bid-bond still escalates (fail-toward-disqualifier intact)");
  }

  console.log(`\n${failures === 0 ? "🟢 DRY — card #572 benign-recital gauntlet PASSES" : `🔴 ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
