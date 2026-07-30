import { readFileSync } from "fs";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
console.log("verifierDrops present:", !!rec.result.verifierDrops, "· count:", (rec.result.verifierDrops||[]).length);
for (const d of (rec.result.verifierDrops||[]).slice(0,8)) console.log("  drop:", JSON.stringify(d).slice(0,160));
console.log("\nperLens:", JSON.stringify(rec.result.perLens));
console.log("\ntrace convergence per lens:");
for (const [k,v] of Object.entries(rec.result.trace||{})) console.log(`  ${k}: converged=${(v as any).converged} turns=${(v as any).turns}`);
console.log("\ninputs.verifierSound:", rec.result.inputs.verifierSound);
// D4: is coverageGap still referenced anywhere in the taken path? it only appends to INCOMPLETE reasons (not taken now)
console.log("inputs.coverageGap:", JSON.stringify(rec.result.inputs.coverageGap));
