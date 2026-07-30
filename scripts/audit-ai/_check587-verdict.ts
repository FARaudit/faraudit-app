import { readFileSync } from "fs";
import { replayCoverageStage } from "../../src/lib/audit-run-record";
import { hasBarSignal } from "../../src/lib/audit-gate-v2";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
process.env.AUDIT_GATE_V2="true"; process.env.AUDIT_PERFORMANCE_UPKEEP_CAVEAT="true";
process.env.AUDIT_RECITAL_LINEWRAP_BRIDGE="true"; process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION="true";
const r = replayCoverageStage(rec);
console.log("post-#587 coverageV2: caveatRecital=",r.caveatRecital,"disqualifierUncovered=",r.disqualifierUncovered,"nonBarSignal=",r.ungroundedNonBarSignal);
console.log("\nremaining disqualifierUncovered drivers (what still forces NHR):");
for (const d of (r.coverageV2.disqualifierUncovered??[])) {
  console.log(`  [§${d.section}] "${(d.obligation||"").slice(0,110)}"  hasBarSignal=${hasBarSignal(d.obligation||"")}`);
}
