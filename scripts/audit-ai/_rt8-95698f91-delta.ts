// Why did 95698f91 stop correcting after the heading-merge? Correct stand-down or lost true positive?
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "../../src/lib/audit-force-grounding";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("id,raw_pdf_text,compliance_json").eq("status","complete").not("raw_pdf_text","is",null).order("created_at",{ascending:false}).limit(14);
  for (const r of (data||[]) as any[]) {
    if (!String(r.id).startsWith("95698f91")) continue;
    const src=r.raw_pdf_text as string;
    const named=I.sentencesNaming(src,"site visit");
    console.log(`95698f91 · segments naming "site visit": ${named.length}`);
    for (const s of named) {
      const om=I.OBLIGATION_MARKER.exec(s);
      console.log(`  [${om?`OBLIGATION: ${JSON.stringify(om[0])}`:"none"}] ${s.replace(/\s+/g," ").trim().slice(0,190)}`);
    }
  }
})();
