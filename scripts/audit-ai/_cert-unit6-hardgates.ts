/* CERT Unit-6 — hard attacks: material-emptiness flip (2b), prior-P0-family non-merge, over-merge facet vanish,
 * and the "plain-finding drives a verdict effect merging can change" hunt. */
import { applyFindingDedup, deriveVerdict, disposeFinding, type TypedFinding } from "../../src/lib/audit-decide";
import type { BidderProfile, VerdictInputs } from "../../src/lib/audit-findings";

process.env.AUDIT_FINDING_DEDUP = "true";
const F = (o: Partial<TypedFinding>): TypedFinding => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  requirement: o.requirement ?? "req", citation: o.citation ?? "", excerpt: o.excerpt ?? "",
  kind: o.kind ?? "other", controllability: o.controllability ?? "bidder_controls", grounded: o.grounded ?? true, ...o,
} as TypedFinding);
const vi = (f: TypedFinding[], p: BidderProfile | null): VerdictInputs =>
  ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const V = (d: ReturnType<typeof deriveVerdict>) => `${d.verdict}|${d.eligible}|ss=${d.showStoppers.length}`;
let fails = 0;
function inv(name: string, before: TypedFinding[], p: BidderProfile | null = null) {
  const after = applyFindingDedup(before, { enabled: true });
  const b = V(deriveVerdict(vi(before, p))), a = V(deriveVerdict(vi(after, p)));
  const flag = b === a ? "ok " : "FAIL";
  if (b !== a) fails++;
  console.log(`  ${flag} ${name}  ${b}  ->  ${a}   (rows ${before.length}->${after.length})`);
}

// ── Material-emptiness (2b): dispositions.every(dropped) ⇒ NHR "materially-empty". ──
// A: ALL findings boilerplate plains on ONE clause. Before: 2 dropped → every-dropped=TRUE → NHR.
//    After: 1 boilerplate survivor → still every-dropped → NHR. Preserved.
inv("2b all-boilerplate 1 clause", [
  F({ citation: "FAR 52.204-7", requirement: "SAM reg boilerplate one", controllability: "bidder_controls", kind: "boilerplate" }),
  F({ citation: "52.204-7", requirement: "SAM reg boilerplate two variant text", controllability: "bidder_controls", kind: "boilerplate" }),
]);
// B: the DANGER shape — could a merge turn an "all-dropped" set into a "has-survivor" set or vice-versa?
//    boilerplate plain + non-boilerplate plain on same clause + a SEPARATE lone boilerplate.
//    Before dispositions: [dropped, gate_to_clear, dropped] → not all dropped → BID.
//    After: survivor kind=submission (non-boilerplate wins rank) → [gate_to_clear, dropped] → not all dropped → BID.
inv("2b mixed-kind merge keeps non-dropped", [
  F({ citation: "FAR 52.212-1", requirement: "Instructions boilerplate", controllability: "bidder_controls", kind: "boilerplate" }),
  F({ citation: "52.212-1", requirement: "Submit a price schedule", controllability: "bidder_controls", kind: "submission" }),
  F({ citation: "FAR 52.204-7", requirement: "Lone SAM boilerplate", controllability: "bidder_controls", kind: "boilerplate" }),
]);
// C: WORST-CASE for 2b — the ONLY non-dropped finding is a plain that shares a clause with a boilerplate plain.
//    If the merge could pick the boilerplate kind as survivor, the set would go all-dropped → flip BID→NHR.
//    fdKindRank(boilerplate)=0 < middle=2, so survivor MUST be non-boilerplate. Prove it holds.
inv("2b sole non-dropped shares clause w/ boilerplate", [
  F({ citation: "FAR 52.222-41", requirement: "SCA wage determination boilerplate clause text", controllability: "bidder_controls", kind: "boilerplate" }),
  F({ citation: "52.222-41", requirement: "Submit conformance request for unlisted labor class", controllability: "bidder_controls", kind: "submission" }),
]);

// ── Prior 6-pass P0 family: these MUST now be NON-MERGES (protected pass through). ──
// P0-a: forced-protected attr-clobber shape (R4) — attr-bearing bar + attr-less plain, same clause.
//       Bar is protected (isBarClass). Only 1 plain → plainIdx<2 → NO merge. Bar reaches deriveVerdict intact.
inv("P0 forced-protected-attr (R4)", [
  F({ citation: "FAR 52.219-14", requirement: "LoS bar", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "los:50pct" }),
  F({ citation: "52.219-14", requirement: "LoS mention", controllability: "bidder_controls", kind: "other" }),
], { satisfiedAttributes: [] });
// P0-b: bar-softening (R1) — two bars same clause + one plain. Bars protected (both pass through). plain lone → no merge.
inv("P0 bar-softening (R1)", [
  F({ citation: "FAR 52.219-33", requirement: "NMR bar A", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "nmr:x" }),
  F({ citation: "52.219-33", requirement: "NMR bar B typed", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", nmrGuard: true } as Partial<TypedFinding>),
  F({ citation: "52.219-33", requirement: "NMR plain mention", controllability: "bidder_controls", kind: "other" }),
], { satisfiedAttributes: [] });
// P0-c: requiredAttribute fabrication (R3) — attr-less plain + untyped-worst plain would previously fabricate attr.
//       Now: neither carries requiredAttribute (both plain) → survivor has NO requiredAttribute → cannot fabricate a bar.
inv("P0 requiredAttribute-fabrication (R3) — two attr-less plains", [
  F({ citation: "FAR 52.219-1", requirement: "size self-cert mention", controllability: "already_satisfied", kind: "other" }),
  F({ citation: "52.219-1", requirement: "size standard notice under NAICS", controllability: "bidder_controls", kind: "other" }),
], { satisfiedAttributes: [] });

// ── Over-merge / facet vanish: two DISTINCT plain obligations on one clause, distinct identity token. ──
// Distinct facets must both survive in survivor.requirement (a concern must not vanish).
{
  const before = [
    F({ citation: "FAR 52.217-8", requirement: "Exercise option 1 within 30 days of expiration", controllability: "bidder_controls", kind: "submission" }),
    F({ citation: "52.217-8", requirement: "Exercise option 2 within 60 days of expiration", controllability: "bidder_controls", kind: "submission" }),
  ];
  const after = applyFindingDedup(before, { enabled: true });
  const surv = after.find((f) => (f as any).findingDedupMerged);
  const keptBoth = surv && /option 1/.test(surv.requirement) && /option 2/.test(surv.requirement);
  console.log(`  ${keptBoth ? "ok " : "FAIL"} over-merge facet-preserve (option1 & option2)  survivor.req="${surv?.requirement}"`);
  if (!keptBoth) fails++;
}
// True restatement (no new token) should collapse to one facet (not over-append is fine, must not LOSE content).
{
  const before = [
    F({ citation: "FAR 52.217-9", requirement: "Option to extend the term of the contract", controllability: "bidder_controls", kind: "submission" }),
    F({ citation: "52.217-9", requirement: "Option to extend the term", controllability: "bidder_controls", kind: "submission" }),
  ];
  const after = applyFindingDedup(before, { enabled: true });
  const surv = after.find((f) => (f as any).findingDedupMerged);
  const hasFull = surv && /extend the term of the contract/.test(surv.requirement);
  console.log(`  ${hasFull ? "ok " : "FAIL"} restatement keeps maximal facet  survivor.req="${surv?.requirement}"`);
  if (!hasFull) fails++;
}

// ── disposeFinding parity: survivor disposition must equal what its own controllability/kind implies. ──
{
  const before = [
    F({ citation: "FAR 52.203-3", requirement: "Gratuities plain a", controllability: "bidder_controls", kind: "other" }),
    F({ citation: "52.203-3", requirement: "Gratuities plain b", controllability: "bidder_controls", kind: "other" }),
  ];
  const after = applyFindingDedup(before, { enabled: true });
  const surv = after.find((f) => (f as any).findingDedupMerged)!;
  const d = disposeFinding(surv);
  console.log(`  ${d === "gate_to_clear" ? "ok " : "FAIL"} survivor disposition = ${d}`);
  if (d !== "gate_to_clear") fails++;
}

console.log(fails === 0 ? "\nHARD-GATES: ALL PASS" : `\nHARD-GATES: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
