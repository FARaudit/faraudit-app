/** BRAIN CARD 240 FORK 7 — NMR DOCTRINE ($0, deterministic, NO engine calls).
 *  (3) SINGLE EMITTER — the deterministic keyfact detector is the SOLE emitter of the NMR attribute; a model-lens
 *      NMR attribute is retired to advisory. Order-independent.
 *  (4) TRISTATE MAPPING (kills P-8) — the NMR attribute rides the Fork-3 who-can-win path: compliant → proven-pass
 *      (contributes true, never pins null); closed-world noncompliant → INELIGIBLE (attribute-specific); unknown →
 *      NHR when verdict-decisive. Never universal, never NO_BID.
 *    npx tsx scripts/audit-ai/test-fork7-nmr-doctrine.ts */
import { deriveVerdict, applyNmrSingleEmitter, applyNmrFirmStatusGate, NMR_ATTRIBUTE, canonicalizeNmrAttr } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  [PASS] ${label}`); } else { fails.push(label); console.log(`  [FAIL] ${label}`); } };
const inp = (findings: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });
const gate = (fs: TypedFinding[], p: BidderProfile | null) => applyNmrFirmStatusGate(applyNmrSingleEmitter(fs), p, { enabled: true });
const decide = (fs: TypedFinding[], p: BidderProfile | null) => deriveVerdict(inp(gate(fs, p), p));
const withTristate = <T>(fn: () => T): T => { const prev = process.env.AUDIT_ELIGIBLE_TRISTATE; process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev; } };

// The canonical NMR finding as the deterministic keyfact detector emits it (eligibility_bar + attribute + bidder_controls).
const nmr = (): TypedFinding => ({
  requirement: "Non-Manufacturer Rule (FAR 52.219-33): a nonmanufacturer must supply a small U.S. manufacturer's end item and not exceed 500 employees, unless SBA waives.",
  citation: "FAR 52.219-33 · 13 CFR 121.406(b)", excerpt: "the non-manufacturer rule applies to this small-business set-aside supply acquisition",
  kind: "eligibility_bar", controllability: "bidder_controls", requiredAttribute: NMR_ATTRIBUTE, curableInWindow: true, grounded: true, lens: "keyfact_detector",
});
const COMPLIANT: BidderProfile = { satisfiedAttributes: [NMR_ATTRIBUTE] };                    // proven compliant (canonical token)
const NONCOMPLIANT: BidderProfile = { satisfiedAttributes: ["nonmanufacturer:noncompliant"] }; // POSITIVE canonical non-compliance token → the ONLY INELIGIBLE path (card 242, review-hardened)

// ── (3) SINGLE EMITTER ────────────────────────────────────────────────────────────────────────────────
console.log("[(3) single emitter — keyfact detector is sole NMR-attribute emitter]");
{
  const modelLensNmr: TypedFinding = { ...nmr(), lens: "small_business_counsel" }; // a MODEL lens that typed NMR
  const soleModel = applyNmrSingleEmitter([modelLensNmr]);
  ok("FAIL-CLOSED: a SOLE model-lens NMR is PROMOTED, not dropped (eligibility signal never silently lost)", soleModel[0].requiredAttribute === NMR_ATTRIBUTE);
  const keyfactOut = applyNmrSingleEmitter([nmr()]);
  ok("a keyfact_detector NMR keeps the attribute (sole emitter)", keyfactOut[0].requiredAttribute === NMR_ATTRIBUTE);
  const mixed = applyNmrSingleEmitter([{ ...nmr(), lens: "small_business_counsel" }, nmr()]);
  ok("mixed: exactly ONE canonical carries the attribute", mixed.filter((f) => f.requiredAttribute === NMR_ATTRIBUTE).length === 1);
  ok("mixed: the keyfact_detector one is canonical (deterministic source wins the dedup)", mixed.find((f) => f.requiredAttribute === NMR_ATTRIBUTE)!.lens === "keyfact_detector");
}

// ── (4) TRISTATE MAPPING — kills P-8 ───────────────────────────────────────────────────────────────────
console.log("[(4) tristate mapping — compliant→pass · noncompliant→INELIGIBLE · unknown→NHR]");
withTristate(() => {
  // (c) THE P-8 NEGATIVE (load-bearing): a COMPLIANT firm reaches committal eligible=true — the attribute no longer
  //     pins committalEligible to null forever.
  const vCompliant = decide([nmr()], COMPLIANT);
  ok(`c: compliant firm (firmStatus satisfies) → BID (got ${vCompliant.verdict})`, vCompliant.verdict === "BID");
  ok(`c: P-8 KILLED — committal eligible === true (was null FOREVER) (got ${vCompliant.eligible})`, vCompliant.eligible === true);

  // closed-world NONCOMPLIANT → INELIGIBLE with an attribute-specific reason.
  const vNon = decide([nmr()], NONCOMPLIANT);
  ok(`noncompliant closed-world → INELIGIBLE (got ${vNon.verdict})`, vNon.verdict === "INELIGIBLE");
  ok("noncompliant → eligible:false (positively determined)", vNon.eligible === false);
  ok("noncompliant → reason names the NMR attribute (attribute-specific, no category claim)", /nonmanufacturer:compliant/i.test(vNon.reason) && !/who-can-win/i.test(vNon.reason));

  // unknown / null → NHR (verdict-decisive), never a silent caution, never NO_BID.
  const vUnknown = decide([nmr()], null);
  ok(`unknown/null → NEEDS_HUMAN_REVIEW (got ${vUnknown.verdict})`, vUnknown.verdict === "NEEDS_HUMAN_REVIEW");
  ok("unknown/null → never NO_BID (rides who-can-win, never universal)", vUnknown.verdict !== "NO_BID");
  // (4) the NHR reason carries CURABILITY context (card 242 item 4) — honest verdict + a visible path through,
  //     NOT the generic lead-time "cannot be cured in the window" framing (NMR is curable by supply).
  ok("unknown/null → NHR reason carries the NMR curability path (supply a small U.S. manufacturer's product)",
    /nonmanufacturer rule compliance is typically achievable by supplying a small u\.s\. manufacturer/i.test(vUnknown.reason) && !/lead time exceeds/i.test(vUnknown.reason));
});

// ── (Finding-1, card 242) CANONICAL NMR TOKEN — a SYNONYM never causes a false INELIGIBLE ──────────────
console.log("[(Finding-1) canonical NMR token — synonym→NHR (walk-away-error wall); canonical noncompliant→INELIGIBLE]");
{
  // canonicalizer unit: the exact token + recognized compliant synonyms canonicalize; a bare/ambiguous token does not.
  ok("canon: exact token → nmr:compliant", canonicalizeNmrAttr(NMR_ATTRIBUTE) === "nmr:compliant");
  ok("canon: 'NMR compliant' synonym → nmr:compliant", canonicalizeNmrAttr("NMR compliant") === "nmr:compliant");
  ok("canon: 'nonmanufacturer rule compliance' → nmr:compliant", canonicalizeNmrAttr("nonmanufacturer rule compliance") === "nmr:compliant");
  ok("canon: an ambiguous/unparseable NMR token → null (not a compliance attestation)", canonicalizeNmrAttr("nonmanufacturer-ok") === null);
  ok("canon: an unrelated attribute → null", canonicalizeNmrAttr("Top Secret facility clearance") === null);
  ok("canon: a POSITIVE non-compliance token → nmr:noncompliant (the only INELIGIBLE path)", canonicalizeNmrAttr("nonmanufacturer:noncompliant") === "nmr:noncompliant");
  ok("canon: negation-aware — 'not NMR compliant' → nmr:noncompliant, never compliant", canonicalizeNmrAttr("not nmr compliant") === "nmr:noncompliant");
  // Defect A (adversarial verify): a NON-NMR 'rule' noncompliance token must NOT canonicalize (no false INELIGIBLE).
  for (const bad of ["affiliation rule noncompliant", "limitations on subcontracting rule non-compliant", "cmmc rule noncompliant", "berry amendment rule non-compliant"])
    ok(`canon Defect-A: "${bad}" → null (not an NMR token — no false INELIGIBLE)`, canonicalizeNmrAttr(bad) === null);
  // Defect B (adversarial verify): a GAPPED negation must read as non-compliance, never a false compliant/eligible.
  for (const neg of ["not currently nmr compliant", "not yet nmr compliant", "not fully nonmanufacturer rule compliant", "not presently nonmanufacturer compliant"])
    ok(`canon Defect-B: "${neg}" → nmr:noncompliant (gapped negation, never false-compliant)`, canonicalizeNmrAttr(neg) === "nmr:noncompliant");
  // and a distant unrelated "not" must NOT flip a genuine compliance attestation.
  ok("canon: 'nmr compliant, will not subcontract' → nmr:compliant (distant 'not' does not flip)", canonicalizeNmrAttr("nmr compliant, will not subcontract") === "nmr:compliant");
}
withTristate(() => {
  // A firm that IS compliant but recorded it under a SYNONYM the canonicalizer accepts → still clears → BID/eligible=true.
  const vSyn = decide([nmr()], { satisfiedAttributes: ["NMR compliant"] });
  ok(`compliant SYNONYM ("NMR compliant") still clears → BID (got ${vSyn.verdict})`, vSyn.verdict === "BID" && vSyn.eligible === true);
  // THE LOAD-BEARING NEGATIVE: a closed-world firm that asserted an NMR-related status in an UNRECOGNIZED form must
  // NEVER be ruled INELIGIBLE (the walk-away error). It routes to NHR (unknown), not INELIGIBLE, not a silent BID.
  const vWall = decide([nmr()], { satisfiedAttributes: ["nonmanufacturer-ok"], openWorld: false });
  ok(`Finding-1 WALL: closed-world SYNONYM token → NHR, never false INELIGIBLE (got ${vWall.verdict})`, vWall.verdict === "NEEDS_HUMAN_REVIEW");
  ok("Finding-1 WALL: the synonym case is NOT INELIGIBLE (false-INELIGIBLE is the walk-away error class)", vWall.verdict !== "INELIGIBLE");
  // REVIEW-HARDENED (adversarial Finding-1): ABSENCE is not proof of NMR ineligibility. A closed-world profile with
  // NO NMR token (NMR is a per-bid supply arrangement, not a standing cert; a genuine manufacturer wouldn't list it)
  // → NHR, NEVER a false INELIGIBLE. INELIGIBLE fires ONLY on a POSITIVE canonical non-compliance token (NONCOMPLIANT).
  const vClosedNone = decide([nmr()], { satisfiedAttributes: ["Top Secret facility clearance"], openWorld: false });
  ok(`hardened: closed-world, NO NMR token → NHR (absence ≠ ineligible), never INELIGIBLE (got ${vClosedNone.verdict})`, vClosedNone.verdict === "NEEDS_HUMAN_REVIEW");
  const vEmpty = decide([nmr()], { satisfiedAttributes: [], openWorld: false });
  ok(`hardened: EMPTY closed-world profile → NHR, never INELIGIBLE (got ${vEmpty.verdict})`, vEmpty.verdict === "NEEDS_HUMAN_REVIEW");
  // Only a POSITIVE canonical non-compliance token → INELIGIBLE.
  const vPosNon = decide([nmr()], NONCOMPLIANT);
  ok(`hardened: POSITIVE canonical non-compliance token → INELIGIBLE (the only path) (got ${vPosNon.verdict})`, vPosNon.verdict === "INELIGIBLE");
});

// ── (d) ORDER-INDEPENDENCE PERMUTATION LOCK (P-9 dead) ─────────────────────────────────────────────────
console.log("[(d) order-independence — permutation over emitter order → identical verdict]");
withTristate(() => {
  // A benign co-finding (a submission gate) + the NMR attribute, permuted. The single-emitter + firm-status gate
  // are keyed on the attribute/lens, so verdict must be identical regardless of position.
  const other: TypedFinding = { requirement: "Submit the quote by the closing date.", citation: "SF-1449 Block 8", excerpt: "closing date", kind: "submission", controllability: "bidder_controls", grounded: true, lens: "keyfact_detector" };
  const perms: TypedFinding[][] = [[nmr(), other], [other, nmr()]];
  for (const p of [null, COMPLIANT, NONCOMPLIANT] as (BidderProfile | null)[]) {
    const verdicts = perms.map((fs) => decide(fs, p).verdict);
    ok(`order-independent under profile=${p === null ? "null" : JSON.stringify(p.satisfiedAttributes)}: ${verdicts.join(" == ")}`, verdicts[0] === verdicts[1]);
  }
});

console.log(`\n${fails.length === 0 ? `✅ FORK-7 GREEN — ${pass} checks` : `❌ ${fails.length} FAIL of ${pass + fails.length}`} — NMR doctrine: keyfact is sole attribute emitter (model-lens retired to advisory); the NMR attribute rides the who-can-win path (compliant→BID/eligible=true KILLS P-8; noncompliant→INELIGIBLE attribute-specific; unknown→NHR); never NO_BID; order-independent (P-9 dead). $0, no engine calls.`);
if (fails.length) { fails.forEach((f) => console.log(`   ✗ ${f}`)); process.exit(1); }
