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
  ok("52.229-11 Tax on Certain Foreign Procurements → boilerplate",
    importanceOf("The offeror shall complete the representation at FAR 52.229-11 Tax on Certain Foreign Procurements.") === "boilerplate");
  ok("foreign-person representation → boilerplate",
    importanceOf("The offeror represents that it is not a foreign person under section 5000C.") === "boilerplate");
  ok("IRS W-14 exemption election → boilerplate",
    importanceOf("A full or partial exemption from the excise tax may be claimed on IRS Form W-14.") === "boilerplate");
  // negative guard for the new member: a real bar in the same sentence as an excise-tax mention is NOT laundered
  ok("compound: clearance BAR + excise-tax rep → NOT laundered (not boilerplate)",
    importanceOf("The offeror must possess a facility clearance; select full or no exemption from the excise tax.") !== "boilerplate");

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
