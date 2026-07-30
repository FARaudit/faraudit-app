/* CERT Unit-6 — attack vector 1 residual: a PLAIN eligibility_bar-kind finding (bidder_controls/already_satisfied,
 * NO requiredAttribute, no markers). Does merging two such plains change any verdict driver?
 * unverifiedGates = kind===eligibility_bar && !!requiredAttribute && ... — the !!requiredAttribute predicate means a
 * NO-requiredAttribute eligibility_bar-kind plain NEVER enters unverifiedGates. Prove it, both merged and not. */
import { applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { BidderProfile, VerdictInputs } from "../../src/lib/audit-findings";
process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; // arm the unverifiedGates clamp path so any leak would SHOW
process.env.AUDIT_FINDING_DEDUP = "true";
const F = (o: Partial<TypedFinding>): TypedFinding => ({
  id: o.id ?? Math.random().toString(36).slice(2), requirement: o.requirement ?? "req", citation: o.citation ?? "",
  excerpt: o.excerpt ?? "", kind: o.kind ?? "other", controllability: o.controllability ?? "bidder_controls", grounded: o.grounded ?? true, ...o,
} as TypedFinding);
const vi = (f: TypedFinding[], p: BidderProfile | null): VerdictInputs =>
  ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const V = (d: ReturnType<typeof deriveVerdict>) => `${d.verdict}|${d.eligible}`;
let fails = 0;
// two plain eligibility_bar-kind, NO requiredAttribute, same clause — both bidder_controls (so non-bar, no attr → plain absorbable)
const set = [
  F({ citation: "FAR 52.219-6", requirement: "Set-aside clause applies to this acquisition", controllability: "bidder_controls", kind: "eligibility_bar" }),
  F({ citation: "52.219-6", requirement: "Set-aside clause applies to this acquisition per notice", controllability: "bidder_controls", kind: "eligibility_bar" }),
];
const after = applyFindingDedup(set, { enabled: true });
console.log(`rows ${set.length} -> ${after.length}`);
for (const [label, p] of [["null", null], ["open", { satisfiedAttributes: [] }]] as const) {
  const b = V(deriveVerdict(vi(set, p))), a = V(deriveVerdict(vi(after, p)));
  const ok = b === a;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok " : "FAIL"} [${label}] eligbar-kind no-attr plain  ${b} -> ${a}`);
}
// also: already_satisfied eligibility_bar-kind no-attr (disposes to met, inert)
const set2 = [
  F({ citation: "FAR 52.212-3", requirement: "Offeror representations complete", controllability: "already_satisfied", kind: "eligibility_bar" }),
  F({ citation: "52.212-3", requirement: "Offeror representations complete and current", controllability: "already_satisfied", kind: "eligibility_bar" }),
];
const after2 = applyFindingDedup(set2, { enabled: true });
for (const [label, p] of [["null", null], ["open", { satisfiedAttributes: [] }]] as const) {
  const b = V(deriveVerdict(vi(set2, p))), a = V(deriveVerdict(vi(after2, p)));
  const ok = b === a; if (!ok) fails++;
  console.log(`  ${ok ? "ok " : "FAIL"} [${label}] already_satisfied eligbar-kind no-attr  ${b} -> ${a}`);
}
console.log(fails === 0 ? "\nELIGBAR-KIND: ALL PASS" : `\nELIGBAR-KIND: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
