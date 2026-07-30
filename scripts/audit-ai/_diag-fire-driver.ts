import { readFileSync } from "fs";
import { classifyPerformanceUpkeepRecital, classifyBenignRecital, credentialConditionalRecital } from "../../src/lib/audit-gate-v2";
const r = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
const dq = (r.result.inputs?.coverageV2?.disqualifierUncovered)??[];
console.log(`disqualifierUncovered: ${dq.length}\n`);
for (const d of dq) {
  const ob = d.obligation || "";
  console.log(`[§${d.section}] FULL: "${ob}"`);
  console.log(`   upkeep(#576)=${JSON.stringify(classifyPerformanceUpkeepRecital(ob))}  benign(#572)=${classifyBenignRecital(ob)}  credCond(#575b)=${JSON.stringify(credentialConditionalRecital(ob))}`);
  console.log("");
}
