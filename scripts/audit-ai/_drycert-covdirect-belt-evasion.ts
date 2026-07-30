// DRY-CERT (independent) — BELT-EVASION UNDER-FIRE hunt (CATASTROPHIC false-green).
// Thesis: isNonBidderEligibilitySentence SKIPS a match when THING_LEAD_RE ∨ FORM_FIELD_8A_RE ∨ ACCEPTANCE_OBJECT_RE
// fires AND both belts miss (no OFFEROR_SUBJECT_RE, no FIRM_CREDENTIAL_RE). Hunt a REAL bidder-disqualifier that
// (a) ELIGIBILITY_BAR_RE matches, (b) leads with a thing-noun (or is an acceptance-object frame), (c) names NO
// offeror-class noun, (d) carries NO firm-credential token → wrongly SKIPPED → covered_direct → false-green.
// PROD QUARTET on. Real completenessOf, no stubs.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

const BENIGN = "Government-furnished property will be provided at the contractor's facility during performance.";
const mkFinding = (sec: string, ex: string): TypedFinding =>
  ({ id: "f_b", citation: `§${sec}`, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

type C = { name: string; sec: string; bar: string; note: string };
// Each `bar` is intended to be a REAL bidder-disqualifier. We assert it FLOORS (obligations_ungrounded).
// A NON-floor = UNDER-FIRE break (catastrophic) — BUT only counts if ELIGIBILITY_BAR_RE actually matches the bar
// (otherwise it's a pre-existing detector limit, out of scope). We check RE-match separately.
const CASES: C[] = [
  // ── THING_LEAD leads, no offeror noun, no firm-credential — but a REAL restriction ──────────────
  { name: "setaside-thing-lead-award-restricted", sec: "C",
    bar: "This procurement is set aside for small business concerns and award is restricted to eligible small business firms only.",
    note: "leads with 'This' (not a thing-noun in list?) — but has 'concerns'/'firms' → belt1 SHOULD fire. Control." },
  { name: "code-lead-restricted-to-hubzone", sec: "C",
    bar: "Codes for this action limit award to HUBZone participants and no other party may receive award.",
    note: "'Codes' leads → THING_LEAD. No offeror-class noun ('party' not in OFFEROR_SUBJECT_RE). 'hubzone' → FIRM_CREDENTIAL belt2 SHOULD fire." },
  { name: "provisions-lead-only-8a-eligible", sec: "C",
    bar: "Provisions of this notice make only 8(a) program participants eligible to receive award under this action.",
    note: "'Provisions' leads → THING_LEAD. '8(a)' → FIRM_CREDENTIAL? RE has (sdvosb|hubzone|wosb|edwosb|service-disabled) but NOT 8(a) or set-aside here. But 'set-aside' absent. Belt2 may MISS 8(a)." },
  { name: "data-lead-award-only-sdvosb", sec: "C",
    bar: "Data rights notwithstanding, award under this action is available only to service-disabled veteran-owned concerns.",
    note: "'Data' leads → THING_LEAD. 'concerns' → belt1 fires. 'service-disabled' → belt2 fires. Control (double-belted)." },
  { name: "values-lead-registration-bar", sec: "C",
    bar: "Values reported must be current; award may not be made to any entity lacking an active SAM registration.",
    note: "'Values' leads → THING_LEAD. 'entity' NOT in OFFEROR_SUBJECT_RE. FIRM_CREDENTIAL has 'active sam registration' → belt2 SHOULD fire." },
  { name: "entries-lead-debarred-bar", sec: "C",
    bar: "Entries in this table are informational; a debarred party is not eligible to receive award of this contract.",
    note: "'Entries' leads → THING_LEAD. 'party' NOT offeror-class. 'debarred' → FIRM_CREDENTIAL belt2 fires." },
  // ── ACCEPTANCE_OBJECT frame masking a real offeror-eligibility bar ──────────────────────────────
  { name: "acceptance-frame-real-offeror-payment-bar", sec: "H",
    bar: "An offeror is not eligible for payment unless it is registered in SAM prior to award.",
    note: "ACCEPTANCE_OBJECT_RE matches 'eligible ... for payment'. BUT belt1 'offeror' fires → floors. Control." },
  { name: "acceptance-frame-no-offeror-noun", sec: "H",
    bar: "Any concern not registered in SAM is ineligible for payment and award will not be made to it.",
    note: "'ineligible ... for payment' → ACCEPTANCE_OBJECT. 'concern' → belt1 fires. 'registered in SAM' → belt2 fires. Double control." },
  { name: "acceptance-frame-party-registration", sec: "H",
    bar: "A party lacking an active SAM.gov registration is ineligible for award under this solicitation.",
    note: "ineligible for award → ACCEPTANCE_OBJECT (award in list). 'party' NOT offeror. 'active sam.gov registration' → belt2 fires." },
  // ── The genuinely dangerous class: thing-lead + NO offeror noun + NO firm-credential + REAL bar ──
  { name: "code-lead-restricted-firm-only-generic", sec: "C",
    bar: "Codes assigned here restrict award; only entities certified by the Small Business Administration may compete.",
    note: "'Codes' leads → THING_LEAD. 'entities' NOT offeror-class. no clearance/setaside/registration token → belt2 MISS. 'certified by SBA' = REAL third-party bar. UNDER-FIRE candidate." },
  { name: "item-lead-restricted-cage", sec: "C",
    bar: "Items delivered are subject to inspection; only holders of a valid facility security clearance may be awarded this contract.",
    note: "'Items' leads → THING_LEAD. no offeror noun. BUT 'facility ... clearance' → belt2 fires. Control." },
];

let underfire = 0; const breaks: string[] = [];
const ELIG = /\b(?:shall|must|required to) (?:hold|possess|maintain|have)/i; // sanity only

for (const c of CASES) {
  const src = [`SECTION ${c.sec} - TEST`, BENIGN, c.bar].join("\n");
  const r = completenessOf({ fullSource: src } as any, [c.sec], [mkFinding(c.sec, BENIGN)], new Set([c.sec]));
  const a = r.attestations.find((x) => x.section === c.sec);
  const floored = a?.status === "obligations_ungrounded";
  // Does ELIGIBILITY_BAR_RE actually match this bar? (in-scope check) — re-import the RE indirectly by re-running
  // the floor on the bar ALONE with NO grounded finding: if it fires, RE matched. We approximate via output.
  console.log(`${floored ? "FLOOR " : "SKIP  "} [${c.name}] status=${a?.status}`);
  console.log(`        bar="${c.bar.slice(0, 80)}"`);
  if (!floored) {
    // IN-SCOPE discriminator: prepend an explicit offeror noun. If that makes the SAME bar FLOOR, then
    // ELIGIBILITY_BAR_RE matched the bar body and belt-1 (offeror) was the ONLY thing forcing the floor —
    // so the original (no offeror noun) is a genuine belt-evasion UNDER-FIRE, not an RE limit.
    const barWithOfferor = "The offeror acknowledges: " + c.bar;
    const src2 = [`SECTION ${c.sec} - TEST`, BENIGN, barWithOfferor].join("\n");
    const r2 = completenessOf({ fullSource: src2 } as any, [c.sec], [mkFinding(c.sec, BENIGN)], new Set([c.sec]));
    const a2 = r2.attestations.find((x) => x.section === c.sec);
    const reMatchedInScope = a2?.status === "obligations_ungrounded";
    console.log(`        [+offeror-prefix status=${a2?.status} → RE-matched-in-scope=${reMatchedInScope}]`);
    if (reMatchedInScope) { underfire++; breaks.push(`${c.name}: RE matched a real bar body, floor SKIPPED without an offeror noun (belt-evasion under-fire)`); }
    else console.log(`        [OUT OF SCOPE — RE did not match this bar even with an offeror noun → pre-existing detector limit]`);
  }
  console.log(`        note: ${c.note}\n`);
}

console.log(`\n=== UNDER-FIRE breaks (in-scope, catastrophic): ${underfire} ===`);
breaks.forEach((b) => console.log("  ❌ " + b));
if (underfire === 0) console.log("  (none — belt-evasion under-fire not exploitable in this battery)");
