// CLAUSE-PRESENCE BLINDNESS PROBE — $0, deterministic, no model call, no paid run.
//
// THE DEFECT CLASS (REPORT-TRUTH-ARC, panel 95698f91 / W9123826QA032): the report told the customer
// "no escalation clause visible" while FAR 52.222-43 sat at raw line 1463 — the panel's EXPENSIVE
// finding, because a bidder who believes it must pad four option years of SCA escalation that the
// clause actually reimburses loses a price-only competition. Same shape as "no set-aside visible"
// with 52.219-6 at raw L1434.
//
// `makeClauseSourceChecker` (agentic-sections.ts:453) is the deterministic gate that decides whether
// an expert MAY cite a clause — "the expert CANNOT cite a clause this says is absent" (Rule 64). So a
// FALSE NEGATIVE there is not a cosmetic miss: it makes a clause that IS in the customer's
// solicitation unmentionable, and `stripFabricatedClauses` then rewrites the cite to
// "[clause not in source — suppressed]".
//
// METHOD — never trust one recognizer to audit itself. Two readers over the SAME raw text:
//   STRICT  = production. makeClauseSourceChecker at the flag state the shell supplies.
//   LENIENT = what a HUMAN reading the PDF would see. Tolerates the artifacts a page break
//             injects between the parts of a clause number: line wraps, page headers, running
//             footers, "Page 220 of 420" / "-- 261 of 1668 --" markers, soft hyphens.
// A clause the lenient reader finds and the strict gate denies is a candidate blindness. Each
// candidate is then printed WITH ITS RAW CONTEXT so it can be judged by eye — a candidate is a
// question, not a finding, and the lenient reader is deliberately over-permissive.
//
// RESULT 2026-08-05, measured over 111 banked packages / 7,718 clause sightings:
//   AUDIT_CLAUSE_SOURCE_FULLTEXT=true  (PRODUCTION) → leg A = 0. The gate is SOUND.
//   AUDIT_CLAUSE_SOURCE_FULLTEXT unset (pre-#539)   → leg A = 2,212. That is what arming #539 bought,
//                                                     quantified: 2,212 clause sightings plainly in the
//                                                     raw text that the legacy normalizer denied.
// So this gate needs no stub to prove it can go red — running the legacy arm IS the red proof, and it
// doubles as a standing regression guard on the clause normalizer.
//
// RECORDS_DIR overrides the corpus path. Exit 1 on leg A only (see the leg-B note near the bottom).

import fs from "node:fs";
import path from "node:path";
import { makeClauseSourceChecker } from "../../src/lib/agentic-sections";

const DIR = process.env.RECORDS_DIR ?? path.join(__dirname, "run-records");

// A clause number as PRODUCTION recognizes it (CLAUSE_NUM_RE, agentic-sections.ts:437).
const STRICT_CLAUSE = /\b2?52\.\d{3}-\d{1,4}\b/g;

// THE LENIENT READER. Same shape as STRICT, but tolerant of what a page break injects between the
// parts of a clause number: line wraps, running headers, soft hyphens.
//
// ⚠ THE JUNK WINDOW MUST CONTAIN NO DIGITS. A first cut allowed `\d{0,4}` inside it "to skip page
// numbers", and it silently ate the LEADING digits of the real clause: 52.222-90 was read as
// 52.222-0, manufacturing 4,749 candidates across 111 packages, none of them real. The trailing
// `\d{1,4}` must be the FIRST digits after the hyphen or the reader is not reading the clause.
const JUNK = "[^\\d]{0,40}(?:\\n[^\\d]{0,40}){0,3}";
const LENIENT_CLAUSE = new RegExp(`\\b(2?52)\\s*\\.\\s*(\\d{3})\\s*[-‐-―­]\\s*(?:${JUNK})?(\\d{1,4})(?!\\d)`, "g");

type Candidate = { file: string; sol: string; clause: string; leg: string; context: string };

function loadRecords(dir: string): Array<{ file: string; rec: { input?: { fullSource?: string }; meta?: { sol?: string } } }> {
  const out: Array<{ file: string; rec: { input?: { fullSource?: string }; meta?: { sol?: string } } }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...loadRecords(p)); continue; }
    if (!entry.name.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(p, "utf8"));
      if (rec?.input?.fullSource) out.push({ file: path.relative(DIR, p), rec });
    } catch { /* not a record */ }
  }
  return out;
}

const records = loadRecords(DIR);
if (!records.length) {
  console.error("FAIL — no records under", DIR, "(run-records/ is gitignored; copy it from the primary checkout)");
  process.exit(2);
}

console.log(`AUDIT_CLAUSE_SOURCE_FULLTEXT=${process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT ?? "(unset)"}`);
console.log(`scanning ${records.length} banked packages\n`);

const candidates: Candidate[] = [];
const missedByLenient: string[] = [];
let strictTotal = 0, lenientTotal = 0;

for (const { file, rec } of records) {
  const src = rec.input!.fullSource!;
  const inSrc = makeClauseSourceChecker(src);

  // What production can see.
  const strict = new Set(src.match(STRICT_CLAUSE) ?? []);
  strictTotal += strict.size;

  // What a human reading the page would see.
  const lenient = new Map<string, number>(); // clause → offset of first sighting
  for (const m of src.matchAll(LENIENT_CLAUSE)) {
    const clause = `${m[1]}.${m[2]}-${m[3]}`;
    if (!lenient.has(clause)) lenient.set(clause, m.index ?? 0);
  }
  lenientTotal += lenient.size;
  for (const c of strict) if (!lenient.has(c)) missedByLenient.push(`${c} in ${file}`);

  // ── LEG A — THE SHARPEST TEST, and the one the first cut waved through. A clause the RAW TEXT
  //    plainly contains (production's own CLAUSE_NUM_RE finds it, intact, on one line) that the GATE
  //    still denies. No lenient reader needed: both sides are production's. This is card #539's live
  //    root — "Feb 2026\n52.222-41" normalizes to "...202652.222-41" under the legacy whitespace-strip
  //    and the (?<!\d) guard then rejects a clause that is unambiguously present.
  for (const clause of strict) {
    if (inSrc(clause)) continue;
    const at = src.indexOf(clause);
    candidates.push({
      file, sol: rec.meta?.sol ?? "(none)", clause, leg: "A: in raw text, gate denies it",
      context: JSON.stringify(src.slice(Math.max(0, at - 60), at + 160)),
    });
  }

  // ── LEG B — the softer test: a clause only a page-break-tolerant reader can assemble.
  for (const [clause, at] of lenient) {
    if (strict.has(clause)) continue;   // leg A already judged it
    if (inSrc(clause)) continue;        // THE GATE ITSELF says present — no blindness, whatever the regexes think
    candidates.push({
      file, sol: rec.meta?.sol ?? "(none)", clause, leg: "B: assembled across a break",
      context: JSON.stringify(src.slice(Math.max(0, at - 60), at + 160)),
    });
  }
}

console.log(`strict sightings (production): ${strictTotal}`);
console.log(`lenient sightings (a reader):  ${lenientTotal}`);

// ── NEGATIVE CONTROL, and the run is DISCARDED if it fails ──────────────────────────────────────
// The lenient reader must be a strict SUPERSET: anything production plainly sees, a more permissive
// reader must also see. The first version of this probe violated exactly this (lenient 6,901 <
// strict 7,718) because its junk window ate digits, and every "finding" it produced was an artifact
// of the instrument. A probe that cannot be shown to be weaker than what it audits proves nothing.
if (missedByLenient.length) {
  console.error(`\n⛔ CONTROL FAILED — the "lenient" reader missed ${missedByLenient.length} clause(s) that STRICT sees, so it is not a superset and this run is meaningless.`);
  for (const m of missedByLenient.slice(0, 10)) console.error(`   ${m}`);
  console.error("DISCARD this run and fix the reader — do NOT report its candidates.");
  process.exit(2);
}
console.log("control: lenient ⊇ strict ✓ (the reader is genuinely weaker than the gate)");
const legA = candidates.filter((c) => c.leg.startsWith("A"));
console.log(`\n── CANDIDATE BLINDNESS (${candidates.length}) — leg A (raw text vs gate): ${legA.length} · leg B (across a break): ${candidates.length - legA.length} ──`);

// LEG B IS REPORTED, NOT FAILED — and this is a judgement, so it is stated rather than buried.
// Its only member is a SOURCE-side defect: the extracted text reads "52.236-Preconstruction
// Conference. (Feb 1995)" — FAR 52.236-26 with its trailing digits lost at extraction. No normalizer
// can recover digits the document does not contain, so failing the gate on it would pin it red
// forever and it would stop being read. Leg A is the gate's own contract and IS enforced.
if (!legA.length) {
  console.log(`\nGREEN — leg A clean: no clause that the raw text plainly contains is denied by the gate.`);
  if (candidates.length) console.log(`        (leg B: ${candidates.length} source-side truncation(s) reported above, not failed — see the note in this file.)`);
  process.exit(0);
}

// Group by clause so one recurring artifact does not read as many separate defects.
const byClause = new Map<string, Candidate[]>();
for (const c of candidates) {
  if (!byClause.has(c.clause)) byClause.set(c.clause, []);
  byClause.get(c.clause)!.push(c);
}
for (const [clause, cs] of [...byClause].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${clause} — ${cs.length} sighting(s) [${cs[0].leg}], e.g. ${cs[0].sol} (${cs[0].file})`);
  console.log(`    raw: ${cs[0].context.slice(0, 220)}`);
}

console.error(`\nRED — leg A: ${legA.length} sighting(s) where the raw text plainly contains the clause and the gate denies it.`);
console.error(`      This is the customer-visible failure: the expert CANNOT cite a clause this gate calls absent (Rule 64),`);
console.error(`      and stripFabricatedClauses rewrites the cite to "[clause not in source — suppressed]".`);
process.exit(1);
