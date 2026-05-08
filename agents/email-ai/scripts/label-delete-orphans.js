// One-shot deletion of orphan Gmail labels.
// CEO-approved (May 8 2026 PM) for all 26 non-canonical user labels.
// Run: railway run --service Email-AI -- node agents/email-ai/scripts/label-delete-orphans.js

import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url).pathname });

import { google } from 'googleapis';

const CANONICAL = new Set(['🔴 NOW', '🟡 THIS WEEK', '🟢 WAITING', '🔵 READ', '⚫ ARCHIVE', '🗑️ DELETE']);

const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost'
);
oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oauth2 });

const list = await gmail.users.labels.list({ userId: 'me' });
const labels = list.data.labels || [];
const orphans = labels.filter((l) => l.type !== 'system' && !CANONICAL.has(l.name));

console.log(`Found ${orphans.length} orphan labels to delete`);
console.log('');

const results = { ok: [], err: [] };
for (const lbl of orphans) {
  try {
    await gmail.users.labels.delete({ userId: 'me', id: lbl.id });
    results.ok.push(lbl);
    console.log(`  ✓ deleted "${lbl.name}" (${lbl.id})`);
  } catch (e) {
    results.err.push({ lbl, err: e.message });
    console.error(`  ✗ FAIL "${lbl.name}" (${lbl.id}): ${e.message}`);
    // Stop on first error per HARD STOP
    break;
  }
}

console.log('');
console.log(`Deleted: ${results.ok.length} · Errors: ${results.err.length}`);

// Re-list to verify final state
const list2 = await gmail.users.labels.list({ userId: 'me' });
const labels2 = list2.data.labels || [];
const sys = labels2.filter((l) => l.type === 'system');
const usr = labels2.filter((l) => l.type !== 'system');
console.log('');
console.log(`Final count: ${labels2.length} total · ${sys.length} system · ${usr.length} user-defined`);
console.log('Remaining user labels:');
for (const l of usr.sort((a, b) => a.name.localeCompare(b.name))) {
  const flag = CANONICAL.has(l.name) ? '✓ canonical' : '⚠️ unexpected';
  console.log(`  ${flag}  "${l.name}"  (${l.id})`);
}
