// Recompete AI — daily Railway cron worker.
//
// Scans audits.outcome='won' rows. For each, estimates the period of
// performance (preferring overview_json.period_of_performance, falling
// back to a 12-month default). When a contract is within 180 days of
// estimated expiration AND we haven't already queued a recompete for
// that origin audit, write a new pending_audits row with
// source='recompete' + recompete_origin_audit set, then Telegram-alert.
//
// DRY_RUN=true logs the plan but writes nothing.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
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
  auth: { persistSession: false, autoRefreshToken: false }
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
  pdf_url: string | null;
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
    .select("id, notice_id, title, agency, naics_code, set_aside, bid_submit_date, outcome_date, overview_json, pdf_url")
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

  // 2. Pull pending_audits already emitted by recompete-ai so we don't double-emit.
  const { data: existingRecompetes } = await supabase
    .from("pending_audits")
    .select("recompete_origin_audit")
    .eq("source", "recompete");
  const alreadyEmitted = new Set(
    ((existingRecompetes as Array<{ recompete_origin_audit: string | null }>) || [])
      .map((r) => r.recompete_origin_audit)
      .filter((id): id is string => !!id)
  );

  const now = new Date();
  const newRows: Array<{
    notice_id: string;
    title: string | null;
    agency: string | null;
    naics_code: string | null;
    set_aside: string | null;
    pdf_url: string | null;
    source: "recompete";
    notice_type: "recompete";
    notes: string;
    recompete_origin_audit: string;
  }> = [];
  const alertsToSend: string[] = [];

  for (const a of candidates) {
    if (alreadyEmitted.has(a.id)) continue;
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

    const recompeteNoticeId = `RECOMPETE-${a.notice_id || a.id.slice(0, 8)}-${expires.toISOString().slice(0, 7)}`;
    newRows.push({
      notice_id: recompeteNoticeId,
      title: a.title ? `Recompete watch — ${a.title}` : "Recompete watch",
      agency: a.agency,
      naics_code: a.naics_code,
      set_aside: a.set_aside,
      pdf_url: a.pdf_url,
      source: "recompete",
      notice_type: "recompete",
      notes: `Origin audit ${a.id} · estimated ${months}-month PoP · expires ${expires.toISOString().slice(0, 10)} · ${daysToExpiry}d remaining`,
      recompete_origin_audit: a.id
    });
    alertsToSend.push(`⚠️ *Recompete watch* — ${a.notice_id || "—"} expires in ${daysToExpiry}d (${a.agency || "agency unknown"})`);
  }

  console.log(`[recompete-ai] ${newRows.length} new recompete watch row(s) to emit`);

  if (DRY_RUN) {
    newRows.slice(0, 10).forEach((r) => console.log(`  [DRY] ${r.notice_id} · ${r.notes}`));
    console.log("[DRY_RUN] no DB write · no Telegram send");
    return;
  }

  if (newRows.length === 0) {
    console.log("[recompete-ai] nothing new · exiting clean");
    return;
  }

  const { error: insertErr } = await supabase.from("pending_audits").insert(newRows);
  if (insertErr) {
    console.error("[recompete-ai] insert failed:", insertErr.message);
    // Try to alert anyway so the CEO knows.
    await sendAlert(`❌ recompete-ai insert failed: ${insertErr.message}`);
    process.exit(1);
  }
  console.log(`[recompete-ai] inserted ${newRows.length} pending_audits rows`);

  // Telegram digest — one message with all alerts (4096-char cap respected).
  const summary = [
    `*Recompete AI · ${new Date().toISOString().slice(0, 10)}*`,
    `${newRows.length} contract(s) within ${ALERT_WINDOW_DAYS} days of expiry:`,
    "",
    ...alertsToSend.slice(0, 20)
  ].join("\n");
  const sent = await sendAlert(summary);
  if (!sent.ok) {
    console.warn(`[recompete-ai] telegram alert failed: ${sent.reason}`);
  } else {
    console.log("[recompete-ai] telegram digest sent");
  }
}

run().catch((err) => {
  console.error("[recompete-ai] fatal:", err);
  process.exit(1);
});
