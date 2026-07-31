import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("compliance_json,raw_pdf_text").eq("id","583df921-9cd9-4fd9-b56a-4f49aee62eb2").single();
  const cj:any=(data as any).compliance_json;
  const prov=new Set<string>((cj.finding_provenance||[]).map((p:any)=>p.doc).filter((d:string)=>d&&d!=="(ungrounded)"));
  const { reconcileAbsenceClaims } = await import("../../src/lib/audit-absence-reconcile");
  const withIds = cj.v3.findings.map((f:any,i:number)=>({...f,id:`f#${i}`}));
  const {data:row2}=await a.from("audits").select("set_aside").eq("id","583df921-9cd9-4fd9-b56a-4f49aee62eb2").single();
  const r = reconcileAbsenceClaims(withIds, (data as any).raw_pdf_text, prov, (row2 as any).set_aside);
  console.log(`REFUTED ${r.refuted.length} of ${withIds.length} findings\n`);
  for (const x of r.refuted) {
    console.log(`── ${x.id}  [${x.kind}]  doc="${x.doc}"`);
    console.log(`   AFTER (full): ${x.after.replace(/\s+/g," ")}\n`);
  }
  console.log("=== LEAK SWEEP across ALL findings ===");
  const leaks = (r.findings as any[]).filter((f)=>/UNVERIFIED ABSENCE|is not stated in Section B|not provided in the assigned source|but not reproduced/i.test(String(f.requirement)));
  console.log("findings still carrying a refuted false clause:", leaks.length);
  for (const l of leaks) console.log("  !", String(l.requirement).slice(0,150).replace(/\s+/g," "));
  // FALSIFICATION: content-absence claims must NOT be touched
  const untouched = r.findings.filter((f:any,i:number)=>f.requirement!==withIds[i].requirement).length;
  console.log(`findings changed: ${untouched} (must equal refuted count)`);
  const setAside = r.findings.find((f:any)=>/Set-aside type is not stated/i.test(String(f.requirement)));
  console.log(`set-aside CONTENT claim left alone: ${setAside ? "YES" : "n/a"}`);
})();
