// Does F-2 (AUDIT_SEVERITY_HONEST) route findings to an `unrated` tier that v5 does NOT render? Count corpus rows
// where buildV4Data(row) produces unrated.length>0 under F-2 ON. Any such row loses those findings on served v5.
import { createClient } from "@supabase/supabase-js";
import { buildV4Data } from "../../src/lib/v4-report/build-data";
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const rows: any[] = [];
  for (let from=0;;from+=1000){ const {data}=await sb.from("audits").select("id,solicitation_number,compliance_json").eq("status","complete").range(from,from+999); if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break; }
  const v3 = rows.filter(r=>r.compliance_json?.engine==="agentic_v3");
  process.env.AUDIT_SEVERITY_HONEST="true";
  let withUnrated=0, totalUnrated=0; const specimens:string[]=[];
  for(const row of v3){
    try{
      const d:any = buildV4Data(row);
      const n = (d.findings?.unrated?.length)||0;
      if(n>0){ withUnrated++; totalUnrated+=n; if(specimens.length<5) specimens.push(`${String(row.id).slice(0,8)}(${row.solicitation_number})=${n}`); }
    }catch(e){ /* skip */ }
  }
  console.log(`agentic_v3 rows: ${v3.length}`);
  console.log(`rows producing unrated findings under F-2 ON: ${withUnrated}`);
  console.log(`total unrated findings that v5 would DROP: ${totalUnrated}`);
  if(specimens.length) console.log(`specimens: ${specimens.join(" · ")}`);
  console.log(withUnrated===0
    ? "\n→ SAFE: no served row produces an unrated finding — F-2's dedup is the only served effect; nothing dropped."
    : "\n→ REGRESSION RISK: F-2 ON would silently drop unrated findings on the served v5 surface (v5 has no unrated tier). Port an unrated tier into v5 render BEFORE arming F-2.");
})();
