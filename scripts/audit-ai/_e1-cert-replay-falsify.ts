// Can _e1-cert-replay-corpus.ts go RED? Applying the rule that the E2 corpus cert violated: a green cert is
// evidence only once you have made it fail on purpose. That one compared `.verdict`/`.coverage`, which do not
// exist on ReplayResult, so both sides were undefined and GREEN was unconditional.
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";

const DIR = path.join(__dirname, "run-records");
let checked = 0, detectable = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"))) {
  let rec: RunRecord;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")); if (rec?.schema !== RUN_RECORD_SCHEMA) continue; } catch { continue; }
  if (!rec.input?.fullSource || !rec.result?.findings?.length) continue;
  checked++;
  const before = JSON.parse(JSON.stringify(rec)) as RunRecord;
  const after = JSON.parse(JSON.stringify(rec)) as RunRecord;
  // MUTATE: drop every finding. Coverage must collapse; the cert's comparators must see it.
  (after.result as { findings: unknown[] }).findings = [];
  const a = replayRunRecord(before), b = replayRunRecord(after);
  const set = (xs: string[]) => [...xs].sort().join(",");
  const moved = set(a.missing) !== set(b.missing) || set(a.coreMissing) !== set(b.coreMissing) || a.replayVerdict !== b.replayVerdict;
  if (moved) detectable++;
  if (checked <= 3) console.log(`  ${file.slice(0, 26)} verdict ${a.replayVerdict}→${b.replayVerdict} · missing ${set(a.missing) !== set(b.missing)}`);
}
console.log(`\nrecords ${checked} · mutation DETECTED on ${detectable}`);
// Also assert the properties are real, which is precisely what the E2 cert got wrong.
const probe = replayRunRecord(JSON.parse(fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).find((f) => f.endsWith(".run-record.json"))!), "utf8")));
console.log(`replayVerdict is a real property: ${typeof probe.replayVerdict === "string"}`);
console.log(`missing is a real property:       ${Array.isArray(probe.missing)}`);
console.log(`("verdict"/"coverage" — what the E2 cert read — exist? ${"verdict" in probe} / ${"coverage" in probe})`);
console.log(detectable > 0 && typeof probe.replayVerdict === "string"
  ? "\n✅ FALSIFIABLE — the E1 corpus cert detects induced drift; its green is evidence"
  : "\n❌ PLACEBO");
process.exit(detectable > 0 ? 0 : 1);
