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
  // Measure the SHIPPED rule, never a copy of it. This file originally froze the v1 regex inline, so after the fix
  // it kept reporting MISS while the module matched — a probe drifting from the thing it claims to measure.
  const { DOC_ABSENCE_FOR_TEST, reconcileAbsenceClaims } = await import("../../src/lib/audit-absence-reconcile");
  console.log("\n  DOC_ABSENCE (shipped) matches?", DOC_ABSENCE_FOR_TEST.test(String(pws?.requirement)));
  console.log("  last run : 'is referenced but not provided'  -> the optional group is exactly 'referenced but'  -> MATCH");
  console.log("  this run : 'is listed but not reproduced'    -> interjection is 'listed but'                    -> v1 MISS");

  // End-to-end through the production path: what does the customer actually read now?
  const prov=new Set<string>(((r as any).compliance_json?.finding_provenance||[]).map((p:any)=>p.doc).filter((d:string)=>d&&d!=="(ungrounded)"));
  const out=reconcileAbsenceClaims(f.map((x:any,i:number)=>({...x,id:`f#${i}`})), full, prov, (r as any).compliance_json?.set_aside ?? null);
  console.log(`\n  reconciled ${out.refuted.length} claim(s):`);
  for (const x of out.refuted) console.log(`   [${x.id}] ${x.kind} · ${x.doc}\n      AFTER: ${x.after.replace(/\s+/g," ").slice(0,300)}`);
})();
