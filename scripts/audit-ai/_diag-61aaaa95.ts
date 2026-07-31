import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { docRegions } from "../../src/lib/audit-orchestrator";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data:r}=await a.from("audits").select("raw_pdf_text,compliance_json").eq("id","61aaaa95-b205-43b0-bf41-0a25fdd9265e").single();
  const full=(r as any).raw_pdf_text;
  console.log("regions in THIS run:");
  for (const x of docRegions(full)) console.log(`    ${x.name}  ${x.text.length}`);
  const f=(r as any).compliance_json.v3.findings;
  const pws=f.find((x:any)=>/PWS \(Attachment 0001\)/i.test(String(x.requirement)));
  console.log("\nsurviving PWS claim, verbatim:\n   ", String(pws?.requirement).slice(0,230).replace(/\s+/g," "));
  const RE=/\b(?:is|are|was|were)\s+(?:referenced\s+but\s+)?not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located)\b/i;
  console.log("\n  DOC_ABSENCE matches?", RE.test(String(pws?.requirement)));
  console.log("  last run : 'is referenced but not provided'  -> the optional group is exactly 'referenced but'  -> MATCH");
  console.log("  this run : 'is listed but not reproduced'    -> interjection is 'listed but'                    -> MISS");
})();
