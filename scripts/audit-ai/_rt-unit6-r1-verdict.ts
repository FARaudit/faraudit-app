// RT Unit6 R1 — VERDICT-SAFETY invariant: deriveVerdict(full).verdict === deriveVerdict(deduped).verdict
// and same .eligible, for every adversarial fixture. Flag OFF via env for deriveVerdict is default;
// but applyFindingDedup we call with enabled:true directly (it's the thing under test).
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

type F = TypedFinding;
const mk = (o: Partial<F>): F => ({
  requirement: "", citation: "", excerpt: "", kind: "other",
  controllability: "bidder_controls", grounded: true, ...o,
} as F);

const vi = (findings: F[]) => ({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as any);

function check(label: string, findings: F[]) {
  const full = deriveVerdict(vi(findings));
  const deduped = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi(deduped));
  const ok = full.verdict === after.verdict && full.eligible === after.eligible;
  console.log(`${ok ? "ok " : "*** VERDICT-UNSAFE"} [${label}] full=${full.verdict}/elig=${full.eligible}  deduped=${after.verdict}/elig=${after.eligible}  rows ${findings.length}->${deduped.length}`);
  if (!ok) {
    console.log(`    full.reason: ${(full as any).reason?.slice(0,140)}`);
    console.log(`    dedup.reason: ${(after as any).reason?.slice(0,140)}`);
    console.log(`    survivors: ${deduped.map((f) => `[${f.controllability}/${f.severity ?? "-"}/cur=${f.curableInWindow}/cf=${f.cautionFloor}]`).join(" ")}`);
  }
}

// ---- A1: two DISTINCT bars share a clause number but are different obligations.
// Non-curable structural bar + a curable submission gate, same clause 52.204-7. Most-conservative primary = bar.
check("A1 same-clause bar + curable", [
  mk({ citation: "52.204-7", requirement: "hold CMMC L3 clearance at award", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "cmmc-l3" }),
  mk({ citation: "52.204-7", requirement: "register in SAM before offer", controllability: "bidder_controls", curableInWindow: true }),
]);

// ---- A2: the KILLER — two findings share a clause but ONE is no_one_can_move (universal claim),
// the OTHER is bidder_controls. Full set: unmarkedUniversalClaim fires → NHR. Does dedup preserve?
check("A2 no_one_can_move + bidder_controls same clause", [
  mk({ citation: "52.222-99", requirement: "delivery in 3 days is impossible for any offeror", controllability: "no_one_can_move", curableInWindow: false }),
  mk({ citation: "52.222-99", requirement: "submit price in SAM", controllability: "bidder_controls", curableInWindow: true }),
]);

// ---- A3: bar with requiredAttribute + a bidder_controls WITHOUT requiredAttribute, same clause.
// Full: the bar is disqualifying/unknown → nonCurable branch → NHR. Survivor keeps requiredAttribute?
check("A3 bar w/ attr + controls no attr", [
  mk({ citation: "52.219-33", requirement: "nonmanufacturer rule bars this firm", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "small-mfr", kind: "eligibility_bar" }),
  mk({ citation: "52.219-33", requirement: "note the NMR applies to end items", controllability: "bidder_controls", curableInWindow: true }),
]);

// ---- A4: primary selection tie — most-conservative primary is a CURABLE bar; another member is
// a NON-curable bar. anyNonCurableBar must force survivor curable=false.
check("A4 curable-primary but non-curable member", [
  mk({ citation: "52.204-7", requirement: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA long curable bar text", controllability: "bidder_cannot_move", curableInWindow: true, requiredAttribute: "x" }),
  mk({ citation: "52.204-7", requirement: "short bar", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "y" }),
]);

// ---- A5: cautionFloor member merged into a non-floored primary. OR must carry cautionFloor.
check("A5 cautionFloor OR", [
  mk({ citation: "52.204-7", requirement: "qualification caution here", controllability: "bidder_controls", curableInWindow: true, cautionFloor: true }),
  mk({ citation: "52.204-7", requirement: "plain gate", controllability: "bidder_controls", curableInWindow: true }),
]);

// ---- A6: idempotency
const set6 = [
  mk({ citation: "52.217-8", requirement: "option A", controllability: "bidder_controls" }),
  mk({ citation: "52.217-8", requirement: "option B distinct facet zzzz", controllability: "bidder_controls" }),
];
const once = applyFindingDedup(set6, { enabled: true });
const twice = applyFindingDedup(once, { enabled: true });
console.log(`${JSON.stringify(once) === JSON.stringify(twice) ? "ok " : "*** NON-IDEMPOTENT"} [A6 idempotency] rows ${set6.length}->${once.length}->${twice.length}`);

// ---- A7: flag OFF byte-identity
const off = applyFindingDedup(set6, { enabled: false });
console.log(`${off === set6 ? "ok " : "*** FLAG-OFF NOT SAME REF"} [A7 flag-off byte-id] sameRef=${off === set6}`);

// ---- A8: PROVEN-FAIL show-stopper preserved. Needs a profile to prove fail; use closedWorld-ish.
// Use two eligibility_bar findings on same clause; a proven fail needs firmStatus. Skip profile complexity:
// instead show the INELIGIBLE/NO_BID path via universalDefect requires verifiedBy — out of dedup scope.

// ---- A9: severity max preserved (P0 buried under P2 primary by ctrl/len sort).
check("A9 P0 severity must survive", [
  mk({ citation: "52.204-7", requirement: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB long P2 text", controllability: "bidder_controls", severity: "P2" }),
  mk({ citation: "52.204-7", requirement: "P0", controllability: "bidder_controls", severity: "P0" }),
]);
