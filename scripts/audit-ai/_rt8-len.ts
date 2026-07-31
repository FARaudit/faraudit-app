import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { groundModalForce } from "../../src/lib/audit-force-grounding";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data:r}=await a.from("audits").select("raw_pdf_text,compliance_json,set_aside").eq("id","61aaaa95-b205-43b0-bf41-0a25fdd9265e").single();
  const src=(r as any).raw_pdf_text; const f=((r as any).compliance_json?.v3?.findings||[]).map((x:any,i:number)=>({...x,id:`f#${i}`}));
  const prov=new Set<string>(((r as any).compliance_json?.finding_provenance||[]).map((p:any)=>p.doc).filter((d:string)=>d&&d!=="(ungrounded)"));
  console.log("RENDER TRUNCATION LIMIT = 400 chars (truncateOnWord)\n");
  for (const [label,out] of [["#8 force",groundModalForce(f,src).corrected],["#7 absence",reconcileAbsenceClaims(f,src,prov,(r as any).set_aside).refuted]] as any) {
    for (const c of out) {
      const before=c.before.length, after=c.after.length;
      const cut = after>400 ? c.after.slice(0,400) : c.after;
      const lostCorrection = after>400 && !/no statement that it is|IS in the analyzed source|IS in the retrieved source/i.test(cut);
      console.log(`${label} ${c.id}: before=${before} after=${after} ${after>400?"⚠ TRUNCATED":"ok"}`);
      if (after>400) console.log(`   tail lost: ${JSON.stringify(c.after.slice(380,after).replace(/\s+/g," ").slice(0,140))}`);
      if (lostCorrection) console.log(`   🔴 THE CORRECTION ITSELF IS CUT — customer sees the claim without the correction`);
    }
  }
})();
