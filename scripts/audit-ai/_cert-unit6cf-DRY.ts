/* CONSOLIDATED DRY CERT — cross-fleet date-dedup gate (AUDIT_CROSS_FLEET_DEDUP). Owns the full verdict-safety proof for
 * applyCrossFleetDedup ONLY (the clause gate is unchanged/ratified). Consolidates the Gauntlet R1–R3 enders:
 *   • protected-passthrough (bar/marker/off-enum-ctrl never absorbed)   • R1 boilerplate ride-along CLOSED
 *   • R2 off-enum/undefined ctrl CLOSED   • R2 negation/symbol facet loss CLOSED   • R2 cautionFloor laundering CLOSED
 *   • R3 card-#590 composite kind×ctrl + excerpt-package-scan CLOSED (0 flips under AUDIT_SELF_CLEARABLE_PACKAGE)
 *   • exhaustive verdict-invariance sweep (both flag envs)   • idempotence / order-stability / flag-OFF byte-identity. */
import { applyCrossFleetDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌ FAIL"} ${m}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const run = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const V = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };

// 1. Protected-passthrough: bar / marker / off-enum-ctrl / undefined-ctrl all pass by-reference (never absorbed).
{
  const bar = F({ requirement: "Hold clearance by July 22, 2026", controllability: "no_one_can_move", kind: "eligibility_bar", curableInWindow: false });
  const marker = F({ requirement: "WOSB by July 22, 2026", requiredAttribute: "setaside:WOSB" } as any);
  const offEnum = F({ requirement: "OCI plan by July 22, 2026", controllability: "cannot_determine" as never });
  const undef = F({ requirement: "Roster by July 22, 2026", controllability: undefined as never });
  const p1 = F({ requirement: "Offer due July 22, 2026 A", kind: "submission" });
  const p2 = F({ requirement: "Offer due July 22, 2026 B", kind: "submission" });
  const out = run([bar, marker, offEnum, undef, p1, p2]);
  ok([bar, marker, offEnum, undef].every((f) => out.includes(f)), "1: bar/marker/off-enum/undefined-ctrl all pass by-reference");
  ok(out.filter((f) => (f as any).crossFleetMerged).length === 1, "1: only the homogeneous plain pair merged");
}
// 2. R2 off-enum ctrl verdict-invariance (the escalation must NOT vanish).
{
  const a = F({ requirement: "OCI mitigation plan by July 22, 2026", kind: "submission", controllability: "cannot_determine" as never });
  const b = F({ requirement: "Offer due July 22, 2026", kind: "submission", controllability: "bidder_controls" });
  ok(V([a, b]) === V(run([a, b])), `2: off-enum ctrl verdict-invariant (${V([a, b])} == ${V(run([a, b]))})`);
}
// 3. R2 cautionFloor laundering: off-domain truthy "yes" must NOT be laundered into a verdict-live floor.
{
  const a = F({ requirement: "Offer due July 22, 2026 A", kind: "submission" });
  const b = F({ requirement: "Offer due July 22, 2026 B", kind: "submission", cautionFloor: "yes" as unknown as boolean });
  ok(V([a, b]) === V(run([a, b])), `3: off-domain cautionFloor not laundered (${V([a, b])} == ${V(run([a, b]))})`);
}
// 4. R3 card-#590 composite: kind and ctrl come from the SAME member (never synthesized) — verify under the armed flag.
{
  process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
  const A = F({ requirement: "SDVOSB status current; offers due July 22, 2026.", kind: "eligibility_bar", controllability: "already_satisfied", severity: "P2" });
  const B = F({ requirement: "Submit offer by July 22, 2026 via SAM.gov.", kind: "submission", controllability: "bidder_controls", severity: "P2" });
  ok(V([A, B]) === V(run([A, B])), `4a: no composite kind×ctrl synthesized under #590 (${V([A, B])} == ${V(run([A, B]))})`);
  // excerpt-union: an absorbed member's credential excerpt must survive package-wide.
  const C = F({ requirement: "Confirm SAM before July 22, 2026.", kind: "submission", controllability: "bidder_controls", excerpt: "Registered in SAM at offer." });
  const D = F({ requirement: "Proposals due July 22, 2026.", kind: "submission", controllability: "bidder_controls", excerpt: "Maintain CMMC Level 2 certification." });
  const merged = run([C, D]);
  ok(V([C, D]) === V(merged) && /cmmc/i.test(merged.map((f) => f.excerpt ?? "").join(" ")), "4b: absorbed CMMC excerpt unioned onto survivor; verdict invariant under #590");
  delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
}
// 5. Facet fidelity: negation + purely-symbolic distinguishers ALWAYS kept; exact case/ws dup collapses.
{
  const a = F({ requirement: "No extensions after July 22, 2026", kind: "submission" });
  const b = F({ requirement: "Extensions after July 22, 2026 on request", kind: "submission" });
  const c = F({ requirement: "no   EXTENSIONS after July 22, 2026", kind: "submission" });   // ws/case dup of a
  const d = F({ requirement: "Temp ≤ 30C until July 22, 2026", kind: "submission" });
  const e = F({ requirement: "Temp ≥ 30C until July 22, 2026", kind: "submission" });
  const out = run([a, b, c, d, e]);
  const r = out[0].requirement ?? "";
  ok(/No extensions/.test(r) && /(?<!No )Extensions after/.test(r) && r.includes("≤") && r.includes("≥"), "5: negation + ≤/≥ facets all kept");
  ok(!/EXTENSIONS/.test(r), "5: exact case/whitespace duplicate collapsed");
}
// 6. Exhaustive verdict-invariance sweep across kind×ctrl×sev×cautionFloor pairs — BOTH flag envs, 0 flips required.
{
  const kinds = ["eligibility_bar", "submission", "boilerplate", "other", "pricing", "clause_flowdown"];
  const ctrls = ["bidder_controls", "already_satisfied"];
  const cfs = [undefined, true, false] as const;
  const sevs = ["P0", "P2", undefined] as const;
  const sweep = (label: string) => {
    let flips = 0, n = 0; let sample = "";
    for (const k1 of kinds) for (const c1 of ctrls) for (const f1 of cfs)
      for (const k2 of kinds) for (const c2 of ctrls) for (const f2 of cfs) for (const s2 of sevs) {
        const a = F({ requirement: "Offers due July 22, 2026 alpha.", kind: k1 as any, controllability: c1 as any, ...(f1 === undefined ? {} : { cautionFloor: f1 }) });
        const b = F({ requirement: "Offers due July 22, 2026 beta.", kind: k2 as any, controllability: c2 as any, ...(f2 === undefined ? {} : { cautionFloor: f2 }), ...(s2 ? { severity: s2 } : {}) });
        n++; if (V([a, b]) !== V(run([a, b]))) { flips++; if (!sample) sample = `${k1}/${c1}/${f1}+${k2}/${c2}/${f2}/${s2}`; }
      }
    ok(flips === 0, `6[${label}]: ${n} pairs, ${flips} flips${sample ? ` (${sample})` : ""}`);
  };
  sweep("default");
  process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true"; sweep("AUDIT_SELF_CLEARABLE_PACKAGE"); delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
}
// 7. Idempotence, order-stability, flag-OFF byte-identity.
{
  const set = [F({ requirement: "Offers due July 22, 2026 A", kind: "submission" }), F({ requirement: "Offers due July 22, 2026 B", kind: "submission" }), F({ requirement: "Questions due July 14, 2026", kind: "submission" }), F({ requirement: "unrelated prose", kind: "other" })];
  ok(JSON.stringify(run(run(set))) === JSON.stringify(run(set)), "7: idempotent");
  const shuf = [set[3], set[1], set[0], set[2]];
  ok(V(run(set)) === V(run(shuf)), "7: order-stable verdict");
  ok(applyCrossFleetDedup(set, { enabled: false }) === set, "7: flag-OFF ⇒ same reference (byte-identical)");
}

console.log(fails === 0 ? "\nCROSS-FLEET DRY: ALL PASS" : `\nCROSS-FLEET DRY: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
