// $0 REGRESSION for the ELIGIBILITY-AUTHORITY ALLOW-LIST guard (Brain card 329) — the phantom-cite disqualifier seam.
// Run: npx tsx src/lib/audit-decide-eligibility-authority.test.ts
//
// Doctrine (Brain card 329 RULING, /panel + adversarial red-team UNANIMOUS): a hard eligibility / `no_one_can_move`
// show-stopper is STRUCTURALLY VALID only if its cited clause is an enumerated bidder-eligibility / size / set-aside
// AUTHORITY (FAR 19 / 52.219-x / 13 CFR 121-128 / 52.204-8 / 52.212-3 / 52.209) — ALLOW-BY-AUTHORITY, not a
// Part-25/Part-5 block-list. The live root (audit a80a9a13): a `former_ko` lens typed "items are not subject to the
// WTO GPA/FTA, per FAR 5.101(4)(iii)" as `no_one_can_move`, which forced NHR (unmarkedUniversalClaim). This guard
// re-types that phantom off the bar path → BID_WITH_CAUTION, while PRESERVING every legitimate hard-bar class.
// Pure functions, no engine calls; flag INJECTED via the opt (no env mutation). Default-OFF ⇒ byte-identical.
import { applyEligibilityAuthorityAllowlist, deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
const on = (fs: TypedFinding[]) => applyEligibilityAuthorityAllowlist(fs, { enabled: true });
const off = (fs: TypedFinding[]) => applyEligibilityAuthorityAllowlist(fs, { enabled: false });

// ── The live fabricated finding (audit a80a9a13), typed no_one_can_move as it was in the paid run. ──
const wtoPhantom = (): TypedFinding => ({
  requirement: "Items are not subject to the WTO GPA or Free Trade Agreements, per FAR 5.101(4)(iii). No TAA/Buy American obligation is cited.",
  citation: "Solicitation para 14(b)",
  excerpt: "The items are not subject to the WTO GPA and/or a Free Trade Agreement by citing the FAR Clause and Required language shown at FAR 5.101(4)(iii).",
  kind: "clause_flowdown", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
});
// A GENUINE FAR-19 set-aside eligibility bar, correctly cited — must be KEPT (route by eligibility).
const genuineSetAside = (): TypedFinding => ({
  requirement: "This acquisition is a 100% HUBZone set-aside; award restricted to certified HUBZone small business concerns.",
  citation: "FAR 52.219-3", excerpt: "set aside exclusively for HUBZone small business concerns",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "small_business_eligibility",
  requiredAttribute: "se:hubzone", curableInWindow: false,
});
// A GENUINE structural bar (facility clearance) with a WEAK, non-eligibility citation — kept by LANGUAGE.
const clearanceBar = (): TypedFinding => ({
  requirement: "Offeror must hold an active TOP SECRET facility clearance at time of award.",
  citation: "§ H.4 (para 3)", excerpt: "a TOP SECRET facility security clearance is required at award",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "cyber_cmmc",
  requiredAttribute: "clearance:ts-facility", curableInWindow: false,
});
// A GENUINE sole-source no_one_can_move (brand-name, no substitute) with a weak cite — kept by LANGUAGE.
const soleSource = (): TypedFinding => ({
  requirement: "Award restricted to brand-name OEM part XYZ-123; no substitute will be accepted.",
  citation: "§B basis-for-award", excerpt: "BRAND NAME ONLY - OEM part XYZ-123, no substitute",
  kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko", curableInWindow: false,
});
// A non-eligibility-framed unverified TECHNICAL universal impossibility — NOT the guard's target → keep (stays NHR).
const techImpossible = (): TypedFinding => ({
  requirement: "The specified tolerance of 0.0001mm across a 4-meter span is not achievable by any known process.",
  citation: "§C.3.2", excerpt: "flatness shall not exceed 0.0001mm over the full 4m length",
  kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
});

console.log("\n── 1 · flag ON: WTO/FAR-5.101 phantom no_one_can_move → re-typed off the bar path → BID_WITH_CAUTION (not NHR) ──");
{
  const g = on([wtoPhantom()]);
  assert(g[0].controllability === "bidder_controls" && g[0].cautionFloor === true && g[0].eligibilityAuthorityGuard === true,
    "phantom re-typed → bidder_controls + cautionFloor + eligibilityAuthorityGuard");
  assert(g[0].requiredAttribute === undefined, "requiredAttribute cleared (cannot pin eligibility=null)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "BID_WITH_CAUTION", `verdict = BID_WITH_CAUTION (got ${d.verdict})`);
}

console.log("\n── 2 · BEFORE the guard (baseline): the phantom forces NHR (the live a80a9a13 bug) ──");
{
  const d = deriveVerdict({ findings: [wtoPhantom()], ...base });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `unguarded phantom → NHR via unmarkedUniversalClaim (got ${d.verdict})`);
}

console.log("\n── 3 · GENUINE FAR-19 set-aside (cited 52.219-3) → KEPT as a bar (never downgraded) ──");
{
  const g = on([genuineSetAside()]);
  assert(g[0].controllability === "bidder_cannot_move" && !g[0].eligibilityAuthorityGuard, "set-aside untouched (real authority + isPositiveSetAside)");
}

console.log("\n── 4 · GENUINE clearance bar, WEAK cite (§ H.4) → KEPT by structural language ──");
{
  const g = on([clearanceBar()]);
  assert(g[0].controllability === "bidder_cannot_move" && !g[0].eligibilityAuthorityGuard, "clearance bar untouched despite weak cite (STRUCTURAL_BAR_RE_114)");
}

console.log("\n── 5 · GENUINE sole-source no_one_can_move, weak cite → KEPT by structural language ──");
{
  const g = on([soleSource()]);
  assert(g[0].controllability === "no_one_can_move" && !g[0].eligibilityAuthorityGuard, "sole-source untouched (NON_SELF_CLEARABLE_BAR_RE)");
}

console.log("\n── 6 · non-eligibility TECHNICAL universal impossibility → NOT downgraded (keeps its NHR path) ──");
{
  const g = on([techImpossible()]);
  assert(g[0].controllability === "no_one_can_move" && !g[0].eligibilityAuthorityGuard, "tech-impossibility untouched (not eligibility-framed)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `still NHR (got ${d.verdict})`);
}

console.log("\n── 7 · flag OFF → byte-identical (no re-type on any input) ──");
{
  for (const mk of [wtoPhantom, genuineSetAside, clearanceBar, soleSource, techImpossible]) {
    const o = off([mk()]);
    assert(JSON.stringify(o) === JSON.stringify([mk()]), `${mk.name}: unchanged when flag OFF`);
  }
}

console.log("\n── 8 · mixed set: phantom re-typed BUT a coexisting genuine sole-source still drives the verdict ──");
{
  const g = on([wtoPhantom(), soleSource()]);
  const ph = g.find((f) => f.eligibilityAuthorityGuard);
  const ss = g.find((f) => f.lens === "former_ko" && !f.eligibilityAuthorityGuard);
  assert(!!ph && ph.controllability === "bidder_controls", "phantom re-typed");
  assert(!!ss && ss.controllability === "no_one_can_move", "genuine sole-source preserved");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `sole-source still forces NHR (unmarked universal) (got ${d.verdict})`);
}

console.log("\n── 9 · PANEL FIXES (Brain #329 review): genuine authorities/classes that must be KEPT, not downgraded ──");
{
  const keeps: Array<[string, TypedFinding]> = [
    ["13 CFR Part 121 size bar (Part form)", { requirement: "A concern other than small is ineligible; offeror exceeds the size standard.", citation: "13 CFR Part 121.201", excerpt: "other than small business concerns are not eligible", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "small_business_eligibility", requiredAttribute: "naics:333120-small", curableInWindow: false }],
    ["bare 4-digit FAR 19.1405 SDVOSB", { requirement: "Set-aside restricted to SDVOSB concerns.", citation: "19.1405", excerpt: "restricted to service-disabled veteran-owned small business", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "small_business_eligibility", requiredAttribute: "se:sdvosb", curableInWindow: false }],
    ["VAAR clause 852.219-10", { requirement: "VA SDVOSB set-aside; award restricted to verified SDVOSBs.", citation: "VAAR 852.219-10", excerpt: "this acquisition is set aside for SDVOSB", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "small_business_eligibility", requiredAttribute: "se:sdvosb", curableInWindow: false }],
    ["ITAR export-control eligibility bar", { requirement: "Offeror must be ITAR-registered; ineligible if not a US person able to access export-controlled data.", citation: "§ H.9", excerpt: "ITAR registration and US-person status required — foreign persons are excluded", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "contracts_attorney", requiredAttribute: "itar:registered", curableInWindow: false }],
    ["FOCI foreign-ownership bar", { requirement: "Firms under foreign ownership, control or influence are ineligible for award.", citation: "§ H.12", excerpt: "offerors owned or controlled by a foreign interest (FOCI) are excluded", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "cyber_cmmc", requiredAttribute: "foci:mitigated", curableInWindow: false }],
    // Red-team re-review MAJOR: a delivery/window impossibility mis-typed no_one_can_move that LACKS its sweep marker
    // must still be kept by LANGUAGE (eligibility-framed here via "end product", the trap case).
    ["marker-less delivery impossibility", { requirement: "No offeror can deliver the end product within the mandatory 5-day window against a 90-day irreducible production lead time (ARO).", citation: "§F.2", excerpt: "delivery within 5 days ARO; production lead time is 90 days and cannot be compressed", kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko" }],
  ];
  for (const [name, f] of keeps) {
    const g = on([f]);
    assert(!g[0].eligibilityAuthorityGuard && g[0].controllability === f.controllability, `KEEP: ${name} (not downgraded)`);
  }
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
