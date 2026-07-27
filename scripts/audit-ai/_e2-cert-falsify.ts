// Can _e2-cert-corpus.ts go RED now? The version it replaced could not, and I quoted its green anyway.
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
const DIR = path.join(__dirname, "run-records");
let checked = 0, detected = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"))) {
  let rec: RunRecord;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")); if (rec?.schema !== RUN_RECORD_SCHEMA) continue; } catch { continue; }
  if (!rec.input?.fullSource || !rec.result?.findings?.length) continue;
  checked++;
  const a = replayRunRecord(JSON.parse(JSON.stringify(rec)));
  const mut = JSON.parse(JSON.stringify(rec)) as RunRecord;
  (mut.result as { findings: unknown[] }).findings = [];   // induce real drift
  const b = replayRunRecord(mut);
  const set = (xs: string[]) => [...xs].sort().join(",");
  if (a.replayVerdict !== b.replayVerdict || set(a.missing) !== set(b.missing) || set(a.coreMissing) !== set(b.coreMissing)) detected++;
}
const probe = replayRunRecord(JSON.parse(fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).find((f) => f.endsWith(".run-record.json"))!), "utf8")));
console.log(`records ${checked} · induced drift DETECTED on ${detected}`);
console.log(`the OLD comparators ("verdict"/"coverage") exist on ReplayResult? ${"verdict" in probe} / ${"coverage" in probe}  ← both false = why the old cert could not fail`);
console.log(`the NEW comparators exist? replayVerdict=${typeof probe.replayVerdict === "string"} missing=${Array.isArray(probe.missing)} coreMissing=${Array.isArray(probe.coreMissing)}`);
console.log(detected > 0 ? "\n✅ FALSIFIABLE — the E2 corpus cert now detects drift" : "\n❌ STILL A PLACEBO");
process.exit(detected > 0 ? 0 : 1);
