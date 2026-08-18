// Measure the ownership map on the REAL corpus: classification coverage, residue size, and — the test that
// actually matters — per-lens CHAR LOAD on the worst packages. Ownership only helps if it DIVIDES the load.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listBindingDocuments, readDocument } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools";
import { ownerOf, type Owner } from "./_ownership-map-proposal";
const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const CPT=3.82;
const LENSES:Owner[]=["capture_strategist","contracts_attorney","pricing_analyst","former_ko","proposal_manager","RESIDUE"];

const names:string[]=JSON.parse(readFileSync("/tmp/ua3/docnames.json"  // regenerate with _ownership-map-docnames.ts,"utf8"));
const byOwner=new Map<Owner,string[]>();
for(const n of names){const {owner}=ownerOf(n); if(!byOwner.has(owner))byOwner.set(owner,[]); byOwner.get(owner)!.push(n);}
console.log(`── CLASSIFICATION over the ${names.length} distinct observed names`);
for(const L of LENSES){const v=byOwner.get(L)??[];console.log(`   ${String(v.length).padStart(3)}  ${L}`);}
const res=byOwner.get("RESIDUE")??[];
console.log(`   residue rate: ${(100*res.length/names.length).toFixed(0)}%\n`);
console.log(`   RESIDUE — the names no observed shape matched:`);
for(const n of res) console.log(`     · ${n.slice(0,86)}`);

// Per-package load
type Row={sol:string;docs:number;load:Record<string,number>;total:number};
const rows:Row[]=[];
for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
  let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
  const fullSource=d?.input?.fullSource; if(!fullSource) continue;
  const ctx:any={fullSource,sections:d?.input?.sections??null,noticeBodyText:d?.input?.noticeBodyText??null};
  const load:Record<string,number>={}; let total=0,docs=0;
  for(const n of listBindingDocuments(ctx)){
    const r=readDocument(ctx,n); if(!r.present) continue;
    docs++; const {owner}=ownerOf(n);
    load[owner]=(load[owner]??0)+r.text.length; total+=r.text.length;
  }
  if(docs) rows.push({sol:d?.meta?.sol??f.slice(0,18),docs,load,total});
}
console.log(`\n── PER-LENS LOAD after ownership (chars→tokens @${CPT}), worst packages by total`);
console.log(`   ${"package".padEnd(20)} ${"docs".padStart(4)} ${"TODAY".padStart(8)}  ${LENSES.map(l=>l.slice(0,7).padStart(7)).join(" ")}   ${"MAXLENS".padStart(8)}`);
for(const r of [...rows].sort((a,b)=>b.total-a.total).slice(0,8)){
  const cells=LENSES.map(l=>String(Math.round((r.load[l]??0)/CPT)).padStart(7)).join(" ");
  const maxLens=Math.max(...LENSES.map(l=>(r.load[l]??0)));
  console.log(`   ${r.sol.slice(0,20).padEnd(20)} ${String(r.docs).padStart(4)} ${String(Math.round(r.total/CPT)).padStart(8)}  ${cells}   ${String(Math.round(maxLens/CPT)).padStart(8)}`);
}
const worst=rows.map(r=>Math.max(...LENSES.map(l=>(r.load[l]??0))));
const tot=rows.map(r=>r.total);
const med=(x:number[])=>{const s=[...x].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
console.log(`\n   busiest single lens : p50 ${Math.round(med(worst)/CPT).toLocaleString()} tok · max ${Math.round(Math.max(...worst)/CPT).toLocaleString()} tok`);
console.log(`   vs one-lens-gets-all: p50 ${Math.round(med(tot)/CPT).toLocaleString()} tok · max ${Math.round(Math.max(...tot)/CPT).toLocaleString()} tok`);
console.log(`   packages where the busiest lens still exceeds 200k tok: ${worst.filter(w=>w/CPT>200_000).length} of ${rows.length}`);
