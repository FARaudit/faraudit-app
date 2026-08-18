// Sensitivity: does ANY value of AGENTIC_DOC_READ_CAP make the existing mandate armable?
// Truncation forces INCOMPLETE; raising the cap cures truncation but inflates the pre-inject 1:1.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const CPT=3.82;
(async () => {
  const { listBindingDocuments, readDocument, DOC_READ_CAP } = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools");
  const rows:any[]=[];
  for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
    let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
    const fullSource=d?.input?.fullSource; if(!fullSource) continue;
    const ctx:any={fullSource,sections:d?.input?.sections??null,noticeBodyText:d?.input?.noticeBodyText??null};
    let inject=0,trunc=0,docs=0;
    for(const n of listBindingDocuments(ctx)){ const r=readDocument(ctx,n); if(!r.present) continue; docs++; inject+=r.text.length; if(r.truncated) trunc++; }
    if(docs) rows.push({sol:d?.meta?.sol??f,docs,inject,trunc});
  }
  const anyTrunc=rows.filter(r=>r.trunc>0).length;
  const injs=rows.map(r=>r.inject).sort((a,b)=>a-b);
  const p50=injs[Math.floor(injs.length/2)], mx=injs[injs.length-1];
  console.log(`cap=${String(DOC_READ_CAP).padStart(8)}  pkgsForcedIncomplete=${String(anyTrunc).padStart(2)}/${rows.length}  truncDocs=${String(rows.reduce((a,r)=>a+r.trunc,0)).padStart(3)}  inject p50=${String(Math.round(p50/CPT)).padStart(7)}tok max=${String(Math.round(mx/CPT)).padStart(7)}tok`);
})();
