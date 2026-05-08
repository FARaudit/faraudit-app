// Email-AI v3 · Autonomous Gmail triage cron.
//
// Per CEO mandate (2026-05-08): every unread INBOX thread classified by
// claude-opus-4-7 into one of six buckets — NOW · THIS_WEEK · WAITING ·
// READ · ARCHIVE · DELETE. Labels applied via gmail.modify; ARCHIVE/DELETE
// also strip INBOX; DELETE moves to Trash. WAITING threads tracked in
// email_waiting_log and auto-promoted to NOW after 72h of silence. READ
// threads auto-archived after 7 days of inactivity. Daily brief at 07:00 CT.
//
// Persistence: email_ai_state (counters + brief jsonb) · email_processing_log
// · email_waiting_log · prospects_email_log (Supabase, service-role).

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { getAuthClient } from './auth.js';
import { GmailClient } from './gmail.js';
import {
  getState, updateWatermark, rolloverProcessedToday, appendProcessedToday,
  logProcessed, incrementStateCounters,
  upsertWaitingLog, fetchPendingWaitingThreads, markWaitingPromoted,
  markWaitingResolved, insertProspectLog,
} from './db.js';
import { extractEmail, detectProspectReply, detectKoReply } from './detect.js';
import { ensureSixLabels, buildIdToKey, LABEL_KEYS } from './labels.js';
import { classifyThread } from './classify.js';
import { isProspect, prospectDomain, prospectName } from './prospects.js';
import { generateBriefIfDue, ctDateString } from './brief.js';

const DRY_RUN = process.env.DRY_RUN === 'true';
const RUN_CAP = 50;
const FIRST_RUN_CAP = 200;
const GMAIL_USER = (process.env.GMAIL_USER || 'jose@faraudit.com').toLowerCase();
const DRY_RUN_REPORT_PATH = process.env.DRY_RUN_REPORT_PATH || '/tmp/email-ai-dry-run.md';
const WAITING_PROMOTION_AGE_HOURS = 72;
const READ_AUTO_ARCHIVE_DAYS = 7;
// Phase-3-only override: classify the entire current unread inbox in one shot,
// ignoring the watermark. Used to satisfy the spec's "classify all ~57+ unread"
// audit before flipping DRY_RUN=false. Has no effect outside DRY_RUN.
const FRESH_SCAN = process.env.FRESH_SCAN === 'true';

function bootDiagnostics() {
  const have = (k) => {
    const v = process.env[k];
    if (!v) return `${k}=MISSING`;
    return `${k}=present (len=${v.length})`;
  };
  console.log(
    '[email-ai] env check ·',
    have('GMAIL_CLIENT_ID'),
    have('GMAIL_CLIENT_SECRET'),
    have('GMAIL_REFRESH_TOKEN'),
    have('NEXT_PUBLIC_SUPABASE_URL'),
    have('SUPABASE_SERVICE_ROLE_KEY'),
    have('ANTHROPIC_API_KEY'),
  );
  console.log(`[email-ai] runtime · node=${process.version} · DRY_RUN=${DRY_RUN}`);
}

function extractHeaders(thread) {
  const messages = thread.messages || [];
  const latest = messages[messages.length - 1];
  const headers = (latest && latest.payload && latest.payload.headers) || [];
  const get = (n) => (headers.find((h) => h.name.toLowerCase() === n.toLowerCase()) || {}).value || '';
  return {
    from: get('From'),
    to: get('To'),
    subject: get('Subject'),
    date: get('Date'),
    listUnsubscribe: get('List-Unsubscribe'),
    internalDate: latest?.internalDate || null,
    snippet: latest?.snippet || '',
  };
}

// Did the CEO send any message on this thread? Returns the timestamp (ISO)
// of the most-recent CEO-from message, or null. Used both as the WAITING
// hint flag and as the sent_at value when we log to email_waiting_log.
function ceoLatestSentAt(thread) {
  const messages = thread.messages || [];
  let latestMs = 0;
  for (const m of messages) {
    const headers = (m.payload && m.payload.headers) || [];
    const fromHdr = headers.find((h) => h.name.toLowerCase() === 'from');
    if (!fromHdr) continue;
    const fromEmail = extractEmail(fromHdr.value);
    if (fromEmail !== GMAIL_USER) continue;
    const idMs = parseInt(m.internalDate || '0', 10);
    if (idMs > latestMs) latestMs = idMs;
  }
  return latestMs > 0 ? new Date(latestMs).toISOString() : null;
}

// Normalize a subject for duplicate-detection grouping.
function normalizeSubject(s) {
  return (s || '')
    .toLowerCase()
    .replace(/^\s*(re|fwd|fw):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// In-batch duplicate detector. Builds groups keyed by (sender + normalized
// subject) and flags any thread that is NOT the oldest in its group as a
// duplicate of the oldest. Returns Map<thread_id, oldest_thread_id>.
function detectInBatchDuplicates(threadsWithHeaders) {
  const groups = new Map();
  for (const t of threadsWithHeaders) {
    const sender = extractEmail(t.headers.from) || '';
    const subj = normalizeSubject(t.headers.subject);
    if (!sender || !subj) continue;
    const key = `${sender}|${subj}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const dupes = new Map();
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => parseInt(a.headers.internalDate || '0', 10) - parseInt(b.headers.internalDate || '0', 10));
    const oldest = list[0].id;
    for (let i = 1; i < list.length; i++) dupes.set(list[i].id, oldest);
  }
  return dupes;
}

// ── WAITING auto-promotion sweep ─────────────────────────────────────
// Pending email_waiting_log rows older than WAITING_PROMOTION_AGE_HOURS get
// re-evaluated: if the Gmail thread has had no inbound message since sent_at,
// strip WAITING and apply NOW. Skips threads that already received a reply
// (those get marked resolved instead).
async function sweepWaitingPromotions(client, labelIds) {
  const cutoff = new Date(Date.now() - WAITING_PROMOTION_AGE_HOURS * 3600 * 1000).toISOString();
  let pending;
  try {
    pending = await fetchPendingWaitingThreads(cutoff);
  } catch (e) {
    console.error('[email-ai] waiting sweep · fetch FAIL:', e.message);
    return { promoted: 0, resolved: 0 };
  }
  if (pending.length === 0) return { promoted: 0, resolved: 0 };

  let promoted = 0;
  let resolved = 0;
  for (const row of pending) {
    try {
      const thread = await client.getThreadFull(row.thread_id);
      const sentAtMs = new Date(row.sent_at).getTime();
      let inboundAfterSentAt = false;
      for (const m of thread.messages || []) {
        const fromHdr = (m.payload?.headers || []).find((h) => h.name.toLowerCase() === 'from');
        if (!fromHdr) continue;
        const fromEmail = extractEmail(fromHdr.value);
        if (fromEmail === GMAIL_USER) continue;
        if (parseInt(m.internalDate || '0', 10) > sentAtMs) {
          inboundAfterSentAt = true;
          break;
        }
      }
      if (inboundAfterSentAt) {
        // Reply arrived — leave classifier to handle the new inbound. Mark
        // the WAITING row resolved here so the sweep doesn't keep retrying.
        if (!DRY_RUN) await markWaitingResolved(row.thread_id);
        resolved++;
        continue;
      }
      // Stale — promote to NOW.
      if (!DRY_RUN) {
        await client.modifyThread(row.thread_id, [labelIds.NOW], [labelIds.WAITING]);
        await markWaitingPromoted(row.thread_id);
      }
      promoted++;
      console.log(`  · WAITING→NOW · thread=${row.thread_id} · subject="${(row.subject || '').slice(0, 60)}"`);
    } catch (e) {
      console.error(`[email-ai] waiting sweep · thread=${row.thread_id} FAIL: ${e.message}`);
    }
  }
  return { promoted, resolved };
}

// ── READ auto-archive sweep ──────────────────────────────────────────
// Threads carrying the READ label whose latest message is older than
// READ_AUTO_ARCHIVE_DAYS get INBOX stripped (still discoverable by label).
async function sweepReadAutoArchive(client, labelIds) {
  let stubs;
  try {
    stubs = await client.listThreadsByLabel(labelIds.READ, 100);
  } catch (e) {
    console.error('[email-ai] read sweep · list FAIL:', e.message);
    return { archived: 0 };
  }
  if (stubs.length === 0) return { archived: 0 };

  const cutoffMs = Date.now() - READ_AUTO_ARCHIVE_DAYS * 24 * 3600 * 1000;
  let archived = 0;
  for (const stub of stubs) {
    try {
      const thread = await client.getThread(stub.id);
      const messages = thread.messages || [];
      const latest = messages[messages.length - 1];
      const idMs = parseInt(latest?.internalDate || '0', 10);
      if (idMs === 0 || idMs >= cutoffMs) continue;
      const stillInInbox = (thread.messages || []).some((m) => (m.labelIds || []).includes('INBOX'));
      if (!stillInInbox) continue;
      if (!DRY_RUN) {
        await client.modifyThread(stub.id, [], ['INBOX']);
      }
      archived++;
    } catch (e) {
      console.error(`[email-ai] read sweep · thread=${stub.id} FAIL: ${e.message}`);
    }
  }
  return { archived };
}

// ── DRY_RUN report builder ───────────────────────────────────────────
function buildDryRunReport({ proposals, distribution, drafts, sweeps, today }) {
  const lines = [];
  lines.push(`# Email-AI · DRY_RUN report · ${today}`);
  lines.push('');
  lines.push('## Bucket distribution');
  lines.push('');
  lines.push('| Label | Count | % |');
  lines.push('|-------|------:|--:|');
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
  for (const k of LABEL_KEYS) {
    const n = distribution[k] || 0;
    lines.push(`| ${k} | ${n} | ${((n / total) * 100).toFixed(1)}% |`);
  }
  lines.push(`| **TOTAL** | **${total}** | 100% |`);
  lines.push('');

  lines.push('## DELETE candidates (every one — review)');
  lines.push('');
  const deletes = proposals.filter((p) => p.label === 'DELETE');
  if (deletes.length === 0) lines.push('_(none)_');
  else {
    lines.push('| # | Sender | Subject | Confidence | Reason |');
    lines.push('|---|--------|---------|-----------:|--------|');
    deletes.forEach((p, i) => {
      lines.push(`| ${i + 1} | ${(p.from || '').slice(0, 40)} | ${(p.subject || '').slice(0, 60)} | ${p.confidence.toFixed(2)} | ${p.reason} |`);
    });
  }
  lines.push('');

  const sample = (label) => {
    lines.push(`## ${label} sample (up to 5)`);
    lines.push('');
    const items = proposals.filter((p) => p.label === label).slice(0, 5);
    if (items.length === 0) lines.push('_(none)_');
    else {
      lines.push('| Sender | Subject | Reason |');
      lines.push('|--------|---------|--------|');
      items.forEach((p) => {
        lines.push(`| ${(p.from || '').slice(0, 40)} | ${(p.subject || '').slice(0, 60)} | ${p.reason} |`);
      });
    }
    lines.push('');
  };
  sample('NOW');
  sample('ARCHIVE');

  lines.push('## Drafts the agent would create');
  lines.push('');
  if (drafts.length === 0) lines.push('_(none)_');
  else {
    drafts.forEach((d, i) => {
      lines.push(`### Draft ${i + 1} · to ${d.to}`);
      lines.push('');
      lines.push(`**Subject:** ${d.subject}`);
      lines.push('');
      lines.push('```');
      lines.push(d.body);
      lines.push('```');
      lines.push('');
    });
  }

  lines.push('## Sweeps');
  lines.push('');
  lines.push(`- WAITING→NOW promotions (proposed): **${sweeps.promoted}**`);
  lines.push(`- WAITING resolved (inbound reply seen): **${sweeps.resolved}**`);
  lines.push(`- READ auto-archive (proposed): **${sweeps.readArchived}**`);
  lines.push('');
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────
async function run() {
  const startedAt = new Date();
  console.log(`[email-ai] start ${startedAt.toISOString()}${DRY_RUN ? ' · DRY_RUN' : ''}`);
  bootDiagnostics();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[email-ai] CONFIG FAIL · ANTHROPIC_API_KEY missing. Set it on Railway and redeploy.');
    process.exit(1);
  }

  let auth;
  try {
    auth = getAuthClient();
  } catch (e) {
    console.error('[email-ai] auth-config FAIL · check Railway env: GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN');
    throw e;
  }
  const client = new GmailClient(auth);

  let state;
  try {
    state = await getState();
  } catch (e) {
    console.error('[email-ai] state read FAIL — has the 6-bucket migration been applied?');
    throw e;
  }

  const today = ctDateString();
  const processedToday = await rolloverProcessedToday(today);

  const labelIds = await ensureSixLabels(client);
  const idToKey = buildIdToKey(labelIds);
  console.log(`[email-ai] labels resolved · ${LABEL_KEYS.map((k) => `${k}=${labelIds[k]}`).join(' · ')}`);

  // ── Hourly sweeps (cheap; idempotent) ──────────────────────────────
  const promo = await sweepWaitingPromotions(client, labelIds);
  const readSweep = await sweepReadAutoArchive(client, labelIds);
  if (promo.promoted > 0 || promo.resolved > 0) {
    console.log(`[email-ai] waiting sweep · promoted=${promo.promoted} resolved=${promo.resolved}`);
  }
  if (readSweep.archived > 0) {
    console.log(`[email-ai] read sweep · auto-archived=${readSweep.archived} (>${READ_AUTO_ARCHIVE_DAYS}d old)`);
  }

  // ── Fetch unread inbox window ──────────────────────────────────────
  // P0-3 fix (2026-05-08): drop watermark-based `after:{ts}` query in favor of
  // `in:inbox is:unread`. The old query missed historical unread backlog —
  // verified by FRESH_SCAN diagnostic finding 62 unread threads stuck in
  // inbox (16 ARCHIVE-bound, 22 DELETE-bound) while normal cron returned
  // fetched=0 every tick. Watermark is preserved in state for log/brief
  // continuity but no longer gates the query.
  //
  // Two filter passes prevent re-classifying threads we've already actioned:
  //   1. Drop stubs whose labelIds already include any of the 6 NOW/…/DELETE
  //      labels (means we touched it on a prior tick).
  //   2. Drop stubs in the processed_today set (today's earlier ticks).
  // Result: cron self-cleans — every tick picks up only unprocessed unread
  // threads. Once empty, fetched=0 is correct (not a bug, no work to do).
  const useFreshScan = DRY_RUN && FRESH_SCAN;
  const watermark = (!useFreshScan && state.last_run_at) ? Math.floor(new Date(state.last_run_at).getTime() / 1000) : null;
  const cap = (useFreshScan || !watermark) ? FIRST_RUN_CAP : RUN_CAP;
  // Include Gmail's auto-categorized tabs (Promotions, Social, Updates, Purchases,
  // Forums) so v2 sees the full unread surface — `in:inbox is:unread` alone
  // missed ~200 messages routed to category tabs by Gmail's classifier.
  const queryOverride = '(in:inbox OR category:promotions OR category:social OR category:updates OR category:purchases OR category:forums) is:unread -label:read -label:archive -label:delete -label:waiting -label:this_week -label:now';

  let threadStubs;
  try {
    threadStubs = await client.listInboxThreads(cap * 3, null, queryOverride);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/invalid_grant|invalid_token|unauthorized_client/i.test(msg)) {
      console.error('[email-ai] OAUTH FAIL · refresh token rejected. Run scripts/get-token.js.');
    } else if (/insufficient.*scope|forbidden|permission/i.test(msg)) {
      console.error('[email-ai] SCOPE FAIL · token lacks gmail.modify or gmail.labels.');
    } else {
      console.error('[email-ai] threads.list FAIL ·', msg);
    }
    throw e;
  }

  // Filter pass 1: drop threads that already carry one of our 6 buckets
  // (means a prior tick or day already classified them). Stubs from
  // threads.list include labelIds in some shapes — fall back to keeping
  // the stub if labelIds is missing rather than dropping silently.
  const ourLabelIds = new Set(Object.values(labelIds));
  const unhandledStubs = threadStubs.filter((s) => {
    if (!Array.isArray(s.labelIds)) return true; // unknown → keep, classify
    return !s.labelIds.some((lid) => ourLabelIds.has(lid));
  });

  // Filter pass 2: drop today's already-processed thread IDs.
  const remainingStubs = unhandledStubs.filter((s) => !processedToday.has(s.id));

  const fetchedRaw = threadStubs.length;
  const droppedAlreadyLabeled = threadStubs.length - unhandledStubs.length;
  const droppedProcessedToday = unhandledStubs.length - remainingStubs.length;
  const burstDetected = remainingStubs.length > cap;
  const toProcess = remainingStubs.slice(0, cap);
  console.log(`[email-ai] query=<inbox+5 categories, unread, no-existing-label> · fetched=${fetchedRaw} · already_labeled=${droppedAlreadyLabeled} · processed_today=${droppedProcessedToday} · to_process=${toProcess.length}/${cap}${burstDetected ? ' · BURST' : ''}`);

  // Pull full threads up front (one round-trip per thread). Headers + CEO-
  // reply detection both need the full message list.
  const threadsWithFull = [];
  for (const stub of toProcess) {
    try {
      const full = await client.getThreadFull(stub.id);
      threadsWithFull.push({ id: stub.id, full, headers: extractHeaders(full) });
    } catch (e) {
      console.error(`[email-ai] thread fetch FAIL · ${stub.id}: ${e.message}`);
    }
  }

  const inBatchDupes = detectInBatchDuplicates(threadsWithFull);

  // ── Per-thread classify + apply ────────────────────────────────────
  const logRows = [];
  const proposals = [];     // for DRY_RUN report
  const draftsProposed = []; // for DRY_RUN report
  const distribution = Object.fromEntries(LABEL_KEYS.map((k) => [k, 0]));
  let labeled = 0, archived = 0, deleted = 0, draftsCreated = 0, errors = 0;
  let latestInternalDate = watermark || 0;

  for (const t of threadsWithFull) {
    try {
      const message = t.headers;
      const fromEmail = extractEmail(message.from);

      const idMs = parseInt(message.internalDate || '0', 10);
      if (idMs > 0 && Math.floor(idMs / 1000) > latestInternalDate) {
        latestInternalDate = Math.floor(idMs / 1000);
      }

      // Hint flags fed into the classifier prompt.
      const ceoSentAtIso = ceoLatestSentAt(t.full);
      const isProspectMatch = isProspect(message.from);
      let koMatch = null;
      try { koMatch = await detectKoReply(message); } catch { /* non-fatal */ }
      let prospectReplyHint = false;
      try { prospectReplyHint = await detectProspectReply(message); } catch { /* non-fatal */ }

      // Deterministic dedup short-circuit. Skip the Claude call entirely.
      const dupeOf = inBatchDupes.get(t.id);
      let verdict;
      if (dupeOf) {
        verdict = {
          label: 'DELETE',
          confidence: 1,
          reason: `Duplicate of thread ${dupeOf} (same sender + normalized subject in this batch)`,
          recommended_action: null,
          draft_reply: null,
          is_duplicate_of_thread_id: dupeOf,
          usage: { input_tokens: 0, output_tokens: 0, ms: 0 },
          raw: '[deterministic dedup]',
        };
      } else {
        verdict = await classifyThread({
          message,
          snippet: message.snippet,
          ceoRepliedRecently: !!ceoSentAtIso || prospectReplyHint,
          isProspectMatch,
          isKoMatch: !!koMatch,
        });
      }

      distribution[verdict.label] = (distribution[verdict.label] || 0) + 1;

      // Apply mapping per spec:
      //   NOW / THIS_WEEK / WAITING / READ → add label, keep INBOX
      //   ARCHIVE → add label + remove INBOX
      //   DELETE  → add label + remove INBOX + trash
      const targetLabelId = labelIds[verdict.label];
      const addLabelIds = [targetLabelId];
      const removeLabelIds = (verdict.label === 'ARCHIVE' || verdict.label === 'DELETE') ? ['INBOX'] : [];

      if (!DRY_RUN) {
        await client.modifyThread(t.id, addLabelIds, removeLabelIds);
        if (verdict.label === 'DELETE') {
          try { await client.trashThread(t.id); } catch (e) {
            console.error(`  · trash FAIL thread=${t.id}: ${e.message}`);
          }
        }
      }

      labeled++;
      if (verdict.label === 'ARCHIVE') archived++;
      if (verdict.label === 'DELETE') deleted++;

      // WAITING → log for the 72h promotion sweep.
      if (verdict.label === 'WAITING') {
        const sentAt = ceoSentAtIso || new Date(idMs || Date.now()).toISOString();
        if (!DRY_RUN) {
          try {
            await upsertWaitingLog({
              thread_id: t.id,
              subject: (message.subject || '').slice(0, 200),
              sent_to: message.to || null,
              sent_at: sentAt,
            });
          } catch (e) {
            console.error(`  · waiting log FAIL thread=${t.id}: ${e.message}`);
          }
        }
      }

      // Prospect → create draft + log.
      if (isProspectMatch && verdict.draft_reply) {
        const subject = `Re: ${(message.subject || '').replace(/^\s*re:\s*/i, '')}`.slice(0, 200);
        let draftId = null;
        if (!DRY_RUN) {
          try {
            draftId = await client.createDraft({
              to: fromEmail || message.from,
              subject,
              body: verdict.draft_reply,
            });
            await insertProspectLog({
              thread_id: t.id,
              prospect_domain: prospectDomain(message.from) || 'unknown',
              prospect_name: prospectName(message.from),
              classification: verdict.label,
              draft_id: draftId,
            });
          } catch (e) {
            console.error(`  · prospect draft FAIL thread=${t.id}: ${e.message}`);
          }
        }
        draftsCreated++;
        draftsProposed.push({
          to: fromEmail || message.from,
          subject,
          body: verdict.draft_reply,
        });
      }

      proposals.push({
        thread_id: t.id,
        from: message.from,
        subject: message.subject,
        label: verdict.label,
        confidence: verdict.confidence,
        reason: verdict.reason,
      });

      // Map new 6-bucket label → legacy email_processing_log.tier value the
      // existing CHECK constraint accepts (action|monitor|archive|skip). The
      // real label lives on the Gmail thread + in rule_name; this is just to
      // keep the legacy audit table appendable until its tier constraint is
      // dropped in a follow-up migration.
      const legacyTier = ({
        NOW: 'action', WAITING: 'action',
        THIS_WEEK: 'monitor', READ: 'monitor',
        ARCHIVE: 'archive', DELETE: 'archive',
      })[verdict.label] || 'archive';
      logRows.push({
        thread_id: t.id,
        rule_name: `claude:${verdict.label}`,
        tier: legacyTier,
        category: verdict.label.toLowerCase(),
        labels_added: addLabelIds,
        labels_removed: removeLabelIds,
        from_address: fromEmail,
        subject: (message.subject || '').slice(0, 200),
        was_dry_run: DRY_RUN,
        tokens_input: verdict.usage?.input_tokens || 0,
        tokens_output: verdict.usage?.output_tokens || 0,
        model_name: 'claude-sonnet-4-6',
      });

      console.log(`  · ${verdict.label} (${verdict.confidence.toFixed(2)}) · ${message.from} · ${message.subject}`);
    } catch (err) {
      errors++;
      console.error(`  · ERROR thread=${t.id} · ${err.message}`);
    }
  }

  // ── Persist log + advance watermark ────────────────────────────────
  await logProcessed(logRows);
  if (!DRY_RUN) {
    const processedIds = threadsWithFull.map((t) => t.id);
    await appendProcessedToday(processedIds);
    if (latestInternalDate > 0) {
      await updateWatermark(new Date(latestInternalDate * 1000));
    } else if (threadsWithFull.length > 0) {
      await updateWatermark(new Date());
    }
    await incrementStateCounters({
      labels_applied_today: labeled,
      drafts_created_today: draftsCreated,
      auto_archived_today: archived + readSweep.archived,
      auto_deleted_today: deleted,
      waiting_thread_promotions_today: promo.promoted,
    });
  }

  // ── DRY_RUN report (filesystem + stdout) ───────────────────────────
  // Stdout copy is for Railway log capture — container /tmp is ephemeral
  // and `railway logs` is the only readable surface in production.
  if (DRY_RUN) {
    try {
      const md = buildDryRunReport({
        proposals,
        distribution,
        drafts: draftsProposed,
        sweeps: { promoted: promo.promoted, resolved: promo.resolved, readArchived: readSweep.archived },
        today,
      });
      writeFileSync(DRY_RUN_REPORT_PATH, md);
      console.log(`[email-ai DRY_RUN] report written to ${DRY_RUN_REPORT_PATH}`);
      console.log('───── BEGIN DRY_RUN REPORT ─────');
      console.log(md);
      console.log('───── END DRY_RUN REPORT ─────');
    } catch (e) {
      console.error('[email-ai DRY_RUN] report write FAIL:', e.message);
    }
  }

  // ── Daily brief (07:00 CT, idempotent) ─────────────────────────────
  let briefResult = { generated: false, reason: 'not attempted' };
  try {
    briefResult = await generateBriefIfDue({
      gmailClient: client,
      state: await getState(),
      labelIds,
      idToKey,
      dryRun: DRY_RUN,
      runStats: {
        burstDetected,
        burstSize: burstDetected ? threadStubs.length : 0,
        promoted: promo.promoted,
        readArchived: readSweep.archived,
      },
    });
  } catch (e) {
    console.error('[email-ai] brief generation FAIL (non-fatal) ·', e.message);
  }

  const finishedAt = new Date();
  console.log(
    `[email-ai] done ${finishedAt.toISOString()} · processed=${threadsWithFull.length} labeled=${labeled} archived=${archived} deleted=${deleted} drafts=${draftsCreated} promoted=${promo.promoted} read_archived=${readSweep.archived} errors=${errors} burst=${burstDetected} brief=${briefResult.generated ? 'sent' : briefResult.reason} duration=${finishedAt - startedAt}ms`
  );
}

run().catch((e) => {
  console.error('[email-ai] fatal', e);
  process.exit(1);
});
