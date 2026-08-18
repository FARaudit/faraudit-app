import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listBindingDocuments } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools";
const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const all=new Map<string,number>();
for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
  let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
  const fullSource=d?.input?.fullSource; if(!fullSource) continue;
  const ctx:any={fullSource,sections:d?.input?.sections??null,noticeBodyText:d?.input?.noticeBodyText??null};
  for(const n of listBindingDocuments(ctx)) all.set(n,(all.get(n)??0)+1);
}
const names=[...all.keys()].sort();
writeFileSync("/tmp/ua3/docnames.json",JSON.stringify(names,null,1));
console.log(`distinct binding-document names across the corpus: ${names.length}`);
