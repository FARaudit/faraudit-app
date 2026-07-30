// RT Unit6 R1 — mark-preservation on merge (universalDefect/verifiedBy/nmrGuard/mmEvidenceFactor)
// and severity monotonicity. The survivor is `...primary` — so a NON-primary member's marks are LOST.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

type F = TypedFinding;
const mk = (o: Partial<F>): F => ({
  requirement: "", citation: "", excerpt: "", kind: "other",
  controllability: "bidder_controls", grounded: true, ...o,
} as F);
const vi = (findings: F[]) => ({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as any);

// M1: NON-primary member carries universalDefect+verifiedBy (→ NO_BID driver). Primary is a plain
// bidder_controls (loses the sort? no — controllability sort: no_one_can_move > controls). Make the
// universalDefect member no_one_can_move so it IS primary → mark should survive. Then INVERT: make the
// universalDefect member a LOWER controllability than a co-member so primary is the OTHER one.
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
process.env.AUDIT_FOURWALLS_NOBID = "true";
{
  // universalDefect member = no_one_can_move (rank 4) so it wins primary → keeps its marks. Safe case.
  const uMember = mk({ citation: "52.211-6", requirement: "spec self-contradicts, unmeetable by any offeror ZZZZ", controllability: "no_one_can_move", curableInWindow: false, universalDefect: "unmeetable_by_any_offeror", verifiedBy: { affirmation: "x", excerptHash: "h" } as any });
  const other = mk({ citation: "52.211-6", requirement: "also references the same spec", controllability: "no_one_can_move", curableInWindow: false });
  const findings = [other, uMember]; // uMember second, but higher? both no_one_can_move; tie → severity → length. other is shorter.
  const full = deriveVerdict(vi(findings));
  const ded = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi(ded));
  const survKeepsMark = (ded.find((f) => (f as any).findingDedupMerged) as any)?.universalDefect;
  console.log(`[M1 universalDefect co-members] full=${full.verdict} deduped=${after.verdict} survivorMark=${survKeepsMark} ${full.verdict === after.verdict ? "ok" : "*** VERDICT-UNSAFE"}`);
}
{
  // DANGEROUS: universalDefect member has LOWER sort priority than a co-member, so primary is the OTHER,
  // survivor = ...primary → universalDefect + verifiedBy DROPPED. Both no_one_can_move so both rank 4;
  // tie-break severity then length. Give the NON-defect member higher severity so it becomes primary.
  const uMember = mk({ citation: "52.211-7", requirement: "unmeetable defect", controllability: "no_one_can_move", curableInWindow: false, severity: "P2", universalDefect: "unmeetable_by_any_offeror", verifiedBy: { affirmation: "x", excerptHash: "h" } as any });
  const otherHi = mk({ citation: "52.211-7", requirement: "AAAAAAAAAAAAAAAAAAAAAAAA long high-sev non-defect finding on same clause", controllability: "no_one_can_move", curableInWindow: false, severity: "P0" });
  const findings = [uMember, otherHi];
  const full = deriveVerdict(vi(findings));
  const ded = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi(ded));
  const surv = ded.find((f) => (f as any).findingDedupMerged) as any;
  console.log(`[M2 universalDefect member NOT primary] full=${full.verdict}/${full.eligible} deduped=${after.verdict}/${after.eligible}  survivor.universalDefect=${surv?.universalDefect} verifiedBy=${!!surv?.verifiedBy}`);
  console.log(`     ${full.verdict === after.verdict && full.eligible === after.eligible ? "ok verdict-safe" : "*** VERDICT-UNSAFE — NO_BID lost"}`);
}
delete process.env.AUDIT_FOURWALLS_NOBID;
delete process.env.AUDIT_ELIGIBLE_TRISTATE;

// M3: nmrGuard drop. deriveVerdict routes nmrUnknown separately (nmrGuard===true). If a nmrGuard member
// is NOT primary, survivor loses nmrGuard → falls into the generic nonCurable branch → DIFFERENT reason
// (and possibly different pole vs the nmr branch). Both are NHR though. Check reason text divergence only.
{
  const nmrMember = mk({ citation: "52.219-33", requirement: "NMR status unknown", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "nmr", nmrGuard: true });
  const genericBar = mk({ citation: "52.219-33", requirement: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA long generic non-curable bar same clause", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "g" });
  const findings = [nmrMember, genericBar];
  const full = deriveVerdict(vi(findings));
  const ded = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi(ded));
  const surv = ded.find((f) => (f as any).findingDedupMerged) as any;
  console.log(`[M3 nmrGuard drop] full=${full.verdict} deduped=${after.verdict} survivor.nmrGuard=${surv?.nmrGuard}`);
  console.log(`     full.reason:  ${(full as any).reason?.slice(0,90)}`);
  console.log(`     dedup.reason: ${(after as any).reason?.slice(0,90)}`);
  console.log(`     ${(full as any).reason === (after as any).reason ? "reason-identical" : "*** REASON DIVERGED (nmr framing lost)"}`);
}

// M4: severity monotonicity — can survivorSeverity ever be LOWER than max? maxSev index map check.
{
  const findings = [
    mk({ citation: "52.204-7", requirement: "BBBBBBBBBBBBBBBB long P2", controllability: "bidder_controls", severity: "P2" }),
    mk({ citation: "52.204-7", requirement: "P0 short", controllability: "bidder_controls", severity: "P0" }),
  ];
  const ded = applyFindingDedup(findings, { enabled: true });
  console.log(`[M4 severity max] survivor sev=${(ded[0] as any).severity} (expect P0)`);
}
