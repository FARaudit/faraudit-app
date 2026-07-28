export {};
import * as fs from "fs"; import * as path from "path";
import { procurementPart } from "../../src/lib/audit-tools";
import { coreMissingFor } from "../../src/lib/audit-orchestrator";
const DIR = path.join(__dirname, "run-records");
const c: Record<string, number> = {}; const nonEmpty: Record<string, number> = {};
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let r: any; try { r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
  const src = r?.input?.fullSource; if (!src) continue;
  const ctx = { fullSource: src } as never;
  const p = procurementPart(ctx); c[p] = (c[p] ?? 0) + 1;
  if (coreMissingFor(ctx).length) nonEmpty[p] = (nonEmpty[p] ?? 0) + 1;
}
console.log("records by procurement part:", JSON.stringify(c));
console.log("of those, coreMissing non-empty:", JSON.stringify(nonEmpty));
