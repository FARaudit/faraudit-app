// $0 GAUNTLET for card #576 — ORDINARY-COURSE PERFORMANCE-UPKEEP → CAVEAT (flag AUDIT_PERFORMANCE_UPKEEP_CAVEAT, OFF).
// Run: npx tsx src/lib/audit-gate-v2-performance-upkeep.test.ts
//
// Brain ruling (CEO customer-failure reframe): "maintain <ordinary-course credential> during performance" is a POST-AWARD
// performance obligation, NOT a pre-award bar → it STOPS driving NHR and attaches as a BID_WITH_CAUTION caveat. Two-axis
// discriminator (temporal + ordinariness; ambiguous → escalate). PRODUCTION-SHAPE binding (Rule 64): the demotion arm
// MUST run on the ACTUAL line-wrap-severed LBJ fragment, not the clean sentence.
process.env.GATE_V2 = "true";

import type { SectionAttestation } from "./audit-orchestrator";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const att = (section: string, ungrounded: string[]): SectionAttestation =>
  ({ section, status: "obligations_ungrounded", obligations: ungrounded, citedFindingIds: [], ungrounded });

async function mod(on: boolean) {
  if (on) process.env.AUDIT_PERFORMANCE_UPKEEP_CAVEAT = "true"; else delete process.env.AUDIT_PERFORMANCE_UPKEEP_CAVEAT;
  return import(`./audit-gate-v2?u576=${on}`);
}
async function grade(on: boolean, attestations: SectionAttestation[], source: string) {
  const m = await mod(on);
  return { m, cov: m.gradeCoverageV2(attestations, { verifyRecitalPresence: (ob: string) => m.verifyRecitalInSource(source, ob) }) };
}

// PRODUCTION fragment — line-wrap-severed BEFORE "coverage during the entire performance period" (the real LBJ shape).
const LBJ_FRAGMENT = "Maintain licensing requirements, certifications, accreditations, and the required insurance";
// the assembled source contains the FULL sentence, so the continuation carries "coverage during … performance period".
const LBJ_SOURCE = `SOW 7.1.3. ${LBJ_FRAGMENT} coverage during the entire performance period with proof being submitted to the CO upon request. Next clause.`;
// real bid-consequential bars (must ESCALATE, never caveat):
const BAR_PART145 = "The contractor must maintain FAA Part 145 certification during the entire performance period.";       // long-lead
const BAR_CLEARANCE = "The offeror shall maintain a facility security clearance during performance.";                       // long-lead
const BAR_ATAWARD = "The offeror must hold an active Top Secret clearance at the time of award.";                          // pre-award
const BAR_SOURCE = [BAR_PART145, BAR_CLEARANCE, BAR_ATAWARD].join(" ");

(async () => {
  const inCaveat = (cov: any, sub: string) => (cov.caveatRecital ?? []).some((c: any) => c.obligation.includes(sub));
  const inDisq = (cov: any, sub: string) => cov.disqualifierUncovered.some((d: any) => d.obligation.includes(sub));

  // ── 1 · FLAG-OFF byte-identity: LBJ recital escalates (NHR), no caveat bucket ──
  console.log("\n── 1 · FLAG-OFF byte-identical ──");
  {
    const { m, cov } = await grade(false, [att("L", [LBJ_FRAGMENT])], LBJ_SOURCE);
    assert(cov.caveatRecital === undefined, "flag OFF: caveatRecital key ABSENT (byte-identical serialization)");
    assert(Object.keys(cov).sort().join(",") === "coverageGrade,disqualifierUncovered,ungroundedNonBarSignal,ungroundedRead,unreadable",
      "flag OFF: coverageV2 exact pre-#576 key set");
    assert(inDisq(cov, "Maintain licensing"), "flag OFF: LBJ recital ESCALATES to disqualifierUncovered (prior NHR behavior)");
    assert(m.gateV2Outcome(cov).cap === "NEEDS_HUMAN_REVIEW", "flag OFF: gateV2Outcome cap = NEEDS_HUMAN_REVIEW (the pre-fix NHR)");
  }

  // ── 2 · FLAG-ON demotion (PRODUCTION FRAGMENT): LBJ → caveatRecital, NOT disqualifierUncovered; cap flips to null ──
  console.log("\n── 2 · FLAG-ON: LBJ production fragment demotes to caveat, NHR cap lifts ──");
  {
    const { m, cov } = await grade(true, [att("L", [LBJ_FRAGMENT])], LBJ_SOURCE);
    assert(inCaveat(cov, "Maintain licensing") && !inDisq(cov, "Maintain licensing"), "LBJ fragment → caveatRecital (not disqualifierUncovered)");
    assert(m.gateV2Outcome(cov).cap === null, "gateV2Outcome cap = null (NHR lifted — committal verdict now flows)");
    const cred = (cov.caveatRecital ?? [])[0]?.credential ?? "";
    assert(/licens/i.test(cred), `caveat names the credential verbatim-grounded: "${cred}"`);
  }

  // ── 3 · FLAG-ON escalation (cardinal): long-lead + at-award STILL escalate → NHR, never caveat ──
  console.log("\n── 3 · FLAG-ON: long-lead / at-award STILL escalate (no leak) ──");
  {
    const { m, cov } = await grade(true, [att("L", [BAR_PART145, BAR_CLEARANCE, BAR_ATAWARD])], BAR_SOURCE);
    for (const b of ["FAA Part 145", "facility security clearance", "Top Secret clearance at the time of award"])
      assert(inDisq(cov, b) && !inCaveat(cov, b), `escalates (not caveat): ${b}`);
    assert(m.gateV2Outcome(cov).cap === "NEEDS_HUMAN_REVIEW", "long-lead/at-award set → gateV2Outcome NHR (verdict-safe)");
  }

  // ── 4 · MIXED: LBJ demotes to caveat WHILE a co-resident long-lead bar still escalates to NHR ──
  console.log("\n── 4 · mixed — ordinary-course caveats, long-lead still NHRs ──");
  {
    const src = `${LBJ_SOURCE} ${BAR_PART145}`;
    const { m, cov } = await grade(true, [att("L", [LBJ_FRAGMENT, BAR_PART145])], src);
    assert(inCaveat(cov, "Maintain licensing") && inDisq(cov, "FAA Part 145"), "mixed: LBJ→caveat AND Part 145→disqualifierUncovered");
    assert(m.gateV2Outcome(cov).cap === "NEEDS_HUMAN_REVIEW", "mixed: the real long-lead bar still drives NHR (fail-toward-disqualifier intact)");
  }

  // ── 5 · the CAVEAT emitter produces a BID_WITH_CAUTION-floor finding naming the credential ──
  console.log("\n── 5 · emitter → cautionFloor caveat finding ──");
  {
    const decide = await import("./audit-decide");
    const out = decide.emitPerformanceUpkeepCaveats([], [{ section: "L", obligation: LBJ_FRAGMENT, credential: "licensing requirements, and the required insurance" }]);
    const f = out[0];
    assert(!!f && f.cautionFloor === true && f.controllability === "bidder_controls", "caveat finding: cautionFloor=true, bidder_controls (floors BID_WITH_CAUTION, never a bar/NHR)");
    assert(/maintain licensing requirements, and the required insurance during performance/i.test(f.requirement), "caveat prose names the credential verbatim + is conditional");
    assert(!/(you|your firm|the offeror)\s+(do(?:es)?\s+not|lacks?|has not)/i.test(f.requirement), "fabrication-safe: no claim about what the bidder holds");
  }

  console.log(`\n${failures === 0 ? "🟢 DRY — card #576 performance-upkeep→caveat gauntlet PASSES" : `🔴 ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
