// One-shot inventory of Gmail labels with thread counts.
// READ-ONLY. Run: node agents/email-ai/scripts/label-inventory.js

import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url).pathname });

import { google } from 'googleapis';

const CANONICAL = new Set(['🔴 NOW', '🟡 THIS WEEK', '🟢 WAITING', '🔵 READ', '⚫ ARCHIVE', '🗑️ DELETE']);
const SYSTEM_LABEL_TYPES = new Set(['system']);

const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost'
);
oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oauth2 });

const list = await gmail.users.labels.list({ userId: 'me' });
const labels = list.data.labels || [];

const userLabels = labels.filter((l) => l.type !== 'system');
const systemLabels = labels.filter((l) => l.type === 'system');

console.log(`Total labels: ${labels.length} (${systemLabels.length} system + ${userLabels.length} user-defined)`);
console.log('');

const orphans = [];
const canonical = [];

for (const lbl of userLabels) {
  const detail = await gmail.users.labels.get({ userId: 'me', id: lbl.id });
  const row = {
    id: lbl.id,
    name: lbl.name,
    threadsTotal: detail.data.threadsTotal ?? 0,
    messagesTotal: detail.data.messagesTotal ?? 0,
    threadsUnread: detail.data.threadsUnread ?? 0,
  };
  if (CANONICAL.has(lbl.name)) canonical.push(row);
  else orphans.push(row);
}

console.log('=== CANONICAL (keep) ===');
for (const r of canonical.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${r.name}  ·  threads=${r.threadsTotal}  unread=${r.threadsUnread}  id=${r.id}`);
}

console.log('');
console.log('=== ORPHAN user labels (delete candidates) ===');
console.log(`  count=${orphans.length}`);
for (const r of orphans.sort((a, b) => b.threadsTotal - a.threadsTotal)) {
  const flag = r.threadsTotal > 50 ? ' ⚠️ >50 THREADS — REQUIRES APPROVAL' : '';
  console.log(`  threads=${String(r.threadsTotal).padStart(4)}  msgs=${String(r.messagesTotal).padStart(5)}  "${r.name}"  id=${r.id}${flag}`);
}

console.log('');
const overThreshold = orphans.filter((r) => r.threadsTotal > 50);
console.log(`SUMMARY: ${orphans.length} orphan labels · ${overThreshold.length} exceed 50-thread threshold`);
