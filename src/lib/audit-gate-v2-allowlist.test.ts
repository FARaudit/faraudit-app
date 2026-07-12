// $0 regression lock for the GATE_V2 procedural-rights ALLOW-LIST family (Brain card #419 arc-A). Run:
//   npx tsx src/lib/audit-gate-v2-allowlist.test.ts
//
// The allow-list family (ARC #2 protest/disputes · ARC #A debriefing/notification) reclassifies ungrounded
// offeror-RIGHTS boilerplate as boilerplate instead of a disqualifier, so it never drives a FALSE NHR. This suite
// pins BOTH families so the allow-list can never silently narrow — AND pins the negative guard (a compound sentence
// carrying a real eligibility bar must STAY a disqualifier, never get laundered by a rights token).
//
// Flags are set ON before a DYNAMIC import so the module-load consts observe them (ES imports hoist; dynamic import
// runs after env is set). Flag-OFF inertness is structural (`ENABLED && …` short-circuit) and not re-tested here.
export {}; // force module scope (this file uses only a dynamic import, which would otherwise leave it a script)
process.env.AUDIT_PROTEST_CLAUSE_ALLOWLIST = "true";
process.env.AUDIT_DEBRIEF_ALLOWLIST = "true";
process.env.AUDIT_NOOP_REP_ALLOWLIST = "true"; // ARC D1 (card 435) — foreign-procurement-tax rep family member
process.env.AUDIT_PRECEDENCE_ALLOWLIST = "true"; // ARC D-1 (card 445/448) — document order-of-precedence family member

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { importanceOf } = await import("./audit-gate-v2");

  // ── ARC #A — debriefing / notification offeror-RIGHTS → boilerplate (the FA8137 false-NHR driver) ──
  ok("FA8137 verbatim debriefing sentence → boilerplate (not disqualifier)",
    importanceOf("Offerors desiring a debriefing must make their request IAW the requirements of FAR 15.505 or 15.506, as applicable.") === "boilerplate");
  ok("bare debriefing right → boilerplate",
    importanceOf("Unsuccessful offerors may request and receive a debriefing.") === "boilerplate");
  ok("award-notification procedure → boilerplate",
    importanceOf("The PCO will promptly notify offerors of any decision to exclude them from the competitive range.") === "boilerplate");
  ok("FAR 15.506 postaward debriefing → boilerplate",
    importanceOf("A postaward debriefing will be conducted in accordance with FAR 15.506.") === "boilerplate");

  // ── ARC #2 — protest/disputes procedural → boilerplate (the original CBP case; must stay covered) ──
  ok("52.233-2 Service of Protest → boilerplate",
    importanceOf("A copy of any protest shall be served on the Contracting Officer under FAR 52.233-2 Service of Protest.") === "boilerplate");
  ok("GAO protest procedure → boilerplate",
    importanceOf("Protests may be filed with the Government Accountability Office within the time frames of the Comptroller General.") === "boilerplate");

  // ── ARC D1 — foreign-procurement-tax rep (52.229-11 domestic no-op) → boilerplate (the FA8137 bd605b88 false-NHR) ──
  ok("FA8137 verbatim §K excise-tax election → boilerplate (not disqualifier)",
    importanceOf("The offeror represents that it has claimed no exemption [Offeror must select one] from the excise tax.") === "boilerplate");
  // "shall complete the representation …" is boilerplate via BOILERPLATE_RE submission mechanics (NOT the family — the
  // bare 52.229-11/title identifier tokens were removed in Gate-2 root scoping); pins that the instruction still launders.
  ok("52.229-11 complete-the-representation instruction → boilerplate (submission mechanics)",
    importanceOf("The offeror shall complete the representation at FAR 52.229-11 Tax on Certain Foreign Procurements.") === "boilerplate");
  // A "foreign person" STATUS sentence now routes to the SAFE ambiguous→NHR pole (BAR_SIGNAL_RE "foreign person" veto,
  // Gate-2 re-review) — over-tag = recoverable NHR. The FA8137 target (the excise-tax ELECTION above) still launders.
  ok("foreign-person status mention → NOT laundered (safe NHR pole, not boilerplate)",
    importanceOf("The offeror represents that it is not a foreign person under section 5000C.") !== "boilerplate");
  ok("IRS W-14 exemption election → boilerplate",
    importanceOf("A full or partial exemption from the excise tax may be claimed on IRS Form W-14.") === "boilerplate");
  // negative guard for the new member: a real bar in the same sentence as an excise-tax mention is NOT laundered
  ok("compound: clearance BAR + excise-tax rep → NOT laundered (not boilerplate)",
    importanceOf("The offeror must possess a facility clearance; select full or no exemption from the excise tax.") !== "boilerplate");

  // ── GATE-2 REGRESSION (PR #202) — the "foreign person" laundering vector the two lenses surfaced MUST stay closed.
  //    A real ITAR/FOCI access bar / country-of-origin bar must NEVER be laundered to boilerplate by a foreign-token. ──
  ok("ITAR: no-foreign-person-access bar → NOT laundered (not boilerplate)",
    importanceOf("No foreign person shall have access to classified information under this contract.") !== "boilerplate");
  ok("FOCI: foreign-ownership/control bar → NOT laundered",
    importanceOf("Offerors under foreign ownership, control, or influence are ineligible absent a mitigation agreement.") !== "boilerplate");
  ok("ITAR export-control bar → NOT laundered",
    importanceOf("The contractor must comply with ITAR export-control requirements and employ only U.S. citizens on this effort.") !== "boilerplate");
  ok("TAA country-of-origin bar → NOT laundered",
    importanceOf("End products must comply with the Trade Agreements Act; products of a foreign person from a non-designated country are prohibited.") !== "boilerplate");
  // 52.229-11(e)(2) — a NON-exempt foreign offeror's at-offer W-14 duty (phrased WITHOUT "submit", so it exercises the
  // family path not BOILERPLATE_RE) must NOT be laundered by a bare W-14 token (contracts-attorney Gate-2 re-review).
  ok("52.229-11(e)(2) foreign-offeror W-14 withholding duty → NOT laundered",
    importanceOf("Non-exempt foreign offerors are required to file IRS Form W-14 at the time of offer and are subject to the two-percent withholding.") !== "boilerplate");
  // 52.229-11(b)/(e)(2) foreign-person tax-REMITTANCE DUTY class (contracts-attorney Gate-2 re-review #2) — the kept
  // "5000C"/title tokens CAN match these, so the BAR_SIGNAL_RE duty vocabulary (foreign person / remit / withhold /
  // two-percent) must veto ALL of them. These are the three verbatim residuals the lens surfaced.
  ok("5000C remit-2%-prior-to-award duty → NOT laundered",
    importanceOf("Offerors that are foreign persons must remit the 2 percent tax imposed by section 5000C prior to award.") !== "boilerplate");
  ok("5000C two-percent withholding duty → NOT laundered",
    importanceOf("A foreign person is subject to the section 5000C two-percent withholding on this award.") !== "boilerplate");
  ok("title-framed foreign-offeror remit duty → NOT laundered",
    importanceOf("Under Tax on Certain Foreign Procurements, a non-exempt foreign offeror must remit the two-percent tax.") !== "boilerplate");
  // 52.229-11(e)(2) FORFEITURE duty (Gate-2 re-review #3) — no remit/withhold/percent/foreign-person token, matches ONLY
  // the removed bare 5000C identifier; after root scoping to the election frame it no longer matches the family at all.
  ok("5000C W-14-forfeiture consequence duty → NOT laundered",
    importanceOf("If IRS Form W-14 is not submitted with the offer, exemptions will not be applied to any resulting contract under section 5000C.") !== "boilerplate");
  // COMPOUND award-bar + excise election (adversarial-redteam, prohibited/barred-from residual) — a REAL TAA/country-of-
  // origin award bar comma-joined with a genuine excise election fragment must NOT launder via the election token.
  ok("compound: prohibited-from-award + excise election → NOT laundered",
    importanceOf("A supplier is prohibited from award and certifies no exemption from the excise tax.") !== "boilerplate");
  ok("compound: TAA non-designated prohibited-from-award + excise election → NOT laundered",
    importanceOf("A supplier of a non-designated country is prohibited from award, and must certify no exemption from the excise tax.") !== "boilerplate");
  // categorical award-bar-verb coverage (disqualified / excluded from award / not be selected) compounded with an excise election.
  ok("compound: disqualified + excise election → NOT laundered",
    importanceOf("An offeror without a facility security officer is disqualified, and certifies no exemption from the excise tax.") !== "boilerplate");
  ok("compound: excluded-from-award + excise election → NOT laundered",
    importanceOf("Non-domestic manufacturers are excluded from award and must claim no exemption from the excise tax.") !== "boilerplate");

  // ── ARC D-1 — document order-of-precedence (52.215-8 / ITO-BOA) → boilerplate (the 64b79916 §L false-NHR driver) ──
  ok("64b79916 verbatim §L ITO/BOA precedence → boilerplate (not disqualifier)",
    importanceOf("This ITO shall take precedence should there be any conflict between the Basic Ordering Agreement (BOA) and this ITO.") === "boilerplate");
  ok("FAR 52.215-8 Order of Precedence—UCF → boilerplate",
    importanceOf("Any inconsistency in this solicitation shall be resolved by the order of precedence at FAR 52.215-8.") === "boilerplate");
  ok("generic conflict→govern precedence frame → boilerplate",
    importanceOf("In the event of a conflict between the schedule and the specifications, the schedule shall govern.") === "boilerplate");
  // negative guard for the new member: a real eligibility bar phrased with precedence wording is NOT laundered
  ok("compound: 8(a) set-aside eligibility BAR in a precedence frame → NOT laundered (not boilerplate)",
    importanceOf("In the event of a conflict, the 8(a) set-aside eligibility requirements shall take precedence over all other documents.") !== "boilerplate");
  ok("compound: clearance BAR in a precedence frame → NOT laundered",
    importanceOf("Should there be any conflict between documents, the requirement that offerors hold a facility clearance shall control.") !== "boilerplate");
  // scoping guard: a bare non-document "precedence" statement with no conflict/order-of-precedence frame is NOT matched
  ok("bare 'takes precedence' with no conflict/document frame → NOT laundered by this member",
    importanceOf("The awardee's schedule takes precedence in day-to-day site coordination.") !== "boilerplate");

  // ── NEGATIVE GUARD — a real eligibility bar must STAY a disqualifier even with a rights token in the sentence ──
  ok("compound: debriefing + facility-clearance BAR → NOT laundered (not boilerplate)",
    importanceOf("Offerors must possess an active facility clearance; unsuccessful offerors may request a debriefing.") !== "boilerplate");
  ok("compound: protest + 8(a) eligibility BAR → NOT laundered (not boilerplate)",
    importanceOf("Offeror must be a certified 8(a) participant, and any protest may be filed with the GAO.") !== "boilerplate");
  ok("compound: notification + SAM-registration BAR → NOT laundered",
    importanceOf("Unsuccessful offerors will be notified; offerors must be registered in SAM to be eligible for award.") !== "boilerplate");

  // ── A genuine eligibility bar with no rights token stays NON-boilerplate (disqualifier or ambiguous — both safe) ──
  ok("real bar (must hold clearance) → NOT boilerplate (safe pole)",
    importanceOf("The contractor must possess a Top Secret facility clearance for award.") !== "boilerplate");
  // ── A neutral unrelated obligation stays ambiguous (fail-toward-disqualifier default) ──
  ok("unrelated ungrounded obligation → NOT boilerplate (ambiguous/disqualifier, safe pole)",
    importanceOf("The awardee shall coordinate all base access through the 72nd Security Forces Squadron.") !== "boilerplate");

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
