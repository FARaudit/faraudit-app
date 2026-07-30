import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "cab687da-11a4-4b6e-8820-20516f293a1c";
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
(async () => {
  for (let i=0;i<60;i++){
    const { data, error } = await sb.from("audits")
      .select("status,current_stage,stage_updated_at,bid_recommendation,recommendation,confidence_pct,findings,quality_flag,processing_time_ms,completed_at,error_message,summary")
      .eq("id", ID).single();
    if (error){ console.log("ERR:", error.message); return; }
    const a:any = data;
    const f = Array.isArray(a.findings)?a.findings.length:(a.findings?"obj":0);
    console.log(`[${i}] ${a.status} stage=${a.current_stage??"-"} rec=${a.recommendation??a.bid_recommendation??"-"} conf=${a.confidence_pct??"-"} findings=${f} qf=${a.quality_flag??"-"}`);
    if (a.status==="complete"||a.status==="failed"){
      console.log(`\n=== TERMINAL: ${a.status} ===`);
      console.log(`rec=${a.recommendation??a.bid_recommendation??"-"} · conf=${a.confidence_pct??"-"} · findings=${f} · qf=${a.quality_flag??"-"} · proc_ms=${a.processing_time_ms??"-"}`);
      if(a.summary) console.log(`summary=${String(a.summary).slice(0,400)}`);
      if(a.error_message) console.log(`ERR=${a.error_message}`);
      return;
    }
    await sleep(15000);
  }
  console.log("timed out after ~15min");
})();
