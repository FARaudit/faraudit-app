/* RED-TEAM R3-3 — ATTACK 4: date-key normalization. (i) four formats of ONE date must produce ONE key (no false
 * split); (ii) distinct real dates must never share a key; (iii) numeric day/month ambiguity documented m/d/y;
 * (iv) bogus calendar keys rejected; (v) false-anchor probes ("Amendment 3 July 2026"); (vi) ordinals/abbrevs. */
import { applyCrossFleetDedup, type TypedFinding } from "../../src/lib/audit-decide";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? "✅" : "❌ BREAK"} ${msg}`); if (!c) fails++; };
const F = (req: string): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: req, citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true } as TypedFinding);
const rows = (...reqs: string[]) => applyCrossFleetDedup(reqs.map(F), { enabled: true }).length;

// (i) format unification — all four shapes of 2026-07-22 must land in ONE group (4 → 1).
ok(rows("Due 07/22/2026 A", "Due 7/22/2026 B", "Due July 22, 2026 C", "Due 22 July 2026 D") === 1,
   `i: 07/22/2026 ≡ 7/22/2026 ≡ "July 22, 2026" ≡ "22 July 2026" (one key, no false split)`);
// hyphen numeric + ordinal + abbreviated month with period
ok(rows("Due 07-22-2026 A", "Due July 22nd, 2026 B", "Due Jul. 22 2026 C") === 1,
   `i2: 07-22-2026 ≡ "July 22nd, 2026" ≡ "Jul. 22 2026"`);
ok(rows("Due Sept. 5, 2026 A", "Due 09/05/2026 B", "Due 5 September 2026 C") === 1,
   `i3: Sept./September/09-05 unify`);
// (ii) distinct real dates never merge
ok(rows("Due July 22, 2026", "Due July 23, 2026") === 2, `ii: adjacent days stay distinct`);
ok(rows("Due 12/01/2026", "Due 01/12/2026") === 2, `ii2: 12/01 vs 01/12 distinct (no transposition collision)`);
// (iii) numeric ambiguity is resolved m/d/y: 05/06/2026 = May 6 — merges with "May 6, 2026", NOT "June 5, 2026".
ok(rows("Due 05/06/2026", "Due May 6, 2026") === 1, `iii: 05/06/2026 read m/d/y ⇒ merges with May 6, 2026`);
ok(rows("Due 05/06/2026", "Due June 5, 2026") === 2, `iii2: 05/06/2026 does NOT merge with June 5, 2026 (m/d convention; a d/m-authored doc would over-merge — facet-bounded, P3)`);
// (iv) bogus calendar values are not keys (fail-toward-keep)
ok(rows("Due 13/13/2026 A", "Due 13/13/2026 B") === 2, `iv: 13/13/2026 rejected (month 13)`);
ok(rows("Due 00/10/2026 A", "Due 00/10/2026 B") === 2, `iv2: month 0 rejected`);
ok(rows("Due 06/32/2026 A", "Due 06/32/2026 B") === 2, `iv3: day 32 rejected`);
// day 1-31 is calendar-LOOSE (Feb 31 passes) — consistent key, no distinct-real-date collision; document only.
console.log(`   note: day validation is 1-31 flat (2/31/2026 keys as 2026-02-31) — no cross-date collision, P3 doc note`);
// (v) false anchor: "Amendment 3 July 2026" — the amendment NUMBER is read as a day.
{
  const n = rows("Amendment 3 July 2026 revised the PWS wage tables", "Deliverables are due 3 July 2026 to the COR");
  console.log(`   v: "Amendment 3 July 2026" ${n === 1 ? "MERGES with a real 3-July deadline (over-merge, facet-bounded)" : "does not merge"} (rows=${n})`);
}
// (vi) year-less / 2-digit / ISO forms are never anchors (conservative under-merge, per design)
ok(rows("Due July 22 A", "Due July 22 B") === 2, `vi: year-less never keys`);
ok(rows("Due 2026-07-22 A", "Due 2026-07-22 B") === 2, `vi2: ISO never keys (documented conservative)`);
// (vii) a finding naming TWO dates has a compound signature — must not merge with a single-date finding (subset ≠ equal)
ok(rows("Questions due July 14, 2026 and offers due July 22, 2026", "Offers due July 22, 2026") === 2,
   `vii: {7/14,7/22} signature ≠ {7/22} — no subset merge`);

console.log(fails === 0 ? "\nR3-3: ALL PASS (no break)" : `\nR3-3: ${fails} BREAK(S)`);
process.exit(0);
