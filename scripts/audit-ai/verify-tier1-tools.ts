// $0 deterministic gate for T1-6 (audit-tools excerpt drift).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-tools.ts
//
// findInSource / lookupClause located a match in the NORMALIZED source (which
// collapses \s+ → " ") then sliced the ORIGINAL source at that normalized offset
// → the grounding excerpt drifted left by the collapsed-whitespace delta, worst
// on whitespace-dense text PDFs (and it camouflaged T0-1's false-present grounding).
// Fix: normWithMap maps the normalized hit offset back to the original before slicing.

import { findInSource, lookupClause } from "@/lib/audit-tools";
import type { AuditToolContext } from "@/lib/audit-tools";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const ctx = (fullSource: string) => ({ fullSource } as AuditToolContext);

// A whitespace-dense prefix: norm collapses ~250 chars of space/newlines to one
// char, so the match sits at normalized offset ~7 but original offset ~250+.
// Pre-fix, slicing the original at ~7 lands in the header and misses the match.
const bigGap = " ".repeat(200) + "\n".repeat(60);
const phrase = "delivery date is 30 September 2026";
const srcFind = `HEADER${bigGap}The ${phrase} for all line items in this order.`;

const hits = findInSource(ctx(srcFind), phrase).hits;
ok("T1-6 R1: findInSource returns a hit", hits.length === 1);
ok("T1-6 R2: the excerpt is ALIGNED to the real match (contains the phrase, not drifted into the header)",
  hits[0]?.includes(phrase) ?? false);
ok("T1-6 R3: the excerpt carries the trailing context after the match", hits[0]?.includes("for all line items") ?? false);
ok("T1-6 R4: the excerpt did NOT drift into the header prefix", !(hits[0] ?? "").startsWith("HEADER"));

// Regression: a clean (no-gap) source still grounds correctly.
const clean = `Intro. The ${phrase} applies here.`;
ok("T1-6 R5: no-gap source still returns an aligned excerpt (regression)",
  findInSource(ctx(clean), phrase).hits[0]?.includes(phrase) ?? false);

// Case/dash-insensitive match still aligns (norm lowercases + folds dashes).
const mixed = `Preamble${bigGap}The DELIVERY DATE IS 30 SEPTEMBER 2026 (firm).`;
ok("T1-6 R6: case-insensitive match still maps back to the ORIGINAL casing excerpt",
  findInSource(ctx(mixed), phrase).hits[0]?.includes("DELIVERY DATE IS 30 SEPTEMBER 2026") ?? false);

// lookupClause: whitespace before the clause → excerpt must still contain it.
const srcClause = `Clauses section.${bigGap}The clause 52.219-6 is incorporated by reference here.`;
const lc = lookupClause(ctx(srcClause), "52.219-6");
ok("T1-6 R7: lookupClause reports present", lc.present);
ok("T1-6 R8: lookupClause excerpt is aligned to the clause (not drifted into the header)",
  lc.excerpt.includes("52.219-6"));

console.log(`\nTier1 tools (T1-6): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
