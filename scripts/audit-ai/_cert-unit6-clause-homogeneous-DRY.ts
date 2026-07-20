/* CLAUSE-GATE DRY CERT (card #604 pivot) — applyFindingDedup under the disposition-homogeneous construction. Proves the
 * same R1/R2/R3 enders the cross-fleet gate proved, on the CLAUSE gate (anchor = shared FAR/DFARS clause):
 *   R1 boilerplate ride-along · R2 off-enum/undefined ctrl · R3 card-#590 composite kind×ctrl + excerpt-package-scan
 *   · exhaustive 2×3888 verdict sweep BOTH AUDIT_SELF_CLEARABLE_PACKAGE states · protected-passthrough · idempotence /
 *   order-stability / flag-OFF byte-identity. Supersedes the 44c6f44 synthesis (stale — predates #590). */
import { applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

const CL = "52.222-50";                                             // one shared clause so same-(clause,kind,ctrl) findings group
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌ FAIL"} ${m}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: `Comply with FAR ${CL}.`, citation: `Section I, ${CL}`, excerpt: "", kind: "clause_flowdown", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const run = (fs: TypedFinding[]) => applyFindingDedup(fs, { enabled: true });
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const V = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };

// R1 — boilerplate ride-along: OLD synthesis dragged a boilerplate kind onto the survivor → dropped → BID→NHR. Now the two
// have different kind → not homogeneous → not merged → verdict invariant.
{
  const a = F({ requirement: `Standard ${CL} recital.`, kind: "boilerplate", controllability: "bidder_controls" });
  const b = F({ requirement: `${CL} portal submission is met.`, kind: "submission", controllability: "already_satisfied" });
  ok(V([a, b]) === V(run([a, b])), `R1: boilerplate ride-along verdict-invariant (${V([a, b])} == ${V(run([a, b]))})`);
}
// R2 — off-enum / undefined controllability never absorbed (protected), escalation preserved.
{
  const a = F({ requirement: `${CL} OCI mitigation.`, kind: "submission", controllability: "cannot_determine" as never });
  const b = F({ requirement: `${CL} offer submission.`, kind: "submission", controllability: "bidder_controls" });
  const c = F({ requirement: `${CL} roster.`, kind: "submission", controllability: undefined as never });
  const d = F({ requirement: `${CL} offer submission 2.`, kind: "submission", controllability: "bidder_controls" });
  ok(V([a, b]) === V(run([a, b])) && V([c, d]) === V(run([c, d])), `R2: off-enum/undefined ctrl verdict-invariant + never absorbed`);
  ok(run([a, b, c, d]).includes(a) && run([a, b, c, d]).includes(c), `R2: off-enum & undefined ctrl pass by-reference (protected)`);
}
// R3 — card #590: under the armed flag, no composite kind×ctrl synthesized + absorbed excerpts unioned.
{
  process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
  const A = F({ requirement: `${CL} SDVOSB status current.`, kind: "eligibility_bar", controllability: "already_satisfied", severity: "P2" });
  const B = F({ requirement: `${CL} submit offer via SAM.`, kind: "submission", controllability: "bidder_controls", severity: "P2" });
  ok(V([A, B]) === V(run([A, B])), `R3a: no composite kind×ctrl under #590 (${V([A, B])} == ${V(run([A, B]))})`);
  const C = F({ requirement: `${CL} confirm SAM.`, kind: "submission", controllability: "bidder_controls", excerpt: "Registered in SAM at offer." });
  const D = F({ requirement: `${CL} proposals due.`, kind: "submission", controllability: "bidder_controls", excerpt: "Maintain CMMC Level 2 certification." });
  const m = run([C, D]);
  ok(V([C, D]) === V(m) && /cmmc/i.test(m.map((f) => f.excerpt ?? "").join(" ")), `R3b: absorbed CMMC excerpt unioned; verdict invariant under #590`);
  delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
}
// protected-passthrough: bar / marker / attr never absorbed.
{
  const bar = F({ requirement: `${CL} clearance.`, controllability: "no_one_can_move", kind: "eligibility_bar", curableInWindow: false });
  const marker = F({ requirement: `${CL} WOSB.`, requiredAttribute: "setaside:WOSB" } as any);
  const p1 = F({ kind: "submission" }); const p2 = F({ kind: "submission" });
  const out = run([bar, marker, p1, p2]);
  ok(out.includes(bar) && out.includes(marker), "protected: bar + marker pass by-reference");
  ok(out.filter((f) => (f as any).findingDedupMerged).length === 1, "protected: only the homogeneous plain pair merged");
}
// facet fidelity: negation + ≤/≥ kept; exact case/ws dup collapses.
{
  const a = F({ requirement: `No extensions after award per ${CL}` });
  const b = F({ requirement: `Extensions after award on request per ${CL}` });
  const c = F({ requirement: `no   EXTENSIONS after award per ${CL}` });
  const out = run([a, b, c]);
  const r = out[0].requirement ?? "";
  ok(/No extensions/.test(r) && /(?<!No )Extensions after/.test(r) && !/EXTENSIONS/.test(r), "facet: negation kept, exact case/ws dup collapsed");
}
// Exhaustive verdict-invariance sweep — BOTH flag envs, 0 flips (all pairs share clause CL).
{
  const kinds = ["eligibility_bar", "submission", "boilerplate", "other", "pricing", "clause_flowdown"];
  const ctrls = ["bidder_controls", "already_satisfied"];
  const cfs = [undefined, true, false] as const;
  const sevs = ["P0", "P2", undefined] as const;
  const sweep = (label: string) => {
    let flips = 0, n = 0; let sample = "";
    for (const k1 of kinds) for (const c1 of ctrls) for (const f1 of cfs)
      for (const k2 of kinds) for (const c2 of ctrls) for (const f2 of cfs) for (const s2 of sevs) {
        const a = F({ requirement: `Alpha per ${CL}`, kind: k1 as any, controllability: c1 as any, ...(f1 === undefined ? {} : { cautionFloor: f1 }) });
        const b = F({ requirement: `Beta per ${CL}`, kind: k2 as any, controllability: c2 as any, ...(f2 === undefined ? {} : { cautionFloor: f2 }), ...(s2 ? { severity: s2 } : {}) });
        n++; if (V([a, b]) !== V(run([a, b]))) { flips++; if (!sample) sample = `${k1}/${c1}/${f1}+${k2}/${c2}/${f2}/${s2}`; }
      }
    ok(flips === 0, `sweep[${label}]: ${n} pairs, ${flips} flips${sample ? ` (${sample})` : ""}`);
  };
  sweep("default");
  process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true"; sweep("AUDIT_SELF_CLEARABLE_PACKAGE"); delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
}
// idempotence / order-stability / flag-OFF byte-identity.
{
  const set = [F({ id: "a", kind: "submission" }), F({ id: "b", kind: "submission" }), F({ id: "c", requirement: "unrelated", citation: "none", kind: "other" })];
  ok(JSON.stringify(run(run(set))) === JSON.stringify(run(set)), "idempotent");
  ok(V(run(set)) === V(run([set[2], set[1], set[0]])), "order-stable verdict");
  ok(applyFindingDedup(set, { enabled: false }) === set, "flag-OFF ⇒ same reference (byte-identical)");
}

console.log(fails === 0 ? "\nCLAUSE-GATE HOMOGENEOUS DRY: ALL PASS" : `\nCLAUSE-GATE HOMOGENEOUS DRY: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
