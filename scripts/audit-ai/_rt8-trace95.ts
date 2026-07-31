import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { FORCE_GROUNDING_INTERNALS_FOR_TEST as I, groundModalForce } from "../../src/lib/audit-force-grounding";
import { SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "../../src/lib/audit-site-visit-patterns";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("id,raw_pdf_text,compliance_json").eq("status","complete").not("raw_pdf_text","is",null).order("created_at",{ascending:false}).limit(14);
  for (const r of (data||[]) as any[]) {
    if (!String(r.id).startsWith("95698f91")) continue;
    const src=r.raw_pdf_text as string;
    const fs=(r.compliance_json?.v3?.findings||[]);
    for (const [i,f] of fs.entries()) {
      const req=String(f.requirement||""); const fm=I.FORCE_QUALIFIER.exec(req);
      if (!fm) continue;
      const fw=fm[1];
      const inSrc=new RegExp(`\\b${fw}\\b`,"i").test(src);
      const exc=String(f.excerpt||"");
      const excObl=I.OBLIGATION_MARKER.test(exc)||SITE_VISIT_MANDATORY_ATTENDANCE_RE.test(exc);
      const subj=I.qualifiedSubject(req,fm.index,fw);
      const named=subj?I.sentencesNaming(src,subj):[];
      const namedObl=named.some(s=>I.OBLIGATION_MARKER.test(s)||SITE_VISIT_MANDATORY_ATTENDANCE_RE.test(s));
      console.log(`#${i} force=${fw}`);
      console.log(`   c3 word-in-source=${inSrc}${inSrc?"  <-- STANDS DOWN HERE":""}`);
      console.log(`   c2 excerpt-obligation=${excObl}${excObl&&!inSrc?"  <-- STANDS DOWN HERE":""}`);
      console.log(`   c1 subject=${JSON.stringify(subj)}`);
      console.log(`   c4 named=${named.length} namedObligation=${namedObl}`);
      console.log(`   req: ${req.replace(/\s+/g," ").slice(0,150)}`);
    }
    console.log("fired:",groundModalForce(fs.map((x:any,i:number)=>({...x,id:`f#${i}`})),src).corrected.length);
  }
})();
