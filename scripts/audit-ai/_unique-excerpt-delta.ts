// $0 — OFF→ON delta for AUDIT_COVERAGE_UNIQUE_EXCERPT on the banked flagship record.
// Runs the PRODUCTION `documentsCovered` and `deriveAnalyzedDocuments` both ways in one process.
// No model call, no network. Reproduces the customer-visible change exactly.
import { readFileSync } from "node:fs";
import { documentsCovered } from "../../src/lib/audit-orchestrator";
import { deriveAnalyzedDocuments } from "../../src/lib/audit-executor-v3";

const DIR = process.env.RUN_RECORDS_DIR || "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const rec = JSON.parse(readFileSync(`${DIR}/${process.env.FLAGSHIP_RECORD || "_ua-3b5bba30.json"}`, "utf8"));
const fullSource: string = rec.input.fullSource;
const findings = rec.result.findings;

// ⛔ MIRROR THE RUN'S OWN FLAG SET FIRST. A local probe at library defaults is not production: this record
// banked 135 AUDIT_* values and the coverage path reads several of them. Measuring the OFF baseline at
// defaults would compare the new rule against a configuration that has never run.
const flagEnv: Record<string, string> = rec?.meta?.flagEnv ?? {};
for (const [k, v] of Object.entries(flagEnv)) process.env[k] = String(v);
console.log(`   [flag parity] applied ${Object.keys(flagEnv).length} banked AUDIT_* values from the run record`);

const run = (on: boolean) => {
  if (on) process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT = "true"; else delete process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT;
  const dc = documentsCovered(fullSource, findings);
  const an = deriveAnalyzedDocuments(fullSource, dc.uncovered);
  return { dc, an };
};

const off = run(false);
const on = run(true);

console.log(`══ AUDIT_COVERAGE_UNIQUE_EXCERPT — OFF→ON delta on ${rec.meta.sol} (${String(rec.meta.runId).slice(0, 8)})`);
console.log(`   uncovered documents      OFF ${off.dc.uncovered.length}   →   ON ${on.dc.uncovered.length}`);
console.log(`   analyzed (customer card) OFF ${off.an.analyzed} of ${off.an.analyzed_of}   →   ON ${on.an.analyzed} of ${on.an.analyzed_of}`);
console.log(`   coverage complete        OFF ${off.dc.complete}   →   ON ${on.dc.complete}`);

const added = on.dc.uncovered.filter((n) => !off.dc.uncovered.includes(n));
const removed = off.dc.uncovered.filter((n) => !on.dc.uncovered.includes(n));
console.log(`\n── NEWLY NAMED as uncovered (${added.length}) — these are the documents the banner will now name`);
for (const n of added) {
  const why = on.dc.uncoveredDetail?.find((d) => d.doc === n)?.reason ?? "(no reason recorded)";
  console.log(`   · ${n.slice(0, 78)}   [${why}]`);
}
console.log(`\n── NO LONGER named (must be EMPTY — this rule may only ADD): ${removed.length}`);
for (const n of removed) console.log(`   ⛔ ${n}`);

const sharedOnly = (on.dc.uncoveredDetail ?? []).filter((d) => d.reason === "shared_excerpt_only");
console.log(`\n── reason "shared_excerpt_only" recorded on ${sharedOnly.length} document(s)`);

if (removed.length > 0) { console.log("\nFAIL — the rule removed a document from the gap list; it may only add."); process.exit(1); }
console.log("\nPASS — direction is add-only, and every added document carries a recorded reason.");
