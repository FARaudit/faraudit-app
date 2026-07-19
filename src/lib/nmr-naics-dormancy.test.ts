// PHASE 3 UNIT 2 — NMR NAICS-DORMANCY GATE ($0 suite, Brain cards #548/#550, flag AUDIT_NMR_NAICS_DORMANCY).
// Driver: seq-2 dccce793 / 12318726Q0165 (USDA FS LBJ Job Corps, NAICS 561320 Total SB, commercial RFQ) rendered a
// ☒-checked 52.219-33 as a P0 AUTO-F show-stopper — but the NMR is legally DORMANT on a services NAICS
// (13 CFR 121.406(b)(3)-(4)). This gate demotes the NMR family to a verdict-inert P2 applicability flag, keyed on the
// SAM-resolved NAICS *fact*, catching the bar regardless of the emitting lens.
// Run: npx tsx src/lib/nmr-naics-dormancy.test.ts
import { applyNmrNaicsDormancy, isNmrApplicableNaics, NMR_SUPPLY_SECTORS, NMR_ATTRIBUTE, disposeFinding } from "./audit-decide";
import { NMR_CAUTION } from "./audit-keyfact-detector";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_NMR_NAICS_DORMANCY;
  if (on) process.env.AUDIT_NMR_NAICS_DORMANCY = "true"; else delete process.env.AUDIT_NMR_NAICS_DORMANCY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_NMR_NAICS_DORMANCY; else process.env.AUDIT_NMR_NAICS_DORMANCY = prev; }
};

const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "x", excerpt: "x", kind: "other", controllability: "bidder_controls", grounded: true, lens: "test", ...o,
});
// The keyfact-detector-shaped NMR eligibility bar — the POSITIVE allowlist shape: NMR_ATTRIBUTE + exact NMR_CAUTION.
const nmrKeyfact = (): TypedFinding => base({
  requirement: NMR_CAUTION,
  citation: "FAR 52.219-33 (source clause list) · 13 CFR 121.406(b)", kind: "eligibility_bar",
  controllability: "bidder_cannot_move", requiredAttribute: NMR_ATTRIBUTE, curableInWindow: false, lens: "keyfact_detector",
});
// The set-aside-notice-shaped 52.219-33 finding — NO requiredAttribute (the real false-33 emitter path on seq-2).
const nmrSetAsideNotice = (): TypedFinding => base({
  requirement: "Set-aside notice: FAR 52.219-33 Nonmanufacturer Rule marked applicable (☒) in Section I clause matrix.",
  citation: "FAR 52.219-33", excerpt: "☒ 52.219-33 Notice of Nonmanufacturer Rule", kind: "eligibility_bar",
  controllability: "bidder_cannot_move", curableInWindow: false, lens: "contracts_attorney",
});
const isDemoted = (f: TypedFinding) =>
  f.kind === "other" && f.controllability === "bidder_controls" && f.requiredAttribute === undefined &&
  f.severity === "P2" && /DORMANT/.test(f.requirement) && /13 CFR 121\.406\(b\)/.test(f.requirement);

const SERVICES = "561320"; // sector 56 — the seq-2 assigned NAICS (Temporary Help Services)
const SUPPLY = "339999";   // sector 33 — Manufacturing
const WHOLESALE = "423430";// sector 42 — Wholesale Trade

console.log("── P1 — flag OFF ⇒ byte-identical (counter-proof: the false bar SURVIVES untouched) ──");
withFlag(false, () => {
  const out = applyNmrNaicsDormancy([nmrKeyfact(), nmrSetAsideNotice()], SERVICES, { enabled: process.env.AUDIT_NMR_NAICS_DORMANCY === "true" });
  assert(out.every((f) => f.controllability === "bidder_cannot_move" && f.kind === "eligibility_bar"), "OFF: both NMR findings stay bidder_cannot_move eligibility bars (dormancy not applied)");
  assert(disposeFinding(out[0]) === "disqualifying", "OFF: NMR keyfact bar still disposes 'disqualifying' (the un-fixed false-AUTO-F path)");
});

console.log("\n── P2 — ON + services NAICS ⇒ keyfact NMR bar demoted to verdict-inert P2 applicability flag ──");
withFlag(true, () => {
  const [f] = applyNmrNaicsDormancy([nmrKeyfact()], SERVICES, { enabled: true });
  assert(isDemoted(f), "ON/services: keyfact NMR bar re-typed (other · bidder_controls · P2 · attr cleared · 13 CFR 121.406(b) cited)");
  assert(disposeFinding(f) === "gate_to_clear", "ON/services: demoted finding disposes 'gate_to_clear' — NOT 'disqualifying' (AUTO-F killed)");
});

console.log("\n── P3 (R3 doctrine) — a non-keyfact-shape 52.219-33 finding (attr-less) is NOT demoted → escalation-safe ──");
withFlag(true, () => {
  const inp = [nmrSetAsideNotice()];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: attr-less set-aside-notice 52.219-33 LEFT INTACT — only the positive keyfact shape (NMR_ATTRIBUTE + NMR_CAUTION) demotes; everything else fails toward escalation (no blocklist)");
});

console.log("\n── P4 — ON + SUPPLY NAICS ⇒ NMR is live ⇒ findings UNTOUCHED (byte-identical) ──");
withFlag(true, () => {
  const inp = [nmrKeyfact(), nmrSetAsideNotice()];
  const out = applyNmrNaicsDormancy(inp, SUPPLY, { enabled: true });
  assert(out[0] === inp[0] && out[1] === inp[1], "ON/supply (339999 sector 33): same object refs returned — NMR untouched on a supply buy");
});

console.log("\n── P5 — ON + NULL/unknown NAICS ⇒ NO demotion (fail-toward-escalation; bar stands) ──");
withFlag(true, () => {
  for (const bad of [null, undefined, "", "5"]) {
    const [f] = applyNmrNaicsDormancy([nmrKeyfact()], bad, { enabled: true });
    assert(f.controllability === "bidder_cannot_move" && disposeFinding(f) === "disqualifying", `ON/unknown NAICS (${JSON.stringify(bad)}): bar NOT demoted — escalation-safe`);
  }
});

console.log("\n── P6 — REGULATION-ANCHOR probe (Brain build-note a): sector table = 13 CFR 121.406(b) supply sectors ──");
assert([...NMR_SUPPLY_SECTORS].sort().join(",") === "31,32,33,42,44,45", "supply-sector table = {31,32,33 Mfg · 42 Wholesale · 44,45 Retail} exactly (13 CFR 121.406(b))");
assert(["311111", "321113", "339999", "423430", "441110", "454110"].every(isNmrApplicableNaics), "applicable: representative Manufacturing/Wholesale/Retail NAICS all TRUE");
assert(["561320", "541611", "236220", "111998", "621111", "928110"].every((n) => !isNmrApplicableNaics(n)), "dormant: representative Services/Construction/Agriculture/PublicAdmin NAICS all FALSE");
assert(!isNmrApplicableNaics(null) && !isNmrApplicableNaics("4"), "unknown/malformed NAICS ⇒ not-applicable (caller then leaves the bar, per P5)");

console.log("\n── P7 — MIXED-SOLICITATION boundary probe (Brain build-note b): services NAICS + supply-CLIN language ──");
console.log("   INTENDED BEHAVIOR: the ASSIGNED NAICS governs NMR applicability (SBA size/NMR follows the assigned code,");
console.log("   NOT embedded CLIN prose). A services-classified buy with incidental supply CLINs ⇒ NMR still DORMANT ⇒ demote.");
withFlag(true, () => {
  const mixed = nmrKeyfact();
  mixed.excerpt = "☒ 52.219-33 · CLIN 0002 schedule of supplies — end items to be delivered (nonmanufacturer end product)";
  const [f] = applyNmrNaicsDormancy([mixed], SERVICES, { enabled: true });
  assert(isDemoted(f), "ON/services+supply-CLIN-language: STILL demoted — gate keys on the assigned NAICS fact, not source supply prose (avoids the T1-9 circular trap)");
});

console.log("\n── P8 — NO over-fire: a non-NMR eligibility bar on a services NAICS is UNTOUCHED ──");
withFlag(true, () => {
  const sdvosb = base({ requirement: "SDVOSB set-aside — offeror must be a verified SDVOSB.", citation: "FAR 52.219-27", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "setaside:SDVOSB", curableInWindow: false });
  const inp = [sdvosb, nmrKeyfact()];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out[0] === inp[0], "ON/services: the SDVOSB bar (non-NMR) is the SAME object — only NMR-family findings demote");
  assert(isDemoted(out[1]), "ON/services: the NMR bar in the same rail IS demoted (targeting is precise)");
});

console.log("\n── P9 — wholesale sector (42) is applicable (boundary of the supply set) ──");
withFlag(true, () => {
  const inp = [nmrKeyfact()];
  const out = applyNmrNaicsDormancy(inp, WHOLESALE, { enabled: true });
  assert(out[0] === inp[0], "ON/wholesale (423430 sector 42): NMR untouched — 42 is in the supply set");
});

// ══ GAUNTLET R1 REMEDIATION PROBES (banked as permanent regressions) ══
const ITVAR = "541519"; // 13 CFR 121.406(b)(3) ITVAR exception — NMR is LIVE despite sector 54

console.log("\n── P10 (R1 #1 P0) — ITVAR 541519: NMR is LIVE by statutory exception ⇒ NOT demoted ──");
assert(isNmrApplicableNaics(ITVAR), "isNmrApplicableNaics('541519') === true (ITVAR exception, 13 CFR 121.406(b)(3))");
withFlag(true, () => {
  const inp = [nmrKeyfact()];
  const out = applyNmrNaicsDormancy(inp, ITVAR, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/541519: NMR bar UNTOUCHED — no false-CLEAR of a live NMR (fail-toward-live)");
});

console.log("\n── P11 (R1 MISSED-A P1) — bare 'non-manufacturer' prose in an OEM bar (NO 52.219-33) ⇒ NOT demoted ──");
withFlag(true, () => {
  const oem = base({ requirement: "Only the original equipment manufacturer or a non-manufacturer authorized dealer with a current letter of supply may be considered eligible for award.", citation: "Section L eligibility", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
  const inp = [oem];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: standalone OEM/authorized-dealer bar UNTOUCHED — bare prose token no longer matches (needs the 52.219-33 clause number)");
  assert(disposeFinding(out[0]) === "disqualifying", "ON/services: the OEM bar stays 'disqualifying' — genuine bar preserved");
});

console.log("\n── P12 (R1 #2) — a distinct set-aside bar whose citation BUNDLES 52.219-33 with other 52.219-xx ⇒ NOT demoted ──");
withFlag(true, () => {
  const bundled = base({ requirement: "Total Small Business set-aside; the Nonmanufacturer Rule is one of several clauses listed.", citation: "FAR 52.219-6 · 52.219-33 · 52.219-28", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "setaside:SB", curableInWindow: false });
  const inp = [bundled];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: bundled-citation set-aside bar UNTOUCHED — a non-NMR-primary bar co-citing 52.219-33 is not swept");
});

console.log("\n── P13 (R1 #3 P1) — a FUSED finding co-stating the NMR + a distinct hard bar (clearance) ⇒ NOT demoted ──");
withFlag(true, () => {
  const fused = base({ requirement: "Nonmanufacturer Rule compliance required AND the offeror must hold an active TOP SECRET facility clearance.", citation: "FAR 52.219-33", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
  const inp = [fused];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: fused NMR+clearance finding LEFT INTACT — co-stated hard bar not false-cleared (fail-toward-escalation)");
  assert(disposeFinding(out[0]) === "disqualifying", "ON/services: the fused finding stays 'disqualifying' — clearance bar preserved");
});

console.log("\n── P14 (regression) — the keyfact attribute NMR (real #92 shape) STILL demotes ──");
withFlag(true, () => {
  const [f] = applyNmrNaicsDormancy([nmrKeyfact()], SERVICES, { enabled: true });
  assert(isDemoted(f), "ON/services: attribute-carrying NMR bar still demoted (the real seq-2 #92 fix holds)");
});

console.log("\n── P15 (R3 doctrine) — a standalone 52.219-33 bar NOT in the keyfact shape is LEFT INTACT (escalation-safe) ──");
withFlag(true, () => {
  const standalone = base({ requirement: "Nonmanufacturer Rule — 52.219-33 checked; if the bidder is not the manufacturer, it must comply with the nonmanufacturer rule requirements.", citation: "Section I, 52.219-33 Nonmanufacturer Rule (Nov 2025)", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
  const inp = [standalone];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: a standalone 52.219-33 bar that is NOT the positive keyfact shape stays a bar → human review (never false-cleared on a non-authoritative match)");
});

console.log("\n── P16 (R3 doctrine) — an arbitrary 52.219-33 finding (abbreviation, non-keyfact text) is LEFT INTACT ──");
withFlag(true, () => {
  const abbr = base({ requirement: "52.219-33 NMR eligibility bar — the offeror must satisfy the NMR.", citation: "Section I, 52.219-33", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
  const inp = [abbr];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: a non-keyfact 52.219-33 finding stays a bar → escalation (positive-shape allowlist, not a prose/clause match)");
});

// ══ GAUNTLET R2 REMEDIATION PROBES ══
console.log("\n── P17 (R3 doctrine) — the pure keyfact NMR demotes; a clearance word in its GROUNDING excerpt is not a bar it carries ──");
withFlag(true, () => {
  const attr = nmrKeyfact(); // NMR_ATTRIBUTE + exact NMR_CAUTION requirement (pure NMR by construction)
  attr.excerpt = "☒ 52.219-33 Nonmanufacturer Rule · adjacent source line mentions a TOP SECRET facility clearance";
  const [f] = applyNmrNaicsDormancy([attr], SERVICES, { enabled: true });
  assert(isDemoted(f), "ON/services: the positive-shape keyfact NMR demotes — its excerpt is GROUNDING (evidence), not a bar; a real clearance requirement is emitted as its OWN finding by the clearance lens (separation of concerns)");
  assert(/clearance/i.test(f.excerpt ?? ""), "ON/services: the excerpt text is PRESERVED (transparency — nothing erased from the record)");
});

console.log("\n── P18 (R2 #2 P2) — VAAR 852.219-70 bundle + setaside:SB attribute ⇒ NOT demoted (belt + suspenders) ──");
withFlag(true, () => {
  const sbBar = base({ requirement: "Total Small Business set-aside — only small business concerns are eligible. Nonmanufacturer Rule (52.219-33) also applies.", citation: "852.219-70 · 52.219-33", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "setaside:SB", curableInWindow: false });
  const inp = [sbBar];
  const out = applyNmrNaicsDormancy(inp, SERVICES, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ON/services: VAAR-bundled SB set-aside bar UNTOUCHED — foreign-attribute guard + 852.219 in OTHER_219_RE both catch it");
});

console.log("\n── P19 (R2 #3 P3) — ITVAR robust to a trailing/decimal digit (541519.0 / 5415190) ⇒ stays LIVE ──");
assert(isNmrApplicableNaics("5415190") && isNmrApplicableNaics("541519.0" as string), "isNmrApplicableNaics keeps 7-digit-after-strip ITVAR forms applicable (fail-toward-live)");
withFlag(true, () => {
  const out = applyNmrNaicsDormancy([nmrKeyfact()], "5415190", { enabled: true });
  assert(disposeFinding(out[0]) === "disqualifying", "ON/5415190: live ITVAR NMR NOT demoted (P3 robustness closed)");
});

console.log("\n── P20 (regression) — a clean attribute NMR (clean excerpt, no foreign attr) STILL demotes ──");
withFlag(true, () => {
  const [f] = applyNmrNaicsDormancy([nmrKeyfact()], SERVICES, { enabled: true });
  assert(isDemoted(f), "ON/services: the plain keyfact NMR still demotes — R2 guards did not over-suppress");
});

console.log("\n── P21 (R2 #3 close) — any MALFORMED (non-6-digit) NAICS demotes NOTHING (leading-zero/padded/truncated) ──");
withFlag(true, () => {
  for (const bad of ["0541519", "5415190", "54151", "3341110", "561320561320"]) {
    const [f] = applyNmrNaicsDormancy([nmrKeyfact()], bad, { enabled: true });
    assert(disposeFinding(f) === "disqualifying", `ON/malformed "${bad}" (len ${bad.replace(/\D/g,"").length}): NMR bar NOT demoted — no false-clear on a non-6-digit code`);
  }
  // control: the well-formed services code still demotes
  const [ok] = applyNmrNaicsDormancy([nmrKeyfact()], "561320", { enabled: true });
  assert(disposeFinding(ok) === "gate_to_clear", "ON/561320 (well-formed 6-digit services): still demotes — the 6-digit gate did not over-suppress");
});

// ══ GAUNTLET R3 REMEDIATION PROBE (the blocklist-leak family — positive allowlist closes it by construction) ══
console.log("\n── P22 (R3 P1×N) — a 52.219-33 finding co-stating ANY distinct hard bar is LEFT INTACT (no vocabulary list) ──");
withFlag(true, () => {
  const foreignBars = ["EAR/export control license", "DCAA-approved accounting system", "authorized distributor letter", "bid bond and payment bond", "ISO 9001 certification", "CMMC Level 2", "FAA Part 145 repair station certificate", "AS9100 certification", "Buy American / TAA compliance", "state contractor license", "an active facility security clearance"];
  let anyDemoted = false;
  for (const bar of foreignBars) {
    const fused = base({ requirement: `Nonmanufacturer Rule (52.219-33) compliance AND the offeror must hold ${bar}.`, citation: "52.219-33", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
    const out = applyNmrNaicsDormancy([fused], SERVICES, { enabled: true });
    if (out[0] !== fused || disposeFinding(out[0]) !== "disqualifying") anyDemoted = true;
  }
  assert(!anyDemoted, `ON/services: all ${foreignBars.length} co-stated-bar findings LEFT INTACT — the positive allowlist needs no foreign-bar vocabulary (R3 blocklist treadmill closed by construction)`);
});

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILED`} — nmr-naics-dormancy`);
process.exit(failures === 0 ? 0 : 1);
