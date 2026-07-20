/* RED-TEAM R2 attack 1 — VALUE-DOMAIN HOLE in fdBaseAbsorbable: an OFF-ENUM / missing `controllability`.
 * disposeFinding maps ANYTHING outside {already_satisfied,bidder_controls,boilerplate-kind} → "disqualifying"
 * (fail-closed 5a untyped-bar NHR), but isBarClass only recognizes the two bar strings → an off-enum-ctrl
 * finding is fdBaseAbsorbable=TRUE, and fdCtrlRank ranks it 0 (LEAST conservative) → it LOSES the ctrl sort
 * and its disqualifying disposition VANISHES into a bidder_controls survivor. NHR → BID flip probe.
 * Constructibility: audit-expert.ts:285 `f as RawFinding[]` blind cast + :116 verbatim copy — no runtime
 * enum enforcement; tool input_schema is model-advisory. */
import { applyCrossFleetDedup, applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let breaks = 0; let holds = 0;
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const triple = (d: ReturnType<typeof deriveVerdict>) => `${d.verdict}/${d.eligible}/${d.showStoppers.length}`;
const probe = (label: string, set: TypedFinding[], gate: (fs: TypedFinding[]) => TypedFinding[]) => {
  const off = deriveVerdict(vi(set));
  const on = deriveVerdict(vi(gate(set)));
  const same = off.verdict === on.verdict && off.eligible === on.eligible && off.showStoppers.length === on.showStoppers.length;
  console.log(`${same ? "✅ holds" : "🔥 BREAK"} ${label}: OFF=${triple(off)}  ON=${triple(on)}`);
  same ? holds++ : breaks++;
};
const cf = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });
const cl = (fs: TypedFinding[]) => applyFindingDedup(fs, { enabled: true });

// 1a. CROSS-FLEET gate — off-enum ctrl string (model deviation, e.g. "cannot_determine").
probe("1a cross-fleet: off-enum ctrl 'cannot_determine' + bidder_controls partner (same date)", [
  F({ requirement: "Submit signed OCI mitigation plan by July 22, 2026", kind: "submission", controllability: "cannot_determine" as never }),
  F({ requirement: "Offer due July 22, 2026 to the Contracting Officer", kind: "submission", controllability: "bidder_controls" }),
], cf);

// 1b. CROSS-FLEET gate — controllability key present but undefined (clipped/partial tool JSON).
probe("1b cross-fleet: undefined ctrl + bidder_controls partner (same date)", [
  F({ requirement: "Provide facility access roster by July 22, 2026", kind: "submission", controllability: undefined as never }),
  F({ requirement: "Offer due July 22, 2026 to the Contracting Officer", kind: "submission", controllability: "bidder_controls" }),
], cf);

// 1c. CLAUSE gate (ratified sibling) — same hole via a shared single clause key.
probe("1c clause gate: off-enum ctrl + bidder_controls partner (both cite 52.212-1)", [
  F({ requirement: "Comply with instructions to offerors", citation: "52.212-1", kind: "submission", controllability: "must_verify" as never }),
  F({ requirement: "Follow FAR 52.212-1 submission instructions", citation: "52.212-1", kind: "submission", controllability: "bidder_controls" }),
], cl);

// 1d. already_satisfied partner (ctrl rank 1 still out-ranks 0) — disqualifying vanishes into a "met" survivor.
probe("1d cross-fleet: off-enum ctrl + already_satisfied partner (same date)", [
  F({ requirement: "Hold state license through July 22, 2026", kind: "other", controllability: "not_applicable" as never }),
  F({ requirement: "Registration current as of July 22, 2026", kind: "other", controllability: "already_satisfied" }),
], cf);

// 1e. CONTROL — off-enum ctrl standing ALONE (no same-date partner): gate must not touch it (no group of 2 plains).
probe("1e control: off-enum ctrl alone (no partner) — gate is a no-op", [
  F({ requirement: "Submit signed OCI mitigation plan by July 22, 2026", kind: "submission", controllability: "cannot_determine" as never }),
  F({ requirement: "Unrelated undated obligation", kind: "other", controllability: "bidder_controls" }),
], cf);

// 1f. CONTROL — enum-valid set (bidder_controls + already_satisfied): must hold.
probe("1f control: enum-valid plains only (same date)", [
  F({ requirement: "Offer due July 22, 2026 A", kind: "submission", controllability: "bidder_controls" }),
  F({ requirement: "Offer due July 22, 2026 B", kind: "other", controllability: "already_satisfied" }),
], cf);

console.log(`\nR2-1: ${breaks} BREAK(s), ${holds} hold(s)`);
process.exit(0);
