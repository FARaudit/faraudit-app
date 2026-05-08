// Daily brief generator — runs once at 07:00 CT, creates a Gmail draft and
// persists the same payload to email_ai_state.daily_brief (jsonb) so the
// /home tab can render it without a Gmail round-trip.
//
// Brief sections (per CEO mandate 2026-05-08):
//   TODAY      — up to 5 NOW threads · one-line summary + recommended action
//   WAITING ON — up to 5 WAITING threads · sent date · days waiting · draft Y/N
//   THIS WEEK  — up to 5 THIS_WEEK threads · one-line item + deadline if any
//   SIGNAL     — counts only · X new READ today · Y new READ last 7 days

import { fetchAllPendingWaiting, saveDailyBriefJson, markBriefSent } from './db.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazily build a service-role Supabase client so brief.js doesn't crash at
// import time in dry-run paths that don't actually hit the brief.
let _supabase = null;
function supa() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('brief.js: Supabase env missing');
  _supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

// Format a Date as YYYY-MM-DD in America/Chicago timezone.
export function ctDateString(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d);
}

// Returns { hour, minute } in America/Chicago time.
export function ctClock(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hour: h, minute: m };
}

// Brief is due if the current CT clock is in the 07:00–07:29 window AND we
// haven't already sent today's brief. Aligned with the 16-min cron cadence:
// at most one cron tick lands in that 30-min window, but the date guard
// catches the edge case where the cron runs early/late.
export function isBriefDue(state, now = new Date()) {
  const today = ctDateString(now);
  if (state.last_brief_date === today) return false;
  const { hour, minute } = ctClock(now);
  return hour === 7 && minute < 30;
}

// Extract one-line header summary from a thread.
function extractOneLine(thread) {
  const messages = thread.messages || [];
  const latest = messages[messages.length - 1];
  const headers = (latest && latest.payload && latest.payload.headers) || [];
  const get = (n) => (headers.find((h) => h.name.toLowerCase() === n.toLowerCase()) || {}).value || '';
  return {
    from: get('From'),
    subject: get('Subject'),
    internalDate: latest?.internalDate || null,
  };
}

// Pull up to N threads carrying a single label, with extracted summary lines.
async function fetchLabeledSummaries(client, labelId, n) {
  const stubs = await client.listThreadsByLabel(labelId, n);
  const out = [];
  for (const stub of stubs.slice(0, n)) {
    try {
      const thread = await client.getThread(stub.id);
      out.push({ thread_id: stub.id, ...extractOneLine(thread) });
    } catch {
      // Skip on transient fetch failure; brief is non-critical.
    }
  }
  return out;
}

// Count READ threads with a latest message timestamp newer than `sinceMs`.
async function countReadSince(client, readLabelId, sinceMs) {
  const stubs = await client.listThreadsByLabel(readLabelId, 200);
  let count = 0;
  for (const stub of stubs) {
    try {
      const thread = await client.getThread(stub.id);
      const latest = (thread.messages || [])[thread.messages.length - 1];
      const idMs = parseInt(latest?.internalDate || '0', 10);
      if (idMs >= sinceMs) count++;
    } catch {
      // Skip on transient fetch failure.
    }
  }
  return count;
}

// Bulk-check which thread_ids have a draft attached via prospects_email_log.
// Returns Set<thread_id>. Used to fill the "draft Y/N" column on WAITING items.
async function threadsWithDraft(threadIds) {
  if (threadIds.length === 0) return new Set();
  const { data, error } = await supa()
    .from('prospects_email_log')
    .select('thread_id, draft_id')
    .in('thread_id', threadIds);
  if (error) {
    console.error('[email-ai brief] draft lookup failed (non-fatal):', error.message);
    return new Set();
  }
  return new Set((data || []).filter((r) => !!r.draft_id).map((r) => r.thread_id));
}

function buildBriefBody(brief) {
  const lines = [];
  lines.push(`Morning brief · ${brief.date}`);
  lines.push('');

  lines.push(`🔴 TODAY (${brief.now.length})`);
  lines.push('────────────────────');
  if (brief.now.length === 0) lines.push('  (clear)');
  else {
    for (const item of brief.now) {
      lines.push(`  · ${item.from}`);
      lines.push(`    ${item.subject}`);
      if (item.recommended_action) lines.push(`    → ${item.recommended_action}`);
    }
  }
  lines.push('');

  lines.push(`🟢 WAITING ON (${brief.waiting.length})`);
  lines.push('────────────────────');
  if (brief.waiting.length === 0) lines.push('  (none)');
  else {
    for (const item of brief.waiting) {
      const draftFlag = item.draft_ready ? 'Y' : 'N';
      lines.push(`  · ${item.from || item.sent_to || '(unknown)'} · sent ${item.sent_date} · ${item.days_waiting}d waiting · draft=${draftFlag}`);
      lines.push(`    ${item.subject}`);
    }
  }
  lines.push('');

  lines.push(`🟡 THIS WEEK (${brief.this_week.length})`);
  lines.push('────────────────────');
  if (brief.this_week.length === 0) lines.push('  (none)');
  else {
    for (const item of brief.this_week) {
      lines.push(`  · ${item.from}`);
      lines.push(`    ${item.subject}${item.deadline ? ` · ${item.deadline}` : ''}`);
    }
  }
  lines.push('');

  lines.push('🔵 SIGNAL');
  lines.push('────────────────────');
  lines.push(`  · ${brief.signal.read_today} new READ items today`);
  lines.push(`  · ${brief.signal.read_week} new READ items in last 7 days`);
  lines.push('');

  if (brief.runStats?.burstDetected) {
    lines.push(`⚠️ BURST · ${brief.runStats.burstSize} threads in last cycle (cap 50). Backlog will catch up over next ticks.`);
    lines.push('');
  }

  lines.push('Generated by Email-AI v3 at 07:00 CT.');
  return lines.join('\n');
}

export async function generateBriefIfDue({ gmailClient, state, labelIds, dryRun, runStats }) {
  if (!isBriefDue(state)) return { generated: false, reason: 'not in window or already sent today' };
  if (!labelIds) return { generated: false, reason: 'labelIds missing' };

  const today = ctDateString();
  const todayMidnightCt = new Date(`${today}T00:00:00-05:00`).getTime(); // CT ≈ UTC-5/-6; close enough for date boundary
  const weekAgoMs = Date.now() - 7 * 24 * 3600 * 1000;

  // Gather sections in parallel.
  const [nowItems, waitingItems, thisWeekItems, readToday, readWeek, waitingRows] = await Promise.all([
    fetchLabeledSummaries(gmailClient, labelIds.NOW, 5),
    fetchLabeledSummaries(gmailClient, labelIds.WAITING, 5),
    fetchLabeledSummaries(gmailClient, labelIds.THIS_WEEK, 5),
    countReadSince(gmailClient, labelIds.READ, todayMidnightCt),
    countReadSince(gmailClient, labelIds.READ, weekAgoMs),
    fetchAllPendingWaiting().catch(() => []),
  ]);

  // Annotate WAITING items with sent_at from email_waiting_log + draft Y/N.
  const waitingByTid = new Map(waitingRows.map((r) => [r.thread_id, r]));
  const draftSet = await threadsWithDraft(waitingItems.map((i) => i.thread_id));
  const waitingAnnotated = waitingItems.map((item) => {
    const row = waitingByTid.get(item.thread_id);
    const sentAt = row?.sent_at ? new Date(row.sent_at) : null;
    const days = sentAt ? Math.floor((Date.now() - sentAt.getTime()) / (24 * 3600 * 1000)) : 0;
    return {
      thread_id: item.thread_id,
      from: item.from,
      subject: item.subject,
      sent_to: row?.sent_to || null,
      sent_date: sentAt ? sentAt.toISOString().slice(0, 10) : '(unknown)',
      days_waiting: days,
      draft_ready: draftSet.has(item.thread_id),
    };
  });

  const brief = {
    date: today,
    now: nowItems.map((i) => ({
      thread_id: i.thread_id, from: i.from, subject: i.subject, recommended_action: null,
    })),
    waiting: waitingAnnotated,
    this_week: thisWeekItems.map((i) => ({
      thread_id: i.thread_id, from: i.from, subject: i.subject, deadline: null,
    })),
    signal: { read_today: readToday, read_week: readWeek },
    runStats: runStats || null,
  };

  const subject = `Morning brief · ${today}`;
  const body = buildBriefBody(brief);

  if (dryRun) {
    console.log('\n[email-ai BRIEF · DRY_RUN — not creating draft]\n');
    console.log(`Subject: ${subject}\n`);
    console.log(body);
    console.log('\n[/brief]\n');
    return { generated: false, reason: 'dry_run', brief, body };
  }

  await gmailClient.createDraft({ to: 'jose@faraudit.com', subject, body });
  await saveDailyBriefJson(brief);
  await markBriefSent(today);
  return { generated: true, subject, brief };
}
