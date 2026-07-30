// JUDGE probe 3 — cases where a REAL merge fires (survivorPatch.size>0) with disposition divergence,
// to actually exercise the worst-derivation. A merge needs ≥2 PLAIN (absorbable) members OR
// 1 protected + plain members. Absorbable = non-bar AND all keys in FD_ABSORBABLE_KEYS.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s)).verdict;
const E = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s)).eligible;
let breaks = 0;
const R = (n: string, ok: boolean, d = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${n}${d ? "  — " + d : ""}`); };
const merges = (f: TypedFinding[]) => applyFindingDedup(f, { enabled: true }).length < f.length;

const C = (e: Partial<TypedFinding>): TypedFinding => ({
  id: "x", requirement: "FAR 52.217-8 option requirement.", citation: "FAR 52.217-8", excerpt: "",
  kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true, ...e,
} as TypedFinding);

const profiles: Array<[string, any, string | undefined]> = [
  ["null", null, undefined],
  ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }, undefined],
  ["cw-empty+src", { closedWorld: true, satisfiedAttributes: [] }, "far 52.217-8 option to extend"],
];

// ---- MERGE-1: two PLAIN non-bar dups with divergent kind/controllability/severity/curableInWindow.
//      Both absorbable → mergeSet=both → survivor from worst. Must fire AND stay invariant.
{
  const a = C({ id: "a", controllability: "already_satisfied", kind: "boilerplate", severity: "P2", curableInWindow: true });
  const b = C({ id: "b", controllability: "bidder_controls", kind: "submission", severity: "P0", curableInWindow: false, cautionFloor: true });
  R("MERGE-1 fires", merges([a, b]), `rows ${applyFindingDedup([a,b],{enabled:true}).length}`);
  for (const [pn, p, s] of profiles) {
    const before = V([a, b], p, s), beforeE = E([a, b], p, s);
    const merged = applyFindingDedup([a, b], { enabled: true });
    const after = V(merged, p, s), afterE = E(merged, p, s);
    R(`MERGE-1 plain-dup divergent disposition [${pn}]`, before === after && beforeE === afterE, `${before}->${after}, elig ${beforeE}->${afterE}`);
  }
}

// ---- MERGE-2: THREE plain dups; worst must win on ctrl>kind>curable>sev independently.
{
  const a = C({ id: "a", controllability: "already_satisfied", kind: "submission", curableInWindow: true, severity: "P2" });
  const b = C({ id: "b", controllability: "bidder_controls", kind: "eligibility_bar", curableInWindow: false, severity: "P1" });
  const c = C({ id: "c", controllability: "bidder_controls", kind: "boilerplate", curableInWindow: true, severity: "P0" });
  for (const [pn, p, s] of profiles) {
    const before = V([a, b, c], p, s), beforeE = E([a, b, c], p, s);
    const merged = applyFindingDedup([a, b, c], { enabled: true });
    const after = V(merged, p, s), afterE = E(merged, p, s);
    const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
    R(`MERGE-2 three plain dups [${pn}]`, before === after && beforeE === afterE,
      `${before}->${after}, elig ${beforeE}->${afterE}, survCtrl=${surv?.controllability} survKind=${surv?.kind} survCw=${surv?.curableInWindow} survSev=${surv?.severity}`);
  }
}

// ---- MERGE-3: 1 protected (attributed, non-bar) + 2 plain dups. protectedIdx.length==1 → forced survivor,
//      absorbs the 2 plains. Markers ride from protected; DISPOSITION re-derived from worst of all 3.
{
  const prot = C({ id: "a", controllability: "already_satisfied", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true });
  const p1 = C({ id: "b", controllability: "bidder_controls", kind: "submission", curableInWindow: true });
  const p2 = C({ id: "c", controllability: "bidder_controls", kind: "submission", curableInWindow: false });
  for (const [pn, p, s] of profiles) {
    const before = V([prot, p1, p2], p, s), beforeE = E([prot, p1, p2], p, s);
    const merged = applyFindingDedup([prot, p1, p2], { enabled: true });
    const after = V(merged, p, s), afterE = E(merged, p, s);
    const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
    R(`MERGE-3 forced-protected + 2 plain [${pn}]`, before === after && beforeE === afterE,
      `${before}->${after}, elig ${beforeE}->${afterE}, survAttr=${surv?.requiredAttribute} survMm=${surv?.mmEvidenceFactor}, rows=${merged.length}`);
  }
}

// ---- MERGE-4: ≥2 protected → only plains merge among themselves; protected pass through.
{
  const protA = C({ id: "a", controllability: "bidder_controls", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true });
  const protB = C({ id: "b", controllability: "bidder_controls", requiredAttribute: "setaside:hz", curableInWindow: true, cautionFloor: true });
  // incompatible attrs → separate clusters actually. Use compatible: protB no attr but nmrGuard (protected).
  const protB2 = C({ id: "b", controllability: "bidder_controls", nmrGuard: true, curableInWindow: true } as any);
  const pl1 = C({ id: "c", controllability: "bidder_controls", curableInWindow: true });
  const pl2 = C({ id: "d", controllability: "bidder_controls", curableInWindow: true });
  for (const [pn, p, s] of profiles) {
    const set = [protA, protB2, pl1, pl2];
    const before = V(set, p, s), beforeE = E(set, p, s);
    const merged = applyFindingDedup(set, { enabled: true });
    const after = V(merged, p, s), afterE = E(merged, p, s);
    R(`MERGE-4 two-protected + two-plain [${pn}]`, before === after && beforeE === afterE, `${before}->${after}, rows=${merged.length}`);
  }
}

console.log(`\n=== JUDGE-REALMERGE: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
