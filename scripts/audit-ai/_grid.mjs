import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const M={ "70B01C26R00000080":"bbcbb971-d857-4f8b-bf60-237bc7957403","W9123626BA006":"3ed049b9-71f5-4f45-82a8-23f4408a721b","70LGLY26RSSB00022":"22c47cd5-1781-4c4f-8943-01c4fd6cf039","W51H7226QA009":"fafd63be-e375-4c07-8a08-e30b36e0f684","W15QKN-26-Q-A119":"87d374fa-791c-4d71-a35f-9479e518fda8" };
const ids=Object.values(M); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<40;i++){
  const { data } = await admin.from("audits").select("id,compliance_json,status").in("id",ids);
  const ready=(data||[]).filter(a=>a.compliance_json?.v2_shadow||a.compliance_json?.v2_error).length;
  if(ready>=5) break;
  await sleep(15000);
}
const { data } = await admin.from("audits").select("id,solicitation_number,status,recommendation,compliance_json").in("id",ids);
console.log("=== POST-FIX GRID (sha=04593d1) ===");
for(const [sol,id] of Object.entries(M)){
  const a=(data||[]).find(x=>x.id===id); if(!a){console.log(sol+": missing");continue;}
  const cj=a.compliance_json||{},v2=cj.v2_shadow||{},ing=cj.ingestion||{},j=v2.judgment||{};
  console.log(`${sol}: ${a.status} | ing ${ing.files_ingested}/${ing.files_total} form=${ing.form_identified} | v2_ms=${v2.engine_ms??(cj.v2_error?"ERR":"NO")} | risks=${Array.isArray(j.risks)?j.risks.length:"?"} | far/df=${(cj.far_clauses||[]).length}/${(cj.dfars_clauses||[]).length} | ${a.recommendation} | bottom="${(j.verdict?.bottomLine||"").slice(0,55)}"`);
}
