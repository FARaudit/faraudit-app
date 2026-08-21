// $0 MEASUREMENT — what "specifications out of the lens path" does, using the PRODUCTION classifier
// (src/lib/audit-doc-purpose.ts) and the PRODUCTION region parser and router. No model call, no network.
//
// Replays each record's OWN flagEnv before importing the engine: a probe at library defaults routes
// fallback:WHOLE-SOURCE and measures a configuration that never ran.
//   npx tsx scripts/audit-ai/_spec-partition.ts [record.json ...]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => join(DIR, f));

async function main() {
  let totW = 0, totD = 0, pkgs = 0, touched = 0;
  console.log("package                 docs  withheld   withheld-chars   busiest lens (before → after)");
  console.log("─".repeat(96));
  for (const f of files) {
    let rec: Record<string, any>;
    try { rec = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    const full: string = rec?.input?.fullSource ?? "";
    if (!full || full.length < 1000) continue;
    for (const [k, v] of Object.entries(rec?.meta?.flagEnv ?? {})) process.env[k] = String(v);

    const { docRegions } = await import("../../src/lib/audit-orchestrator");
    const { partitionLensSource } = await import("../../src/lib/audit-doc-purpose");
    const { buildPanelInputs } = await import("../../src/lib/panel-adapter");

    const regions = docRegions(full);
    if (regions.length < 2) continue;
    pkgs++;
    const part = partitionLensSource(full, docRegions);
    totD += regions.length; totW += part.withheld.length;

    const busiest = (src: string) => {
      const st = (buildPanelInputs(src).sectionText ?? {}) as Record<string, string>;
      return Math.max(0, ...Object.values(st).map((v) => (v ?? "").length));
    };
    const before = busiest(full);
    const after = part.withheld.length ? busiest(part.lensSource) : before;
    if (part.withheld.length) {
      touched++;
      const sol = String(rec?.meta?.sol ?? f.split("/").pop()).slice(0, 22);
      console.log(`${sol.padEnd(23)} ${String(regions.length).padStart(4)} ${String(part.withheld.length).padStart(9)} ${String(part.withheldChars).padStart(16)}   ${String(before).padStart(9)} → ${String(after).padStart(9)}  ${before ? ((1 - after / before) * 100).toFixed(1).padStart(5) : "  -  "}%`);
    }
  }
  console.log("─".repeat(96));
  console.log(`${pkgs} packages measured · ${totD} documents · ${totW} withheld · ${touched} package(s) affected`);
}
main();
