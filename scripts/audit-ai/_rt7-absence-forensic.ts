import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("compliance_json,raw_pdf_text").eq("id","583df921-9cd9-4fd9-b56a-4f49aee62eb2").single();
  const cj:any=(data as any).compliance_json;
  const { docRegions } = await import("../../src/lib/audit-orchestrator");
  const regions = docRegions((data as any).raw_pdf_text);
  console.log("DOCUMENT REGIONS PRESENT IN THE RUN'S OWN SOURCE:");
  for (const r of regions) console.log(`   ${r.isPrimary?"PRIMARY":"attach "} "${r.name}" (${r.text.length} chars)`);
  console.log("\nPROVENANCE TALLY (which docs produced findings):");
  const t:Record<string,number>={}; for(const p of (cj.finding_provenance||[])) t[p.doc]=(t[p.doc]||0)+1;
  console.log("  ",JSON.stringify(t));
  console.log("\nEVERY ABSENCE CLAIM IN THE REPORT:");
  for (const f of cj.v3.findings) {
    const req=String(f.requirement||"");
    if (/UNVERIFIED ABSENCE/.test(req)) console.log(`\n  [${f.severity}] ${req.slice(0,300).replace(/\s+/g," ")}`);
  }
  console.log("\n\nSET-ASIDE / MANDATORY claims:");
  for (const f of cj.v3.findings) {
    const req=String(f.requirement||"");
    if (/set-aside type is not stated|mandatory/i.test(req)) console.log(`\n  [${f.severity}] ${req.slice(0,260).replace(/\s+/g," ")}`);
  }
})();
