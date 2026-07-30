import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function get(sol:string,id:string,cache:string){
  if(fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache,"utf8"));
  const {data,error}=await sb.storage.from("run-records").download(`${sol}/${id}.json`);
  if(error){console.log("dl err",id,error.message);return null;}
  const buf=Buffer.from(await data.arrayBuffer()); fs.writeFileSync(cache,buf); return JSON.parse(buf.toString());
}
function summarize(tag:string, rec:any){
  const r=rec.result, led=r.diagnostics?.verifierLedger, sv=r.diagnostics?.shadowVerdict;
  console.log(`\n########## ${tag} ##########`);
  console.log("live verdict:", r.verdict, "| findings:", r.findings.length);
  console.log("LEDGER failureMode:", led?.failureMode, "| residueDoctrine:", led?.residueDoctrine);
  console.log("LEDGER throwMessage:", String(led?.throwMessage??"-").slice(0,220));
  console.log("LEDGER counts:", JSON.stringify(led?.counts));
  console.log("LEDGER unresolvedIndices n:", led?.unresolvedIndices?.length, "| rulings n:", led?.rulings?.length);
  // cause histogram
  const ch:Record<string,number>={}; for(const u of (led?.rulings||[])){const c=u.cause||u.mechanicalCause||"?";ch[c]=(ch[c]||0)+1;}
  console.log("LEDGER cause histogram:", JSON.stringify(ch));
  console.log("SHADOW verdict:", sv?.verdict, "| reason:", String(sv?.reason??"-").slice(0,140));
  console.log("SHADOW deciding/enrichment:", sv?.decidingCount,"/",sv?.enrichmentCount, "| vetoes:", (sv?.vetoes||[]).length, "| killShots:", JSON.stringify(sv?.killShotClasses));
  const kinds:Record<string,number>={}; for(const f of r.findings){const k=f.kind||"?";kinds[k]=(kinds[k]||0)+1;}
  console.log("finding kinds:", JSON.stringify(kinds));
}
(async()=>{
  const A=await get("12318726Q0165","cab687da-11a4-4b6e-8820-20516f293a1c","scripts/audit-ai/run-records/_new-cab687da.json");
  const B=await get("12318726Q0165","40fd02ce-e123-4fcf-b308-b85a6884d958","scripts/audit-ai/run-records/_dl-40fd02ce.json");
  if(A) summarize("cab687da (NEW, pole=true)", A);
  if(B) summarize("40fd02ce (PRIOR)", B);
})();
