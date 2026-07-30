// RT Unit6 R1 — the PROFILE / firmStatus attacks. Closed-world profile so requiredAttribute is load-bearing.
// The survivor keeps ONLY primary.requiredAttribute — attack: two DISTINCT failed attributes on the same clause.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

type F = TypedFinding;
const mk = (o: Partial<F>): F => ({
  requirement: "", citation: "", excerpt: "", kind: "other",
  controllability: "bidder_controls", grounded: true, ...o,
} as F);

// closedWorld profile that HOLDS neither attribute; source provided so grounding passes.
const source = "attr-alpha and attr-beta and cmmc-l3 and wosb-cert appear here in source text";
const profile: any = { satisfiedAttributes: [], closedWorld: true };
const vi = (findings: F[]) => ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);

function check(label: string, findings: F[]) {
  const full = deriveVerdict(vi(findings));
  const deduped = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi(deduped));
  const verdictOK = full.verdict === after.verdict && full.eligible === after.eligible;
  const rFull = (full as any).reason ?? "";
  const rDed = (after as any).reason ?? "";
  const reasonMentionsBoth_full = /attr-alpha/.test(rFull) && /attr-beta/.test(rFull);
  const reasonMentionsBoth_ded = /attr-alpha/.test(rDed) && /attr-beta/.test(rDed);
  console.log(`${verdictOK ? "ok " : "*** VERDICT-UNSAFE"} [${label}] full=${full.verdict}/${full.eligible} deduped=${after.verdict}/${after.eligible} rows ${findings.length}->${deduped.length}`);
  console.log(`     full reason mentions BOTH attrs=${reasonMentionsBoth_full}  deduped=${reasonMentionsBoth_ded}  ${reasonMentionsBoth_full && !reasonMentionsBoth_ded ? "*** LOST-ATTR (attr dropped from INELIGIBLE reason)" : ""}`);
  console.log(`     full.reason:  ${rFull.slice(0, 160)}`);
  console.log(`     dedup.reason: ${rDed.slice(0, 160)}`);
}

// P1: two DISTINCT proven-fail eligibility bars on the SAME clause. Both firmStatus="fails".
// deriveVerdict → INELIGIBLE naming provenFails' requiredAttribute. Dedup keeps only primary's attr.
check("P1 two distinct proven-fail attrs, same clause", [
  mk({ citation: "52.219-6", requirement: "must be small under NAICS 541512 — attr-alpha", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "attr-alpha" }),
  mk({ citation: "52.219-6", requirement: "must hold WOSB cert — attr-beta", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "attr-beta" }),
]);

// P2: one proven-fail bar (attr-alpha) + a SATISFIED bar (held) same clause. positiveEligible()
// checks ALL disqualifying-with-attr: a fail anywhere → false. If dedup drops the SATISFIED member's
// attr, does positiveEligible flip? (should stay false either way since alpha fails)
const profileHolds: any = { satisfiedAttributes: ["attr-held"], closedWorld: true };
const vi2 = (findings: F[]) => ({ findings, bidderProfile: profileHolds, coverageComplete: true, verifierSound: true, conflict: false, source: source + " attr-held" } as any);
{
  const findings = [
    mk({ citation: "52.204-7", requirement: "hold attr-held (firm HAS it)", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "attr-held" }),
    mk({ citation: "52.204-7", requirement: "must be attr-alpha (firm LACKS)", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "attr-alpha" }),
  ];
  const full = deriveVerdict(vi2(findings));
  const deduped = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi2(deduped));
  const ok = full.verdict === after.verdict && full.eligible === after.eligible;
  console.log(`${ok ? "ok " : "*** VERDICT-UNSAFE"} [P2 held+fail same clause, primary=held] full=${full.verdict}/${full.eligible} deduped=${after.verdict}/${after.eligible}`);
  console.log(`     survivor attr=${deduped[0]?.requiredAttribute} ctrl=${deduped[0]?.controllability}`);
}

// P3: unverifiedGates / committalCaution attr dedup on the BID_WITH_CAUTION tristate path.
// Needs AUDIT_ELIGIBLE_TRISTATE. Set env then require fresh? deriveVerdict reads env at call-time. Set here.
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
const profileOpen: any = { satisfiedAttributes: [] }; // open-world, unknown
const vi3 = (findings: F[]) => ({ findings, bidderProfile: profileOpen, coverageComplete: true, verifierSound: true, conflict: false } as any);
{
  // two eligibility_bar findings, curable (so they route to caution, not NHR), distinct attrs, same clause.
  const findings = [
    mk({ citation: "52.219-6", requirement: "WOSB setaside — attr-alpha", controllability: "bidder_controls", curableInWindow: true, kind: "eligibility_bar", requiredAttribute: "attr-alpha", cautionFloor: true }),
    mk({ citation: "52.219-6", requirement: "size std — attr-beta", controllability: "bidder_controls", curableInWindow: true, kind: "eligibility_bar", requiredAttribute: "attr-beta", cautionFloor: true }),
  ];
  const full = deriveVerdict(vi3(findings));
  const deduped = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi3(deduped));
  const rF = (full as any).reason ?? "", rD = (after as any).reason ?? "";
  const bothF = /attr-alpha/.test(rF) && /attr-beta/.test(rF);
  const bothD = /attr-alpha/.test(rD) && /attr-beta/.test(rD);
  console.log(`${full.verdict === after.verdict && full.eligible === after.eligible ? "ok " : "*** VERDICT-UNSAFE"} [P3 tristate committalCaution attrs] full=${full.verdict}/${full.eligible} deduped=${after.verdict}/${after.eligible}`);
  console.log(`     ELIGIBILITY-NOT-VERIFIED lists BOTH gates: full=${bothF} deduped=${bothD} ${bothF && !bothD ? "*** LOST-GATE in customer caution" : ""}`);
  console.log(`     full:  ${rF.slice(0,150)}`);
  console.log(`     dedup: ${rD.slice(0,150)}`);
}
delete process.env.AUDIT_ELIGIBLE_TRISTATE;
