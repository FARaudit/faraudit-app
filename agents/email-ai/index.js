// Email-AI v2 · Gmail organize cron (gmail.modify scope, no send).
//
// Pulls new INBOX threads since the last watermark, classifies into 3 tiers
// (action / monitor / archive), labels them with the canonical 10-label
// schema, archives the archive-tier ones, queues unsubscribe candidates,
// migrates legacy 📥 Action Required threads to the canonical ⚠️ Action
// Required, and at 07:00 CT drafts a daily brief.
//
// Persistence: email_ai_state · email_processing_log · unsubscribe_candidates
// · outreach_log (Supabase, service-role).

import 'dotenv/config';
import { getAuthClient } from './auth.js';
import { GmailClient } from './gmail.js';
import { evaluate } from './rules.js';
import {
  getState, updateWatermark, rolloverProcessedToday, appendProcessedToday,
  logProcessed, upsertUnsubscribeCandidate,
} from './db.js';
import { extractEmail, parseListUnsubscribe, detectProspectReply, detectKoReply } from './detect.js';
import { generateBriefIfDue, ctDateString } from './brief.js';

// ── Canonical 10-label schema ──────────────────────────────────────
// Label IDs are immutable in Gmail — using IDs avoids the ensureLabel
// round-trip and prevents accidental sub-label re-creation. Names in
// comments are CEO-curated (do not rename without coordinating).
const LABEL_IDS = {
  action:    'Label_2',                              // ⚠️ Action Required
  monitor:   'Label_3190068954376551733',            // 👀 Monitor
  archive:   'Label_143976743385970639',             // 🗄️ Archive
  legal:     'Label_5829246309597873793',            // 🏛️ Legal & Entity
  finance:   'Label_5704203879296068917',            // 💰 Finance
  infra:     'Label_844720757590499152',             // 🔧 Infrastructure
  prospects: 'Label_7847419524916820118',            // 👥 Prospects
  linkedin:  'Label_6138916314518096505',            // 📣 LinkedIn
  bullrize:  'Label_3',                              // 📥 Forwarded/Bullrize
  lexanchor: 'Label_1',                              // 📥 Forwarded/LexAnchor
};

// Legacy label scheduled for retirement — threads carrying this get migrated
// to LABEL_IDS.action on every cycle until the label is empty (CEO removes
// the label via Gmail web UI after verification).
const LEGACY_ACTION_REQUIRED = 'Label_5451607444722133154'; // 📥 Action Required (old)

const DRY_RUN = process.env.DRY_RUN === 'true';
const RUN_CAP = 50;
const FIRST_RUN_CAP = 200;        // backfill cap when watermark is null

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
  };
}

// One-time-ish migration: any thread carrying the legacy 📥 Action Required
// label (Label_5451...) gets the canonical ⚠️ Action Required (Label_2)
// added and the legacy one removed. Idempotent — once empty, this is a
// single Gmail list call returning [].
async function migrateLegacyActionRequired(client) {
  let stubs;
  try {
    stubs = await client.listThreadsByLabel(LEGACY_ACTION_REQUIRED, 100);
  } catch (e) {
    console.error(`[email-ai] legacy-label scan FAIL: ${e.message}`);
    return { found: 0, migrated: 0 };
  }
  if (stubs.length === 0) return { found: 0, migrated: 0 };

  if (DRY_RUN) {
    const sample = stubs.slice(0, 5).map((t) => t.id).join(', ');
    console.log(`\n[email-ai · DRY_RUN] legacy 📥 Action Required cleanup proposal`);
    console.log(`  Found ${stubs.length} thread${stubs.length === 1 ? '' : 's'} on ${LEGACY_ACTION_REQUIRED}`);
    console.log(`  Sample IDs: ${sample}${stubs.length > 5 ? ' …' : ''}`);
    console.log(`  On first LIVE run: addLabelIds=[${LABEL_IDS.action}], removeLabelIds=[${LEGACY_ACTION_REQUIRED}]`);
    console.log(`  Legacy label NOT deleted — CEO removes via Gmail web UI after verification.\n`);
    return { found: stubs.length, migrated: 0 };
  }

  let migrated = 0;
  for (const t of stubs) {
    try {
      await client.modifyThread(t.id, [LABEL_IDS.action], [LEGACY_ACTION_REQUIRED]);
      migrated++;
    } catch (e) {
      console.error(`  · migrate FAIL thread=${t.id}: ${e.message}`);
    }
  }
  console.log(`[email-ai] migrated ${migrated}/${stubs.length} thread(s) from legacy 📥 to ⚠️ Action Required`);
  return { found: stubs.length, migrated };
}

async function run() {
  const startedAt = new Date();
  console.log(`[email-ai] start ${startedAt.toISOString()}${DRY_RUN ? ' · DRY_RUN' : ''}`);
  bootDiagnostics();

  // ── Auth + state ──────────────────────────────────────────────────
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
    console.error('[email-ai] state read FAIL — has migration 018 been applied?');
    throw e;
  }

  const today = ctDateString();
  await rolloverProcessedToday(today);

  // ── Legacy label migration (runs every cycle, no-op once empty) ──
  const legacyResult = await migrateLegacyActionRequired(client);

  // ── Fetch threads ─────────────────────────────────────────────────
  const watermark = state.last_run_at ? Math.floor(new Date(state.last_run_at).getTime() / 1000) : null;
  const cap = watermark ? RUN_CAP : FIRST_RUN_CAP;

  let threadStubs;
  try {
    threadStubs = await client.listInboxThreads(cap + 1, watermark);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/invalid_grant|invalid_token|unauthorized_client/i.test(msg)) {
      console.error('[email-ai] OAUTH FAIL · refresh token rejected. Run scripts/get-token.js with the Desktop client to mint a fresh refresh token.');
    } else if (/insufficient.*scope|forbidden|permission/i.test(msg)) {
      console.error('[email-ai] SCOPE FAIL · token lacks gmail.modify or gmail.labels.');
    } else {
      console.error('[email-ai] threads.list FAIL ·', msg);
    }
    throw e;
  }

  const burstDetected = threadStubs.length > cap;
  const toProcess = threadStubs.slice(0, cap);
  console.log(`[email-ai] watermark=${watermark || 'null (first run)'} · fetched=${threadStubs.length} · cap=${cap}${burstDetected ? ' · BURST' : ''}`);

  if (burstDetected) {
    console.warn(`[email-ai] BURST ALERT · ${threadStubs.length} new threads since last watermark · capped at ${cap}, remaining will process next tick`);
  }

  // ── Per-thread classify + apply ──────────────────────────────────
  const logRows = [];
  let labeled = 0, archived = 0, flaggedAction = 0, flaggedMonitor = 0, skipped = 0, errors = 0;
  let latestInternalDate = watermark || 0;

  for (const t of toProcess) {
    try {
      const full = await client.getThread(t.id);
      const message = extractHeaders(full);

      // Track most-recent internalDate seen, for watermark advancement.
      const idMs = parseInt(message.internalDate || '0', 10);
      if (idMs > 0 && Math.floor(idMs / 1000) > latestInternalDate) {
        latestInternalDate = Math.floor(idMs / 1000);
      }

      const fromEmail = extractEmail(message.from);

      // 1. DB-driven detectors first (override pure rules on hit)
      let classification = null;
      const koMatch = await detectKoReply(message);
      if (koMatch) {
        classification = {
          rule: `KO Reply · audit ${koMatch.notice_id || koMatch.id}`,
          category: 'prospects',
          tier: 'action',
        };
      } else if (await detectProspectReply(message)) {
        classification = {
          rule: 'Prospect Reply · matched outreach_log',
          category: 'prospects',
          tier: 'action',
        };
      } else {
        classification = evaluate(message);
      }

      // 2. Unsubscribe candidate detection (archive-tier with List-Unsubscribe header)
      if (classification && classification.tier === 'archive' && message.listUnsubscribe && fromEmail) {
        const { url, mailto } = parseListUnsubscribe(message.listUnsubscribe);
        if (url || mailto) {
          await upsertUnsubscribeCandidate({ sender: fromEmail, unsubscribeUrl: url, unsubscribeMailto: mailto });
        }
      }

      // 3. Skip when no rule + no detector matches
      if (!classification) {
        skipped++;
        logRows.push({
          thread_id: t.id,
          rule_name: null,
          tier: 'skip',
          category: null,
          labels_added: [],
          labels_removed: [],
          from_address: fromEmail,
          subject: (message.subject || '').slice(0, 200),
          was_dry_run: DRY_RUN,
          tokens_input: 0,
          tokens_output: 0,
          model_name: null,
        });
        console.log(`  · skip · ${message.from} · ${message.subject}`);
        continue;
      }

      // 4. Apply 10-label canonical assignment by Label ID
      const categoryLabelId = LABEL_IDS[classification.category];
      if (!categoryLabelId) {
        console.error(`  · CONFIG FAIL · unknown category="${classification.category}" for rule "${classification.rule}" — thread=${t.id}`);
        errors++;
        continue;
      }
      const addLabelIds = [categoryLabelId];
      if (classification.tier === 'action') {
        addLabelIds.push(LABEL_IDS.action);
        flaggedAction++;
      } else if (classification.tier === 'monitor') {
        addLabelIds.push(LABEL_IDS.monitor);
        flaggedMonitor++;
      } else if (classification.tier === 'archive') {
        addLabelIds.push(LABEL_IDS.archive);
      }
      const removeLabelIds = classification.tier === 'archive' ? ['INBOX'] : [];

      if (!DRY_RUN) {
        await client.modifyThread(t.id, addLabelIds, removeLabelIds);
      }

      labeled++;
      if (classification.tier === 'archive') archived++;

      logRows.push({
        thread_id: t.id,
        rule_name: classification.rule,
        tier: classification.tier,
        category: classification.category,
        labels_added: addLabelIds,
        labels_removed: removeLabelIds,
        from_address: fromEmail,
        subject: (message.subject || '').slice(0, 200),
        was_dry_run: DRY_RUN,
        tokens_input: 0,
        tokens_output: 0,
        model_name: null,
      });

      console.log(`  · ${classification.rule} · ${classification.category}/${classification.tier} · from=${message.from} · subj=${message.subject}`);
    } catch (err) {
      errors++;
      console.error(`  · ERROR thread=${t.id} · ${err.message}`);
    }
  }

  // ── Persist log + advance watermark + accumulate today's set ─────
  await logProcessed(logRows);
  const processedIds = toProcess.map((t) => t.id);
  await appendProcessedToday(processedIds);
  if (latestInternalDate > 0) {
    await updateWatermark(new Date(latestInternalDate * 1000));
  } else if (toProcess.length > 0) {
    await updateWatermark(new Date());
  }

  // ── Daily brief (07:00 CT, idempotent via last_brief_date) ───────
  let briefResult = { generated: false, reason: 'not attempted' };
  try {
    briefResult = await generateBriefIfDue({
      gmailClient: client,
      state: await getState(),
      dryRun: DRY_RUN,
      briefStats: {
        lastRunBurst: burstDetected ? threadStubs.length : 0,
        oauthRefreshFailed: false,
        pendingPhysicalMail: 0,                          // TODO v2.1: real query
        legacyMigrationFound: legacyResult.found,
        legacyMigrationApplied: legacyResult.migrated,
      },
    });
  } catch (e) {
    console.error('[email-ai] brief generation FAIL (non-fatal) ·', e.message);
  }

  const finishedAt = new Date();
  console.log(
    `[email-ai] done ${finishedAt.toISOString()} · processed=${toProcess.length} labeled=${labeled} archived=${archived} action=${flaggedAction} monitor=${flaggedMonitor} skipped=${skipped} errors=${errors} burst=${burstDetected} legacy_found=${legacyResult.found} legacy_migrated=${legacyResult.migrated} brief=${briefResult.generated ? 'sent' : briefResult.reason} duration=${finishedAt - startedAt}ms`
  );
}

run().catch((e) => {
  console.error('[email-ai] fatal', e);
  process.exit(1);
});
