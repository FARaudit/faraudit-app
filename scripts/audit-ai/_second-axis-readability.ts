// SECOND AXIS — the load-bearing test. If READABILITY is proven deterministically from docRegions' FULL
// region text (which carries no 40,000-char tool cap), how many documents are genuinely unreadable — i.e.
// what is the HONEST INCOMPLETE driver once truncation stops standing in for unreadability?
//
// Today: truncated tool read ⇒ not in docsRead ⇒ uncovered ⇒ INCOMPLETE on 34 of 44 packages.
// Proposed: readable = deterministic over full region text; analyzed = a grounded finding or attestation.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { docRegions } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-orchestrator";
import { hasEngineText, isBindingDoc } from "/Users/josearodriguezjr./faraudit-app/src/lib/sam-attachments";
import { ownerOf } from "./_ownership-map-proposal";
const DIR="/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
// the construction manifest's own obligation signal (audit-construction-manifest.ts:75), used as the
// read-and-empty rescue: obligation verbs are real English and cannot occur in a scanned stub.
const OBLIGATION_RE=/\b(?:shall|must|provide|submit|furnish|required|quote|deliver|install|erect|construct|responsible\s+for|is\s+required\s+to|are\s+required\s+to|no\s+later\s+than|at\s+no\s+(?:additional|extra)\s+cost|to\s+be\s+provided\s+by)\b/gi;

let pkgs=0, docs=0, unreadable=0, readEmpty=0, withObl=0, pkgsWithUnreadable=0, over40k=0;
const unreadableNames:string[]=[];
for (const f of readdirSync(DIR).filter(x=>x.endsWith(".json"))) {
  let d:any; try{d=JSON.parse(readFileSync(join(DIR,f),"utf8"));}catch{continue;}
  const fullSource=d?.input?.fullSource; if(!fullSource) continue;
  pkgs++;
  let pkgUnreadable=0;
  for (const r of docRegions(fullSource)) {
    if (r.isPrimary) continue;
    if (!isBindingDoc({role:"attachment",name:r.name})) continue;
    docs++;
    if (r.text.length>40000) over40k++;
    const obl=(r.text.match(OBLIGATION_RE)??[]).length;
    const readable = hasEngineText(r.text) || obl>0;
    if (!readable) { unreadable++; pkgUnreadable++; if(unreadableNames.length<12) unreadableNames.push(`${d?.meta?.sol??""} :: ${r.name.slice(0,58)}`); }
    else if (obl===0) readEmpty++;
    else withObl++;
  }
  if (pkgUnreadable>0) pkgsWithUnreadable++;
}
console.log(`packages ${pkgs} · binding documents ${docs}\n`);
console.log(`── READABILITY proven deterministically over FULL region text (no 40k cap)`);
console.log(`   genuinely UNREADABLE (no engine text, no obligation verbs) : ${unreadable}`);
console.log(`   readable, zero obligations (attest read-and-empty)         : ${readEmpty}`);
console.log(`   readable, carries obligations (needs analysis)             : ${withObl}`);
console.log(`   documents over the 40,000-char tool cap                    : ${over40k}\n`);
console.log(`── THE HEADLINE SWAP`);
console.log(`   TODAY    packages forced INCOMPLETE by TRUNCATION alone : 34 of 44`);
console.log(`   PROPOSED packages with a genuinely unreadable document  : ${pkgsWithUnreadable} of ${pkgs}`);
if (unreadableNames.length) { console.log(`\n   genuinely unreadable documents:`); for(const n of unreadableNames) console.log(`     · ${n}`); }
