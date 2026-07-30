// JUDGE 2 (independent) — final tiebreak safety: (a) tiebreak can NEVER override a more-conservative ctrl/kind
// (it runs AFTER them), (b) order-stability of the tiebreak when two members tie on ctrl+kind+attr, (c) flag-OFF
// byte-identity, (d) idempotency, (e) ReDoS, (f) real-record show-stopper count invariant.
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
import { applyFindingDedup, deriveVerdict, logicalShowStopperCount, disposeFinding } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";
import * as fs from "fs";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s));
let breaks = 0;
const R = (n: string, ok: boolean, d = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${n}${d ? "  — " + d : ""}`); };
const base = (id: string, extra: Partial<TypedFinding>): TypedFinding => Object.assign(
  { id, requirement: "FAR 52.219-14 small business.", citation: "FAR 52.219-14", excerpt: "",
    kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true }, extra) as TypedFinding;

// ── (a) TIEBREAK CANNOT override ctrl: an already_satisfied member WITH attribute vs a bidder_controls plain.
//    ctrl rank (bidder_controls=2 > already_satisfied=1) runs BEFORE the attr tiebreak → worst = the bidder_controls
//    plain, NOT the attributed already_satisfied. The survivor stays bidder_controls (never softened to 'met').
console.log("-- (a) tiebreak cannot override more-conservative ctrl --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", controllability: "already_satisfied", curableInWindow: true }),  // attributed but LESS conservative ctrl
    base("b", { kind: "eligibility_bar", controllability: "bidder_controls", curableInWindow: false }),                                      // attr-less, MORE conservative ctrl
  ];
  const merged = applyFindingDedup(set, { enabled: true });
  const surv = merged.find((f) => (f as any).findingDedupMerged) as any;
  // NB: member a carries attr → protected → forced primary. worst re-derived: ctrl b(bidder_controls) > a(already_satisfied)
  // → worst=b (attr-less). survivor ctrl=bidder_controls (NOT softened to met). attr clobbered to b's undefined.
  R("(a) survivor ctrl NOT softened to met", surv?.controllability === "bidder_controls", `ctrl=${surv?.controllability} attr=${surv?.requiredAttribute}`);
  for (const [pn, p, s] of [["null", null, undefined], ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }, undefined], ["cw-empty+src", { closedWorld: true, satisfiedAttributes: [] }, "far 52.219-14 small business setaside:sb"]] as any) {
    const before = V(set, p, s), after = V(merged, p, s);
    R(`(a) invariant [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible, `V ${before.verdict}->${after.verdict} ELIG ${before.eligible}->${after.eligible}`);
  }
}

// ── (b) order-stability: two members tie on ctrl+kind+attr-presence. Reverse input → identical survivor + verdict.
console.log("\n-- (b) tiebreak order-stability (ties on ctrl+kind+attr) --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true, requirement: "FAR 52.219-14 sb attr one." }),
    base("b", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: false, cautionFloor: true, requirement: "FAR 52.219-14 sb attr two." }),
  ];
  // both attributed + same attr → compatible → cluster; both protected (attr) → ≥2 protected → NO merge (plains only).
  const mf = applyFindingDedup(set, { enabled: true });
  const mr = applyFindingDedup([...set].reverse(), { enabled: true });
  R("(b) same-attr both-protected → no merge", !mf.some((f) => (f as any).findingDedupMerged) && mf.length === 2, `rows=${mf.length}`);
  R("(b) order-stable verdict", V(mf, null).verdict === V(mr, null).verdict && V(mf, null).eligible === V(mr, null).eligible);
}

// ── (c) flag-OFF byte-identity (same reference)
console.log("\n-- (c) flag-OFF byte-identity --");
{
  const set = [base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb" }), base("b", { kind: "eligibility_bar", curableInWindow: false })];
  R("(c) flag-OFF same reference", applyFindingDedup(set, { enabled: false }) === set);
}

// ── (d) idempotency on the forced-attr merge
console.log("\n-- (d) idempotency --");
{
  const set = [
    base("a", { kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true }),
    base("b", { kind: "eligibility_bar", curableInWindow: false }),
    base("c", { kind: "submission" }),
  ];
  const once = applyFindingDedup(set, { enabled: true });
  const twice = applyFindingDedup(once, { enabled: true });
  R("(d) idempotent (rows+JSON)", once.length === twice.length && JSON.stringify(once) === JSON.stringify(twice), `${once.length} vs ${twice.length}`);
}

// ── (e) ReDoS with attr fields populated
console.log("\n-- (e) ReDoS --");
{
  const evil = "5".repeat(40000) + "2.219-14-" + "9".repeat(40000);
  const set = [
    base("a", { citation: evil, requirement: evil, kind: "eligibility_bar", requiredAttribute: evil, curableInWindow: true } as any),
    base("b", { citation: evil, requirement: evil + " b", kind: "eligibility_bar", curableInWindow: false } as any),
  ];
  const t0 = Date.now(); applyFindingDedup(set, { enabled: true }); const dt = Date.now() - t0;
  R("(e) ReDoS bounded (<500ms)", dt < 500, `${dt}ms`);
}

// ── (f) real-record: verdict + eligible + logicalShowStopperCount invariant across all 5 profiles
console.log("\n-- (f) real-record verdict + eligible + showStopperCount invariant --");
{
  const rec = JSON.parse(fs.readFileSync("/tmp/seq2-runrecord.json", "utf8"));
  const findings: TypedFinding[] = (rec.result?.findings || rec.findings || []) as any;
  const src = rec.result?.fullSource || rec.fullSource || rec.result?.source || "";
  const merged = applyFindingDedup(findings, { enabled: true });
  const profiles: Array<[string, any]> = [
    ["null", null],
    ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }],
    ["ow-hold-nmr", { closedWorld: false, satisfiedAttributes: ["nonmanufacturer:compliant"] }],
    ["cw-empty", { closedWorld: true, satisfiedAttributes: [] }],
    ["cw-gold", { closedWorld: true, satisfiedAttributes: ["nonmanufacturer:compliant", "set_aside_eligibility", "setaside:sb"] }],
  ];
  const ssBefore = logicalShowStopperCount(findings.filter((f) => disposeFinding(f) === "disqualifying").map((f) => ({ ...f, disposition: "disqualifying" as const })));
  const ssAfter = logicalShowStopperCount(merged.filter((f) => disposeFinding(f) === "disqualifying").map((f) => ({ ...f, disposition: "disqualifying" as const })));
  R("(f) logicalShowStopperCount invariant", ssBefore === ssAfter, `${ssBefore} -> ${ssAfter} (${findings.length}->${merged.length} rows)`);
  for (const [pn, p] of profiles) {
    const before = V(findings, p, src), after = V(merged, p, src);
    R(`(f) real-record [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible, `${before.verdict}/${before.eligible} -> ${after.verdict}/${after.eligible}`);
  }
}

console.log(`\n=== JUDGE2-ORDER-HARDENING: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
