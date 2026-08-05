// INGEST CEILINGS — CI gate. Run: npx tsx src/lib/ingest-ceilings.test.ts
//
// TWO ceilings gate how much of a package the engine ever sees, and they are SEQUENTIAL:
//   1. MAX_DOCS               (sam-attachments)   — how many documents are ingested at all
//   2. MAX_FULLSOURCE_CHARS   (agentic-executor)  — how much assembled text survives into one read
//
// MEASURED on the live W911SG27BA002 run (2026-08-05): 55 published → 36 ingested (MAX_DOCS) → 29
// assembled (MAX_FULLSOURCE_CHARS drops 7 more whole docs). Every one of the 19 dropped at stage 1 was
// BINDING, including SF 1413, a form the bidder must submit.
//
// THE INVARIANT THIS EXISTS FOR: raising ONE is a no-op. 36 documents already assemble to 1,565,625 chars
// against a 1,400,000 ceiling, so admitting more documents just relocates the drop to a later stage where
// it is harder to see and costs a download first. The two must move together.
//
// ⚠ WHY CHILD PROCESSES. Both constants are read at MODULE SCOPE, so they bind once per process. A first
// version of this gate mutated process.env and re-imported with a cache-busting query string; the module
// cache returned the FIRST value and the override assertion failed — which is the good outcome, because a
// same-process test that happened to pass would have been asserting nothing about the running worker.
// Same reason src/app/api/sam/route.failclosed.test.ts spawns per phase.

import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let passed = 0;
const ok = (label: string, cond: boolean) => { assert.ok(cond, `FAIL — ${label}`); console.log(`  ✓ ${label}`); passed++; };

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Read both ceilings in a FRESH process under the given env. */
function ceilingsUnder(env: Record<string, string | undefined>): { docs: number; chars: number } {
  const code =
    `import { MAX_DOCS } from ${JSON.stringify(HERE + "sam-attachments.ts")};` +
    `import { MAX_FULLSOURCE_CHARS } from ${JSON.stringify(HERE + "agentic-executor.ts")};` +
    `console.log(JSON.stringify({ docs: MAX_DOCS, chars: MAX_FULLSOURCE_CHARS }));`;
  const clean = { ...process.env };
  delete clean.AUDIT_MAX_DOCS; delete clean.AGENTIC_MAX_FULLSOURCE_CHARS;
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete clean[k]; else clean[k] = v; }
  const r = spawnSync("npx", ["tsx", "-e", code], { encoding: "utf8", env: clean, cwd: HERE + "../.." });
  const line = (r.stdout || "").trim().split("\n").filter((l) => l.startsWith("{")).pop();
  if (!line) throw new Error(`child produced no result. stderr:\n${(r.stderr || "").slice(0, 600)}`);
  return JSON.parse(line);
}

// Measured constants from the live run — the arithmetic below is anchored, not invented.
const DOCS_PUBLISHED = 55;
const CHARS_PER_DOC = 1_565_625 / 36;                     // ≈ 43,490, measured
const CHARS_AT_55 = CHARS_PER_DOC * DOCS_PUBLISHED;       // ≈ 2,391,927

console.log("── ingest ceilings ──");

// 1. DEFAULTS UNCHANGED. Making a constant configurable must not move it — shipping the knob is a
//    separate act from deciding to turn it.
const base = ceilingsUnder({});
ok(`default MAX_DOCS is still 36 (got ${base.docs})`, base.docs === 36);
ok(`default MAX_FULLSOURCE_CHARS is still 1,400,000 (got ${base.chars.toLocaleString()})`, base.chars === 1_400_000);

// 2. BOTH actually override — a knob that does not turn is worse than no knob.
const raised = ceilingsUnder({ AUDIT_MAX_DOCS: "60", AGENTIC_MAX_FULLSOURCE_CHARS: "2600000" });
ok(`AUDIT_MAX_DOCS raises the doc ceiling (got ${raised.docs})`, raised.docs === 60);
ok(`AGENTIC_MAX_FULLSOURCE_CHARS raises the char ceiling (got ${raised.chars.toLocaleString()})`, raised.chars === 2_600_000);

// 3. GARBAGE FAILS SAFE — a typo must never silently uncap ingestion.
for (const bad of ["", "abc", "0", "-5", "12.7", "1e9x", " "]) {
  const g = ceilingsUnder({ AUDIT_MAX_DOCS: bad });
  ok(`AUDIT_MAX_DOCS="${bad}" falls back to 36 (got ${g.docs})`, g.docs === 36);
}

// 4. THE PAIRING INVARIANT — the reason this file exists, asserted as arithmetic rather than left in a
//    comment somebody has to read.
const needed = Math.ceil(raised.docs * CHARS_PER_DOC);
ok(`raising docs to ${raised.docs} ALONE would still truncate (needs ~${needed.toLocaleString()} chars ` +
   `vs default ${base.chars.toLocaleString()}) — the two ceilings must move together`,
  needed > base.chars);
ok(`the raised PAIR admits a full ${DOCS_PUBLISHED}-document pursuit ` +
   `(~${Math.ceil(CHARS_AT_55).toLocaleString()} chars ≤ ${raised.chars.toLocaleString()})`,
  CHARS_AT_55 <= raised.chars && raised.docs >= DOCS_PUBLISHED);

console.log(`\n✓ ${passed}/${passed} passed — ingest ceilings`);
