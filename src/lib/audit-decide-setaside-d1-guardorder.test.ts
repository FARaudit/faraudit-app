// $0 PROOF for Brain #338 Decision-1 (reverse #335) — set-aside NOTICE findings emitted BEFORE the softening guard
// chain so a SINGLE clean set-aside renders a coherent BID_WITH_CAUTION (verify-language, ZERO no-bid phrasing),
// a closed-world holder → committal, and FA1068's multi-program doc still → NHR. Mirrors the orchestrator order:
//   emit+merge → applyAwardBasisOvertypeGuard → applySetAsideFirmStatusGate → applyEligibilityAuthorityAllowlist → deriveVerdict.
// Run: npx tsx src/lib/audit-decide-setaside-d1-guardorder.test.ts
import { emitSetAsideNoticeFindings, mergeSetAsideNoticeFindings, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts, applySetAsideFirmStatusGate, applyEligibilityAuthorityAllowlist, detectSetAsideConflict, deriveVerdict } from "./audit-decide";
import type { BidderProfile } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { coverageComplete: true, verifierSound: true, conflict: false } as const;
// Guard chain as the orchestrator runs it (prod flags: SETASIDE_OVERTYPE_GUARD on, ELIGIBLE_TRISTATE on, ALLOWLIST on).
const OPTS = setAsideOvertypeGuardOpts({ AUDIT_SETASIDE_OVERTYPE_GUARD: "true" });
function runGuards(source: string, profile: BidderProfile | null) {
  let f = mergeSetAsideNoticeFindings([], emitSetAsideNoticeFindings(source));
  f = applyAwardBasisOvertypeGuard(f, profile, OPTS);
  f = applySetAsideFirmStatusGate(f, profile, { enabled: true });
  f = applyEligibilityAuthorityAllowlist(f, { enabled: true });
  return f;
}
// no-bid / delivery phrasing that must NEVER appear on an ELIGIBILITY caution (Brain #338 hard condition).
const NOBID_RE = /no[-\s]?bid|lead[-\s]?time|conditional no|walk[-\s]?away|cannot bid|do not bid/i;
const FA1068 = [
  "RFO Clause 52.219-3 Notice of HUBZone Set-Aside or Sole-Source Award Class Deviation Date (Feb 2026) Yes",
  "RFO Clause 52.219-6 Notice of Total Small Business Set-Aside Feb 2026 Yes",
].join("\n");

console.log("\n── 1 · SINGLE HUBZone set-aside, NULL profile → BID_WITH_CAUTION, verify-language, ZERO no-bid phrasing ──");
{
  const src = "RFO Clause 52.219-3 Notice of HUBZone Set-Aside Feb 2026 Yes\nRFO Clause 52.219-8 Utilization Feb 2026 Yes";
  const f = runGuards(src, null);
  assert(f.some((x) => /52\.219-3/.test(x.citation)), "HUBZone notice finding SURVIVES the guard chain incl. the eligibility-authority allowlist");
  const d = deriveVerdict({ findings: f, bidderProfile: null, ...base });
  assert(d.verdict === "BID_WITH_CAUTION", `verdict = BID_WITH_CAUTION (got ${d.verdict})`);
  assert(!NOBID_RE.test(d.reason), `reason carries NO no-bid/lead-time phrasing → "${d.reason.slice(0, 150)}"`);
  assert(/verif|confirm|caution|eligib/i.test(d.reason), "reason carries verify/caution/eligibility language");
}

console.log("\n── 2 · CLOSED-WORLD firm HOLDS HUBZone → committal (BID / BID_WITH_CAUTION), never NHR/INELIGIBLE ──");
{
  const src = "RFO Clause 52.219-3 Notice of HUBZone Set-Aside Feb 2026 Yes";
  const profile: BidderProfile = { satisfiedAttributes: ["se:hubzone"], closedWorld: true };
  const f = runGuards(src, profile);
  const d = deriveVerdict({ findings: f, bidderProfile: profile, ...base });
  assert(d.verdict === "BID" || d.verdict === "BID_WITH_CAUTION", `qualified holder → committal (got ${d.verdict})`);
  assert(d.verdict !== "NEEDS_HUMAN_REVIEW" && d.verdict !== "INELIGIBLE", "NOT NHR / NOT a false walk-away for a qualified firm (#1 generalization item)");
}

console.log("\n── 3 · CLOSED-WORLD firm LACKS the cert on a HUBZone set-aside → not a committal (firmStatus fails) ──");
{
  const src = "RFO Clause 52.219-3 Notice of HUBZone Set-Aside Feb 2026 Yes";
  const profile: BidderProfile = { satisfiedAttributes: ["se:sdvosb"], closedWorld: true };
  const f = runGuards(src, profile);
  const d = deriveVerdict({ findings: f, bidderProfile: profile, ...base });
  assert(d.verdict !== "BID" && d.verdict !== "BID_WITH_CAUTION", `provable non-holder → NOT a clean committal (got ${d.verdict})`);
}

console.log("\n── 4 · FA1068 MULTI-PROGRAM (52.219-3 + 52.219-6), NULL profile → NHR (conflict gate dominates) ──");
{
  const f = runGuards(FA1068, null);
  const conflict = detectSetAsideConflict("HZC", f, FA1068);
  assert(!!conflict, "conflict detected from the raw FA1068 matrix");
  const d = deriveVerdict({ findings: f, bidderProfile: null, ...base, setAsideConflict: conflict });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `multi-program → NHR, unchanged by the reorder (got ${d.verdict})`);
  assert(/HUBZone/.test(d.reason) && /Total Small Business/.test(d.reason), "both programs surfaced");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
