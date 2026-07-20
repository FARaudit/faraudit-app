/* RED-TEAM R2 attack 4 — date-key hardening probes: format-variant key equality (invariant 5), non-deadline
 * dates (PoP range / statute date), calendar-validation edge (Feb 30), phone/contract-number no-key,
 * double-count, signature-set semantics, and the clause-gate→cross-fleet composition (merged survivor is
 * protected in the second gate). */
import { applyCrossFleetDedup, applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? "✅" : "🔥 BREAK"} ${msg}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const run = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });

// A. INVARIANT 5 — eight format variants of the SAME date must land in ONE group (same key, no false split).
{
  const reqs = [
    "Offer due July 22, 2026 alpha", "Offer due 07/22/2026 bravo", "Offer due 7/22/2026 charlie",
    "Offer due 22 July 2026 delta", "Offer due Jul 22 2026 echo", "Offer due July 22nd, 2026 foxtrot",
    "Offer due JULY 22, 2026 golf", "Offer due 7-22-2026 hotel",
  ];
  const out = run(reqs.map((r) => F({ requirement: r })));
  ok(out.length === 1, `A: 8 format variants of 2026-07-22 → ONE survivor (got ${out.length})`);
  const t = out.map((f) => f.requirement).join(" ||| ");
  ok(reqs.every((r) => t.includes(r)), "A: all 8 distinct-token facets preserved");
  ok((out[0] as { mergedLensCount?: number }).mergedLensCount === 8, `A: mergedLensCount=8 (got ${(out[0] as { mergedLensCount?: number }).mergedLensCount})`);
}
// B. "22 Sept. 2026" (day-first, dotted abbrev) == "September 22, 2026".
{
  const out = run([F({ requirement: "Report due 22 Sept. 2026 alpha" }), F({ requirement: "Report due September 22, 2026 bravo" })]);
  ok(out.length === 1, `B: dotted 'Sept.' day-first == month-first (got ${out.length} rows)`);
}
// C. PoP RANGE — two DISTINCT obligations quoting the same period-of-performance range: they over-merge
//    (same 2-date signature) but BOTH facets must survive (UX-bounded cost, no text loss, no verdict move).
{
  const a = F({ requirement: "Provide on-site staffing throughout August 1, 2026 – July 31, 2027" });
  const b = F({ requirement: "Maintain required insurance coverage during August 1, 2026 – July 31, 2027" });
  const out = run([a, b]);
  const t = out.map((f) => f.requirement).join(" ||| ");
  ok(/staffing/.test(t) && /insurance/.test(t), `C: PoP-range over-merge keeps BOTH obligation texts (rows=${out.length})`);
  const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
  const off = deriveVerdict(vi([a, b])); const on = deriveVerdict(vi(out));
  ok(off.verdict === on.verdict && off.eligible === on.eligible && off.showStoppers.length === on.showStoppers.length, "C: verdict invariant on the PoP-range merge");
}
// D. SIGNATURE-SET semantics — deadline-only vs deadline+statute-date have DIFFERENT signatures → under-merge (safe).
{
  const out = run([
    F({ requirement: "Offer due July 22, 2026" }),
    F({ requirement: "Offer due July 22, 2026 per the Act of July 4, 1966" }),
  ]);
  ok(out.length === 2, `D: extra statute date changes the signature → no merge (fail-toward-keep, got ${out.length})`);
}
// E. CALENDAR VALIDATION — Feb 30 is accepted by the mo/day range check; both formats must at least produce the
//    SAME key (consistent), and 13/13 must produce NO key.
{
  const feb = run([F({ requirement: "Deliver by February 30, 2026 alpha" }), F({ requirement: "Deliver by 2/30/2026 bravo" })]);
  ok(feb.length === 1, `E1: Feb-30 (calendar-invalid but range-valid) keys CONSISTENTLY across formats (got ${feb.length} rows)`);
  const bogus = run([F({ requirement: "Deliver by 13/13/2026 alpha" }), F({ requirement: "Deliver by 13/13/2026 bravo" })]);
  ok(bogus.length === 2, `E2: 13/13/2026 rejected → no key → no merge (got ${bogus.length})`);
}
// F. NUMBER-COLLISION no-keys — phone / contract number / CFR cite must not key.
{
  const out = run([
    F({ requirement: "Call the CO at 202-555-1212 with questions alpha" }),
    F({ requirement: "Call the CO at 202-555-1212 with questions bravo" }),
    F({ requirement: "Reference contract W91237-26-R-0022 alpha" }),
    F({ requirement: "Reference contract W91237-26-R-0022 bravo" }),
  ]);
  ok(out.length === 4, `F: phone/contract numbers produce NO date key → no merge (got ${out.length})`);
}
// G. DOUBLE-COUNT — one requirement stating the same date in TWO formats yields ONE key (Set-dedup) → still
//    groups with a single-format sibling.
{
  const out = run([
    F({ requirement: "Offer due July 22, 2026, i.e. no later than 7/22/2026, alpha" }),
    F({ requirement: "Offer due July 22, 2026 bravo" }),
  ]);
  ok(out.length === 1, `G: dual-format restatement of ONE date → single key → merges with sibling (got ${out.length})`);
}
// H. AMBIGUOUS NUMERIC day-first "22/7/2026" — month=22 invalid → no key (fail-toward-keep, documented).
{
  const out = run([F({ requirement: "Offer due 22/7/2026 alpha" }), F({ requirement: "Offer due July 22, 2026 bravo" })]);
  ok(out.length === 2, `H: European-style 22/7/2026 not anchored (month>12) → no merge (got ${out.length})`);
}
// I. COMPOSITION — a clause-gate survivor (findingDedupMerged, mergedClause keys) entering the cross-fleet
//    gate is PROTECTED (its merge-marker keys ∉ FD_ABSORBABLE_KEYS) → passes through by-reference, never absorbed.
{
  const clauseSet = [
    F({ requirement: "Extend services per 52.217-8 through July 22, 2026 alpha", citation: "52.217-8" }),
    F({ requirement: "Extend services per 52.217-8 through July 22, 2026 bravo", citation: "52.217-8" }),
  ];
  const afterClause = applyFindingDedup(clauseSet, { enabled: true });
  ok(afterClause.length === 1 && (afterClause[0] as { findingDedupMerged?: boolean }).findingDedupMerged === true, "I1: clause gate merged the 52.217-8 pair");
  const dated = [F({ requirement: "Offer due July 22, 2026 charlie" }), F({ requirement: "Offer due July 22, 2026 delta" })];
  const out = run([...afterClause, ...dated]);
  ok(out.includes(afterClause[0]), "I2: clause-merged survivor passes the cross-fleet gate BY-REFERENCE (protected, not absorbed)");
  ok(out.length === 2, `I3: 3 → 2 (protected clause survivor + merged date pair, got ${out.length})`);
}
// J. ORDINAL day-first "22nd July 2026" == "July 22, 2026".
{
  const out = run([F({ requirement: "Due 22nd July 2026 alpha" }), F({ requirement: "Due July 22, 2026 bravo" })]);
  ok(out.length === 1, `J: ordinal day-first == month-first (got ${out.length})`);
}
console.log(`\nR2-4: ${fails} FAIL`);
process.exit(0);
