// Supabase persistence layer for Email-AI v2.
// All tables service-role only; uses SUPABASE_SERVICE_ROLE_KEY for writes.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('email-ai/db: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── State (singleton row id=1) ───────────────────────────────────────

export async function getState() {
  const { data, error } = await supabase
    .from('email_ai_state')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw new Error(`getState: ${error.message}`);
  return data;
}

export async function updateWatermark(lastRunAt) {
  const { error } = await supabase
    .from('email_ai_state')
    .update({ last_run_at: lastRunAt.toISOString() })
    .eq('id', 1);
  if (error) throw new Error(`updateWatermark: ${error.message}`);
}

// Reset processed_today array if the CT date has rolled over since last run.
// Returns the up-to-date set.
export async function rolloverProcessedToday(currentCtDate) {
  const state = await getState();
  if (state.processed_today_date !== currentCtDate) {
    const { error } = await supabase
      .from('email_ai_state')
      .update({ processed_today: [], processed_today_date: currentCtDate })
      .eq('id', 1);
    if (error) throw new Error(`rolloverProcessedToday: ${error.message}`);
    return new Set();
  }
  return new Set(state.processed_today || []);
}

export async function appendProcessedToday(threadIds) {
  if (threadIds.length === 0) return;
  // Read-modify-write — small array, low contention (single-instance cron).
  const { data, error: readErr } = await supabase
    .from('email_ai_state')
    .select('processed_today')
    .eq('id', 1)
    .single();
  if (readErr) throw new Error(`appendProcessedToday read: ${readErr.message}`);
  const current = new Set(data.processed_today || []);
  for (const id of threadIds) current.add(id);
  const { error: writeErr } = await supabase
    .from('email_ai_state')
    .update({ processed_today: Array.from(current) })
    .eq('id', 1);
  if (writeErr) throw new Error(`appendProcessedToday write: ${writeErr.message}`);
}

export async function markBriefSent(ctDate) {
  const { error } = await supabase
    .from('email_ai_state')
    .update({ last_brief_date: ctDate })
    .eq('id', 1);
  if (error) throw new Error(`markBriefSent: ${error.message}`);
}

// ── Audit log ────────────────────────────────────────────────────────

export async function logProcessed(rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from('email_processing_log').insert(rows);
  if (error) console.error('[email-ai] processing_log write failed (non-fatal):', error.message);
}

// Aggregate last 24h for the daily brief.
export async function fetchLast24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('email_processing_log')
    .select('thread_id, rule_name, tier, category, from_address, subject, processed_at, tokens_input, tokens_output, model_name')
    .gte('processed_at', since)
    .order('processed_at', { ascending: false });
  if (error) throw new Error(`fetchLast24h: ${error.message}`);
  return data || [];
}

// ── Unsubscribe candidates ───────────────────────────────────────────

export async function upsertUnsubscribeCandidate({ sender, unsubscribeUrl, unsubscribeMailto }) {
  // Manual upsert: try update (incrementing thread_count); insert on miss.
  const senderLc = sender.toLowerCase().trim();
  const { data: existing } = await supabase
    .from('unsubscribe_candidates')
    .select('id, thread_count')
    .eq('sender', senderLc)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('unsubscribe_candidates')
      .update({
        thread_count: existing.thread_count + 1,
        last_seen: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) console.error('[email-ai] unsub update failed:', error.message);
  } else {
    const { error } = await supabase.from('unsubscribe_candidates').insert({
      sender: senderLc,
      unsubscribe_url: unsubscribeUrl || null,
      unsubscribe_mailto: unsubscribeMailto || null,
    });
    if (error) console.error('[email-ai] unsub insert failed:', error.message);
  }
}

export async function fetchPendingUnsubs() {
  const { data, error } = await supabase
    .from('unsubscribe_candidates')
    .select('sender, thread_count, last_seen')
    .eq('status', 'pending')
    .order('last_seen', { ascending: false })
    .limit(20);
  if (error) throw new Error(`fetchPendingUnsubs: ${error.message}`);
  return data || [];
}

// ── Outreach log (prospect-reply detection) ─────────────────────────

export async function isKnownOutreachRecipient(emailAddress) {
  if (!emailAddress) return false;
  const lc = emailAddress.toLowerCase().trim();
  const { data, error } = await supabase
    .from('outreach_log')
    .select('id')
    .ilike('recipient', lc)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

// ── Audits table (KO-reply detection) ───────────────────────────────

// Look up an audit by KO email recipient — used to detect when a KO replies
// to a clarification email we drafted earlier.
export async function findAuditByKoEmail(emailAddress) {
  if (!emailAddress) return null;
  const lc = emailAddress.toLowerCase().trim();
  const { data, error } = await supabase
    .from('audits')
    .select('id, notice_id, solicitation_number, title, agency, recommendation, ko_email_recipient')
    .ilike('ko_email_recipient', lc)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return (data || [])[0] || null;
}
