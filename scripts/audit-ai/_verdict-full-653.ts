import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async()=>{
  const { data } = await sb.from("audits").select("bid_recommendation").eq("id","653570ea-ac6a-43c1-a9e6-c733bfa3c3d1").single();
  console.log("=== FULL VERDICT ===\n" + (data as any)?.bid_recommendation);
  const rec = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-653570ea.json","utf8"));
  const ins = rec.result.findings.filter((f:any)=>/insurance|proof.*award|at.*award|bond/i.test(`${f.requirement} ${f.excerpt}`));
  console.log("\n=== insurance / at-award constituents (the Bar #1 saga) ===");
  for(const f of ins.slice(0,5)) console.log(`  [${f.kind}/${f.controllability}/cur=${f.curableInWindow}] "${String(f.requirement).slice(0,90)}"`);
})();
