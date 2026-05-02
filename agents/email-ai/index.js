import 'dotenv/config';
import { getAuthClient } from './auth.js';
import { GmailClient } from './gmail.js';
import { evaluate } from './rules.js';

const ACTION_REQUIRED_LABEL = '⚠️ Action Required';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Loud boot diagnostics — print what's reaching the container before we touch
// any Google APIs. If Railway logs show missing env vars or zero-length tokens,
// the fix is in the dashboard, not the code.
function bootDiagnostics() {
  const have = (k) => {
    const v = process.env[k];
    if (!v) return `${k}=MISSING`;
    return `${k}=present (len=${v.length})`;
  };
  console.log('[email-ai] env check ·',
    have('GMAIL_CLIENT_ID'),
    have('GMAIL_CLIENT_SECRET'),
    have('GMAIL_REFRESH_TOKEN')
  );
  console.log('[email-ai] runtime · node=' + process.version + ' · DRY_RUN=' + DRY_RUN);
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
  };
}

async function run() {
  const startedAt = new Date();
  console.log(`[email-ai] start ${startedAt.toISOString()}${DRY_RUN ? ' · DRY_RUN' : ''}`);
  bootDiagnostics();

  let auth;
  try {
    auth = getAuthClient();
  } catch (e) {
    console.error('[email-ai] auth-config FAIL · check Railway dashboard env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN');
    throw e;
  }

  const client = new GmailClient(auth);

  let threads;
  try {
    threads = await client.listInboxThreads(100);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/invalid_grant|invalid_token|unauthorized_client/i.test(msg)) {
      console.error('[email-ai] OAUTH FAIL · refresh token rejected by Google.');
      console.error('[email-ai]   most likely cause: token was rotated (email-ai-v2 client) but Railway still holds the old GMAIL_REFRESH_TOKEN.');
      console.error('[email-ai]   fix: re-run scripts/get-token.js locally with the v2 client + paste the new token into the Railway service env.');
    } else if (/insufficient.*scope|forbidden|permission/i.test(msg)) {
      console.error('[email-ai] SCOPE FAIL · token does not have gmail.modify or gmail.labels scope.');
    } else {
      console.error('[email-ai] gmail.threads.list FAIL ·', msg);
    }
    throw e;
  }
  console.log(`[email-ai] inbox threads: ${threads.length}`);

  let labeled = 0,
    archived = 0,
    flagged = 0,
    skipped = 0,
    errors = 0;

  for (const t of threads) {
    try {
      const full = await client.getThread(t.id);
      const message = extractHeaders(full);
      const result = evaluate(message);

      if (!result) {
        skipped++;
        console.log(`  · skip · ${message.from} · ${message.subject}`);
        continue;
      }

      const addLabelIds = [];
      for (const lbl of result.labels) {
        addLabelIds.push(await client.ensureLabel(lbl));
      }
      if (result.actionRequired) {
        addLabelIds.push(await client.ensureLabel(ACTION_REQUIRED_LABEL));
      }

      const removeLabelIds = [];
      if (result.archive) removeLabelIds.push('INBOX');

      if (!DRY_RUN) {
        await client.modifyThread(t.id, addLabelIds, removeLabelIds);
      }

      labeled++;
      if (result.archive) archived++;
      if (result.actionRequired) flagged++;

      const tags = [
        result.rule,
        `labels=[${result.labels.join(', ')}]`,
        result.actionRequired ? '⚠️ action-required' : null,
        result.archive ? 'archived' : 'kept-in-inbox',
      ]
        .filter(Boolean)
        .join(' · ');

      console.log(`  · ${tags} · from=${message.from} · subj=${message.subject}`);
    } catch (err) {
      errors++;
      console.error(`  · ERROR thread=${t.id} · ${err.message}`);
    }
  }

  const finishedAt = new Date();
  console.log(
    `[email-ai] done ${finishedAt.toISOString()} · processed=${threads.length} labeled=${labeled} archived=${archived} flagged=${flagged} skipped=${skipped} errors=${errors} duration=${finishedAt - startedAt}ms`
  );
}

run().catch((e) => {
  console.error('[email-ai] fatal', e);
  process.exit(1);
});
