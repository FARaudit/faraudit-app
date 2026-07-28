// ARC #747 · E1 — CERT: replay the head-side re-grounding over the WHOLE banked run-record corpus. $0.
//
// The DRY measured prevalence on 5 stored audits. This is the stronger question, and the one that decides
// whether the change is safe to arm: when a quote gets longer, does anything DOWNSTREAM move?
//
// A repaired excerpt is not inert. `completenessOf` reads finding excerpts to decide covered_direct; coverage
// feeds `deriveVerdict`. So a pass that only ever ADDS true context could still, in principle, flip a section
// from MISSING to COVERED and a verdict with it. That would not be a cosmetic change — it would be E1 quietly
// moving the answer. This measures exactly that, on 49 real banked runs, before any spend.
//
// METHOD: for each run record, take the recorded findings and source, run the SHIPPED pass with the flag ON,
// and re-derive coverage + verdict through `replayRunRecord` both ways. Report every delta. Nothing is
// written; no model is called; no flag is armed anywhere.
//
// HONEST LIMIT: `replayRunRecord` re-derives coverage and verdict from banked findings — it does not re-run
// the model or the render. So this certifies the deterministic post-model path, which is where E1 lives. It
// does not tell us what a live model would emit next time.
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { repairHeadClippedExcerpts } from "../../src/lib/audit-excerpt-repair";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));

const applyFlagEnv = (flagEnv?: Record<string, string>) => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) { saved[k] = process.env[k]; delete process.env[k]; }
  if (flagEnv) for (const [k, v] of Object.entries(flagEnv)) process.env[k] = v;
  return () => {
    for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  };
};

let loaded = 0, skipped = 0, touched = 0, excerptsChanged = 0, verdictDeltas = 0, coverageDeltas = 0;
const details: string[] = [];

for (const f of files) {
  let rec: RunRecord;
  try {
    rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (rec?.schema !== RUN_RECORD_SCHEMA) { skipped++; continue; }
  } catch { skipped++; continue; }
  if (!rec.input?.fullSource || !rec.result?.findings?.length) { skipped++; continue; }
  loaded++;

  const before = JSON.parse(JSON.stringify(rec)) as RunRecord;
  const after = JSON.parse(JSON.stringify(rec)) as RunRecord;

  // BEFORE — replay under the record's own flag environment, exactly as the harness does.
  let restore = applyFlagEnv(rec.meta?.flagEnv);
  const rBefore = replayRunRecord(before);
  restore();

  // AFTER — same flag environment PLUS the E1 flag, with the pass applied to the findings first.
  restore = applyFlagEnv({ ...(rec.meta?.flagEnv ?? {}), AUDIT_EXCERPT_HEAD_REGROUND: "true" });
  const res = repairHeadClippedExcerpts(after.result.findings, after.input.fullSource);
  const rAfter = replayRunRecord(after);
  restore();

  if (res.repaired) { touched++; excerptsChanged += res.repaired; }

  const set = (xs: string[]) => [...xs].sort().join(",");
  const covMoved = set(rBefore.missing) !== set(rAfter.missing) || set(rBefore.coreMissing) !== set(rAfter.coreMissing);
  const verdictMoved = rBefore.replayVerdict !== rAfter.replayVerdict;
  if (covMoved) coverageDeltas++;
  if (verdictMoved) verdictDeltas++;
  if (covMoved || verdictMoved) {
    details.push(`  ⚠ ${rec.meta?.sol ?? f}\n     verdict: ${rBefore.replayVerdict} → ${rAfter.replayVerdict}\n     missing: [${set(rBefore.missing)}] → [${set(rAfter.missing)}]\n     coreMissing: [${set(rBefore.coreMissing)}] → [${set(rAfter.coreMissing)}]`);
  } else if (res.repaired) {
    details.push(`  ✓ ${rec.meta?.sol ?? f} — ${res.repaired} excerpt(s) re-grounded, verdict ${rAfter.replayVerdict} and coverage unchanged`);
  }
}

console.log(`\nARC #747 · E1 CERT — replay over banked run records ($0, nothing written)\n`);
console.log(`  records loaded ......................... ${loaded}   (skipped ${skipped}: wrong schema or no source/findings)`);
console.log(`  records with a re-grounded excerpt ..... ${touched}`);
console.log(`  excerpts re-grounded (total) ........... ${excerptsChanged}`);
console.log(`  records whose COVERAGE moved ........... ${coverageDeltas}`);
console.log(`  records whose VERDICT moved ............ ${verdictDeltas}`);
console.log(`\n── per record ──`);
for (const d of details) console.log(d);
const clean = verdictDeltas === 0 && coverageDeltas === 0;
console.log(`\nRESULT: ${clean ? "CLEAN — E1 lengthens quotes without moving a single verdict or coverage grade" : "NOT CLEAN — E1 moves downstream state; each delta above must be adjudicated before arming"}`);
console.log(`(If zero excerpts were re-grounded, this cert proves nothing — check the touched count above before reading the result.)\n`);
process.exit(clean ? 0 : 1);
