import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("audit-ai: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
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

export interface PendingAudit {
  id: string;
  notice_id: string;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  set_aside: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  source: "seed" | "sam_live" | "manual";
  status: "pending" | "processing" | "processed" | "failed";
  audit_id: string | null;  // audits.id is UUID
  recommendation: string | null;
  compliance_score: number | null;
  bid_no_bid: string | null;
  notes: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function fetchPending(limit: number): Promise<PendingAudit[]> {
  // Prioritize soonest-deadline non-expired rows so the daily cron burns its
  // Claude budget on opportunities that still have time to bid. The prior
  // "oldest-created first" order could surface already-expired rows when the
  // queue had backlog.
  // FA-116: source='user' rows belong to the resident audit-worker loop —
  // the cron must never claim them (disjoint consumer sets, no claim races).
  const { data, error } = await supabase
    .from("pending_audits")
    .select("*")
    .eq("status", "pending")
    .neq("source", "user")
    .gt("response_deadline", new Date().toISOString())
    .order("response_deadline", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`fetchPending: ${error.message}`);
  return (data as PendingAudit[]) || [];
}

export async function markProcessing(id: string): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({ status: "processing" })
    .eq("id", id);
  if (error) throw new Error(`markProcessing(${id}): ${error.message}`);
}

export async function markProcessed(
  id: string,
  result: { audit_id: string | null; recommendation: string; compliance_score: number | null; bid_no_bid: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({
      status: "processed",
      audit_id: result.audit_id,
      recommendation: result.recommendation,
      compliance_score: result.compliance_score,
      bid_no_bid: result.bid_no_bid,
      processed_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw new Error(`markProcessed(${id}): ${error.message}`);
}

export async function markFailed(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
      processed_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw new Error(`markFailed(${id}): ${error.message}`);
}

// FA-116: notice_id uniqueness is now a partial index (WHERE source <> 'user'),
// which PostgREST cannot target as an ON CONFLICT arbiter — upsert(onConflict:
// "notice_id") throws 42P10 against it. Replaced with select-then-split:
// existing non-user rows are updated by notice_id, fresh rows inserted.
// Single-writer (daily cron / manual seed), so the non-atomic window is moot.
export async function upsertPending(rows: Array<Partial<PendingAudit> & { notice_id: string }>): Promise<number> {
  if (rows.length === 0) return 0;
  const { data: existing, error: existErr } = await supabase
    .from("pending_audits")
    .select("notice_id")
    .neq("source", "user")
    .in("notice_id", rows.map((r) => r.notice_id));
  if (existErr) throw new Error(`upsertPending existence check: ${existErr.message}`);
  const existingSet = new Set(((existing || []) as Array<{ notice_id: string }>).map((r) => r.notice_id));

  let written = 0;
  const fresh = rows.filter((r) => !existingSet.has(r.notice_id));
  if (fresh.length > 0) {
    const { error, count } = await supabase
      .from("pending_audits")
      .insert(fresh, { count: "exact" });
    if (error) throw new Error(`upsertPending insert: ${error.message}`);
    written += count ?? fresh.length;
  }
  for (const row of rows.filter((r) => existingSet.has(r.notice_id))) {
    const { error } = await supabase
      .from("pending_audits")
      .update(row)
      .eq("notice_id", row.notice_id)
      .neq("source", "user");
    if (error) throw new Error(`upsertPending update(${row.notice_id}): ${error.message}`);
    written += 1;
  }
  return written;
}

// Corpus ceiling helper — returns total completed audits
export async function getCompletedCount(): Promise<number> {
  const { count } = await supabase
    .from('audits')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'complete');
  return count ?? 0;
}

// Sweep expired pending rows so they stop polluting the dashboard. fetchPending
// already filters response_deadline > now() — that means any pending row with a
// past deadline is stuck forever (gray "…" tile on the Kanban). This marks them
// as failed with a clear error_message, and mirrors the change to the audits
// table for opportunities_pin stub rows so the UI tile flips out of gray.
//
// Idempotent: re-running is a no-op once rows are flipped to status='failed'.
const kExpiredMessage = "response_deadline expired before scoring";

export async function cleanupExpired(): Promise<{ pending_audits: number; audits: number }> {
  const nowIso = new Date().toISOString();

  // FA-116: never sweep user-enqueued rows — auditing an expired solicitation
  // is a supported user flow (closed-state report mode); the audit-worker
  // claims those regardless of deadline.
  const { data: paRows, error: paErr } = await supabase
    .from("pending_audits")
    .update({
      status: "failed",
      error_message: kExpiredMessage,
      processed_at: nowIso
    })
    .eq("status", "pending")
    .neq("source", "user")
    .lt("response_deadline", nowIso)
    .select("notice_id");
  if (paErr) throw new Error(`cleanupExpired(pending_audits): ${paErr.message}`);

  const { data: auRows, error: auErr } = await supabase
    .from("audits")
    .update({
      status: "failed",
      error_message: kExpiredMessage
    })
    .eq("audit_source", "opportunities_pin")
    .eq("status", "pending")
    .lt("response_deadline", nowIso)
    .select("notice_id");
  if (auErr) throw new Error(`cleanupExpired(audits): ${auErr.message}`);

  return {
    pending_audits: paRows?.length || 0,
    audits: auRows?.length || 0
  };
}

