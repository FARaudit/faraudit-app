// $0 — the reconciler has only ever been run against ONE solicitation. Before a paid run, check it does not
// crash or OVER-REFUTE on other real audits. Over-refuting is the dangerous direction: it deletes real warnings.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("id,solicitation_number,raw_pdf_text,compliance_json,set_aside")
    .eq("status","complete").not("raw_pdf_text","is",null).order("created_at",{ascending:false}).limit(14);
  const { reconcileAbsenceClaims } = await import("../../src/lib/audit-absence-reconcile");
  let rows=0, totalF=0, totalR=0, crashes=0;
  console.log("audit    sol                findings  refuted  kinds");
  for (const r of (data||[]) as any[]) {
    const f = r.compliance_json?.v3?.findings;
    if (!Array.isArray(f) || !f.length) continue;
    const prov = new Set<string>((r.compliance_json?.finding_provenance||[]).map((p:any)=>p.doc).filter((d:string)=>d&&d!=="(ungrounded)"));
    try {
      const out = reconcileAbsenceClaims(f.map((x:any,i:number)=>({...x,id:`f#${i}`})), r.raw_pdf_text, prov, r.set_aside);
      rows++; totalF+=f.length; totalR+=out.refuted.length;
      const kinds=[...new Set(out.refuted.map(x=>x.kind))].join(",")||"—";
      console.log(`${String(r.id).slice(0,8)} ${String(r.solicitation_number).padEnd(18)} ${String(f.length).padStart(8)} ${String(out.refuted.length).padStart(8)}  ${kinds}`);
      for (const x of out.refuted) {
        if (!/^(CORRECTED|NOT ANALYZED) — /.test(x.after)) console.log(`    !! malformed rewrite on ${x.id}`);
      }
    } catch (e) { crashes++; console.log(`${String(r.id).slice(0,8)} ${r.solicitation_number}  CRASH: ${(e as Error).message.slice(0,60)}`); }
  }
  const rate = totalF? (totalR/totalF*100):0;
  console.log(`\naudits ${rows} · findings ${totalF} · refuted ${totalR} (${rate.toFixed(1)}%) · crashes ${crashes}`);
  console.log(rate <= 8 && crashes === 0 ? "PASS — bounded refute rate, no crashes" : "INVESTIGATE — rate or crash out of bounds");
})();
