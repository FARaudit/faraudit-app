// JUDGE probe 2 — disposition-bundle coherence (re-attack R2/R3/R4 P0s + new angles).
// The claim: survivor's {controllability, kind, curableInWindow, requiredAttribute} ALL come from
// ONE real member (worst) → deriveVerdict reproduces exactly the group-worst it already saw.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s)).verdict;
const E = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s)).eligible;

let breaks = 0;
const R = (name: string, ok: boolean, detail = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${name}${detail ? "  — " + detail : ""}`); };

const C = (extra: Partial<TypedFinding>): TypedFinding => ({
  id: "x", requirement: "FAR 52.219-14 requirement.", citation: "FAR 52.219-14", excerpt: "",
  kind: "eligibility_bar", controllability: "bidder_controls", severity: "P2", grounded: true, ...extra,
} as TypedFinding);

// Profiles that exercise every firmStatus branch.
const nullP = null;
const owHold = { closedWorld: false, satisfiedAttributes: ["setaside:sb"] } as any;  // open-world holds attr
const owEmpty = { closedWorld: false, satisfiedAttributes: [] } as any;
const cwHold = { closedWorld: true, satisfiedAttributes: ["setaside:sb"] } as any;
const cwEmpty = { closedWorld: true, satisfiedAttributes: [] } as any;
const profiles: Array<[string, any, string | undefined]> = [
  ["null", nullP, undefined],
  ["ow-hold", owHold, undefined],
  ["ow-empty", owEmpty, undefined],
  ["cw-hold+src", cwHold, "the offeror shall be a small business concern setaside:sb"],
  ["cw-empty+src", cwEmpty, "the offeror shall be a small business concern setaside:sb"],
];

// ---- R3 re-attack: ATTRIBUTED non-worst member + UNTYPED bar as worst.
// The prior P0: survivor paired worst.ctrl(bidder_cannot_move) + primary.requiredAttribute(setaside:sb)
// = a fabricated TYPED bar from an UNTYPED one. Fix: requiredAttribute now from `worst` (undefined→untyped).
{
  // member with attribute but NON-bar disposition (already_satisfied): this is the "primary" attribute donor.
  const attrMet = C({ id: "a", controllability: "already_satisfied", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true });
  // the WORST: a plain bar, NO requiredAttribute → the group's most-disqualifying controllability, untyped.
  const bareBar = C({ id: "b", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: undefined, curableInWindow: false });
  for (const [pn, p, s] of profiles) {
    const before = V([attrMet, bareBar], p, s);
    const beforeE = E([attrMet, bareBar], p, s);
    const merged = applyFindingDedup([attrMet, bareBar], { enabled: true });
    const after = V(merged, p, s);
    const afterE = E(merged, p, s);
    R(`R3 attr-donor + untyped-bar-worst [${pn}]`, before === after && beforeE === afterE,
      `verdict ${before}->${after}, elig ${beforeE}->${afterE}, rows=${merged.length}, survAttr=${(merged.find((f)=>(f as any).findingDedupMerged) as any)?.requiredAttribute}`);
  }
}

// ---- R3 REVERSED roles (my noted "break shape"): worst is the ATTRIBUTED bar, non-worst is the plain bar.
// Here attr+disposition coincide on worst → should be safe. Confirm.
{
  const attrBar = C({ id: "a", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: false });
  const plainMet = C({ id: "b", controllability: "already_satisfied", kind: "eligibility_bar", requiredAttribute: undefined, curableInWindow: true });
  for (const [pn, p, s] of profiles) {
    const before = V([attrBar, plainMet], p, s), beforeE = E([attrBar, plainMet], p, s);
    // attrBar is a BAR → protected (never absorbed). Should pass through untouched → invariant.
    const merged = applyFindingDedup([attrBar, plainMet], { enabled: true });
    const after = V(merged, p, s), afterE = E(merged, p, s);
    R(`R3 attributed-bar-worst [${pn}]`, before === after && beforeE === afterE, `${before}->${after}, elig ${beforeE}->${afterE}`);
  }
}

// ---- R2 re-attack: forced-survivor demotion softening a bar. A protected demoted member (structuralWhitelistGuard,
// bidder_controls) forced as survivor absorbing a raw bar sibling. Fix: worst re-derives ctrl → bar preserved.
{
  const demotedProtected = C({ id: "a", controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, structuralWhitelistGuard: true } as any);
  const rawBar = C({ id: "b", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: undefined, curableInWindow: false });
  for (const [pn, p, s] of profiles) {
    const before = V([demotedProtected, rawBar], p, s);
    const merged = applyFindingDedup([demotedProtected, rawBar], { enabled: true });
    const after = V(merged, p, s);
    R(`R2 forced-demoted-survivor + raw bar [${pn}]`, before === after, `${before}->${after}, rows=${merged.length}`);
  }
}

// ---- R2 boilerplate primary dropping a cluster.
{
  const boiler = C({ id: "a", kind: "boilerplate", controllability: "bidder_controls", requirement: "FAR 52.219-14 boilerplate." });
  const real = C({ id: "b", kind: "submission", controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, requirement: "FAR 52.219-14 real caution." });
  const before = V([boiler, real], nullP);
  const merged = applyFindingDedup([boiler, real], { enabled: true });
  const after = V(merged, nullP);
  const survKind = (merged.find((f)=>(f as any).findingDedupMerged) as any)?.kind;
  R("R2 boilerplate + real: cluster not dropped", before === after && survKind !== "boilerplate", `${before}->${after}, survKind=${survKind}`);
}

console.log(`\n=== JUDGE-DISPOSITION: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
