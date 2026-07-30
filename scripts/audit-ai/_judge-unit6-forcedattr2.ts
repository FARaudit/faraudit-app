// JUDGE probe 4b — THE clobber attack, built with NO phantom undefined keys (real-record shape).
// forced-protected member carries a REAL requiredAttribute (→ protected, → drives unverifiedGates clamp).
// Plain absorbable dups have NO requiredAttribute KEY at all. Make a plain the group `worst` so line 1943
// (requiredAttribute = worst.requiredAttribute = undefined) CLOBBERS the survivor's attribute → drops out
// of the unverifiedGates clamp → eligible flips null→true (a false clear).
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s));
let breaks = 0;
const R = (n: string, ok: boolean, d = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${n}${d ? "  — " + d : ""}`); };

// base without any requiredAttribute key
const base = (id: string, extra: Partial<TypedFinding>): TypedFinding => Object.assign(
  { id, requirement: "FAR 52.219-14 small business.", citation: "FAR 52.219-14", excerpt: "",
    kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true }, extra) as TypedFinding;

// forced-protected: eligibility_bar + REAL requiredAttribute + curable + cautionFloor, NO mmEvidenceFactor.
// It ENTERS unverifiedGates → clamp eligible=null.
const forcedProt: TypedFinding = base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true } as any);
// plain worst: bidder_controls + eligibility_bar (kind rank 3, ties protected) + curableInWindow:false (outranks
// protected's true) → worst = this plain, NO requiredAttribute key. If it wins, survivor attr = undefined.
const plainWorst = base("b", { kind: "eligibility_bar", curableInWindow: false });
// filler plain
const plain2 = base("c", { kind: "submission", curableInWindow: true });

const profiles: Array<[string, any, string | undefined]> = [
  ["null", null, undefined],
  ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }, undefined],
  ["ow-hold", { closedWorld: false, satisfiedAttributes: ["setaside:sb"] }, undefined],
];

for (const [pn, p, s] of profiles) {
  const set = [forcedProt, plainWorst, plain2];
  const before = V(set, p, s);
  const merged = applyFindingDedup(set, { enabled: true });
  const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
  const after = V(merged, p, s);
  const ok = before.verdict === after.verdict && before.eligible === after.eligible;
  R(`clobber (no phantom key) [${pn}]`, ok,
    `verdict ${before.verdict}->${after.verdict}, ELIG ${before.eligible}->${after.eligible}, rows=${merged.length}, survAttr=${surv?.requiredAttribute}, survCtrl=${surv?.controllability}, survKind=${surv?.kind}`);
}

console.log(`\n=== JUDGE-FORCEDATTR2: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
