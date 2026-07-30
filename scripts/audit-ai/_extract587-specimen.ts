import { readFileSync, writeFileSync } from "fs";
const r = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
const src: string = r.input.fullSource;
const dq = (r.result.inputs?.coverageV2?.disqualifierUncovered)??[];
// the exact obligation strings (production, not reconstructed)
const obs = dq.map((d:any)=>d.obligation);
console.log("OBLIGATIONS (verbatim from record):");
obs.forEach((o:string,i:number)=>console.log(`  [${i}] "${o}"`));
// raw source window around occurrence 1 (@17056) with newlines visible
const i = src.toLowerCase().indexOf("maintain licensing");
const win = src.slice(i-10, i+320);
console.log("\nRAW SOURCE WINDOW (⏎=newline):");
console.log(JSON.stringify(win));
// persist a specimen fixture for the cert (real bytes)
writeFileSync("scripts/audit-ai/_specimen587.json", JSON.stringify({ obligations: obs, rawWindow: win, fullSourceLen: src.length }, null, 2));
console.log("\nspecimen written to scripts/audit-ai/_specimen587.json");
