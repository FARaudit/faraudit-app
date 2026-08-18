// Size the batched extraction on the REAL corpus using the PRODUCTION chunker (chunkForMap) over the
// documents that actually need analysis. $0, no model calls — this measures the JOB, it does not run it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { docRegions } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-orchestrator";
import { hasEngineText, isBindingDoc } from "/Users/josearodriguezjr./faraudit-app/src/lib/sam-attachments";
import { chunkForMap } from "/Users/josearodriguezjr./faraudit-app/src/lib/agentic-map";
const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const CPT=3.82;
// verified list prices (the repo's own table is 3x high on opus; these are the real rates)
const PRICE={haiku:{in:1,out:5},sonnet:{in:3,out:15}};
const OUT_TOK=1200;            // a schema-constrained DocExtract is small and bounded
const BATCH_DISCOUNT=0.5;      // Batch API list discount

let pkgs=0; const perPkg:Array<{sol:string;docs:number;chunks:number;inTok:number}>=[];
for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
  let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
  const fullSource=d?.input?.fullSource; if(!fullSource) continue;
  pkgs++;
  let docs=0,chunks=0,inTok=0;
  for (const r of docRegions(fullSource)) {
    if (r.isPrimary || !isBindingDoc({role:"attachment",name:r.name})) continue;
    if (!hasEngineText(r.text)) continue;          // unreadable → honest INCOMPLETE, not an extraction target
    docs++;
    const cs=chunkForMap(r.text);
    chunks+=cs.length;
    inTok+=Math.round(cs.reduce((a,c)=>a+c.length,0)/CPT);
  }
  if(docs) perPkg.push({sol:d?.meta?.sol??f.slice(0,18),docs,chunks,inTok});
}
const med=(x:number[])=>{const s=[...x].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const cost=(inTok:number,chunks:number,m:"haiku"|"sonnet",batched:boolean)=>{
  const p=PRICE[m], mult=batched?BATCH_DISCOUNT:1;
  return ((inTok/1e6)*p.in + (chunks*OUT_TOK/1e6)*p.out)*mult;
};
console.log(`packages with readable binding attachments: ${perPkg.length} of ${pkgs}\n`);
console.log(`── THE JOB (production chunkForMap over every readable binding document)`);
console.log(`   documents per package : p50 ${med(perPkg.map(p=>p.docs))} · max ${Math.max(...perPkg.map(p=>p.docs))}`);
console.log(`   CHUNKS per package    : p50 ${med(perPkg.map(p=>p.chunks))} · max ${Math.max(...perPkg.map(p=>p.chunks))}`);
console.log(`   input tokens/package  : p50 ${med(perPkg.map(p=>p.inTok)).toLocaleString()} · max ${Math.max(...perPkg.map(p=>p.inTok)).toLocaleString()}\n`);
console.log(`── COST PER PACKAGE (input + ${OUT_TOK} out/chunk; real list prices haiku $1/$5, sonnet $3/$15)`);
for (const [label,m] of [["haiku","haiku"],["sonnet","sonnet"]] as const) {
  const p50=cost(med(perPkg.map(x=>x.inTok)),med(perPkg.map(x=>x.chunks)),m,false);
  const p50b=cost(med(perPkg.map(x=>x.inTok)),med(perPkg.map(x=>x.chunks)),m,true);
  const mx=cost(Math.max(...perPkg.map(x=>x.inTok)),Math.max(...perPkg.map(x=>x.chunks)),m,false);
  const mxb=cost(Math.max(...perPkg.map(x=>x.inTok)),Math.max(...perPkg.map(x=>x.chunks)),m,true);
  console.log(`   ${label.padEnd(7)} p50 $${p50.toFixed(2)} (batched $${p50b.toFixed(2)})   max $${mx.toFixed(2)} (batched $${mxb.toFixed(2)})`);
}
const flag=perPkg.find(p=>p.sol.startsWith("W911SG"));
if(flag) console.log(`\n   flagship W911SG27BA002: ${flag.docs} docs · ${flag.chunks} chunks · ${flag.inTok.toLocaleString()} in-tok`
  + `\n     haiku batched $${cost(flag.inTok,flag.chunks,"haiku",true).toFixed(2)} · sonnet batched $${cost(flag.inTok,flag.chunks,"sonnet",true).toFixed(2)}   (today's whole run: $11.96)`);
