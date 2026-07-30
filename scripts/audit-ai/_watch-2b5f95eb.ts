import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "2b5f95eb-c9f8-4adc-8b3f-2ed8a9d46cb7";
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
(async () => {
  let last = "";
  for (let i=0;i<80;i++){
    const { data, error } = await sb.from("audits").select("status,current_stage,stage_updated_at,recommendation,bid_recommendation,confidence_pct,completed_at,error_message,summary").eq("id", ID).single();
    if (error){ console.log("ERR:", error.message); return; }
    const a:any = data;
    const line = `${a.status}/${a.current_stage??"-"}`;
    if (line !== last) { console.log(`[${i}] ${line} (${a.stage_updated_at??""})`); last = line; }
    if (a.status==="complete"||a.status==="failed"){
      console.log(`\n=== TERMINAL: ${a.status} ===`);
      console.log(`bid_recommendation: ${String(a.bid_recommendation??"-").slice(0,160)}`);
      console.log(`recommendation: ${String(a.recommendation??"-").slice(0,120)} · conf=${a.confidence_pct??"-"}`);
      if(a.error_message) console.log(`ERR: ${a.error_message}`);
      return;
    }
    await sleep(15000);
  }
  console.log("timed out ~20min");
})();
