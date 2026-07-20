/* RED-TEAM R3-4 — ATTACKS 3 + 5: gate ordering/protection interplay, idempotence, order-stability, flag-OFF
 * reference identity, by-reference protected passthrough, facet no-text-loss (incl. zero-width/NBSP), and an
 * exhaustive absorbable-pair ON-vs-OFF verdict sweep under DEFAULT env and under AUDIT_SELF_CLEARABLE_PACKAGE. */
import { applyCrossFleetDedup, applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? "✅" : "❌ BREAK"} ${msg}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as VerdictInputs);
const tuple = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };
const pipe = (fs: TypedFinding[]) => applyCrossFleetDedup(applyFindingDedup(fs, { enabled: true }), { enabled: true });

// A. ORDERING (attack 3): a clause-gate survivor that ALSO carries a date is PROTECTED in the cross-fleet gate
// (findingDedupMerged ∉ FD_ABSORBABLE_KEYS) — by-reference passthrough, and the no-clause pair still merges.
{
  const c1 = F({ requirement: "Comply with FAR 52.222-50; annual cert due July 22, 2026.", citation: "52.222-50" });
  const c2 = F({ requirement: "FAR 52.222-50 compliance certification due July 22, 2026.", citation: "52.222-50" });
  const p1 = F({ requirement: "Offers due July 22, 2026 by email." });
  const p2 = F({ requirement: "Submit quote by July 22, 2026." });
  const afterClause = applyFindingDedup([c1, c2, p1, p2], { enabled: true });
  const clauseSurvivor = afterClause.find((f) => (f as any).findingDedupMerged)!;
  const out = applyCrossFleetDedup(afterClause, { enabled: true });
  ok(!!clauseSurvivor && out.includes(clauseSurvivor), `A: clause-survivor (merged, dated) passes cross-fleet gate BY REFERENCE (protected)`);
  ok(out.filter((f) => (f as any).crossFleetMerged).length === 1 && out.length === 2, `A2: protection did not drop the needed plain-pair merge (4→2)`);
  const t = out.map((f) => f.requirement).join(" ||| ");
  ok(/email/.test(t) && /Submit quote/.test(t) && /annual cert/i.test(t), `A3: no requirement text vanished across the two-gate pipeline`);
}
// B. Idempotence on a mixed real-shaped set (bars + markers + clause dups + date dups + no-anchor prose).
{
  const set = [
    F({ requirement: "Offeror must hold facility clearance.", controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false, severity: "P0" }),
    F({ requirement: "NMR compliance required.", nmrGuard: true } as any),
    F({ requirement: "Comply with FAR 52.217-8 option extension.", citation: "52.217-8" }),
    F({ requirement: "FAR 52.217-8 option to extend services applies.", citation: "52.217-8" }),
    F({ requirement: "Offers due July 22, 2026 A." }),
    F({ requirement: "Offers due July 22, 2026 B.", cautionFloor: true }),
    F({ requirement: "Questions due July 14, 2026." }),
    F({ requirement: "Provide three past-performance references." }),
  ];
  const once = pipe(set); const twice = pipe(once);
  ok(JSON.stringify(once) === JSON.stringify(twice), `B: full pipeline idempotent on mixed set`);
  ok(tuple(set) === tuple(once), `B2: verdict tuple invariant on mixed set (OFF=${tuple(set)} ON=${tuple(once)})`);
}
// C. Flag-OFF byte-identity (same array reference) for both gates.
{
  const set = [F({ requirement: "Offers due July 22, 2026 A." }), F({ requirement: "Offers due July 22, 2026 B." })];
  ok(applyCrossFleetDedup(set) === set && applyCrossFleetDedup(set, { enabled: false }) === set, `C: cross-fleet flag-OFF ⇒ same reference`);
  ok(applyFindingDedup(set) === set, `C2: clause gate flag-OFF ⇒ same reference`);
}
// D. Order-stability: content of the merged output is permutation-stable on rank-distinct members.
{
  const a = F({ id: "a", requirement: "Offers due July 22, 2026 with signed SF1449.", kind: "submission", controllability: "bidder_controls", severity: "P1" });
  const b = F({ id: "b", requirement: "Offer package due July 22, 2026.", kind: "other", controllability: "already_satisfied", severity: "P2" });
  const c = F({ id: "c", requirement: "Delivery of quote July 22, 2026 electronic only.", kind: "pricing", controllability: "already_satisfied", severity: "P2" });
  const norm = (fs: TypedFinding[]) => fs.map((f) => `${f.requirement}::${f.kind}::${f.controllability}::${f.severity}::${(f as any).cautionFloor ?? ""}`).sort().join("\n");
  const o1 = applyCrossFleetDedup([a, b, c], { enabled: true });
  const o2 = applyCrossFleetDedup([c, b, a], { enabled: true });
  ok(norm(o1) === norm(o2), `D: permutation-stable merged content (rank-distinct members)`);
  // full-tie probe (same ctrl/kind/sev/req-length): spread-base metadata (id/citation/excerpt) may ride input order — verdict-inert, log only.
  const t1 = F({ id: "t1", requirement: "Due July 22, 2026 AAAA.", excerpt: "e1" });
  const t2 = F({ id: "t2", requirement: "Due July 22, 2026 BBBB.", excerpt: "e2" });
  const s1 = applyCrossFleetDedup([t1, t2], { enabled: true })[0];
  const s2 = applyCrossFleetDedup([t2, t1], { enabled: true })[0];
  console.log(`   D-note: full-tie spread base under reorder: excerpt "${s1.excerpt}" vs "${s2.excerpt}" (${s1.excerpt === s2.excerpt ? "stable" : "order-rides — verdict-inert P3"})`);
}
// E. Facet fidelity: meaning-bearing single-char differences are ALWAYS kept; only exact normalized dups drop.
{
  const a = F({ requirement: "No extensions granted after July 22, 2026." });
  const b = F({ requirement: "Extensions granted after July 22, 2026." });           // negation pair — MUST keep both
  const c = F({ requirement: "no   extensions granted after JULY 22, 2026." });      // ws/case dup of a — may drop
  const d = F({ requirement: "Quantity ≤ 500 units by July 22, 2026." });
  const e = F({ requirement: "Quantity ≥ 500 units by July 22, 2026." });       // ≤ vs ≥ — MUST keep both
  const out = applyCrossFleetDedup([a, b, c, d, e], { enabled: true });
  const t = out.map((f) => f.requirement).join(" ||| ");
  ok(/No extensions granted/i.test(t) && /(^| )Extensions granted/.test(t.replace(/No extensions granted[^|]*/i, "")), `E: negation pair both kept`);
  ok(t.includes("≤") && t.includes("≥"), `E2: ≤ and ≥ facets both kept`);
  // zero-width-space variant is NOT whitespace-normalized ⇒ kept as distinct (conservative keep — fine)
  const z1 = F({ requirement: "Submit bid July 22, 2026." });
  const z2 = F({ requirement: "Submit bid​ July 22, 2026." });
  const zt = applyCrossFleetDedup([z1, z2], { enabled: true }).map((f) => f.requirement).join("|");
  console.log(`   E-note: zero-width-space variant ${zt.includes("​") ? "kept (conservative)" : "dropped"}`);
}
// F. Exhaustive absorbable-pair sweep: kinds × ctrls × cautionFloor × severity, ON-vs-OFF verdict tuple.
{
  const kinds = ["eligibility_bar", "submission", "boilerplate", "other", "pricing", "clause_flowdown"];
  const ctrls = ["bidder_controls", "already_satisfied"];
  const cfs = [undefined, true, false] as const;
  const sevs = ["P0", "P2", undefined] as const;
  const sweep = (label: string) => {
    let flips = 0, n = 0; const samples: string[] = [];
    for (const k1 of kinds) for (const c1 of ctrls) for (const f1 of cfs)
      for (const k2 of kinds) for (const c2 of ctrls) for (const f2 of cfs) for (const s2 of sevs) {
        const a = F({ requirement: "Offers due July 22, 2026 alpha.", kind: k1 as any, controllability: c1 as any, ...(f1 === undefined ? {} : { cautionFloor: f1 }) });
        const b = F({ requirement: "Offers due July 22, 2026 beta.", kind: k2 as any, controllability: c2 as any, ...(f2 === undefined ? {} : { cautionFloor: f2 }), ...(s2 ? { severity: s2 } : {}) });
        const off = tuple([a, b]); const on = tuple(applyCrossFleetDedup([a, b], { enabled: true }));
        n++;
        if (off !== on) { flips++; if (samples.length < 6) samples.push(`k=${k1}/${c1}/cf=${f1} + k=${k2}/${c2}/cf=${f2}/sev=${s2}: OFF=${off} ON=${on}`); }
      }
    console.log(`   F[${label}]: ${n} pairs, ${flips} verdict flips`);
    samples.forEach((s) => console.log(`      FLIP ${s}`));
    return flips;
  };
  delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
  const f1 = sweep("default env");
  ok(f1 === 0, `F: default-env sweep zero flips`);
  process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
  const f2 = sweep("AUDIT_SELF_CLEARABLE_PACKAGE=true");
  ok(f2 === 0, `F2: self-clearable-env sweep zero flips`);
  delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
}

console.log(fails === 0 ? "\nR3-4: ALL PASS (no break)" : `\nR3-4: ${fails} BREAK(S)`);
process.exit(0);
