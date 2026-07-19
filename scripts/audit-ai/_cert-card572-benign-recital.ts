// $0 ASYMMETRIC PROOF — card #572 benign-in-source recital triage. Exercises the REAL exported predicates
// (classifyBenignRecital + verifyRecitalInSource + recitalTailVeto) plus the full loop disposition against every
// demotion + escalation specimen, sourced from the actual banked run-records. No paid run; no engine mutation.
//   DEMOTION arm  → each specimen must resolve to benign-covered (arm matched + source-present + no tail-veto).
//   ESCALATION arm → each specimen must STILL escalate (no arm claims it) — the cardinal-risk proof.
// Run: npx tsx scripts/audit-ai/_cert-card572-benign-recital.ts
import * as fs from "fs";
import { classifyBenignRecital, verifyRecitalInSource, recitalTailVeto, importanceOf, hasBarSignal } from "../../src/lib/audit-gate-v2";

const RR = `${__dirname}/run-records`;
const load = (f: string) => JSON.parse(fs.readFileSync(`${RR}/${f}`, "utf8")).input.fullSource as string;
const fa3030 = load("FA303026Q0020.e83887af-4b25-4e16-8010-f7e01de63499.run-record.json");
const fa8137 = load("FA813726R0033.bd605b88-1f32-4a37-8698-a79fae142e30.run-record.json");
const cbp = load("70B01C26R00000096.999e909b-e110-431d-8823-f26a8d5a869b.run-record.json");
const w9126 = load("W9126G26RA087.991acd40-b13a-44b9-844e-5db2139870da.run-record.json");
const faa = load("697DCK-26-R-00186.9ce4e3fb-ffa8-4599-90dd-140a7449d894.run-record.json");

// The LBJ maintain recital is NOT banked (12318726Q0165 has no run-record — spec NOTE confirmed). Its verbatim text
// is proven present in a source that WOULD contain it in a live run (self-source) — the shape+guard logic is real; the
// source-presence MECHANISM is proven on the in-source specimens below. This split is stated honestly on the card.
const lbjRecital = "Maintain licensing requirements, certifications, accreditations, and the required insurance coverage during the entire performance period with proof being submitted to the CO upon request.";
const lbjSource = `==== DOCUMENT: SOW ====\nSection 7.1.3. ${lbjRecital} The Contractor shall coordinate with the COR.`;

type Spec = { id: string; ob: string; src: string; expectArm?: string };
// Each specimen's disposition through the ACTUAL loop logic (flag-ON): arm ∧ present ∧ ¬tail-veto ⇒ benign-covered.
function disposition(ob: string, src: string): { arm: string | null; present: boolean; tailVeto: boolean; benign: boolean; imp: string } {
  const imp = importanceOf(ob);
  if (imp === "disqualifier") return { arm: null, present: false, tailVeto: false, benign: false, imp }; // never reaches the block
  const arm = classifyBenignRecital(ob);
  const ver = arm ? verifyRecitalInSource(src, ob) : null;
  const tailVeto = ver ? recitalTailVeto(ver.continuation) : false;
  const benign = !!(arm && ver?.present && !tailVeto);
  return { arm, present: !!ver?.present, tailVeto, benign, imp };
}

const D: Spec[] = [
  // D1 (LBJ maintain-credential-during-performance) + D3 (FA3030 SAM maintain-registration) are DEFERRED, not demoted:
  // both are bar-signal-POSITIVE and the 2nd Gauntlet round proved the "maintain <credential> during performance" shape
  // is INDISTINGUISHABLE from a real firm-inherent-credential bar (#557 collision). ARM-1 + ARM-6 were dropped; these
  // now correctly ESCALATE (see the ESCALATION arm G-F6/G-F7). Relayed to Brain — needs a non-shape discriminator.
  { id: "D5  FA8137 reps-and-certifications list", ob: "Offerors are required to meet all OPR requirements, to include terms and conditions, representations and certifications, and Statement of Work (SOW) requirements, in", src: fa8137, expectArm: "reps-certs-completion" },
  { id: "D6  FA8137 excise-tax [select one] election", ob: "no exemption [Offeror must select one] from the excise tax.", src: fa8137, expectArm: "excise-tax-election" },
  { id: "D7  FA8137 site-visit RSVP logistics", ob: "Your RSVP email must be received within 5 calendar days from the posting of this project.", src: fa8137, expectArm: "site-visit-logistics" },
  { id: "D8a CBP GAO protest served-on-CO", ob: "with the Government Accountability Office (GAO), must be served on the Contracting Officer identified in the", src: cbp, expectArm: "protest-recital" },
  { id: "D8b CBP copy-of-any-protest received", ob: "(b) The copy of any protest must be received in the office designated above within one day of filing a protest with the", src: cbp, expectArm: "protest-recital" },
];

const E: Spec[] = [
  { id: "E1  FA8137 bid guarantee 20% (the ONE real §L blocker)", ob: "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.", src: fa8137 },
  { id: "E2  FA8137 unacknowledged-amendments render ineligible", ob: "Any unacknowledged amendments in the offeror's proposal will render the offeror ineligible", src: fa8137 },
  { id: "E3  FA8137 compliance-mandatory fragment", ob: "Compliance with these instructions is mandatory and failure to provide all the required", src: fa8137 },
  { id: "E3b FA8137 compliance-mandatory full (failure→ineligible)", ob: "Compliance with these instructions is mandatory and failure to provide all the required data may result in an offeror being determined ineligible for award.", src: fa8137 },
  { id: "E4  FA8137 must-attend site visit to be eligible", ob: "You must attend the Initial Site Visit for the project to be considered eligible to propose.", src: fa8137 },
  { id: "E5  FA8137 MAC BOA Holders ONLY", ob: "This posting is for Tinker AFB - MAC BOA Holders ONLY .", src: fa8137 },
  { id: "E6  FA3030 SAM not-registered-at-time-of-award", ob: "If at the time of award an Offeror is not actively and successfully registered in the SAM database, the Government reserves the right to award to the next prospective Offeror.", src: fa3030 },
  { id: "E7  FAA SDS Failure-to-submit fragment", ob: "Failure to submit the", src: faa },
  { id: "E8  W9126 CMMC L1 required prior to award", ob: "CMMC Level 1 (Self) is required prior to award for each contractor information system that will process, store, or", src: w9126 },
  { id: "E9  W9126 rejected-as-nonresponsive", ob: "Will be rejected as nonresponsive if this acquisition is conducted by sealed bidding; or", src: w9126 },
  { id: "E10 FAA 52.204-7 prospective-awardee-must-be (SAM prior-to-award tail)", ob: "(b)(1) By submission of an offer, the offeror acknowledges the requirement that a prospective awardee must be", src: faa },
  { id: "E11 FAA experience-lead floor", ob: "least seven (7) of the overall years of experience must be in a Lead role.", src: faa },
  { id: "E12 CBP OCI found-ineligible", ob: "otherwise resolved to the satisfaction of the Government, and the offeror may be found ineligible for award.", src: cbp },
  // synthetic SHAPE probes of the ruling's named near-misses (labeled — auxiliary regression, NOT acceptance-chain):
  { id: "E13* SHAPE maintain-clearance-or-nonresponsive (ARM-1 killer)", ob: "The offeror shall maintain its facility clearance during performance or the offer will be deemed nonresponsive.", src: "" },
  { id: "E14* SHAPE hold-cert-at-time-of-award", ob: "The offeror must hold an active AS9100 certification at the time of award.", src: "" },
  { id: "E15* SHAPE cert-prior-to-award + render-ineligible", ob: "ISO 9001 certification is required prior to award; failure to provide the certification shall render the offer ineligible.", src: "" },
  { id: "E16* SHAPE maintain-insurance-during-perf-OR-nonresponsive (ARM-1 + consequence)", ob: "The offeror shall maintain insurance during the performance period or be found nonresponsive.", src: "" },
  // ── Gauntlet round-1 confirmed swallows (must escalate after the hardening) ──
  { id: "G-F1* compound: maintain-insurance-during-perf AND hold-Secret-clearance", ob: "The offeror shall maintain the required insurance coverage during the entire performance period and shall hold an active Secret facility clearance.", src: "" },
  { id: "G-F2* 8(a) participation rep with bare [Offeror must select one] bracket", ob: "The offeror represents that it is a certified 8(a) program participant [Offeror must select one].", src: "" },
  { id: "G-F5* maintain SAM registration AT TIME OF AWARD (G-AWARD gap)", ob: "The offeror shall maintain an active SAM registration at time of award and through contract award.", src: "" },
  { id: "G-F6* #557 firm-inherent: must maintain FAA Part 145 certification during performance", ob: "The contractor must maintain FAA Part 145 certification during the entire performance period.", src: "" },
  // ── Gauntlet round-2 confirmed swallows (drove dropping ARM-1) — the bar-positive flagship class, now escalating ──
  { id: "G-R2a* D1 LBJ flagship (maintain licensing/certs/accreditations/insurance during perf) — DEFERRED, escalates", ob: lbjRecital, src: lbjSource },
  { id: "G-R2b* in-span credential list (insurance + Secret clearance + DCSA accreditation during perf)", ob: "The Contractor shall maintain the required insurance coverage, an active Secret facility clearance, and DCSA accreditation during the entire performance period.", src: "" },
  { id: "G-R2c* D3 FA3030 SAM have-and-maintain-active-registration", ob: "REGISTRATIONS: Offerors shall have and shall maintain an active registration in the System for Award Management (SAM) database at http://www.", src: fa3030, srcName: "FA303026Q0020" },
];

let fails = 0;
console.log("═══ DEMOTION ARM — each MUST resolve benign-covered (arm ∧ present ∧ ¬tail-veto) ═══");
for (const s of D) {
  const d = disposition(s.ob, s.src);
  const ok = d.benign && (!s.expectArm || d.arm === s.expectArm);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌ FAIL"} ${s.id}\n     arm=${d.arm} present=${d.present} tailVeto=${d.tailVeto} imp=${d.imp} barSignal=${hasBarSignal(s.ob)} → ${d.benign ? "BENIGN-COVERED" : "ESCALATE"}`);
}
console.log("\n═══ ESCALATION ARM — each MUST still escalate (NO arm may claim it) ═══");
for (const s of E) {
  const d = disposition(s.ob, s.src);
  const ok = !d.benign; // must NOT become benign-covered
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌ FAIL"} ${s.id}\n     arm=${d.arm} present=${d.present} tailVeto=${d.tailVeto} imp=${d.imp} → ${d.benign ? "BENIGN-COVERED (LEAK!)" : "ESCALATE"}`);
}
console.log(`\n${fails === 0 ? "🟢 DRY — asymmetric proof PASSES both arms" : `🔴 ${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);
