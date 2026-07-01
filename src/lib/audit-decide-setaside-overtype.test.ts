// $0 REGRESSION for the guard-fix (card 164/167, AUDIT_SETASIDE_OVERTYPE_GUARD) — the false-INELIGIBLE-under-null
// seam. Run: npx tsx src/lib/audit-decide-setaside-overtype.test.ts
//
// Doctrine (Brain): a PURE socioeconomic set-aside MIS-TYPED `no_one_can_move` under a NULL/open-world profile
// must normalize to a CURABLE CAUTION (BID_WITH_CAUTION), never INELIGIBLE — zero-contract-loss. The fix is the
// new opt `normalizeNoOneCanMoveSetAside` on applyAwardBasisOvertypeGuard (flag AUDIT_SETASIDE_OVERTYPE_GUARD,
// default-OFF). Pure functions, no engine calls, flag INJECTED via the opt (no env mutation).
import { applyAwardBasisOvertypeGuard, deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// A pure SDVOSB set-aside, DELIBERATELY mis-typed no_one_can_move (a who-can-win bar is never truly universal).
const setAside = (): TypedFinding => ({
  requirement: "This acquisition is a 100% SDVOSB set-aside; award is restricted to verified service-disabled veteran-owned small business concerns.",
  citation: "FAR 52.219-27", excerpt: "set-aside for service-disabled veteran-owned small business concerns",
  kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "contracts_attorney",
  requiredAttribute: "se:sdvosb", curableInWindow: false,
});
// A GENUINE universal bar (brand-name sole-source) — excluded by NON_SELF_CLEARABLE_BAR_RE, never matches the
// socioeconomic regex, so the guard must leave it untouched; it must still drive a disqualifying verdict.
const soleSource = (): TypedFinding => ({
  requirement: "Award is restricted to brand-name OEM part no. XYZ-123; no substitute will be accepted.",
  citation: "§B basis-for-award", excerpt: "BRAND NAME ONLY - OEM part XYZ-123, no substitute",
  kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
  curableInWindow: false,
});
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
const guard = (fs: TypedFinding[], normalize: boolean) =>
  applyAwardBasisOvertypeGuard(fs, null, { enabled: true, normalizeNoOneCanMoveSetAside: normalize });

console.log("── 1 · flag ON: mis-typed no_one_can_move SDVOSB + null → BID_WITH_CAUTION (not INELIGIBLE) ──");
{
  const g = guard([setAside()], true);
  assert(g[0].controllability === "bidder_controls" && g[0].curableInWindow === true && g[0].cautionFloor === true, "guard normalizes the set-aside → bidder_controls + curable + cautionFloor");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "BID_WITH_CAUTION", `verdict = BID_WITH_CAUTION (got ${d.verdict})`);
  assert(d.eligible !== false, `eligible !== false (got ${d.eligible})`);
}

console.log("── 2 · flag OFF / bypass: same input → INELIGIBLE (proves the flag is load-bearing) ──");
{
  const off = deriveVerdict({ findings: guard([setAside()], false), ...base });
  assert(off.verdict === "INELIGIBLE", `flag OFF → INELIGIBLE (got ${off.verdict})`);
  const bypass = deriveVerdict({ findings: [setAside()], ...base });
  assert(bypass.verdict === "INELIGIBLE", `guard bypass → INELIGIBLE (got ${bypass.verdict})`);
}

console.log("── 3 · REFINEMENT: mis-typed set-aside + coexisting GENUINE universal bar, flag ON → still disqualifying ──");
{
  const g = guard([setAside(), soleSource()], true);
  const sa = g.find((f) => f.requiredAttribute === "se:sdvosb")!;
  const ss = g.find((f) => f.lens === "former_ko")!;
  assert(sa.controllability === "bidder_controls", "set-aside softened to a caution");
  assert(ss.controllability === "no_one_can_move", "genuine sole-source bar LEFT UNTOUCHED (per-finding)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "NO_BID" || d.verdict === "INELIGIBLE", `real universal bar still drives ${d.verdict} (softening did NOT rescue a foreclosed solicitation)`);
}

console.log("── 4 · flag-OFF byte-identical: guard output identical with opt false vs the pre-fix predicate ──");
{
  // With the opt false/absent, a no_one_can_move set-aside is NOT softened (the pre-fix behavior).
  const optFalse = guard([setAside()], false);
  const optAbsent = applyAwardBasisOvertypeGuard([setAside()], null, { enabled: true });
  assert(optFalse[0].controllability === "no_one_can_move" && optAbsent[0].controllability === "no_one_can_move", "opt false/absent → set-aside NOT softened (byte-identical to pre-fix)");
  // And the existing bidder_cannot_move set-aside path is unchanged regardless of the opt.
  const bcm = { ...setAside(), controllability: "bidder_cannot_move" as const };
  const a = guard([bcm], true)[0], b = guard([bcm], false)[0];
  assert(a.controllability === "bidder_controls" && b.controllability === "bidder_controls", "existing bidder_cannot_move set-aside path unchanged by the opt");
}

console.log("── 5 · CARD 177 RULING: nhr disposition — mis-typed no_one_can_move SDVOSB + null → NEEDS_HUMAN_REVIEW (honest-fail, NOT INELIGIBLE) ──");
{
  const g = applyAwardBasisOvertypeGuard([setAside()], null, { enabled: true, setAsideOvertypeDisposition: "nhr" });
  assert(g[0].controllability === "bidder_cannot_move" && g[0].curableInWindow === false, "nhr disposition → non-curable bidder_cannot_move bar (not universal, not curable)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `verdict = NEEDS_HUMAN_REVIEW (got ${d.verdict})`);
  assert(d.eligible !== false, `eligible !== false (got ${d.eligible})`);
}

console.log("── 6 · SCOPE-GUARD (SPRDL125Q0030-shape): structural sole-source bar UNTOUCHED → stays INELIGIBLE, even in nhr mode ──");
{
  // Carries an 8(a) token AND sole-source / named-firm / no-substitute STRUCTURAL language — NON_SELF_CLEARABLE_BAR_RE
  // must win so the guard never softens (nor NHRs) a genuine structural bar the way it does a PURE set-aside.
  const structural = (): TypedFinding => ({
    requirement: "This 8(a) award is a sole-source directed to named firm ABC Corp; no substitute or alternate will be accepted.",
    citation: "§B / approved-source", excerpt: "sole source, no substitute, directed to named firm",
    kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
    requiredAttribute: "se:8a", curableInWindow: false,
  });
  const g = applyAwardBasisOvertypeGuard([structural()], null, { enabled: true, setAsideOvertypeDisposition: "nhr" });
  assert(g[0].controllability === "no_one_can_move", "structural bar LEFT UNTOUCHED (NON_SELF_CLEARABLE_BAR_RE exclusion wins over the 8(a) token)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "INELIGIBLE", `structural bar still drives INELIGIBLE (got ${d.verdict})`);
  assert(d.eligible === false, `eligible === false (got ${d.eligible})`);
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — guard-fix (AUDIT_SETASIDE_OVERTYPE_GUARD).`);
process.exit(failures === 0 ? 0 : 1);
