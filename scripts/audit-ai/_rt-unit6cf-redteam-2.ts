/* RED-TEAM unit6cf #2 — (a) does the P0 verdict-flip root (ctrl-first worst-sort takes a boilerplate kind)
 * also live in the RATIFIED sibling applyFindingDedup? (b) minimal 2-finding reproduction detail dump. */
import { applyFindingDedup, applyCrossFleetDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const vt = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };

// (a) SIBLING applyFindingDedup — same-clause pair, boilerplate/bidder_controls vs submission/already_satisfied.
{
  const a = F({ kind: "boilerplate", controllability: "bidder_controls", requirement: "Standard 52.212-1 instruction recital", citation: "FAR 52.212-1" });
  const b = F({ kind: "submission", controllability: "already_satisfied", requirement: "52.212-1 portal submission requirement is met", citation: "FAR 52.212-1" });
  const out = applyFindingDedup([a, b], { enabled: true });
  console.log(`[sibling] rows=${out.length} survivorKind=${out[0]?.kind} ctrl=${out[0]?.controllability}`);
  console.log(`[sibling] OFF=${vt([a, b])}  ON=${vt(out)}  ${vt([a, b]) === vt(out) ? "invariant holds" : "SAME P0 ROOT IN RATIFIED SIBLING"}`);
}

// (b) minimal cross-fleet repro, full survivor dump.
{
  const a = F({ kind: "boilerplate", controllability: "bidder_controls", requirement: "Standard notice: offers due July 22, 2026 per instructions" });
  const b = F({ kind: "submission", controllability: "already_satisfied", requirement: "Electronic submission portal registration for the July 22, 2026 deadline is complete" });
  const out = applyCrossFleetDedup([a, b], { enabled: true });
  console.log(`[cf-min] survivor=${JSON.stringify(out[0], null, 0)}`);
  console.log(`[cf-min] OFF=${vt([a, b])}  ON=${vt(out)}`);
}
