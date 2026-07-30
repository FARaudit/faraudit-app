// JUDGE probe 5 — idempotency, order-stability (verdict + facet string), flag-OFF byte-identity,
// ReDoS, empty/null, and REAL-RECORD verdict invariance across profiles.
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";
import * as fs from "fs";

const VI = (findings: TypedFinding[], profile: any, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);
const V = (f: TypedFinding[], p: any, s?: string) => deriveVerdict(VI(f, p, s));
let breaks = 0;
const R = (n: string, ok: boolean, d = "") => { if (!ok) breaks++; console.log(`${ok ? "PASS" : "**BREAK**"}  ${n}${d ? "  — " + d : ""}`); };

// ---- FLAG-OFF byte-identity (Rule 61)
{
  const set: TypedFinding[] = [
    { id: "a", requirement: "FAR 52.217-8 option.", citation: "FAR 52.217-8", kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true } as any,
    { id: "b", requirement: "FAR 52.217-8 option two.", citation: "FAR 52.217-8", kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true } as any,
  ];
  const off = applyFindingDedup(set, { enabled: false });
  R("flag-OFF same reference", off === set);
}

// ---- Idempotency: dedup(dedup(x)) === dedup(x)
{
  const set: TypedFinding[] = ["a","b","c"].map((id) => ({ id, requirement: `FAR 52.217-8 opt ${id}.`, citation: "FAR 52.217-8", kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true } as any));
  const once = applyFindingDedup(set, { enabled: true });
  const twice = applyFindingDedup(once, { enabled: true });
  R("idempotent (rows + JSON)", once.length === twice.length && JSON.stringify(once) === JSON.stringify(twice), `${once.length} vs ${twice.length}`);
}

// ---- Order-stability: shuffle input → same verdict AND same survivor requirement (facet) string.
{
  const mk = (id: string, req: string, extra: Partial<TypedFinding> = {}): TypedFinding => ({ id, requirement: req, citation: "FAR 52.217-8", excerpt: "", kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true, ...extra } as any);
  const set = [
    mk("a", "FAR 52.217-8 base year option pricing."),
    mk("b", "FAR 52.217-8 first option period extension."),
    mk("c", "FAR 52.217-8 option to extend services clause."),
  ];
  const rev = [...set].reverse();
  const mf = applyFindingDedup(set, { enabled: true });
  const mr = applyFindingDedup(rev, { enabled: true });
  const facetF = (mf.find((f) => (f as any).findingDedupMerged) as any)?.requirement;
  const facetR = (mr.find((f) => (f as any).findingDedupMerged) as any)?.requirement;
  R("order-stable facet string", facetF === facetR, `\n    fwd="${facetF}"\n    rev="${facetR}"`);
  R("order-stable verdict", V(mf, null).verdict === V(mr, null).verdict);
}

// ---- ReDoS: pathological clause-ish inputs.
{
  const evil = "5".repeat(50000) + "2.219-14-" + "9".repeat(50000);
  const set: TypedFinding[] = [
    { id: "a", requirement: evil, citation: evil, kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true } as any,
    { id: "b", requirement: evil + " b", citation: evil, kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true } as any,
  ];
  const t0 = Date.now();
  applyFindingDedup(set, { enabled: true });
  const dt = Date.now() - t0;
  R("ReDoS bounded (<500ms)", dt < 500, `${dt}ms`);
}

// ---- empty / null fields
{
  R("empty array", applyFindingDedup([], { enabled: true }).length === 0);
  const nully: TypedFinding[] = [
    { id: "a", requirement: undefined as any, citation: undefined as any, kind: undefined as any, controllability: undefined as any, severity: undefined as any } as any,
    { id: "b", requirement: undefined as any, citation: undefined as any, kind: undefined as any, controllability: undefined as any, severity: undefined as any } as any,
  ];
  let threw = false;
  try { applyFindingDedup(nully, { enabled: true }); } catch { threw = true; }
  R("null-field findings don't throw", !threw);
}

// ---- REAL RECORD: verdict + eligible invariance across profiles.
{
  const rec = JSON.parse(fs.readFileSync("/tmp/seq2-runrecord.json", "utf8"));
  const findings: TypedFinding[] = (rec.result?.findings || rec.findings || []) as any;
  const src = rec.result?.fullSource || rec.fullSource || rec.result?.source || "";
  const profiles: Array<[string, any]> = [
    ["null", null],
    ["ow-empty", { closedWorld: false, satisfiedAttributes: [] }],
    ["ow-hold-nmr", { closedWorld: false, satisfiedAttributes: ["nonmanufacturer:compliant"] }],
    ["cw-empty", { closedWorld: true, satisfiedAttributes: [] }],
    ["cw-gold", { closedWorld: true, satisfiedAttributes: ["nonmanufacturer:compliant", "set_aside_eligibility", "setaside:sb"] }],
  ];
  for (const [pn, p] of profiles) {
    const before = V(findings, p, src);
    const merged = applyFindingDedup(findings, { enabled: true });
    const after = V(merged, p, src);
    R(`REAL-RECORD verdict+elig invariant [${pn}]`, before.verdict === after.verdict && before.eligible === after.eligible,
      `${before.verdict}/${before.eligible} -> ${after.verdict}/${after.eligible}, ${findings.length}->${merged.length} rows`);
  }
}

console.log(`\n=== JUDGE-BATTERY: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
