import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID="2b5f95eb-c9f8-4adc-8b3f-2ed8a9d46cb7", SOL="12318726Q0165";
(async()=>{
  // (a) storage banked record?
  const dl = await sb.storage.from("run-records").download(`${SOL}/${ID}.json`);
  console.log("banked run record:", dl.error ? `NONE (${dl.error.message})` : "PRESENT");
  // (b) DB row partial data
  const { data } = await sb.from("audits").select("status,findings,raw_pdf_text,error_message,current_stage,processing_time_ms,model_used").eq("id",ID).single();
  const a:any=data;
  const fc = Array.isArray(a?.findings)?a.findings.length:(a?.findings?"obj":"null");
  console.log(`DB row: status=${a?.status} stage=${a?.current_stage} findings=${fc} proc_ms=${a?.processing_time_ms} err=${String(a?.error_message).slice(0,60)}`);
})();
