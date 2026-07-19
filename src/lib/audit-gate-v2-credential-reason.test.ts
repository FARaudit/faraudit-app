// $0 GAUNTLET for card #575b — CREDENTIAL-CONDITIONAL REASON-QUALITY slice (flag AUDIT_CREDENTIAL_CONDITIONAL_REASON,
// default-OFF). Run: npx tsx src/lib/audit-gate-v2-credential-reason.test.ts
//
// Ruling (binding, Brain card #575): credential-conditional bars (maintain-credential-during-performance, SAM-active)
// are benign IFF the offeror HOLDS the credential — undeterminable by shape, so their NHR routing is CORRECT. The open
// defect is REASON QUALITY only. This slice upgrades the reason prose; VERDICT (cap) is UNCHANGED. Fabrication-invariant
// compliant: credential grounded from the obligation, ZERO claim about the bidder. Flag-OFF ⇒ reason byte-identical.
process.env.GATE_V2 = "true";

import type { SectionAttestation } from "./audit-orchestrator";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const att = (section: string, ungrounded: string[]): SectionAttestation =>
  ({ section, status: "obligations_ungrounded", obligations: ungrounded, citedFindingIds: [], ungrounded });

// Re-import fresh per flag combo (flags read at CALL time; query-param bust is belt-and-suspenders).
async function outcome(reasonFlag: boolean, ob: string, fabFlag?: boolean) {
  if (reasonFlag) process.env.AUDIT_CREDENTIAL_CONDITIONAL_REASON = "true"; else delete process.env.AUDIT_CREDENTIAL_CONDITIONAL_REASON;
  if (fabFlag === true) process.env.AUDIT_FABRICATION_INVARIANT = "true"; else if (fabFlag === false) delete process.env.AUDIT_FABRICATION_INVARIANT;
  const m = await import(`./audit-gate-v2?cr=${reasonFlag}&fab=${fabFlag}`);
  const cov = m.gradeCoverageV2([att("L", [ob])]);          // bar-positive ⇒ escalates to disqualifierUncovered
  return m.gateV2Outcome(cov) as { cap: string; reason: string };
}

// ── flagship credential-conditional specimens (real #572 autopsy material) ──
const LBJ = "Maintain licensing requirements, certifications, accreditations, and the required insurance coverage during the entire performance period with proof being submitted to the CO upon request.";
const SAM = "REGISTRATIONS: Offerors shall have and shall maintain an active registration in the System for Award Management (SAM) database to be eligible for a Government contract award.";
const PART145 = "The contractor must maintain FAA Part 145 certification during the entire performance period.";
const FLAGSHIP = [LBJ, SAM, PART145];

// ── non-credential real bars (must keep the LEGACY reason even flag-ON — selectivity) ──
const BOND = "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.";
const CMMC = "CMMC Level 1 (Self) is required prior to award for each contractor information system that will process or store CUI.";
const SAM_ATAWARD = "If at the time of award an Offeror is not actively and successfully registered in the SAM database, the Government reserves the right to award to the next prospective Offeror.";
const EXPERIENCE = "least seven (7) of the overall years of experience must be in a Lead role.";
const NONCRED = [BOND, CMMC, SAM_ATAWARD, EXPERIENCE];

const LEGACY = (r: string) => /^A potential disqualifying requirement /.test(r);
const IMPROVED = (r: string) => /^A credential-conditional requirement /.test(r) && / it requires .+\. Confirm your firm holds this before bidding/.test(r);
// fabrication guard: the improved reason must NEVER ASSERT (declaratively) that the bidder lacks/holds the credential.
// The advisory imperative "Confirm your firm holds this before bidding" is NOT an assertion (it instructs verification)
// — so the guard flags only a DECLARATIVE possession/lack statement, and explicitly allows the confirm/verify imperative.
const NO_BIDDER_CLAIM = (r: string) => {
  const stripped = r.replace(/\b(?:confirm|verify|ensure|check)\s+(?:that\s+)?your firm holds this before bidding/gi, "");
  return !/\b(?:you|your firm|the offeror|the bidder|the contractor)\s+(?:do(?:es)?\s+not|does not|lacks?|is not|are not|has not|have not|hasn'?t|haven'?t|cannot|will not|fails?\s+to|holds?|possess(?:es)?)\b/i.test(stripped);
};

(async () => {
  // ── 1 · FLAG-OFF byte-identity: every specimen keeps the legacy reason; cap = NEEDS_HUMAN_REVIEW ──
  console.log("\n── 1 · FLAG-OFF: legacy reason byte-identical, verdict NHR ──");
  for (const ob of [...FLAGSHIP, ...NONCRED]) {
    const off = await outcome(false, ob);
    assert(off.cap === "NEEDS_HUMAN_REVIEW" && LEGACY(off.reason), `flag OFF legacy+NHR: ${ob.slice(0, 40)}…`);
  }

  // ── 2 · FLAG-ON: the 3 flagship credential-conditional specimens emit the improved conditional reason ──
  console.log("\n── 2 · FLAG-ON: flagship credential-conditional → improved conditional reason ──");
  {
    const lbj = await outcome(true, LBJ);
    assert(IMPROVED(lbj.reason) && /licensing requirements, certifications, accreditations/i.test(lbj.reason), `LBJ improved (credential grounded verbatim): ${lbj.reason.slice(0, 130)}`);
    const sam = await outcome(true, SAM);
    assert(IMPROVED(sam.reason) && /active System for Award Management \(SAM\) registration/.test(sam.reason), `SAM improved: ${sam.reason.slice(0, 130)}`);
    const p145 = await outcome(true, PART145);
    assert(IMPROVED(p145.reason) && /FAA Part 145 certification/.test(p145.reason), `Part 145 improved: ${p145.reason.slice(0, 130)}`);
    for (const ob of FLAGSHIP) {
      const on = await outcome(true, ob);
      assert(NO_BIDDER_CLAIM(on.reason), `fabrication-safe (no bidder claim): ${ob.slice(0, 40)}…`);
      assert(on.cap === "NEEDS_HUMAN_REVIEW", `verdict UNCHANGED (cap NHR) flag-ON: ${ob.slice(0, 40)}…`);
    }
  }

  // ── 3 · FLAG-ON selectivity: non-credential bars keep the LEGACY reason (no mislabelling) ──
  console.log("\n── 3 · FLAG-ON: non-credential bars keep legacy reason ──");
  for (const ob of NONCRED) {
    const on = await outcome(true, ob);
    assert(LEGACY(on.reason), `non-credential keeps legacy flag-ON: ${ob.slice(0, 40)}…`);
  }

  // ── 3b · Gauntlet round-2 confirmed defects — each must now behave correctly ──
  console.log("\n── 3b · Gauntlet-fix red-team ──");
  {
    // F1 — a NON-SAM registration must NOT be mislabeled as SAM; it names its own registry VERBATIM.
    const nursing = await outcome(true, "The contractor shall maintain an active registration with the State Board of Nursing during the performance period.");
    assert(IMPROVED(nursing.reason) && /State Board of Nursing/i.test(nursing.reason) && !/SAM|System for Award/i.test(nursing.reason),
      `F1 state-nursing registration named verbatim, NOT mislabeled SAM: ${nursing.reason.slice(60, 150)}`);
    // F2 — long list whose credential noun falls past the 90-char cut → credential doesn't survive → LEGACY (no dangling banner).
    const longlist = await outcome(true, "The contractor shall maintain personnel, equipment, facilities, staffing plans, quality control processes, and any applicable professional licenses during performance.");
    assert(LEGACY(longlist.reason), "F2 long non-credential list (license past 90 chars) falls back to legacy, no dangling-conjunction banner");
    // F3 — "qualified personnel" is a staffing duty, not a credential → LEGACY.
    const qual = await outcome(true, "The contractor shall maintain qualified personnel during the performance period.");
    assert(LEGACY(qual.reason), "F3 'qualified personnel' staffing duty keeps legacy reason (qualif dropped from credential tokens)");
    // F4 — a semicolon-separated clause must not be swallowed into the credential → LEGACY.
    const semi = await outcome(true, "The contractor shall maintain equipment; ensure all certifications are current during performance.");
    assert(LEGACY(semi.reason), "F4 semicolon clause not swallowed into credential (falls to legacy)");
  }

  // ── 4 · NO VERDICT DRIFT: cap identical flag-ON vs flag-OFF across the whole escalation set ──
  console.log("\n── 4 · no verdict drift (cap identical flag-ON vs OFF) ──");
  for (const ob of [...FLAGSHIP, ...NONCRED]) {
    const on = await outcome(true, ob), off = await outcome(false, ob);
    assert(on.cap === off.cap && on.cap === "NEEDS_HUMAN_REVIEW", `cap stable: ${ob.slice(0, 40)}…`);
  }

  // ── 5 · FABRICATION-INVARIANT COMPOSITION: the reason is identical regardless of AUDIT_FABRICATION_INVARIANT ──
  console.log("\n── 5 · composition with AUDIT_FABRICATION_INVARIANT (independent sites) ──");
  for (const ob of FLAGSHIP) {
    const fabOn = await outcome(true, ob, true);
    const fabOff = await outcome(true, ob, false);
    assert(fabOn.reason === fabOff.reason && IMPROVED(fabOn.reason), `#575b reason identical with fab-invariant ON/OFF: ${ob.slice(0, 40)}…`);
  }
  delete process.env.AUDIT_FABRICATION_INVARIANT;

  console.log(`\n${failures === 0 ? "🟢 DRY — card #575b credential-conditional reason gauntlet PASSES" : `🔴 ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
