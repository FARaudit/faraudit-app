import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID="653570ea-ac6a-43c1-a9e6-c733bfa3c3d1", SOL="12318726Q0165";
(async()=>{
  const { data: row } = await sb.from("audits").select("status,bid_recommendation,processing_time_ms").eq("id",ID).single();
  console.log("VERDICT:", String((row as any)?.bid_recommendation).slice(0,240));
  const dl = await sb.storage.from("run-records").download(`${SOL}/${ID}.json`);
  if(dl.error){ console.log("banked record: NONE", dl.error.message); return; }
  const rec = JSON.parse(Buffer.from(await dl.data.arrayBuffer()).toString());
  fs.writeFileSync("scripts/audit-ai/run-records/_new-653570ea.json", JSON.stringify(rec));
  const r = rec.result, led = r.diagnostics?.verifierLedger, sv = r.diagnostics?.shadowVerdict;
  console.log("\n=== VERIFIER LEDGER ===");
  console.log("failureMode:", led?.failureMode, "| counts:", JSON.stringify(led?.counts));
  console.log("live verdict:", r.verdict, "| findings:", r.findings.length);
  console.log("\n=== SHADOW (positive pole) ===");
  console.log("verdict:", sv?.verdict, "| reason:", String(sv?.reason??"-").slice(0,120));
  console.log("deciding/enrichment:", sv?.decidingCount,"/",sv?.enrichmentCount, "| vetoes:", JSON.stringify((sv?.vetoes??[]).slice(0,4)));
  console.log("\n=== BAR #1 SPLIT? (insurance / licensing / accreditation constituents) ===");
  const rel = r.findings.filter((f:any)=>/insurance|licens|accredit|certif/i.test(`${f.requirement}`));
  for(const f of rel.slice(0,8)) console.log(`  [${f.kind}/${f.controllability}/cur=${f.curableInWindow}] "${String(f.requirement).slice(0,80)}"`);
})();
