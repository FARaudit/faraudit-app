// RT Unit6 R2 — ROOT ISOLATION for the 3 confirmed breaks + variants.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";
type F = TypedFinding;
const mk = (o: Partial<F>): F => ({ requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as F);
const vi = (findings: F[]) => ({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as any);

function show(label: string, findings: F[]) {
  const dd = applyFindingDedup(findings, { enabled: true });
  const full = deriveVerdict(vi(findings)), after = deriveVerdict(vi(dd));
  const ok = full.verdict === after.verdict && full.eligible === after.eligible;
  console.log(`${ok ? "ok " : "*** UNSAFE"} [${label}] ${full.verdict}/${full.eligible} -> ${after.verdict}/${after.eligible}`);
  console.log(`     survivor ctrl/kind/cur: ${dd.map((f) => `${f.controllability}|${f.kind}|cur=${f.curableInWindow}|merged=${(f as any).findingDedupMerged}`).join("  ;  ")}`);
}

// C2 minimal: 0-protected path — does the SORT pick the bar as primary? Both plain, no markers.
// Plain no_one_can_move + plain bidder_controls, SAME clause, no object-id, no attr. 0 protected.
// primary sort: ctrl rank no_one_can_move=4 > bidder_controls=2 → bar wins → SAFE.
show("Z1 0-protected: bar+controls (sort picks bar)", [
  mk({ citation: "52.222-99", requirement: "no one can move impossibility here", controllability: "no_one_can_move", curableInWindow: false }),
  mk({ citation: "52.222-99", requirement: "controllable submit price zzz", controllability: "bidder_controls" }),
]);

// C2 forced: add a benign non-allow-list marker to the CONTROLS member so it becomes PROTECTED and FORCED.
show("Z2 forced: controls-protected + no_one_can_move plain (PROVED break)", [
  mk({ citation: "52.222-99", requirement: "controllable item protected", controllability: "bidder_controls", preconditionOvertypeFloored: true }),
  mk({ citation: "52.222-99", requirement: "no one can move impossibility zzz", controllability: "no_one_can_move", curableInWindow: false }),
]);

// C1 forced: curable-protected + non-curable plain bar.
show("Z3 forced: curable-protected + non-curable bar plain (PROVED break)", [
  mk({ citation: "52.204-7", requirement: "curable protected", controllability: "bidder_controls", curableInWindow: true, preconditionOvertypeFloored: true }),
  mk({ citation: "52.204-7", requirement: "clearance bar hold at award zzz", controllability: "bidder_cannot_move", curableInWindow: false }),
]);

// B2 minimal: 0-protected boilerplate primary. Confirm the sort picks boilerplate (ctrl tie -> length).
show("Z4 0-protected: boilerplate-primary drops the cluster", [
  mk({ citation: "52.204-7", requirement: "LONG BOILERPLATE WINS LENGTH TIEBREAK aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", kind: "boilerplate", controllability: "bidder_controls" }),
  mk({ citation: "52.204-7", requirement: "verify cert caution", kind: "submission", controllability: "bidder_controls", cautionFloor: true }),
]);

// B2 variant: boilerplate primary absorbing a real BAR (not just a caution).
show("Z5 boilerplate-primary absorbs a bidder_cannot_move bar", [
  mk({ citation: "52.204-7", requirement: "LONG BOILERPLATE WINS LENGTH aaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbb", kind: "boilerplate", controllability: "bidder_controls" }),
  mk({ citation: "52.204-7", requirement: "clearance bar hold at award", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false }),
]);
// NB: bar has higher ctrl rank -> becomes primary -> boilerplate absorbed. That's SAFE. The danger is only when
// boilerplate is the MOST conservative (all bidder_controls) OR is the forced protected member.

// B2 forced: boilerplate carrying a protective marker -> FORCED survivor -> drops everything.
show("Z6 boilerplate PROTECTED (marker) forced-survivor drops a real bar", [
  mk({ citation: "52.204-7", requirement: "boilerplate protected", kind: "boilerplate", controllability: "bidder_controls", preconditionOvertypeFloored: true }),
  mk({ citation: "52.204-7", requirement: "clearance bar hold at award zzz", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false }),
]);
