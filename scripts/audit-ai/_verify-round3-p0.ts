// Round-3 adversarial claims, checked against REAL banked data (audit 496a9a21), not synthetic strings.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
import { docRegions } from "../../src/lib/audit-orchestrator";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits").select("id,raw_pdf_text,compliance_json")
    .eq("status","complete").not("raw_pdf_text","is",null).order("created_at",{ascending:false}).limit(14);
  const row = ((data||[]) as any[]).find(r => String(r.id).startsWith("496a9a21"));
  if (!row) { console.log("496a9a21 not in the recent 14"); process.exit(0); }
  console.log("regions in 496a9a21:");
  for (const r of docRegions(row.raw_pdf_text)) console.log(`   ${r.name}`);
  const prov = new Set<string>((row.compliance_json?.finding_provenance||[]).map((p:any)=>p.doc).filter((d:string)=>d&&d!=="(ungrounded)"));
  const CASES = [
    "The register is not provided — bidders cannot confirm submittal items.",   // P0-1: subset-token match
    "The narrative is not attached — the design intent is unavailable.",        // P0-1
    "Wage determination 2015-5631 is not provided — rates are unknown.",        // P0-2: digits read as 'nothing else'
  ];
  for (const c of CASES) {
    const out = reconcileAbsenceClaims([{ id:"c", requirement:c }], row.raw_pdf_text, prov, null);
    console.log(`  ${out.refuted.length ? "REFUTED off <"+out.refuted[0].doc+">" : "stands down"}  ::  ${c.slice(0,58)}`);
  }
})();
