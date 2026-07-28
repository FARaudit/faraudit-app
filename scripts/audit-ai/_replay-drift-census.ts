// How faithful is replay, as ONE number per axis? The harness prints drift per record; nobody totals it, so
// "the corpus replays faithfully" has never had a figure attached to it.
export {};
import * as fs from "fs"; import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA } from "../../src/lib/audit-run-record";
const DIR = path.join(__dirname, "run-records");
const axis: Record<string, number> = {}; let n = 0, clean = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let r: any; try { r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
  if (r?.schema !== RUN_RECORD_SCHEMA) continue;
  let res: any; try { res = replayRunRecord(r); } catch { continue; }
  n++;
  const d: string[] = res.drift ?? [];
  if (!d.length) { clean++; continue; }
  for (const line of d) { const k = String(line).split(":")[0].trim(); axis[k] = (axis[k] ?? 0) + 1; }
}
console.log(`records replayed: ${n} · drift-free: ${clean} (${Math.round((clean / n) * 100)}%)`);
console.log("drift by axis:", JSON.stringify(axis, null, 0));
console.log(clean === n ? "✅ replay reproduces every banked record"
  : `⚠️  ${n - clean} record(s) do not reproduce — replay-based greens are bounded by this`);
