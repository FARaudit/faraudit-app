import { readFileSync } from "node:fs";
import { docRegions } from "../../src/lib/audit-orchestrator";
import { ownerOf } from "../../src/lib/audit-doc-ownership";
const rec = JSON.parse(readFileSync("/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records/_ua-3b5bba30.json","utf8"));
const regions = docRegions(rec.input.fullSource).filter(r=>r.name!=="SAM Notice Body");
const byWhy = new Map<string, {n:number; chars:number}>();
for (const r of regions) { const {why}=ownerOf(r.name); const e=byWhy.get(why)??{n:0,chars:0}; e.n++; e.chars+=r.text.length; byWhy.set(why,e); }
console.log(`${regions.length} posted documents, grouped by the ownership rule that claimed them:`);
for (const [why,e] of [...byWhy.entries()].sort((a,b)=>b[1].chars-a[1].chars))
  console.log(`   ${String(e.n).padStart(3)} docs  ${String(Math.round(e.chars/3.82)).padStart(8)} tok  ${why.slice(0,60)}`);
