// SECOND AXIS — the shape of the over-cap problem. Uses production listBindingDocuments; reads each doc at a
// cap high enough to see its TRUE length (AGENTIC_DOC_READ_CAP set huge before import), then reports what a
// 40,000-char page size would require. $0, no model calls.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ownerOf } from "./_ownership-map-proposal";
const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const PAGE=40000, CPT=3.82;
(async()=>{
  const { listBindingDocuments, readDocument } = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools");
  const docs:Array<{sol:string;name:string;len:number;owner:string}>=[];
  const seen=new Set<string>();
  for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
    let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
    const fullSource=d?.input?.fullSource; if(!fullSource) continue;
    const sol=d?.meta?.sol??f.slice(0,18);
    const ctx:any={fullSource,sections:d?.input?.sections??null,noticeBodyText:d?.input?.noticeBodyText??null};
    for(const n of listBindingDocuments(ctx)){
      const k=`${sol}::${n}`; if(seen.has(k)) continue; seen.add(k);
      const r=readDocument(ctx,n); if(!r.present) continue;
      docs.push({sol,name:n,len:r.text.length,owner:ownerOf(n).owner});
    }
  }
  const over=docs.filter(d=>d.len>PAGE);
  const pages=(l:number)=>Math.ceil(l/PAGE);
  console.log(`distinct (package, document) pairs: ${docs.length}`);
  console.log(`over the ${PAGE.toLocaleString()}-char cap: ${over.length} (${(100*over.length/docs.length).toFixed(0)}%)\n`);
  const lens=docs.map(d=>d.len).sort((a,b)=>a-b);
  const q=(p:number)=>lens[Math.floor(p*(lens.length-1))];
  console.log(`document length: p50 ${q(.5).toLocaleString()} · p90 ${q(.9).toLocaleString()} · p99 ${q(.99).toLocaleString()} · max ${q(1).toLocaleString()} chars`);
  console.log(`pages needed at ${PAGE.toLocaleString()}: total ${docs.reduce((a,d)=>a+pages(d.len),0)} for ${docs.length} docs`);
  console.log(`  extra pages beyond one-per-doc: ${docs.reduce((a,d)=>a+pages(d.len)-1,0)}`);
  console.log(`  worst single document: ${Math.max(...docs.map(d=>pages(d.len)))} pages\n`);
  console.log("── over-cap documents by OWNER (who pays for paging)");
  const byOwner=new Map<string,{n:number;pages:number;chars:number}>();
  for(const d of over){const e=byOwner.get(d.owner)??{n:0,pages:0,chars:0};e.n++;e.pages+=pages(d.len);e.chars+=d.len;byOwner.set(d.owner,e);}
  for(const [o,e] of [...byOwner].sort((a,b)=>b[1].chars-a[1].chars))
    console.log(`   ${o.padEnd(20)} docs=${String(e.n).padStart(3)}  pages=${String(e.pages).padStart(3)}  ${String(Math.round(e.chars/CPT)).padStart(7)} tok`);
  console.log("\n── the 10 biggest documents in the corpus");
  for(const d of [...docs].sort((a,b)=>b.len-a.len).slice(0,10))
    console.log(`   ${String(Math.round(d.len/CPT)).padStart(6)} tok ${String(pages(d.len)).padStart(2)}pg ${d.owner.slice(0,18).padEnd(19)} ${d.name.slice(0,52)}`);
})();
