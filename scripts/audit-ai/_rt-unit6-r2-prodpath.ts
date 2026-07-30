// RT Unit6 R2 — PRODUCTION-PATH proof: a real re-typing guard demotes ONE same-clause row to a PROTECTED
// bidder_controls (marker), dedup forces it as survivor and ABSORBS the sibling raw bar → the bar vanishes.
// Mirrors the orchestrator order: guard(s) THEN applyFindingDedup THEN deriveVerdict.
import { applyFindingDedup, applyStructuralBarWhitelist, applyClauseSemanticsGuard, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";
type F = TypedFinding;
const mk = (o: Partial<F>): F => ({ requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as F);
const vi = (findings: F[]) => ({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as any);

function pipeline(label: string, raw: F[]) {
  // Orchestrator-order (subset): structural-bar whitelist ON (default-ON in prod), then dedup, then verdict.
  const g1 = applyStructuralBarWhitelist(raw, null, { enabled: true });
  const withoutDedup = deriveVerdict(vi(g1));
  const g2 = applyFindingDedup(g1, { enabled: true });
  const withDedup = deriveVerdict(vi(g2));
  const ok = withoutDedup.verdict === withDedup.verdict && withoutDedup.eligible === withDedup.eligible;
  console.log(`${ok ? "ok " : "*** PROD-PATH UNSAFE"} [${label}] guard-only=${withoutDedup.verdict}/${withoutDedup.eligible}  guard+dedup=${withDedup.verdict}/${withDedup.eligible}`);
  console.log(`     after guard: ${g1.map((f) => `${f.controllability}|swg=${(f as any).structuralWhitelistGuard}`).join("  ")}`);
  console.log(`     after dedup: ${g2.map((f) => `${f.controllability}|cur=${f.curableInWindow}|merged=${(f as any).findingDedupMerged}`).join("  ")}`);
}

// SCENARIO A — same clause 52.219-6 (set-aside). Pass-1 phrases it as a "reps and certs / SAM registration"
// compliance item → COMPLIANCE_REP_RE matches → structural whitelist DEMOTES to bidder_controls + guard marker
// (PROTECTED). Pass-2 phrases the SAME clause as a non-curable bar with NO compliance vocab → whitelist does NOT
// demote (SAFETY: unrecognized non-curable → left as-is). Both are non-curable bidder_cannot_move BEFORE the guard.
// After guard: row1 = bidder_controls(protected), row2 = bidder_cannot_move(plain non-curable bar).
// dedup: exactly 1 protected → FORCED survivor = row1 → absorbs row2 → bar GONE.
pipeline("A demoted set-aside rep row eats the sibling raw bar", [
  mk({ citation: "52.219-6", requirement: "small business size standard reps and certs must be current in SAM registration", controllability: "bidder_cannot_move", curableInWindow: false }),
  mk({ citation: "52.219-6", requirement: "award is restricted and this firm may be barred from this pool zzz", controllability: "bidder_cannot_move", curableInWindow: false }),
]);

// SCENARIO B — clause-semantics guard. 52.204-7 (SAM) is CAP-ONLY re-typed to bidder_controls + clauseSemanticsGuard
// marker (PROTECTED) when it arrives as a bar. Pass-2 mentions 52.204-7 but ALSO carries a genuine co-located bar the
// lens typed no_one_can_move (e.g. it bundled a clearance). Guard caps ONLY the exact-cite bar row it recognizes...
// Here just show the same-clause dup: row1 capped→protected controls, row2 stays no_one_can_move.
{
  const raw = [
    mk({ citation: "52.204-7", requirement: "system for award management registration required", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar" }),
    mk({ citation: "52.204-7", requirement: "no offeror can satisfy the impossible registration timing zzz", controllability: "no_one_can_move", curableInWindow: false }),
  ];
  const g1 = applyClauseSemanticsGuard(raw, { enabled: true });
  const before = deriveVerdict(vi(g1));
  const g2 = applyFindingDedup(g1, { enabled: true });
  const after = deriveVerdict(vi(g2));
  const ok = before.verdict === after.verdict;
  console.log(`${ok ? "ok " : "*** PROD-PATH UNSAFE"} [B clause-semantics cap then dedup] guard-only=${before.verdict}  guard+dedup=${after.verdict}`);
  console.log(`     after guard: ${g1.map((f) => `${f.controllability}|csg=${(f as any).clauseSemanticsGuard}`).join("  ")}`);
  console.log(`     after dedup: ${g2.map((f) => `${f.controllability}|merged=${(f as any).findingDedupMerged}`).join("  ")}`);
}
