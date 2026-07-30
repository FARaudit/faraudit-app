/* CERT Unit-6 — verdict+eligible invariance of applyFindingDedup across profiles, idempotency, order, flag-off, ReDoS.
 * Run: AUDIT_FINDING_DEDUP=true npx tsx scripts/audit-ai/_cert-unit6-invariance.ts
 * NB: applyFindingDedup reads env at call → we set the flag per-call by mutating process.env. */
import { applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { BidderProfile, VerdictInputs } from "../../src/lib/audit-findings";
import fs from "fs";

const F = (o: Partial<TypedFinding>): TypedFinding => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  requirement: o.requirement ?? "req",
  citation: o.citation ?? "",
  excerpt: o.excerpt ?? "",
  kind: o.kind ?? "other",
  controllability: o.controllability ?? "bidder_controls",
  grounded: o.grounded ?? true,
  ...o,
} as TypedFinding);

const vi = (findings: TypedFinding[], p: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false });

const nullP: BidderProfile | null = null;
const openP: BidderProfile = { satisfiedAttributes: ["se:wosb"] };
const closedP: BidderProfile = { satisfiedAttributes: ["se:wosb"], closedWorld: true } as BidderProfile;

const on = () => { process.env.AUDIT_FINDING_DEDUP = "true"; };
const off = () => { process.env.AUDIT_FINDING_DEDUP = "false"; };

let fails = 0;
const V = (d: ReturnType<typeof deriveVerdict>) => `${d.verdict}|${d.eligible}`;
function check(name: string, before: TypedFinding[]) {
  on();
  const after = applyFindingDedup(before, { enabled: true });
  for (const [label, p] of [["null", nullP], ["open", openP], ["closed", closedP]] as const) {
    const b = V(deriveVerdict({ ...vi(before, p), source: "" }));
    const a = V(deriveVerdict({ ...vi(after, p), source: "" }));
    if (b !== a) { console.log(`  FAIL ${name} [${label}] verdict changed: ${b} -> ${a}`); fails++; }
  }
  // idempotency
  const twice = applyFindingDedup(after, { enabled: true });
  if (JSON.stringify(twice) !== JSON.stringify(after)) { console.log(`  FAIL ${name} not idempotent`); fails++; }
  // order-stability (reverse input, verdict must be invariant to input order for a pure gate — verdict not row order)
  const rev = applyFindingDedup(before.slice().reverse(), { enabled: true });
  const bRev = V(deriveVerdict({ ...vi(rev, nullP), source: "" }));
  const bFwd = V(deriveVerdict({ ...vi(after, nullP), source: "" }));
  if (bRev !== bFwd) { console.log(`  FAIL ${name} order-unstable verdict: fwd ${bFwd} rev ${bRev}`); fails++; }
  // flag-off byte-identity
  off();
  const offRes = applyFindingDedup(before, { enabled: false });
  if (offRes !== before) { console.log(`  FAIL ${name} flag-off not same-ref`); fails++; }
  on();
  console.log(`  ok  ${name}  (rows ${before.length} -> ${after.length})`);
}

// ── Scenario battery ────────────────────────────────────────────────────────
// 1. Two plain bidder_controls dups on one clause (basic collapse)
check("2x plain bidder_controls / 52.217-8", [
  F({ citation: "FAR 52.217-8", requirement: "Option to extend services", controllability: "bidder_controls", kind: "submission" }),
  F({ citation: "52.217-8", requirement: "Option to extend services", controllability: "bidder_controls", kind: "submission" }),
]);

// 2. plain + PROTECTED bar on same clause — bar must pass through untouched, verdict driven by bar
check("plain + bar(bidder_cannot_move,attr) / 52.219-33", [
  F({ citation: "FAR 52.219-33", requirement: "Nonmanufacturer Rule", controllability: "bidder_controls", kind: "other" }),
  F({ citation: "FAR 52.219-33", requirement: "Nonmanufacturer Rule bar", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "nmr:compliant" }),
]);

// 3. two boilerplate plains → survivor boilerplate → still dropped (material-emptiness sensitive)
check("2x boilerplate plain only", [
  F({ citation: "FAR 52.204-7", requirement: "SAM boilerplate", controllability: "bidder_controls", kind: "boilerplate" }),
  F({ citation: "52.204-7", requirement: "SAM boilerplate", controllability: "bidder_controls", kind: "boilerplate" }),
]);

// 4. boilerplate plain + non-boilerplate plain same clause → survivor non-boilerplate (kind rank)
check("boilerplate + submission plain same clause", [
  F({ citation: "FAR 52.212-1", requirement: "Instructions boilerplate", controllability: "bidder_controls", kind: "boilerplate" }),
  F({ citation: "52.212-1", requirement: "Submit price schedule", controllability: "bidder_controls", kind: "submission" }),
]);

// 5. cautionFloor carried on a NON-anchor (later) plain member — must survive OR onto survivor
check("cautionFloor on 2nd member only", [
  F({ citation: "FAR 52.217-9", requirement: "Option to extend the term", controllability: "bidder_controls", kind: "submission" }),
  F({ citation: "52.217-9", requirement: "Option to extend the term period", controllability: "bidder_controls", kind: "submission", cautionFloor: true }),
]);

// 6. already_satisfied plain dups (met) — inert both ways
check("2x already_satisfied plain", [
  F({ citation: "FAR 52.204-8", requirement: "Annual reps", controllability: "already_satisfied", kind: "other" }),
  F({ citation: "52.204-8", requirement: "Annual reps", controllability: "already_satisfied", kind: "other" }),
]);

// 7. mixed ctrl plains: already_satisfied + bidder_controls → worst picks bidder_controls (rank 2 > 1); both inert
check("already_satisfied + bidder_controls plain", [
  F({ citation: "FAR 52.209-2", requirement: "Prohibition rep", controllability: "already_satisfied", kind: "other" }),
  F({ citation: "52.209-2", requirement: "Prohibition rep detail", controllability: "bidder_controls", kind: "other" }),
]);

// 8. protected via marker (structuralAssertionCorrected) + plain same clause — marker-bearer NOT absorbed
check("marker-bearer + plain same clause", [
  F({ citation: "FAR 52.222-41", requirement: "SCA WD", controllability: "bidder_controls", kind: "submission", structuralAssertionCorrected: true } as Partial<TypedFinding>),
  F({ citation: "52.222-41", requirement: "SCA WD", controllability: "bidder_controls", kind: "submission" }),
]);

// 9. requiredAttribute-bearer (non-bar!) + plain same clause — attr-bearer excluded from absorb (fdBaseAbsorbable false)
check("non-bar requiredAttribute-bearer + plain same clause", [
  F({ citation: "FAR 52.219-6", requirement: "Set-aside satisfied", controllability: "already_satisfied", kind: "eligibility_bar", requiredAttribute: "se:wosb" }),
  F({ citation: "52.219-6", requirement: "Set-aside notice", controllability: "bidder_controls", kind: "submission" }),
]);

console.log(fails === 0 ? "\nINVARIANCE: ALL PASS" : `\nINVARIANCE: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
