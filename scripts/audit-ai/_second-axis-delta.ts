// The delta, measured through the PRODUCTION documentsCovered — no reimplementation of obligationsOf.
// findings=[] isolates the ATTESTATION path, which is exactly the path truncation blocks.
//   TODAY    : docsRead = only the docs a capped read returns !truncated for (what audit-expert.ts:151 records)
//   PROPOSED : docsRead = every readable doc (readability proven over full region text, no tool cap)
// attestations = every binding doc in both legs, so the ONLY variable is the truncation gate.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR = "true";   // armed on the live worker
(async () => {
  const { docRegions, documentsCovered } = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-orchestrator");
  const { hasEngineText, isBindingDoc } = await import("/Users/josearodriguezjr./faraudit-app/src/lib/sam-attachments");
  const { readDocument } = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools");
  const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
  let pkgs=0, todayIncomplete=0, propIncomplete=0, changed=0;
  let todayUnc=0, propUnc=0;
  const examples:string[]=[];
  for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
    let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
    const fullSource=d?.input?.fullSource; if(!fullSource) continue;
    const ctx:any={fullSource,sections:null,noticeBodyText:d?.input?.noticeBodyText??null};
    const binding=docRegions(fullSource).filter(r=>!r.isPrimary && isBindingDoc({role:"attachment",name:r.name}));
    if(!binding.length) continue;
    pkgs++;
    const all=binding.map(r=>r.name);
    const notTruncated=binding.filter(r=>{const x=readDocument(ctx,r.name); return x.present && !x.truncated;}).map(r=>r.name);
    const readable=binding.filter(r=>hasEngineText(r.text)).map(r=>r.name);
    const today=documentsCovered(fullSource, [] as never, {docsRead:notTruncated, attestations:all});
    const prop =documentsCovered(fullSource, [] as never, {docsRead:readable,     attestations:all});
    todayUnc+=today.uncovered.length; propUnc+=prop.uncovered.length;
    if(!today.complete) todayIncomplete++;
    if(!prop.complete) propIncomplete++;
    if(today.uncovered.length!==prop.uncovered.length){
      changed++;
      if(examples.length<6) examples.push(`${(d?.meta?.sol??f).slice(0,22).padEnd(24)} uncovered ${today.uncovered.length} -> ${prop.uncovered.length}`);
    }
  }
  console.log(`packages with binding attachments: ${pkgs}\n`);
  console.log(`── ATTESTATION PATH ONLY (findings=[]), production documentsCovered`);
  console.log(`   INCOMPLETE today (docsRead gated on !truncated) : ${todayIncomplete} of ${pkgs}`);
  console.log(`   INCOMPLETE proposed (docsRead = readable)       : ${propIncomplete} of ${pkgs}`);
  console.log(`   total uncovered documents  ${todayUnc}  ->  ${propUnc}   (delta ${propUnc-todayUnc})`);
  console.log(`   packages whose uncovered COUNT changes          : ${changed}`);
  if(examples.length){console.log(`\n   examples:`);for(const e of examples)console.log(`     ${e}`);}
})();
