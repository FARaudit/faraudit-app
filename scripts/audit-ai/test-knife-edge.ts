// $0 proof for knife-edge SELECTION (Brain card-54/55 doctrine). Two deterministic triggers, both gated by
// a sensitivity flip: (1) over-typed bar→caution; (2) under-typed bar via lens DISAGREEMENT. Plus the
// load-bearing selectivity replay (#2/#3 clean poles must NOT over-escalate) and the dangerous-edge negative.
import { readFileSync, existsSync } from "node:fs";
import { knifeEdgeIndices } from "@/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const F = (o: Partial<TypedFinding> & { requirement: string; controllability: TypedFinding["controllability"] }): TypedFinding =>
  ({ citation: "x", excerpt: o.requirement, grounded: true, lens: o.lens ?? "x", kind: o.kind ?? "eligibility_bar", ...o } as TypedFinding);

// ── SELECTIVITY (load-bearing): the clean poles #2/#3 must produce ZERO knife-edge ──
for (const [sol, prof] of [["1240LP26Q0067", null], ["SPRDL125Q0030", { satisfiedAttributes: [] } as BidderProfile]] as const) {
  const p = `ceo/proofs/v3-${sol}-result.json`;
  if (existsSync(p)) ok(`selectivity: ${sol} clean pole → 0 escalations`, knifeEdgeIndices(JSON.parse(readFileSync(p, "utf8")).findings, prof), []);
}

// ── DANGEROUS EDGE (load-bearing negative): under-typed genuine bar caught via lens disagreement ──
// lens A under-types the Dillon sole-source as comply-to-win; lens B types it a bar. null profile.
const underTyped = [
  F({ lens: "proposal", requirement: "offer the Dillon DGMT1002 part per CLIN 0001AA", controllability: "bidder_controls", kind: "submission" }),
  F({ lens: "contracts", requirement: "sole-source to Dillon DGMT1002, no alternates", controllability: "bidder_cannot_move", requiredAttribute: "oem:dillon-DGMT1002", curableInWindow: false }),
];
ok("dangerous edge: under-typed bar via disagreement → BOTH cluster members flagged", knifeEdgeIndices(underTyped, null), [0, 1]);

// shared-miss: BOTH lenses under-type (no disagreement) → no signal → 0 (the SPOF Brain accepts; documented)
const sharedMiss = [
  F({ lens: "a", requirement: "offer Dillon DGMT1002 part", controllability: "bidder_controls", kind: "submission" }),
  F({ lens: "b", requirement: "provide Dillon DGMT1002 with the quote", controllability: "bidder_controls", kind: "submission" }),
];
ok("shared-miss (both lenses agree, under-typed) → no escalation (disagreement signal absent)", knifeEdgeIndices(sharedMiss, null), []);

// ── BAR→CAUTION edge: an over-typed bar (unknown status, non-curable) whose one-notch bump flips the verdict ──
const overTyped = [F({ lens: "ko", requirement: "vague restrictive spec", controllability: "bidder_cannot_move", requiredAttribute: "spec:x", curableInWindow: false })];
ok("bar→caution: over-typed non-curable bar (null profile) is knife-edge", knifeEdgeIndices(overTyped, null).length, 1);

// evidence-locked bar (proven fail, closed-world) is NOT knife-edge (not contestable)
const locked = [F({ lens: "x", requirement: "proven bar", controllability: "bidder_cannot_move", requiredAttribute: "oem:acme", curableInWindow: false })];
ok("evidence-locked proven-fail bar → NOT knife-edge", knifeEdgeIndices(locked, { satisfiedAttributes: [] }), []);

// a pure comply-to-win set → nothing decisive → 0 (no cost explosion on gate-heavy packages)
const cleanGates = [F({ lens: "a", requirement: "submit form", controllability: "bidder_controls", kind: "submission" }), F({ lens: "b", requirement: "price clins", controllability: "bidder_controls", kind: "pricing" })];
ok("gate-heavy clean set → 0 escalations (no cost explosion)", knifeEdgeIndices(cleanGates, null), []);

console.log(`knife-edge gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — both edges fire on genuine signal; clean poles + shared-miss + locked bars + gate-heavy sets do not over-escalate.");
