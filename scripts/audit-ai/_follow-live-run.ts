// $0 — follow a live front-door run for a given sol#. Locates the newest pending_audits row + any audits row,
// reports pipeline state (claimed/heartbeat/attempts/status → verdict when complete). Read-only.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const SOL = process.argv[2] || "SPRRA2-26-R-0034";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: pend } = await admin
    .from("pending_audits")
    .select("id, solicitation_number, source, status, created_at, claimed_at, heartbeat_at, processed_at, attempts, audit_id, error_message, recommendation, bid_no_bid")
    .eq("solicitation_number", SOL)
    .order("created_at", { ascending: false })
    .limit(3);
  console.log(`=== pending_audits for ${SOL} (newest 3) ===`);
  for (const r of pend || []) {
    console.log(`  id=${r.id.slice(0,8)} src=${r.source} status=${r.status} created=${(r.created_at||"").slice(11,19)} claimed=${(r.claimed_at||"").slice(11,19)||"-"} hb=${(r.heartbeat_at||"").slice(11,19)||"-"} proc=${(r.processed_at||"").slice(11,19)||"-"} attempts=${r.attempts} audit=${r.audit_id?.slice(0,8)||"-"} err=${r.error_message?.slice(0,40)||"-"}`);
  }
  const top = (pend || [])[0];
  if (top?.audit_id) {
    const { data: a } = await admin.from("audits").select("id, status, created_at, compliance_json, agentic_status").eq("id", top.audit_id).single();
    if (a) {
      const cj = a.compliance_json || {};
      const v = cj.verdict || {};
      console.log(`\n=== audits row ${a.id.slice(0,8)} ===`);
      console.log(`  status=${a.status} agentic=${a.agentic_status ?? "-"} created=${(a.created_at||"").slice(11,19)}`);
      console.log(`  VERDICT pole=${v.pole ?? "?"} band=${v.band ?? "?"} noVerdict=${v.noVerdict ?? "?"} score=${cj.fit_score ?? cj.compliance_score ?? "?"}`);
      console.log(`  showStoppers=${JSON.stringify((cj.show_stoppers||cj.showStoppers||[]).slice(0,3)).slice(0,200)}`);
    }
  } else {
    console.log(`\n  (no audits row yet — ${top ? `in-flight: ${top.status}` : "run not found yet"})`);
  }
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
