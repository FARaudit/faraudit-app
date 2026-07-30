// SHADOW MEASUREMENT — set-aside backstop (move-4 part B, Brain #668 → #677) on the REAL run-record corpus.
// Replays every banked record twice through the CURRENT engine — AUDIT_SETASIDE_BACKSTOP off vs on — and reports
// every verdict DELTA. Part A (the prose possession floor) was RETIRED by Brain's Q3 ruling (card #677) and is
// deleted; this script therefore measures the set-aside branch ONLY. See ceo/GRAVEYARD-HARDBAR-PART-A.md.
//   npx tsx scripts/audit-ai/_shadow-setaside-backstop-corpus.ts [--hits] [--sol=FA8137]
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { deriveSetAsideBackstop } from "../../src/lib/audit-setaside-backstop";
import { emitSetAsideNoticeFindings } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

const DIR = path.join(__dirname, "run-records");
const argSol = (process.argv.find((a) => a.startsWith("--sol=")) || "").split("=")[1];
const showHits = process.argv.includes("--hits");

const recs: Array<{ file: string; rec: RunRecord }> = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".run-record.json"))) {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (rec?.schema !== RUN_RECORD_SCHEMA) continue;
    if (argSol && !(rec.meta?.sol || f).includes(argSol)) continue;
    recs.push({ file: f, rec });
  } catch { /* skip */ }
}

// Faithful replay under the record's own flag env, then overlay ONLY the backstop flag (mirrors _replay-harness).
const applyFlagEnv = (flagEnv: Record<string, string> | undefined, backstop: boolean) => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) { saved[k] = process.env[k]; delete process.env[k]; }
  if (flagEnv) for (const [k, v] of Object.entries(flagEnv)) process.env[k] = v;
  process.env.AUDIT_SETASIDE_BACKSTOP = backstop ? "true" : "false";
  return () => { for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k]; for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; };
};

let deltas = 0, committalsOff = 0, fired = 0;
const byClass: Record<string, number> = {};
const capTally: Record<string, number> = {};
const rows: string[] = [];

for (const { file, rec } of recs) {
  const sol = (rec.meta?.sol || file).slice(0, 24);
  let off, on;
  { const restore = applyFlagEnv(rec.meta?.flagEnv, false); try { off = replayRunRecord(rec); } catch { restore(); continue; } restore(); }
  { const restore = applyFlagEnv(rec.meta?.flagEnv, true); try { on = replayRunRecord(rec); } catch { restore(); continue; } restore(); }

  const committal = off.replayVerdict === "BID" || off.replayVerdict === "BID_WITH_CAUTION";
  if (committal) committalsOff++;

  // What the backstop SAW on this record (independent of whether a committal exit was reached).
  const restore = applyFlagEnv(rec.meta?.flagEnv, true);
  let floor = null;
  try {
    floor = deriveSetAsideBackstop(
      (rec.result.inputs.findings as TypedFinding[]).map((f) => ({ f, disposition: "gate_to_clear" as never })),
      emitSetAsideNoticeFindings(rec.input.fullSource),
    );
  } catch { /* ignore */ }
  restore();
  if (floor) {
    fired++;
    capTally[floor.cap] = (capTally[floor.cap] || 0) + 1;
    for (const h of floor.hits) byClass[h.cls] = (byClass[h.cls] || 0) + 1;
  }

  if (off.replayVerdict !== on.replayVerdict) {
    deltas++;
    rows.push(`  Δ ${sol.padEnd(26)} ${off.replayVerdict} → ${on.replayVerdict}`);
    if (floor) for (const h of floor.hits) rows.push(`        [${h.cls}/${floor.cap}] "${h.sentence.slice(0, 150).replace(/\s+/g, " ")}"`);
  } else if (showHits && floor) {
    rows.push(`  · ${sol.padEnd(26)} ${off.replayVerdict} (no delta; backstop saw ${floor.hits.length} hit(s) at a non-committal exit)`);
    for (const h of floor.hits) rows.push(`        [${h.cls}/${floor.cap}] "${h.sentence.slice(0, 150).replace(/\s+/g, " ")}"`);
  }
}

console.log(`\n===== SET-ASIDE BACKSTOP — SHADOW MEASUREMENT (real run-record corpus) =====`);
console.log(`records replayed:            ${recs.length}`);
console.log(`committal verdicts flag-OFF: ${committalsOff}  (the only exits the backstop can cap)`);
console.log(`records where the backstop FIRED at all: ${fired}/${recs.length}  caps=${JSON.stringify(capTally)}`);
console.log(`hits by class: ${JSON.stringify(byClass)}`);
console.log(`\nVERDICT DELTAS (flag-OFF → flag-ON): ${deltas}`);
if (rows.length) console.log(rows.join("\n"));
console.log(`\nGATE: every delta above must be HAND-LABELED. An over-fire (a genuinely biddable package capped) is a P0.`);
console.log(`NOTE (card #677): this unit is NOT the false-BID backstop. Veto retirement is gated on MEASURED`);
console.log(`false-BID = 0 on the v2 obligation ledger at retirement time — never on this unit's existence.`);
