// Recompete AI — daily Railway cron worker. ALERT-ONLY.
//
// Scans audits.outcome='won' rows. For each, estimates the period of
// performance (preferring overview_json.period_of_performance, falling
// back to a 12-month default). When a contract is within 180 days of
// estimated expiration AND we haven't already alerted on that audit,
// Telegram-alert and stamp audits.recompete_alerted_at (migration
// 20260729190000) so the alert fires once per audit.
//
// 2026-07-29: this agent used to enqueue pending_audits rows with
// source='recompete', but nothing has consumed non-user rows since the V1
// Audit-AI purge — the queue write was a dead end and was retired (CEO
// decision: alert-only).
//
// DRY_RUN=true logs the plan but writes nothing.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { sendAlert } from "./telegram.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";
const ALERT_WINDOW_DAYS = Number(process.env.ALERT_WINDOW_DAYS || "180");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("recompete-ai: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    // Node 18 lacks native WebSocket. realtime-js's getWebSocketConstructor
    // throws at module-load when no transport is supplied. The agent never
    // uses realtime channels (table CRUD only) but the SupabaseClient
    // constructor instantiates RealtimeClient unconditionally, so we hand
    // it the `ws` package to satisfy the constructor lookup.
    transport: WebSocket as unknown as typeof globalThis.WebSocket
  }
});

interface WonAudit {
  id: string;
  notice_id: string | null;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  set_aside: string | null;
  bid_submit_date: string | null;
  outcome_date: string | null;
  overview_json: Record<string, unknown> | null;
  recompete_alerted_at: string | null;
}

// Parse "12 months", "1 year", "Base year + 4 option years", "36 months"
// Returns months, defaulting to 12 if no signal.
function estimateDurationMonths(pop: string): number {
  if (!pop) return 12;
  const s = pop.toLowerCase();

  // "Base year + N option years"
  const optMatch = s.match(/(\d+)\s+option\s+year/);
  if (optMatch) return 12 * (1 + Number(optMatch[1]));

  const yearMatch = s.match(/(\d+)\s*year/);
  if (yearMatch) return 12 * Number(yearMatch[1]);

  const monthMatch = s.match(/(\d+)\s*month/);
  if (monthMatch) return Number(monthMatch[1]);

  return 12;
}

function startDate(audit: WonAudit): Date | null {
  const candidate = audit.bid_submit_date || audit.outcome_date;
  if (!candidate) return null;
  const d = new Date(candidate);
  if (isNaN(d.getTime())) return null;
  return d;
}

async function run() {
  console.log(`[recompete-ai] starting · DRY_RUN=${DRY_RUN} · window=${ALERT_WINDOW_DAYS}d`);

  // 1. Pull all won audits with a submission/outcome anchor.
  const { data: won, error: wonErr } = await supabase
    .from("audits")
    .select("id, notice_id, title, agency, naics_code, set_aside, bid_submit_date, outcome_date, overview_json, recompete_alerted_at")
    .eq("outcome", "won");
  if (wonErr) {
    console.error("[recompete-ai] failed to query audits:", wonErr.message);
    process.exit(1);
  }

  const candidates: WonAudit[] = (won as WonAudit[]) || [];
  console.log(`[recompete-ai] ${candidates.length} won audit(s) on record`);

  if (candidates.length === 0) {
    console.log("[recompete-ai] nothing to evaluate · exiting clean");
    return;
  }

  const now = new Date();
  const alertedIds: string[] = [];
  const alertsToSend: string[] = [];
  const planLines: string[] = [];

  for (const a of candidates) {
    // Dedup: one alert per audit, recorded on the audit row itself.
    if (a.recompete_alerted_at) continue;
    const start = startDate(a);
    if (!start) {
      console.log(`  · skip ${a.id} · no submit/outcome date`);
      continue;
    }
    const popField = (a.overview_json && (a.overview_json.period_of_performance as string)) || "";
    const months = estimateDurationMonths(popField);
    const expires = new Date(start);
    expires.setMonth(expires.getMonth() + months);
    const daysToExpiry = Math.floor((expires.getTime() - now.getTime()) / 86400_000);

    if (daysToExpiry > ALERT_WINDOW_DAYS) {
      console.log(`  · skip ${a.notice_id || a.id} · ${daysToExpiry}d to expiry (outside ${ALERT_WINDOW_DAYS}d window)`);
      continue;
    }
    if (daysToExpiry < -30) {
      console.log(`  · skip ${a.notice_id || a.id} · expired ${-daysToExpiry}d ago`);
      continue;
    }

    alertedIds.push(a.id);
    planLines.push(`${a.notice_id || a.id} · estimated ${months}-month PoP · expires ${expires.toISOString().slice(0, 10)} · ${daysToExpiry}d remaining`);
    alertsToSend.push(`⚠️ *Recompete watch* — ${a.notice_id || "—"} expires in ${daysToExpiry}d (${a.agency || "agency unknown"})`);
  }

  console.log(`[recompete-ai] ${alertsToSend.length} new recompete alert(s) to send`);

  if (DRY_RUN) {
    planLines.slice(0, 10).forEach((l) => console.log(`  [DRY] ${l}`));
    console.log("[DRY_RUN] no DB write · no Telegram send");
    return;
  }

  if (alertsToSend.length === 0) {
    console.log("[recompete-ai] nothing new · exiting clean");
    return;
  }

  // Telegram digest — one message with all alerts (4096-char cap respected).
  const summary = [
    `*Recompete AI · ${new Date().toISOString().slice(0, 10)}*`,
    `${alertsToSend.length} contract(s) within ${ALERT_WINDOW_DAYS} days of expiry:`,
    "",
    ...alertsToSend.slice(0, 20)
  ].join("\n");
  const sent = await sendAlert(summary);
  if (!sent.ok) {
    // Alert lost — exit red WITHOUT stamping so tomorrow's run retries.
    console.error(`[recompete-ai] telegram alert failed: ${sent.reason}`);
    process.exit(1);
  }
  console.log("[recompete-ai] telegram digest sent");

  // 2. Stamp the alerted audits so each alerts exactly once. Alert-then-stamp:
  // a stamp failure means a duplicate alert tomorrow (acceptable) rather than
  // a silently lost one — exit red so the failure is visible on Railway.
  const { error: stampErr } = await supabase
    .from("audits")
    .update({ recompete_alerted_at: new Date().toISOString() })
    .in("id", alertedIds);
  if (stampErr) {
    console.error("[recompete-ai] recompete_alerted_at stamp failed:", stampErr.message);
    await sendAlert(`❌ recompete-ai: alert sent but dedup stamp FAILED (${stampErr.message}) — expect duplicate alerts until fixed. Is migration 20260729190000 applied?`);
    process.exit(1);
  }
  console.log(`[recompete-ai] stamped ${alertedIds.length} audit(s)`);
}

run().catch((err) => {
  console.error("[recompete-ai] fatal:", err);
  process.exit(1);
});
