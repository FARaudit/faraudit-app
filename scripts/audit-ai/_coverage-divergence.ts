export {};
import * as fs from "fs"; import * as path from "path";
import { procurementPart, detectFormat } from "../../src/lib/audit-tools";
import { coreMissingFor, buildManifest } from "../../src/lib/audit-orchestrator";
const DIR = path.join(__dirname, "run-records");
let n = 0, div = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let r: any; try { r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
  const src = r?.input?.fullSource, bankedCore = r?.result?.coverage?.coreMissing;
  if (!src || !Array.isArray(bankedCore)) continue;
  n++;
  const ctx = { fullSource: src } as never;
  const replayCore = coreMissingFor(ctx);
  const same = JSON.stringify([...replayCore].sort()) === JSON.stringify([...bankedCore].sort());
  if (same) continue;
  div++;
  if (div <= 6) console.log(`DIVERGES ${f.slice(0, 46)}\n   part=${procurementPart(ctx)} format=${detectFormat(ctx)} manifest=${JSON.stringify(buildManifest(ctx))}\n   banked coreMissing=${JSON.stringify(bankedCore)}  replay=${JSON.stringify(replayCore)}`);
}
console.log(`\nrecords compared ${n} · coreMissing DIVERGES on ${div}`);
console.log(div === 0 ? "✅ replay reproduces banked coreMissing everywhere" : "⚠️  replay cannot reproduce the run's own coverage on these");
