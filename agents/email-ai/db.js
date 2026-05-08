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
// Also zeroes the five activity counters introduced in the 6-bucket migration
// so per-day metrics are accurate. Returns the up-to-date thread-id set.
export async function rolloverProcessedToday(currentCtDate) {
  const state = await getState();
  if (state.processed_today_date !== currentCtDate) {
    const { error } = await supabase
      .from('email_ai_state')
      .update({
        processed_today: [],
        processed_today_date: currentCtDate,
        labels_applied_today: 0,
        drafts_created_today: 0,
        auto_archived_today: 0,
        auto_deleted_today: 0,
        waiting_thread_promotions_today: 0,
      })
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

// ── 6-bucket triage state · counters + brief ─────────────────────────

// Increment any combination of the five daily counters in a single update.
// Uses read-modify-write — single-instance cron, no contention. Pass only
// the counters that changed; missing keys are skipped.
export async function incrementStateCounters(deltas) {
  const keys = ['labels_applied_today', 'drafts_created_today', 'auto_archived_today', 'auto_deleted_today', 'waiting_thread_promotions_today'];
  const filtered = Object.entries(deltas).filter(([k, v]) => keys.includes(k) && v > 0);
  if (filtered.length === 0) return;

  const { data, error: readErr } = await supabase
    .from('email_ai_state')
    .select(keys.join(','))
    .eq('id', 1)
    .single();
  if (readErr) throw new Error(`incrementStateCounters read: ${readErr.message}`);

  const update = {};
  for (const [k, v] of filtered) update[k] = (data[k] || 0) + v;

  const { error: writeErr } = await supabase
    .from('email_ai_state')
    .update(update)
    .eq('id', 1);
  if (writeErr) throw new Error(`incrementStateCounters write: ${writeErr.message}`);
}

// Persist the latest morning brief as a JSON document. The /home tab can
// render it without a Gmail round-trip; daily refresh is sufficient.
export async function saveDailyBriefJson(briefJson) {
  const { error } = await supabase
    .from('email_ai_state')
    .update({ daily_brief: briefJson })
    .eq('id', 1);
  if (error) throw new Error(`saveDailyBriefJson: ${error.message}`);
}

// ── 6-bucket triage state · email_waiting_log ────────────────────────

// Record a thread that's been parked in the WAITING bucket. Idempotent on
// thread_id (UNIQUE) — repeat classifications update sent_at to the latest
// observed timestamp without breaking the unique constraint.
export async function upsertWaitingLog({ thread_id, subject, sent_to, sent_at }) {
  // Try insert first; on conflict, update sent_at to the freshest value.
  const { error: insErr } = await supabase
    .from('email_waiting_log')
    .insert({ thread_id, subject, sent_to, sent_at });
  if (!insErr) return;
  // 23505 = unique_violation. Anything else bubbles.
  if (insErr.code !== '23505') throw new Error(`upsertWaitingLog insert: ${insErr.message}`);
  const { error: updErr } = await supabase
    .from('email_waiting_log')
    .update({ sent_at })
    .eq('thread_id', thread_id);
  if (updErr) throw new Error(`upsertWaitingLog update: ${updErr.message}`);
}

// Pull pending WAITING rows where sent_at is older than `cutoffIso` and the
// row hasn't been promoted or resolved yet. Caller (the hourly sweep) decides
// per-thread whether to actually promote based on Gmail message activity.
export async function fetchPendingWaitingThreads(cutoffIso) {
  const { data, error } = await supabase
    .from('email_waiting_log')
    .select('id, thread_id, subject, sent_to, sent_at')
    .is('promoted_to_now_at', null)
    .is('resolved_at', null)
    .lt('sent_at', cutoffIso)
    .order('sent_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`fetchPendingWaitingThreads: ${error.message}`);
  return data || [];
}

export async function markWaitingPromoted(threadId) {
  const { error } = await supabase
    .from('email_waiting_log')
    .update({ promoted_to_now_at: new Date().toISOString() })
    .eq('thread_id', threadId);
  if (error) throw new Error(`markWaitingPromoted: ${error.message}`);
}

export async function markWaitingResolved(threadId) {
  const { error } = await supabase
    .from('email_waiting_log')
    .update({ resolved_at: new Date().toISOString() })
    .eq('thread_id', threadId);
  if (error) throw new Error(`markWaitingResolved: ${error.message}`);
}

// Snapshot of all currently-pending (un-resolved) WAITING rows for the
// morning brief. Includes promoted-but-unresolved entries so the brief can
// surface "you've been ignoring this" threads.
export async function fetchAllPendingWaiting() {
  const { data, error } = await supabase
    .from('email_waiting_log')
    .select('thread_id, subject, sent_to, sent_at, promoted_to_now_at')
    .is('resolved_at', null)
    .order('sent_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`fetchAllPendingWaiting: ${error.message}`);
  return data || [];
}

// ── 6-bucket triage state · prospects_email_log ──────────────────────

export async function insertProspectLog({ thread_id, prospect_domain, prospect_name, classification, draft_id }) {
  const { error } = await supabase
    .from('prospects_email_log')
    .insert({ thread_id, prospect_domain, prospect_name, classification, draft_id });
  // 23505 = duplicate thread_id (same prospect, same thread, processed twice). Non-fatal.
  if (error && error.code !== '23505') {
    console.error('[email-ai] prospect log insert failed (non-fatal):', error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────

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
