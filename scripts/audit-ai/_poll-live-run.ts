// $0 — poll a live run to completion, printing stage progress, then the final verdict. Node timers. Read-only.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const PEND = process.argv[2] || "8f76c2bf";
const AUDIT = process.argv[3] || "a7727dfc";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (let i = 0; i < 24; i++) {
    const { data: p } = await admin.from("pending_audits").select("status, heartbeat_at, processed_at, attempts, error_message, audit_id").like("id", `${PEND}%`).limit(1).single();
    const auditId = p?.audit_id || AUDIT;
    const { data: a } = await admin.from("audits").select("status, agentic_status, compliance_json").like("id", `${AUDIT}%`).limit(1).single();
    const cj = a?.compliance_json || {};
    const v = cj.verdict || {};
    const t = new Date().toISOString().slice(11, 19);
    console.log(`[${i}·${t}] pend=${p?.status ?? "?"} hb=${(p?.heartbeat_at||"").slice(11,19)} attempts=${p?.attempts ?? "?"} | audit=${a?.status ?? "?"} agentic=${a?.agentic_status ?? "-"} verdict=${v.pole ?? "-"}`);
    if (p?.error_message) console.log(`   ERROR: ${p.error_message.slice(0, 120)}`);
    const done = (p?.status === "processed" || a?.status === "complete") && (v.pole || cj.recommendation);
    if (done || p?.status === "failed" || a?.status === "failed") {
      console.log(`\n=== FINAL ===`);
      console.log(`  verdict pole=${v.pole ?? "?"} band=${v.band ?? "?"} noVerdict=${v.noVerdict ?? "?"}`);
      console.log(`  recommendation=${cj.recommendation ?? "?"} fit_score=${cj.fit_score ?? "?"}`);
      const ss = cj.show_stoppers || cj.showStoppers || [];
      console.log(`  show_stoppers(${ss.length}): ${JSON.stringify(ss.slice(0,4)).slice(0,400)}`);
      process.exit(0);
    }
    await sleep(20000);
  }
  console.log("timeout — still running after 8min");
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
