import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const A="d8abfd88-2b69-46f9-b24d-30cdd52e5b3d", B="6bb554ec-ff1a-4aae-ab68-5c528279a92d";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=async(id)=>{const {data}=await admin.from("audits").select("recommendation,set_aside,naics_code,period_of_performance,compliance_json,overview_json").eq("id",id).maybeSingle();return data;};
const ready=(d)=>d&&d.compliance_json&&(d.compliance_json.v2_shadow||d.compliance_json.v2_error);
let a,b;
for(let i=0;i<50;i++){a=await get(A);b=await get(B);if(ready(a)&&ready(b))break;await sleep(10000);}
const summ=(d,id)=>{const cj=d.compliance_json||{};const far=(cj.far_clauses||[]).slice().sort();const df=(cj.dfars_clauses||[]).slice().sort();const sd=(JSON.stringify(cj.v2_shadow||{}).match(/SDVOSB|service-disabled/gi)||[]).length;
  return {id:id.slice(0,8),rec:d.recommendation,set_aside:d.set_aside,naics:d.naics_code,far_n:far.length,dfars_n:df.length,sdvosb:sd,v2:!!cj.v2_shadow,far,dfars:df};};
const sa=summ(a,A), sb=summ(b,B);
console.log("RUN A:",JSON.stringify({...sa,far:undefined,dfars:undefined}));
console.log("RUN B:",JSON.stringify({...sb,far:undefined,dfars:undefined}));
const farIdentical=JSON.stringify(sa.far)===JSON.stringify(sb.far);
const dfIdentical=JSON.stringify(sa.dfars)===JSON.stringify(sb.dfars);
console.log("\nDETERMINISM: far_identical="+farIdentical+" dfars_identical="+dfIdentical);
if(!farIdentical){const onlyA=sa.far.filter(x=>!sb.far.includes(x));const onlyB=sb.far.filter(x=>!sa.far.includes(x));console.log(" far diff onlyA:",onlyA.slice(0,8)," onlyB:",onlyB.slice(0,8));}
console.log("\nfar sample A:",sa.far.slice(0,15).join(", "));
