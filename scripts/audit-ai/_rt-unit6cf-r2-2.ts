/* RED-TEAM R2 attack 2 — EXHAUSTIVE enum-valid verdict-invariance sweep over the R1 kindMax fix.
 * Every pair of plain members over ctrl{bidder_controls,already_satisfied} × kind(all 8, incl.
 * eligibility_bar-on-a-nonbar + boilerplate) × sev{undef,P0,P2} × cautionFloor{undef,true}, in three
 * contexts (alone / + protected non-curable bar / + undated plain), BOTH gates, tristate OFF and ON.
 * Asserts deriveVerdict {verdict,eligible,showStoppers.length} identical flag-ON vs flag-OFF.
 * Also: exact R1-P0 repro (boilerplate ride-along) + a mixed triple + idempotence/determinism. */
import { applyCrossFleetDedup, applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0; let cases = 0;
const mk = (o: Partial<TypedFinding>, i: number): TypedFinding => ({ id: `f${i}`, requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const triple = (d: ReturnType<typeof deriveVerdict>) => `${d.verdict}/${d.eligible}/${d.showStoppers.length}`;

const ctrls = ["bidder_controls", "already_satisfied"] as const;
const kinds = ["eligibility_bar", "technical_spec", "pricing", "submission", "past_performance", "clause_flowdown", "boilerplate", "other"] as const;
const sevs = [undefined, "P0", "P2"] as const;
const cfls = [undefined, true] as const;

type Variant = { ctrl: string; kind: string; sev?: string; cfl?: boolean };
const variants: Variant[] = [];
for (const ctrl of ctrls) for (const kind of kinds) for (const sev of sevs) for (const cfl of cfls) variants.push({ ctrl, kind, sev, cfl });

const protectedBar = (i: number) => mk({ requirement: "Offeror must hold a TS facility clearance", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "clearance:ts-facility", kind: "eligibility_bar", severity: "P0" } as Partial<TypedFinding>, i);
const undatedPlain = (i: number) => mk({ requirement: "Provide standard commercial warranty terms", kind: "other", controllability: "bidder_controls" }, i);

const member = (v: Variant, req: string, cite: string, i: number): TypedFinding => mk({
  requirement: req, citation: cite, kind: v.kind as TypedFinding["kind"], controllability: v.ctrl as TypedFinding["controllability"],
  ...(v.sev ? { severity: v.sev as TypedFinding["severity"] } : {}), ...(v.cfl ? { cautionFloor: true } : {}),
}, i);

function sweep(gateName: string, gate: (fs: TypedFinding[]) => TypedFinding[], reqA: string, reqB: string, cite: string) {
  let worst: string | null = null;
  for (const a of variants) for (const b of variants) {
    const pair = [member(a, reqA, cite, 1), member(b, reqB, cite, 2)];
    for (const ctxName of ["alone", "with-bar", "with-undated"]) {
      const set = ctxName === "with-bar" ? [protectedBar(0), ...pair] : ctxName === "with-undated" ? [...pair, undatedPlain(3)] : pair;
      cases++;
      const off = deriveVerdict(vi(set));
      const on = deriveVerdict(vi(gate(set)));
      if (off.verdict !== on.verdict || off.eligible !== on.eligible || off.showStoppers.length !== on.showStoppers.length) {
        fails++;
        if (!worst) worst = `${gateName}[${ctxName}] a=${JSON.stringify(a)} b=${JSON.stringify(b)} OFF=${triple(off)} ON=${triple(on)}`;
      }
    }
  }
  console.log(worst ? `🔥 BREAK ${worst}` : `✅ ${gateName}: all pair×context combos verdict-invariant`);
}

for (const tristate of ["false", "true"]) {
  process.env.AUDIT_ELIGIBLE_TRISTATE = tristate;
  console.log(`— tristate=${tristate} —`);
  sweep("cross-fleet", (fs) => applyCrossFleetDedup(fs, { enabled: true }), "Deliver report by July 22, 2026 alpha", "Deliver report by July 22, 2026 bravo", "");
  sweep("clause", (fs) => applyFindingDedup(fs, { enabled: true }), "Comply with option evaluation alpha", "Comply with option evaluation bravo", "52.217-8");
}
delete process.env.AUDIT_ELIGIBLE_TRISTATE;

// Exact R1-P0 repro — boilerplate/bidder_controls + submission/already_satisfied must stay BID (not flip to NHR).
{
  const set = [
    mk({ requirement: "Standard EEO boilerplate applies through July 22, 2026", kind: "boilerplate", controllability: "bidder_controls" }, 1),
    mk({ requirement: "Registration confirmed as of July 22, 2026", kind: "submission", controllability: "already_satisfied" }, 2),
  ];
  const off = deriveVerdict(vi(set));
  const on = deriveVerdict(vi(applyCrossFleetDedup(set, { enabled: true })));
  const same = off.verdict === on.verdict && off.eligible === on.eligible && off.showStoppers.length === on.showStoppers.length;
  console.log(`${same ? "✅" : "🔥 BREAK"} R1-P0 repro (boilerplate ride-along): OFF=${triple(off)} ON=${triple(on)}`);
  if (!same) fails++;
}
// Mixed TRIPLE — three plains, kinds {boilerplate, submission, other}, ctrls {bidder_controls, already_satisfied, bidder_controls}.
{
  const set = [
    mk({ requirement: "Boilerplate notice July 22, 2026", kind: "boilerplate", controllability: "bidder_controls" }, 1),
    mk({ requirement: "Submission due July 22, 2026", kind: "submission", controllability: "already_satisfied" }, 2),
    mk({ requirement: "Other obligation July 22, 2026", kind: "other", controllability: "bidder_controls" }, 3),
  ];
  const off = deriveVerdict(vi(set));
  const on = deriveVerdict(vi(applyCrossFleetDedup(set, { enabled: true })));
  const same = off.verdict === on.verdict && off.eligible === on.eligible && off.showStoppers.length === on.showStoppers.length;
  console.log(`${same ? "✅" : "🔥 BREAK"} mixed triple: OFF=${triple(off)} ON=${triple(on)}`);
  if (!same) fails++;
}
// All-boilerplate pair — material-emptiness branch must be reached identically (NHR both ways).
{
  const set = [
    mk({ requirement: "Boilerplate A July 22, 2026", kind: "boilerplate", controllability: "bidder_controls" }, 1),
    mk({ requirement: "Boilerplate B July 22, 2026", kind: "boilerplate", controllability: "already_satisfied" }, 2),
  ];
  const off = deriveVerdict(vi(set));
  const on = deriveVerdict(vi(applyCrossFleetDedup(set, { enabled: true })));
  const same = off.verdict === on.verdict && off.eligible === on.eligible && off.showStoppers.length === on.showStoppers.length;
  console.log(`${same ? "✅" : "🔥 BREAK"} all-boilerplate emptiness: OFF=${triple(off)} ON=${triple(on)}`);
  if (!same) fails++;
}
// Idempotence + determinism with the new kindMax survivor.
{
  const set = [
    mk({ requirement: "Boilerplate notice July 22, 2026", kind: "boilerplate", controllability: "bidder_controls" }, 1),
    mk({ requirement: "Submission due July 22, 2026", kind: "submission", controllability: "already_satisfied" }, 2),
  ];
  const once = applyCrossFleetDedup(set, { enabled: true });
  const twice = applyCrossFleetDedup(once, { enabled: true });
  const idem = JSON.stringify(once) === JSON.stringify(twice);
  const again = applyCrossFleetDedup(set, { enabled: true });
  const det = JSON.stringify(once) === JSON.stringify(again);
  console.log(`${idem ? "✅" : "🔥 BREAK"} idempotent; ${det ? "✅" : "🔥 BREAK"} deterministic`);
  if (!idem) fails++; if (!det) fails++;
}

console.log(`\nR2-2: ${fails} FAIL over ${cases} sweep cases`);
process.exit(0);
