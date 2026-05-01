import 'dotenv/config';
import { getAuthClient } from './auth.js';
import { GmailClient } from './gmail.js';
import { evaluate } from './rules.js';

const ACTION_REQUIRED_LABEL = '⚠️ Action Required';
const DRY_RUN = process.env.DRY_RUN === 'true';

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

  const auth = getAuthClient();
  const client = new GmailClient(auth);

  const threads = await client.listInboxThreads(100);
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
