// JUDGE 2 (independent) — attack the NEW requiredAttribute-present tiebreak in the `worst` sort (L1919).
// Every scenario asserts BOTH verdict and eligible are INVARIANT (full set vs deduped set), and probes whether
// the tiebreak can OVER-state (harden a pole the full set didn't reach) or UNDER-state (drop a clamp / attr).
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s));
let breaks = 0;
const R = (n: string, ok: boolean, d = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${n}${d ? "  — " + d : ""}`); };

// Base finding WITHOUT any requiredAttribute key present (real-record shape: absent, not undefined-valued).
const base = (id: string, extra: Partial<TypedFinding>): TypedFinding => Object.assign(
  { id, requirement: "FAR 52.219-14 small business.", citation: "FAR 52.219-14", excerpt: "",
    kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true }, extra) as TypedFinding;

const ALL_PROFILES: Array<[string, any, string | undefined]> = [
  ["null", null, undefined],
  ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }, undefined],
  ["ow-hold", { closedWorld: false, satisfiedAttributes: ["setaside:sb"] }, undefined],
  ["cw-empty+src", { closedWorld: true, satisfiedAttributes: [] }, "far 52.219-14 small business setaside:sb"],
  ["cw-hold+src", { closedWorld: true, satisfiedAttributes: ["setaside:sb"] }, "far 52.219-14 small business setaside:sb"],
];

function assertInvariant(label: string, set: TypedFinding[], expectMerge: boolean) {
  for (const [pn, p, s] of ALL_PROFILES) {
    const before = V(set, p, s);
    const merged = applyFindingDedup(set, { enabled: true });
    const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
    const after = V(merged, p, s);
    const ok = before.verdict === after.verdict && before.eligible === after.eligible;
    R(`${label} [${pn}]`, ok,
      `V ${before.verdict}->${after.verdict} | ELIG ${before.eligible}->${after.eligible} | rows ${set.length}->${merged.length} | survAttr=${surv?.requiredAttribute} survCtrl=${surv?.controllability} survKind=${surv?.kind} survCur=${surv?.curableInWindow}`);
    if (expectMerge && !surv) R(`${label} [${pn}] EXPECTED-MERGE`, false, "no survivor produced");
  }
}

// ── ATTACK 1: the prior P0, independently re-derived. forced-protected attributed gate + attr-less plain worst.
//    Tiebreak must pick the attributed as worst so survivor keeps setaside:sb → clamp holds → eligible invariant.
console.log("\n-- ATTACK 1: forced-protected attr vs attr-less plain worst (curableInWindow:false plain) --");
assertInvariant("A1 forced-attr vs plain-nonCurable-worst", [
  base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true }),
  base("b", { kind: "eligibility_bar", curableInWindow: false }),          // would-be worst on curable tiebreak (pre-fix)
  base("c", { kind: "submission", curableInWindow: true }),
], true);

// ── ATTACK 2a: attributed member LESS conservative on curableInWindow than an attr-less plain.
//    Attributed gate curable:false-absent (curable true), plain worst curable:false. Does picking attributed as
//    worst (higher tiebreak) LOSE the plain's curableInWindow:false? Only matters if survivor becomes a bar (isBar).
//    Both are non-bar here → curableInWindow only spread when isBar → clamp still fires on attr. Must stay invariant.
console.log("\n-- ATTACK 2a: attributed(curable) vs attr-less(nonCurable) — does worst-selection over-soften curable? --");
assertInvariant("A2a attr-curable vs plain-nonCurable", [
  base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true }),
  base("b", { kind: "eligibility_bar", curableInWindow: false, cautionFloor: true }),
], true);

// ── ATTACK 2b: attributed member with LOWER severity than an attr-less plain.  Tiebreak (attr) runs BEFORE severity,
//    so the attributed P2 could be picked worst over an attr-less P0. Survivor severity is the GROUP MAX (separate
//    reduce), so severity can't be under-stated. Verify eligible + verdict + severity=P0 all hold.
console.log("\n-- ATTACK 2b: attributed P2 vs attr-less P0 — tiebreak precedes severity, does survivor lose P0? --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", severity: "P2", curableInWindow: true, cautionFloor: true }),
    base("b", { kind: "eligibility_bar", severity: "P0", curableInWindow: false }),
  ];
  for (const [pn, p, s] of ALL_PROFILES) {
    const before = V(set, p, s);
    const merged = applyFindingDedup(set, { enabled: true });
    const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
    const after = V(merged, p, s);
    const ok = before.verdict === after.verdict && before.eligible === after.eligible && surv?.severity === "P0";
    R(`A2b attrP2 vs plainP0 [${pn}]`, ok, `V ${before.verdict}->${after.verdict} ELIG ${before.eligible}->${after.eligible} sev=${surv?.severity} survAttr=${surv?.requiredAttribute}`);
  }
}

// ── ATTACK 3: attributed member with kind != eligibility_bar (kind rank lower). fdKindRank runs BEFORE the attr
//    tiebreak, so an eligibility_bar (rank 3) beats a `submission`-attributed (rank 2) on kind → the ATTRIBUTED
//    submission is NOT selected worst; kind bundle from the eligibility_bar. Does the survivor then MISS the
//    submission's attribute? unverifiedGates requires kind===eligibility_bar; a submission attr never fires the
//    clamp, so dropping it is correct. Verify no false null and no false true.
console.log("\n-- ATTACK 3: attributed-submission vs attr-less eligibility_bar — tiebreak must NOT pull wrong kind --");
assertInvariant("A3 attr-submission vs plain-eligbar", [
  base("a", { kind: "submission", requiredAttribute: "setaside:sb", curableInWindow: true }),   // attributed but kind=submission
  base("b", { kind: "eligibility_bar", curableInWindow: false }),                                // attr-less, higher kind rank
], true);
// NOTE: member a carries requiredAttribute → it is PROTECTED (attr ∉ FD_ABSORBABLE_KEYS). So this is a 1-protected
// forced merge; primary=a (its markers ride), worst re-derived. Kind rank: b(eligibility_bar=3) > a(submission=2)
// → worst=b (attr-less) → survivor.requiredAttribute from b = undefined, kind=eligibility_bar. The forced primary's
// setaside:sb is CLOBBERED. But kind becomes eligibility_bar → clamp filter checks !!requiredAttribute=false → no
// clamp. Is that a false-clear? Only if the FULL set clamped. In the full set, member a is kind=submission → NOT in
// unverifiedGates; member b is eligibility_bar but attr-less → NOT in unverifiedGates. So full set does NOT clamp.
// Deduped set also does not clamp. INVARIANT holds (both true). This is the mirror of the P0 but SAFE because the
// forced member's attr was on a non-eligibility_bar kind that never drove the clamp. Assertion above catches any flip.

// ── ATTACK 4: two members with DIFFERENT non-empty attributes — must be BLOCKED from clustering (fdMergeCompatible).
console.log("\n-- ATTACK 4: two distinct attributes same clause — must NOT merge (fdMergeCompatible blocks) --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true }),
    base("b", { kind: "eligibility_bar", requiredAttribute: "setaside:wosb", curableInWindow: false }),
  ];
  const merged = applyFindingDedup(set, { enabled: true });
  const anyMerged = merged.some((f) => (f as any).findingDedupMerged);
  R("A4 distinct-attr NOT merged", !anyMerged && merged.length === 2, `rows=${merged.length} merged=${anyMerged}`);
  for (const [pn, p, s] of ALL_PROFILES) {
    const before = V(set, p, s), after = V(merged, p, s);
    R(`A4 distinct-attr invariant [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible,
      `V ${before.verdict}->${after.verdict} ELIG ${before.eligible}->${after.eligible}`);
  }
}

// ── ATTACK 5: three attributed-eligibility-bar gates SAME attribute + two attr-less plains. 1-protected? No — all
//    three attr-bearers are protected (≥2 protected → only plains merge). Verify plains merge, attr gates pass through
//    UNTOUCHED (each keeps setaside:sb), clamp fires exactly as full set.
console.log("\n-- ATTACK 5: >=2 protected attributed gates + plains — attr gates pass through untouched --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true }),
    base("b", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true }),
    base("c", { kind: "submission", curableInWindow: true }),
    base("d", { kind: "submission", curableInWindow: true }),
  ];
  const merged = applyFindingDedup(set, { enabled: true });
  const attrsKept = merged.filter((f) => f.requiredAttribute === "setaside:sb").length;
  R("A5 both attr gates survive w/ attr", attrsKept === 2, `attrCount=${attrsKept} rows=${merged.length}`);
  for (const [pn, p, s] of ALL_PROFILES) {
    const before = V(set, p, s), after = V(merged, p, s);
    R(`A5 invariant [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible,
      `V ${before.verdict}->${after.verdict} ELIG ${before.eligible}->${after.eligible}`);
  }
}

// ── ATTACK 6: attributed member is a genuine BAR (bidder_cannot_move) vs attr-less bar same clause. Bars never
//    absorb (both protected via isBarClass) → ≥2 protected → no merge, pass through. Verify.
console.log("\n-- ATTACK 6: attributed bar vs attr-less bar — bars never absorbed --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", controllability: "bidder_cannot_move", curableInWindow: false }),
    base("b", { kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false }),
  ];
  const merged = applyFindingDedup(set, { enabled: true });
  const anyMerged = merged.some((f) => (f as any).findingDedupMerged);
  R("A6 two bars NOT merged", !anyMerged && merged.length === 2, `rows=${merged.length}`);
  for (const [pn, p, s] of ALL_PROFILES) {
    const before = V(set, p, s), after = V(merged, p, s);
    R(`A6 bar invariant [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible,
      `V ${before.verdict}->${after.verdict} ELIG ${before.eligible}->${after.eligible}`);
  }
}

console.log(`\n=== JUDGE2-TIEBREAK: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
