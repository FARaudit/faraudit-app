import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "653570ea-ac6a-43c1-a9e6-c733bfa3c3d1";
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
(async () => {
  const t0 = Date.now(); let last = "";
  for (let i=0;i<90;i++){
    const { data, error } = await sb.from("audits").select("status,current_stage,recommendation,bid_recommendation,confidence_pct,completed_at,error_message").eq("id", ID).single();
    if (error){ console.log("ERR:", error.message); return; }
    const a:any = data;
    const line = `${a.status}/${a.current_stage??"-"}`;
    if (line !== last) { console.log(`[+${Math.round((Date.now()-t0)/1000)}s] ${line}`); last = line; }
    if (a.status==="complete"||a.status==="failed"){
      console.log(`\n=== TERMINAL (${Math.round((Date.now()-t0)/1000)}s after watch start): ${a.status} ===`);
      console.log(`bid_recommendation: ${String(a.bid_recommendation??"-").slice(0,180)}`);
      console.log(`recommendation: ${String(a.recommendation??"-").slice(0,120)} · conf=${a.confidence_pct??"-"}`);
      if(a.error_message) console.log(`ERR: ${a.error_message}`);
      return;
    }
    await sleep(12000);
  }
  console.log("watch timed out");
})();
