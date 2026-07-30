import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "40fd02ce-e123-4fcf-b308-b85a6884d958";
(async () => {
  const { data, error } = await sb
    .from("audits")
    .select("id, status, current_stage, stage_updated_at, bid_recommendation, bid_score, score, recommendation, confidence_pct, summary, processing_time_ms, completed_at, error_message, quality_flag, findings")
    .eq("id", ID)
    .single();
  if (error) { console.log("ERR:", error.message); return; }
  const a: any = data;
  const findings = Array.isArray(a.findings) ? a.findings.length : (a.findings ? "obj" : 0);
  console.log(`[${a.status}] stage=${a.current_stage ?? "-"} (updated ${a.stage_updated_at ?? "-"})`);
  console.log(`   bid_recommendation=${a.bid_recommendation ?? "-"} · bid_score=${a.bid_score ?? "-"} · recommendation=${a.recommendation ?? "-"} · conf=${a.confidence_pct ?? "-"}`);
  console.log(`   findings=${findings} · quality_flag=${a.quality_flag ?? "-"} · proc_ms=${a.processing_time_ms ?? "-"} · completed=${a.completed_at ?? "-"}`);
  if (a.summary) console.log(`   summary=${String(a.summary).slice(0,240)}`);
  if (a.error_message) console.log(`   ERR=${a.error_message}`);
})();
