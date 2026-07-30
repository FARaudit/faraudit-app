// Live-follow a single audit to terminal state. Emits one line per status/stage change; exits on complete/failed.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = process.argv[2] || "2ababbc3-9c84-4c02-b9d1-e885265b0262";
let last = "";
const TERM = new Set(["complete", "failed"]);
(async () => {
  for (let i = 0; i < 240; i++) {
    const { data, error } = await sb.from("audits")
      .select("status, current_stage, solicitation_number, recommendation, bid_recommendation, bid_score, error_message, updated_at")
      .eq("id", ID).single();
    if (error) { console.log(`ERR ${error.message}`); await new Promise(r => setTimeout(r, 5000)); continue; }
    const a = data as any;
    const verdict = a.bid_recommendation ?? a.recommendation ?? "-";
    const line = `${a.status} | stage=${a.current_stage ?? "-"} | verdict=${verdict}`;
    if (line !== last) { console.log(`[${new Date().toISOString()}] sol=${a.solicitation_number} ${line}`); last = line; }
    if (TERM.has(a.status)) { console.log(`TERMINAL: ${a.status} | verdict=${verdict} | bid_score=${a.bid_score ?? "-"} | err=${a.error_message ?? "-"}`); process.exit(0); }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log("POLL-TIMEOUT (20 min) — audit not terminal");
  process.exit(0);
})();
