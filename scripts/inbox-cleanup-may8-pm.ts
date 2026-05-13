// Inbox cleanup — relabel 12 stale 🔴 NOW threads to ⚫ ARCHIVE / 🟢 WAITING.
// Spec: Notion 35bfaf5b931481feb0abdcc03f8b9d03
//
// Auth note: Notion spec used a service-account JWT pattern that does not work
// for personal Gmail without domain-wide delegation. This script uses the same
// OAuth2 refresh-token pattern that backfill-categories.js uses (already
// validated against woofmanagementco@gmail.com). Run via Railway so env vars
// resolve from the Email-AI service:
//
//   cd ~/faraudit-app
//   railway run --service Email-AI -- npx tsx scripts/inbox-cleanup-may8-pm.ts

import { config } from 'dotenv';
config({ path: new URL('../agents/email-ai/.env', import.meta.url).pathname });

import { google } from 'googleapis';

const LABELS = {
  NOW: 'Label_5',
  THIS_WEEK: 'Label_6',
  WAITING: 'Label_7',
  READ: 'Label_8',
  ARCHIVE: 'Label_9',
  DELETE: 'Label_10',
} as const;

type Reclassification = { threadId: string; newLabel: string; reason: string };

const RECLASSIFICATIONS: Reclassification[] = [
  { threadId: '19e09b12838579bd', newLabel: LABELS.ARCHIVE, reason: 'Resend password reset already used' },
  { threadId: '19e05a19d223a8a3', newLabel: LABELS.WAITING, reason: '83(b) filed, USPS in transit' },
  { threadId: '19e053bdc9580015', newLabel: LABELS.ARCHIVE, reason: 'Audit-AI transient crash' },
  { threadId: '19e078f77ec0e67a', newLabel: LABELS.ARCHIVE, reason: 'Audit-AI transient crash' },
  { threadId: '19dfe90f1d7878bc', newLabel: LABELS.ARCHIVE, reason: 'LexAnchor EIN received' },
  { threadId: '19df8c65a816f24b', newLabel: LABELS.ARCHIVE, reason: 'Bullrize EIN received' },
  { threadId: '19df862dfbb00510', newLabel: LABELS.ARCHIVE, reason: 'Preceded successful 83(b) filing' },
  { threadId: '19df8637649de722', newLabel: LABELS.ARCHIVE, reason: 'Preceded successful 83(b) filing' },
  { threadId: '19df85868712189f', newLabel: LABELS.ARCHIVE, reason: 'Bullrize incorporated, in MEMORY' },
  { threadId: '19df8582b59eb2d2', newLabel: LABELS.ARCHIVE, reason: 'LexAnchor incorporated, in MEMORY' },
  { threadId: '19df83abb87d6d52', newLabel: LABELS.ARCHIVE, reason: 'Regulatory-AI transient crash' },
  { threadId: '19df52af176f2a6f', newLabel: LABELS.ARCHIVE, reason: 'Preceded FARaudit 83(b) filing' },
];

const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost'
);
oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oauth2 });

async function main() {
  let ok = 0;
  let failed = 0;
  const failures: { threadId: string; error: string }[] = [];

  for (const item of RECLASSIFICATIONS) {
    try {
      await gmail.users.threads.modify({
        userId: 'me',
        id: item.threadId,
        requestBody: {
          addLabelIds: [item.newLabel],
          removeLabelIds: [LABELS.NOW],
        },
      });
      ok++;
      const target = item.newLabel === LABELS.WAITING ? '🟢 WAITING' : '⚫ ARCHIVE';
      console.log(`  ✅ ${item.threadId} → ${target}  · ${item.reason}`);
    } catch (err: any) {
      failed++;
      failures.push({ threadId: item.threadId, error: err?.message || String(err) });
      console.error(`  ❌ ${item.threadId}  · ${err?.message?.slice(0, 200)}`);
    }
  }

  console.log('');
  console.log(`Reclassified: ${ok}/${RECLASSIFICATIONS.length}  · failed: ${failed}`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  ${f.threadId}: ${f.error}`);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
