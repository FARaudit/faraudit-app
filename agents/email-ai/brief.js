// Daily brief generator — runs once at 07:00 CT, creates a Gmail draft.

import { fetchLast24h, fetchPendingUnsubs, markBriefSent } from './db.js';

// Format a Date as YYYY-MM-DD in America/Chicago timezone.
export function ctDateString(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

// Returns { hour, minute } in America/Chicago time.
export function ctClock(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hour: h, minute: m };
}

// Brief is due if:
//   1. The current CT clock is in the 07:00–07:29 window
//   2. The state's last_brief_date != today's CT date
export function isBriefDue(state, now = new Date()) {
  const today = ctDateString(now);
  if (state.last_brief_date === today) return false;
  const { hour, minute } = ctClock(now);
  return hour === 7 && minute < 30;
}

// Sonnet 4.6 list pricing (Anthropic public list 2026 — $3 input / $15
// output per million tokens). Update if model_name in the log indicates
// a different model. v2 always logs 0/0 (rule-based, no LLM); the
// structure is in place for v3 LLM augmentation.
const PER_TOKEN_INPUT = 3.0 / 1_000_000;
const PER_TOKEN_OUTPUT = 15.0 / 1_000_000;
const DAILY_COST_ALERT = 1.00;        // anomaly threshold

function buildCostLines(logs) {
  const totals = logs.reduce(
    (acc, r) => {
      acc.input += r.tokens_input || 0;
      acc.output += r.tokens_output || 0;
      return acc;
    },
    { input: 0, output: 0 }
  );
  const cost = totals.input * PER_TOKEN_INPUT + totals.output * PER_TOKEN_OUTPUT;
  const lines = [
    `  Email-AI: ${totals.input.toLocaleString()} input + ${totals.output.toLocaleString()} output tokens · $${cost.toFixed(4)}`,
  ];
  if (cost > DAILY_COST_ALERT) {
    lines.push(`  ⚠️ ANOMALY · daily cost $${cost.toFixed(2)} exceeds $${DAILY_COST_ALERT.toFixed(2)} baseline`);
  } else if (cost === 0) {
    lines.push('  (rule-based, no LLM calls — structure ready for v3 augmentation)');
  }
  return { lines, cost, totals };
}

// Build a plain-text brief body from the last-24h log + queue snapshot.
function buildBody({ logs, unsubs, missRate, anomalies, pendingPhysicalMail }) {
  const byTier = { action: [], monitor: [], archive: [] };
  for (const r of logs) {
    if (r.tier && byTier[r.tier]) byTier[r.tier].push(r);
  }

  const fmtRow = (r) => {
    const sender = (r.from_address || '?').slice(0, 40);
    const subj = (r.subject || '').slice(0, 70);
    return `  - ${sender} · ${subj}`;
  };

  const lines = [];
  lines.push(`⚠️ ACTION REQUIRED (${byTier.action.length})`);
  lines.push('─────────────────────');
  if (byTier.action.length === 0) lines.push('  (none)');
  else byTier.action.slice(0, 20).forEach((r) => lines.push(fmtRow(r)));
  lines.push('');

  lines.push(`👀 MONITOR (${byTier.monitor.length})`);
  lines.push('─────────────');
  if (byTier.monitor.length === 0) lines.push('  (none)');
  else byTier.monitor.slice(0, 10).forEach((r) => lines.push(fmtRow(r)));
  lines.push('');

  lines.push(`🗄️ AUTO-ARCHIVED (${byTier.archive.length})`);
  lines.push('─────────────────────');
  if (byTier.archive.length === 0) lines.push('  (none)');
  else {
    const senderCounts = new Map();
    for (const r of byTier.archive) {
      const s = (r.from_address || '?').split('@').pop() || '?';
      senderCounts.set(s, (senderCounts.get(s) || 0) + 1);
    }
    const top = [...senderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const [s, n] of top) lines.push(`  - ${s} · ${n} thread${n === 1 ? '' : 's'}`);
  }
  lines.push('');

  lines.push('📬 PENDING PHYSICAL MAIL');
  lines.push('────────────────────────');
  lines.push(`  ${pendingPhysicalMail} unread Stable mailroom thread${pendingPhysicalMail === 1 ? '' : 's'} in last 7 days.`);
  lines.push('');

  lines.push('🚨 ANOMALIES');
  lines.push('────────────');
  if (anomalies.length === 0) lines.push('  (none)');
  else anomalies.forEach((a) => lines.push(`  - ${a}`));
  lines.push(`  Rule miss rate (last 24h): ${(missRate * 100).toFixed(1)}% ${missRate < 0.4 ? '✓' : '⚠️ above 40% target'}`);
  lines.push('');

  lines.push('💰 COST (last 24h)');
  lines.push('────────────────');
  const cost = buildCostLines(logs);
  for (const l of cost.lines) lines.push(l);
  lines.push('');

  lines.push(`📋 UNSUBSCRIBE CANDIDATES (${unsubs.length} pending)`);
  lines.push('────────────────────────────────');
  if (unsubs.length === 0) lines.push('  (none)');
  else unsubs.slice(0, 10).forEach((u) => lines.push(`  - ${u.sender} · ${u.thread_count} thread${u.thread_count === 1 ? '' : 's'}`));
  lines.push('');

  lines.push('Generated by Email-AI v2 at 07:00 CT.');

  return lines.join('\n');
}

export async function generateBriefIfDue({ gmailClient, state, dryRun, briefStats }) {
  if (!isBriefDue(state)) return { generated: false, reason: 'not in window or already sent today' };

  const today = ctDateString();
  const logs = await fetchLast24h();
  const unsubs = await fetchPendingUnsubs();

  const totalProcessed = logs.length;
  const skipped = logs.filter((r) => r.tier === 'skip').length;
  const missRate = totalProcessed > 0 ? skipped / totalProcessed : 0;

  const anomalies = [];
  if (briefStats?.oauthRefreshFailed) anomalies.push('OAuth refresh failure detected this cycle');
  if (briefStats?.lastRunBurst) anomalies.push(`Burst run: ${briefStats.lastRunBurst} new threads in 30 min (cap: 50)`);

  const subject = `[Brief] ${today} — Inbox Status`;
  const body = buildBody({
    logs,
    unsubs,
    missRate,
    anomalies,
    pendingPhysicalMail: briefStats?.pendingPhysicalMail ?? 0,
  });

  if (dryRun) {
    console.log('\n[email-ai BRIEF · DRY_RUN — not creating draft]\n');
    console.log(`Subject: ${subject}\n`);
    console.log(body);
    console.log('\n[/brief]\n');
    return { generated: false, reason: 'dry_run' };
  }

  await gmailClient.createDraft({ to: 'jose@faraudit.com', subject, body });
  await markBriefSent(today);
  return { generated: true, subject };
}
