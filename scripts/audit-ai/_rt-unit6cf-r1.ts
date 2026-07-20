/* RED-TEAM R1 — cross-fleet date-anchor dedup. Adversarial attempts to (1) over-merge with FACET LOSS,
 * (2) absorb/alter a verdict-driving finding, (3) false-key from excerpt-only dates, (4) break idempotence/
 * severity/cautionFloor aggregation. Every case asserts the verdict-safety + no-text-loss invariants. */
import { applyCrossFleetDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? "✅" : "❌ FAIL"} ${msg}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const run = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });
const textOf = (fs: TypedFinding[]) => fs.map((f) => f.requirement ?? "").join(" ||| ");

// A. Two DISTINCT plain obligations sharing a date → must collapse to one row but PRESERVE both distinct facets (no text loss).
{
  const a = F({ requirement: "Offer must be submitted by July 22, 2026 via email to the CO", severity: "P0" });
  const b = F({ requirement: "Oral presentation slides are due July 22, 2026 in PowerPoint format", severity: "P1" });
  const out = run([a, b]);
  ok(out.length === 1, `A: two same-date plains collapse to 1 row (got ${out.length})`);
  const t = textOf(out);
  ok(/submitted.*email/i.test(t) && /oral presentation slides/i.test(t), `A: BOTH distinct obligation facets preserved (no text loss)`);
  ok(out[0].severity === "P0", `A: survivor severity = group max P0 (got ${out[0].severity})`);
}
// B. A BAR carrying the same date → must PASS THROUGH untouched (by reference), never absorbed.
{
  const bar = F({ requirement: "Offeror must hold an active facility clearance by July 22, 2026", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", severity: "P0" });
  const p1 = F({ requirement: "Proposal due July 22, 2026 to the CO" });
  const p2 = F({ requirement: "Questions and proposals accepted through July 22, 2026" });
  const out = run([bar, p1, p2]);
  ok(out.includes(bar), `B: bar passes through by-reference (untouched)`);
  ok(out.filter((f) => (f as any).crossFleetMerged).length === 1, `B: the two plains merged, the bar did not`);
  ok(out.length === 2, `B: 3 → 2 (bar + 1 merged survivor)`);
}
// C. Marker-bearers (requiredAttribute / nmrGuard / awardBasisGuard / eligibilityAuthorityGuard) sharing a date → PROTECTED.
{
  const markers: TypedFinding[] = [
    F({ requirement: "Set-aside eligibility confirmed by July 22, 2026", requiredAttribute: "setaside:WOSB" } as any),
    F({ requirement: "NMR compliance by July 22, 2026", nmrGuard: true } as any),
    F({ requirement: "Award basis fixed by July 22, 2026", awardBasisGuard: true } as any),
    F({ requirement: "Authority allow-listed July 22, 2026", eligibilityAuthorityGuard: true } as any),
  ];
  const plainPair = [F({ requirement: "Submit offer July 22, 2026" }), F({ requirement: "Deliver quote by July 22, 2026" })];
  const out = run([...markers, ...plainPair]);
  ok(markers.every((m) => out.includes(m)), `C: ALL 4 marker-bearers pass through by-reference (none absorbed)`);
  ok(out.filter((f) => (f as any).crossFleetMerged).length === 1, `C: only the plain pair merged`);
}
// D. Date only in EXCERPT (not citation/requirement) → must NOT be used as a key (no false merge).
{
  const a = F({ requirement: "Submit the technical volume", excerpt: "context mentions July 22, 2026 elsewhere" });
  const b = F({ requirement: "Submit the price volume", excerpt: "also July 22, 2026 in a neighbouring clause" });
  const out = run([a, b]);
  ok(out.length === 2, `D: excerpt-only dates are NOT keys → no merge (got ${out.length})`);
}
// E. Two-digit year must NOT match (conservative — requires 4-digit year).
{
  const a = F({ requirement: "Offer due 7/22/26 to CO" });
  const b = F({ requirement: "Quote due 7/22/26 to CO" });
  const out = run([a, b]);
  ok(out.length === 2, `E: 2-digit year not anchored → no merge (got ${out.length})`);
}
// F. Different dates → distinct keys → never merge across deadlines.
{
  const a = F({ requirement: "Offer due July 22, 2026" });
  const b = F({ requirement: "Questions due July 14, 2026" });
  const out = run([a, b]);
  ok(out.length === 2, `F: distinct dates (7/22 vs 7/14) stay separate (got ${out.length})`);
}
// G. cautionFloor OR-preservation: an absorbed member with cautionFloor → survivor carries cautionFloor (verdict-preserving).
{
  const a = F({ requirement: "Hold prices firm through July 22, 2026", cautionFloor: true } as any);
  const b = F({ requirement: "Prices firm until July 22, 2026 date of receipt" });
  const out = run([a, b]);
  ok(out.length === 1 && (out[0] as any).cautionFloor === true, `G: survivor OR-preserves cautionFloor from an absorbed member`);
}
// H. Idempotence — re-running the gate on its own output is a no-op.
{
  const set = [F({ requirement: "Submit July 22, 2026 A" }), F({ requirement: "Submit July 22, 2026 B" }), F({ requirement: "unrelated" })];
  const once = run(set); const twice = run(once);
  ok(JSON.stringify(once) === JSON.stringify(twice), `H: idempotent`);
}
// I. Numeric ISO date form (2026-07-22) matches the same key as "July 22, 2026" — wait, ISO is YYYY-MM-DD not M/D/YYYY.
//    The regex only anchors M/D/YYYY or Month D, YYYY; ISO 2026-07-22 should NOT match (fail-toward-keep, documented).
{
  const a = F({ requirement: "Offer due 2026-07-22" });
  const b = F({ requirement: "Offer due July 22, 2026" });
  const out = run([a, b]);
  ok(out.length === 2, `I: ISO 2026-07-22 not anchored (only US forms) → no cross-form merge (conservative, got ${out.length})`);
}
// J. VERDICT INVARIANCE on a mixed set with a real bar present: merging plains must not move the verdict.
{
  const set = [
    F({ requirement: "Offeror must possess ISO 9001 cert", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar", requiredAttribute: "cert:iso9001", severity: "P0" } as any),
    F({ requirement: "Submit offer July 22, 2026 A", severity: "P1" }),
    F({ requirement: "Submit offer July 22, 2026 B", severity: "P1" }),
    F({ requirement: "Submit offer July 22, 2026 C", severity: "P2" }),
  ];
  const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
  const before = deriveVerdict(vi(set));
  const after = deriveVerdict(vi(run(set)));
  ok(before.verdict === after.verdict && before.eligible === after.eligible && before.showStoppers.length === after.showStoppers.length,
     `J: verdict invariant with a real bar present (${before.verdict}/${before.showStoppers.length} == ${after.verdict}/${after.showStoppers.length})`);
}

console.log(fails === 0 ? "\nR1: ALL PASS" : `\nR1: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
