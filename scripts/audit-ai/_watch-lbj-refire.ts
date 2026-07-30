import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "40fd02ce-e123-4fcf-b308-b85a6884d958";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 40; i++) {
    const { data, error } = await sb
      .from("audits")
      .select("status, current_stage, stage_updated_at, bid_recommendation, bid_score, recommendation, confidence_pct, summary, processing_time_ms, completed_at, error_message, quality_flag, findings")
      .eq("id", ID)
      .single();
    if (error) { console.log(`poll#${i} ERR:`, error.message); await sleep(15000); continue; }
    const a: any = data;
    const fc = Array.isArray(a.findings) ? a.findings.length : (a.findings ? "obj" : 0);
    console.log(`poll#${i} [${a.status}] stage=${a.current_stage ?? "-"} rec=${a.bid_recommendation ?? "-"} score=${a.bid_score ?? "-"} findings=${fc} @${new Date().toISOString()}`);
    if (a.status === "complete" || a.status === "failed") {
      console.log("=== TERMINAL ===");
      console.log("status:", a.status);
      console.log("bid_recommendation:", a.bid_recommendation, "· bid_score:", a.bid_score, "· recommendation:", a.recommendation, "· conf:", a.confidence_pct);
      console.log("quality_flag:", a.quality_flag, "· proc_ms:", a.processing_time_ms, "· completed:", a.completed_at);
      console.log("findings:", fc);
      if (a.summary) console.log("summary:", String(a.summary).slice(0, 600));
      if (a.error_message) console.log("ERR:", a.error_message);
      return;
    }
    await sleep(15000);
  }
  console.log("=== TIMEOUT after ~10min still processing ===");
})();
