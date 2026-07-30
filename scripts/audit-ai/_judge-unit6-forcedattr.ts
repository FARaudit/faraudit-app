// JUDGE probe 4 — THE NEW ATTACK: forced-protected survivor's OWN requiredAttribute is CLOBBERED
// to worst.requiredAttribute (line 1943). If the forced protected member carries an eligibility
// requiredAttribute that DRIVES the unverifiedGates clamp, and worst (a plain absorbable dup) has
// NO attribute, the survivor loses the attribute → drops out of unverifiedGates → eligible clamp lost.
// Requires AUDIT_ELIGIBLE_TRISTATE=true (the clamp only bites under tristate).
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s));
let breaks = 0;
const R = (n: string, ok: boolean, d = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${n}${d ? "  — " + d : ""}`); };

const C = (e: Partial<TypedFinding>): TypedFinding => ({
  id: "x", requirement: "FAR 52.219-14 LOSA compliance.", citation: "FAR 52.219-14", excerpt: "",
  kind: "eligibility_bar", controllability: "bidder_controls", severity: "P2", grounded: true, ...e,
} as TypedFinding);

// FORCED-PROTECTED member: eligibility_bar + requiredAttribute + bidder_controls, NO mmEvidenceFactor.
// It is PROTECTED because requiredAttribute ∉ FD_ABSORBABLE_KEYS.
// It ENTERS unverifiedGates (kind=eligibility_bar, has requiredAttribute, !mmEvidenceFactor, firmStatus!=satisfies)
//   → committalEligible()=null → the "ELIGIBILITY NOT VERIFIED" clamp.
const forcedProt = C({ id: "a", controllability: "bidder_controls", kind: "eligibility_bar",
  requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true });

// TWO plain absorbable dups, NO requiredAttribute. One must be the group WORST for its ctrl/kind ordering.
// worst is derived by ctrl>kind>curable>sev. All bidder_controls; kind: give a plain a HIGHER kind rank?
// eligibility_bar=3 > submission=2. To make a PLAIN the worst we'd need it to outrank the protected —
// but the protected is bidder_controls+eligibility_bar too. Tie on ctrl+kind. curable: protected curable=true.
// Give a plain curable=false → plain worst? No: worst sorts curable false ABOVE — plain(cw=false) outranks
// protected(cw=true) → worst = plain (no attr) → survivor.requiredAttribute = undefined. CLAMP LOST?
const plainNoAttrBar = C({ id: "b", controllability: "bidder_controls", kind: "eligibility_bar",
  requiredAttribute: undefined, curableInWindow: false });
const plain2 = C({ id: "c", controllability: "bidder_controls", kind: "submission", curableInWindow: true });

const profiles: Array<[string, any, string | undefined]> = [
  ["null", null, undefined],
  ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }, undefined],
  ["ow-hold", { closedWorld: false, satisfiedAttributes: ["setaside:sb"] }, undefined],
];

for (const [pn, p, s] of profiles) {
  const set = [forcedProt, plainNoAttrBar, plain2];
  const before = V(set, p, s);
  const merged = applyFindingDedup(set, { enabled: true });
  const after = V(merged, p, s);
  const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
  const ok = before.verdict === after.verdict && before.eligible === after.eligible;
  R(`forced-protected attr clobbered by worst [${pn}]`, ok,
    `verdict ${before.verdict}->${after.verdict}, ELIG ${before.eligible}->${after.eligible}, survAttr=${surv?.requiredAttribute}, survCtrl=${surv?.controllability}, survKind=${surv?.kind}, rows=${merged.length}`);
}

// VARIANT: forced protected is the ONLY protected; the plain worst is bidder_controls+submission (kind lower).
// Then worst=protected itself? protected ctrl=bidder_controls, kind=eligibility_bar(3). plains: submission(2).
// worst ranks protected FIRST (kind 3>2) → survivor=protected disposition, attr from protected → NO loss.
{
  const p1 = C({ id: "b", controllability: "bidder_controls", kind: "submission", curableInWindow: true });
  const p2 = C({ id: "c", controllability: "bidder_controls", kind: "submission", curableInWindow: true });
  for (const [pn, p, s] of profiles) {
    const set = [forcedProt, p1, p2];
    const before = V(set, p, s), merged = applyFindingDedup(set, { enabled: true }), after = V(merged, p, s);
    const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
    R(`forced-protected worst=self (attr kept) [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible,
      `${before.verdict}->${after.verdict}, ELIG ${before.eligible}->${after.eligible}, survAttr=${surv?.requiredAttribute}`);
  }
}

console.log(`\n=== JUDGE-FORCEDATTR: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
