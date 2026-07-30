import * as fs from "fs";
const cab = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const bar1 = cab.result.findings.find((f:any)=>f.id==="panel:source_selection_evaluator:G6");
console.log("=== cab687da Bar#1 (the bundle) ===");
console.log("requirement:", bar1.requirement);
console.log("excerpt:", bar1.excerpt);
console.log("kind/ctrl:", bar1.kind, bar1.controllability, "curable:", bar1.curableInWindow, "reqAttr:", bar1.requiredAttribute);
console.log("\n=== 40fd02ce findings mentioning licens/accredit/certif/insur ===");
const f40 = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_dl-40fd02ce.json","utf8"));
const src = f40.result.inputs?.findings ?? f40.result.findings ?? [];
for (const f of src) {
  if (/licens|accredit|certif|insur/i.test(`${f.requirement} ${f.excerpt}`)) {
    console.log(`• [${f.kind}/${f.controllability}/cur=${f.curableInWindow}/attr=${f.requiredAttribute??"-"}] "${String(f.requirement).slice(0,95)}"`);
  }
}
