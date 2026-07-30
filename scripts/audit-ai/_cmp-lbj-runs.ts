import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const IDS = ["cab687da-11a4-4b6e-8820-20516f293a1c","40fd02ce-e123-4fcf-b308-b85a6884d958","45f9bacd-c728-4b83-8aef-b245f15ac2a8"];
(async () => {
  for (const id of IDS) {
    const { data, error } = await sb.from("audits").select("id,status,current_stage,bid_recommendation,bid_score,confidence_pct,findings,raw_pdf_text,summary,error_message,created_at,completed_at,model_used,quality_flag").eq("id", id).single();
    if (error){ console.log(id, "ERR:", error.message); continue; }
    const a:any=data;
    const fc = Array.isArray(a.findings)?a.findings.length:(a.findings?"obj":"null");
    const txt = a.raw_pdf_text? String(a.raw_pdf_text).length : "null";
    console.log(`\n${id.slice(0,8)} | ${a.status} stage=${a.current_stage}`);
    console.log(`  findings=${fc} · raw_pdf_text_len=${txt} · bid_score=${a.bid_score} · conf=${a.confidence_pct} · qf=${a.quality_flag} · model=${a.model_used}`);
    console.log(`  bid_recommendation=${String(a.bid_recommendation??"-").slice(0,120)}`);
    console.log(`  created=${a.created_at} completed=${a.completed_at}`);
    if(a.error_message) console.log(`  ERR=${a.error_message}`);
  }
})();
