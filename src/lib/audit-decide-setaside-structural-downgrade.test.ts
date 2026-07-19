// $0 PROOF for #2 SET-ASIDE STRUCTURAL-IMPOSSIBILITY DOWNGRADE (Brain #344, co-required with #1). Two-sided:
//   POSITIVE — SAM+doc agree on HUBZone AND the un-scrubbed-matrix tell (52.219-3 set-aside + 52.219-4 price-pref
//     both applicable) is present → stray Total-SB notice → P2 doc-integrity flag, conflict SUPPRESSED → committal-HUBZone.
//   NEGATIVE — same agreement but NO structural tell → downgrade null → conflict fires → STILL NHR (could be a
//     genuine tiered/multi-CLIN set-aside). HARD: (a)+(b) alone never downgrade; only (c) the tell licenses it.
// Mirrors the orchestrator order: runGuards → applySetAsideStructuralDowngrade → (suppress?) detectSetAsideConflict → deriveVerdict.
// Run: npx tsx src/lib/audit-decide-setaside-structural-downgrade.test.ts
import {
  emitSetAsideNoticeFindings, mergeSetAsideNoticeFindings, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts,
  applySetAsideFirmStatusGate, applyEligibilityAuthorityAllowlist, detectSetAsideConflict, deriveVerdict,
  detectSetAsideStructuralImpossibility, setAsideStructuralDowngrade, applySetAsideStructuralDowngrade,
} from "./audit-decide";
import type { BidderProfile } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { coverageComplete: true, verifierSound: true, conflict: false } as const;
const OPTS = setAsideOvertypeGuardOpts({ AUDIT_SETASIDE_OVERTYPE_GUARD: "true" });
function runGuards(source: string, profile: BidderProfile | null) {
  let f = mergeSetAsideNoticeFindings([], emitSetAsideNoticeFindings(source));
  f = applyAwardBasisOvertypeGuard(f, profile, OPTS);
  f = applySetAsideFirmStatusGate(f, profile, { enabled: true });
  f = applyEligibilityAuthorityAllowlist(f, { enabled: true });
  return f;
}
// Mirror the orchestrator: downgrade first, then conflict is suppressed when the downgrade fired.
function decide(source: string, profile: BidderProfile | null, sam: string) {
  const guarded = runGuards(source, profile);
  const dg = applySetAsideStructuralDowngrade(guarded, source, sam, { enabled: true });
  const conflict = dg.downgrade ? undefined : detectSetAsideConflict(sam, dg.findings, source);
  const d = deriveVerdict({ findings: dg.findings, bidderProfile: profile, ...base, setAsideConflict: conflict });
  return { d, dg, conflict };
}

// FA1068 WITH the tell — 52.219-3 (set-aside) + 52.219-4 (price-pref) + 52.219-6 (stray Total-SB), all applicable.
const FA1068_TELL = [
  "RFO Clause 52.219-3 Notice of HUBZone Set-Aside or Sole-Source Award Class Deviation Date (Feb 2026) Yes",
  "RFO Clause 52.219-4 Notice of Price Evaluation Preference for HUBZone Small Business Concerns Feb 2026 Yes",
  "RFO Clause 52.219-6 Notice of Total Small Business Set-Aside Feb 2026 Yes",
].join("\n");
// FA1068 WITHOUT the tell — the genuine-ambiguity shape (no 52.219-4 price-pref present).
const FA1068_NOTELL = [
  "RFO Clause 52.219-3 Notice of HUBZone Set-Aside or Sole-Source Award Class Deviation Date (Feb 2026) Yes",
  "RFO Clause 52.219-6 Notice of Total Small Business Set-Aside Feb 2026 Yes",
].join("\n");

console.log("\n── UNIT · detectSetAsideStructuralImpossibility ──");
assert(detectSetAsideStructuralImpossibility(FA1068_TELL).present, "T1 52.219-3 + 52.219-4 both applicable → tell PRESENT");
assert(!detectSetAsideStructuralImpossibility(FA1068_NOTELL).present, "T2 no 52.219-4 → tell ABSENT");
assert(!detectSetAsideStructuralImpossibility("RFO Clause 52.219-3 HUBZone Yes\nRFO Clause 52.219-4 Price Pref No").present, "T3 52.219-4 marked NO → tell ABSENT (grounded on the row's applicability cell)");

console.log("\n── UNIT · setAsideStructuralDowngrade three-gate logic ──");
{
  const g = runGuards(FA1068_TELL, null);
  const dg = setAsideStructuralDowngrade("HZC", g, FA1068_TELL);
  assert(!!dg && dg.governing === "se:hubzone", "G1 (a)+(b)+(c) all hold → downgrade to governing HUBZone");
  assert(!!dg && dg.strays.includes("sb:total"), "G2 stray = Total Small Business");
}
assert(setAsideStructuralDowngrade("HZC", runGuards(FA1068_NOTELL, null), FA1068_NOTELL) === null, "G3 (c) absent → NO downgrade (stays a conflict) — the HARD constraint");
assert(setAsideStructuralDowngrade(null, runGuards(FA1068_TELL, null), FA1068_TELL) === null, "G4 (a) absent (no SAM program) → NO downgrade");
assert(setAsideStructuralDowngrade("SDVOSBC", runGuards(FA1068_TELL, null), FA1068_TELL) === null, "G5 (b) absent (SAM=SDVOSB not declared in doc) → NO downgrade");
// (d) Gauntlet F2 — a SPECIFIC socioeconomic stray is a genuine second pool, NOT template residue → keep NHR.
const FA1068_SDVOSB_STRAY = [
  "RFO Clause 52.219-3 Notice of HUBZone Set-Aside or Sole-Source Award Class Deviation Date (Feb 2026) Yes",
  "RFO Clause 52.219-4 Notice of Price Evaluation Preference for HUBZone Small Business Concerns Feb 2026 Yes",
  "RFO Clause 52.219-27 Notice of Service-Disabled Veteran-Owned Small Business Set-Aside Feb 2026 Yes",
].join("\n");
assert(setAsideStructuralDowngrade("HZC", runGuards(FA1068_SDVOSB_STRAY, null), FA1068_SDVOSB_STRAY) === null, "G6 (F2) tell present but stray is SPECIFIC socioeconomic (SDVOSB) → NO downgrade (genuine 2nd pool → NHR)");

console.log("\n── POSITIVE · tell present → committal-HUBZone, stray → P2 doc-integrity, conflict suppressed ──");
{
  const { d, dg, conflict } = decide(FA1068_TELL, null, "HZC");
  assert(!!dg.downgrade, "P1 downgrade fired");
  assert(conflict === undefined, "P2 conflict SUPPRESSED (not fed to deriveVerdict)");
  assert(d.verdict === "BID_WITH_CAUTION", `P3 null profile → committal BID_WITH_CAUTION (got ${d.verdict})`);
  const stray = dg.findings.find((f) => /52\.219-6/.test(f.citation))!;
  assert(stray.kind === "other" && stray.controllability === "bidder_controls" && stray.severity === "P2", "P4 stray Total-SB re-typed → non-blocking P2 doc-integrity flag");
  assert(stray.requiredAttribute === undefined, "P5 stray no longer asserts an eligibility pool (requiredAttribute dropped)");
  assert(dg.findings.some((f) => /52\.219-3/.test(f.citation) && f.kind === "eligibility_bar"), "P6 governing HUBZone notice UNTOUCHED (still the eligibility basis)");
}

console.log("\n── POSITIVE · closed-world HUBZone holder + tell → committal (BID/BID_WITH_CAUTION), never NHR ──");
{
  const profile: BidderProfile = { satisfiedAttributes: ["se:hubzone"], closedWorld: true };
  const { d } = decide(FA1068_TELL, profile, "HZC");
  assert(d.verdict === "BID" || d.verdict === "BID_WITH_CAUTION", `holder + tell → committal (got ${d.verdict})`);
  assert(d.verdict !== "NEEDS_HUMAN_REVIEW", "NOT NHR for a qualified HUBZone firm once the stray is downgraded");
}

console.log("\n── NEGATIVE · no tell → downgrade null → conflict fires → STILL NHR ──");
{
  const { d, dg, conflict } = decide(FA1068_NOTELL, null, "HZC");
  assert(!dg.downgrade, "N1 no downgrade (no structural tell)");
  assert(!!conflict, "N2 conflict fires from the raw matrix");
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `N3 genuine multi-program ambiguity → NHR (got ${d.verdict})`);
  assert(/HUBZone/.test(d.reason) && /Total Small Business/.test(d.reason), "N4 both programs still surfaced to the CO");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
