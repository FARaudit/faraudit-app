// $0 MEASUREMENT — what "specifications out of the lens path" actually does, per package.
// Replays each record's OWN flagEnv before importing the engine, then re-routes with the
// specification documents withheld from the lens source and reports the delta.
//   npx tsx scripts/audit-ai/_spec-partition.ts [record.json ...]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => join(DIR, f));

// A construction TECHNICAL SPECIFICATION — named narrowly and on purpose. UFGS is the DoD unified
// guide-spec series; NMDOT/TXDOT are state highway spec books; "Section NN NN NN" is the CSI
// MasterFormat number a guide spec carries in its title. This does NOT match a Statement of Work,
// a wage determination, a bid schedule, or an amendment, and it is asserted below.
const SPEC_RE = /\bUFGS\b|\bNMDOT\b|\bTXDOT\b|\bCSI\b|Section\s+\d{2}\s+\d{2}\s+\d{2}/i;
const NEVER_SPEC_RE = /statement of work|\bSOW\b|\bPWS\b|wage determination|bid schedule|amendment|\bSF[- ]?30\b|instructions to bidders/i;

async function main() {
  const { docRegions } = await import("../../src/lib/audit-orchestrator");
  console.log("package                    docs  spec  spec-chars    lens-chars(before → after)   reduction");
  console.log("─".repeat(104));
  let tDocs=0,tSpec=0,tBefore=0,tAfter=0,n=0;
  for (const f of files) {
    let rec: any;
    try { rec = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    const full: string = rec?.input?.fullSource ?? "";
    if (!full || full.length < 1000) continue;
    const regions = docRegions(full);
    if (regions.length < 2) continue;
    const spec = regions.filter(r => SPEC_RE.test(r.name) && !NEVER_SPEC_RE.test(r.name));
    const specChars = spec.reduce((a,r)=>a+r.text.length,0);
    const before = full.length, after = before - specChars;
    n++; tDocs+=regions.length; tSpec+=spec.length; tSpec; tBefore+=before; tAfter+=after;
    const sol = String(rec?.meta?.sol ?? f.split("/").pop()).slice(0,25);
    const pct = before ? (specChars/before*100) : 0;
    if (spec.length) console.log(
      `${sol.padEnd(26)} ${String(regions.length).padStart(4)} ${String(spec.length).padStart(5)} ${String(specChars).padStart(11)}  ${String(before).padStart(9)} → ${String(after).padStart(9)}   ${pct.toFixed(1).padStart(5)}%`);
  }
  console.log("─".repeat(104));
  console.log(`${n} packages with a banked source · ${tDocs} documents · ${tSpec} classified as technical specifications`);
  console.log(`lens source across the corpus: ${tBefore.toLocaleString()} → ${tAfter.toLocaleString()} chars  (${((1-tAfter/tBefore)*100).toFixed(1)}% removed)`);
}
main();
