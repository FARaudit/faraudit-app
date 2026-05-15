/**
 * Email-AI v4 Stage 1 part 2 — One-time INBOX strip pass for non-NOW labeled threads
 *
 * Premise: v3 classifier applies bucket labels (NOW/THIS_WEEK/WAITING/REFERENCE/ARCHIVE)
 * but does NOT strip INBOX label from non-NOW buckets. Result: non-NOW threads pollute
 * the inbox view despite being correctly classified. This script does the one-time backfill.
 *
 * Forward-prevention: agents/email-ai-v3/src/ classifier patch (separate task).
 *
 * Behavior:
 *   - Scan inbox 14d
 *   - For threads with bucket label != NOW AND with INBOX label:
 *     - If PRESERVE list matches → SKIP + log "preserved despite non-NOW classification"
 *     - Else → strip INBOX, keep bucket label
 *
 * Dry-run default. --apply to execute.
 */

import { google } from 'googleapis';

const DRY_RUN = !process.argv.includes('--apply');

const BUCKET_PATTERNS = ['NOW', 'THIS WEEK', 'WAITING', 'REFERENCE', 'ARCHIVE'];

// PRESERVE dropped for strip-inbox flow (CEO ruling 2026-05-15):
// PRESERVE was archive-prevention. Strip is softer — bucket label retained,
// thread remains searchable via label:🟠 THIS WEEK etc. If a non-NOW item
// needs inbox visibility, fix classification (Stage 2), not band-aid here.
const PRESERVE_SUBJECTS: string[] = [];

async function main() {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    console.error('Missing Gmail OAuth env vars.');
    process.exit(1);
  }
  const oauth2Client = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Build label map
  const labelsRes = await gmail.users.labels.list({ userId: 'me' });
  const labelById = new Map<string, string>();
  for (const l of labelsRes.data.labels || []) labelById.set(l.id!, l.name!);

  // Helper: classify thread's bucket from label set
  const bucketOf = (labelIds: string[]): string | null => {
    for (const id of labelIds) {
      const name = labelById.get(id);
      if (!name) continue;
      for (const p of BUCKET_PATTERNS) {
        if (name.includes(p)) return p;  // returns "NOW" / "THIS WEEK" / etc
      }
    }
    return null;
  };

  // Scan inbox 14d
  const search = await gmail.users.threads.list({
    userId: 'me',
    q: 'in:inbox newer_than:14d',
    maxResults: 100,
  });
  const threads = search.data.threads || [];
  console.log(`Scanning ${threads.length} inbox threads...\n`);

  const strip: { threadId: string; subject: string; bucket: string }[] = [];
  const preserved: { threadId: string; subject: string; bucket: string }[] = [];
  const nowKept: number = 0;
  let nowCount = 0;
  let unclassifiedCount = 0;

  for (const t of threads) {
    const detail = await gmail.users.threads.get({ userId: 'me', id: t.id! });
    const msg = detail.data.messages?.[0];
    const subject = (msg?.payload?.headers || []).find(h => h.name === 'Subject')?.value || '';
    const labelIds = msg?.labelIds || [];
    const bucket = bucketOf(labelIds);

    if (bucket === null) {
      unclassifiedCount++;
      continue;  // UNCLASSIFIED stays in inbox until classifier handles
    }
    if (bucket === 'NOW') {
      nowCount++;
      continue;  // NOW correctly stays in inbox
    }

    // Non-NOW bucket: check PRESERVE
    if (PRESERVE_SUBJECTS.some(p => subject.includes(p))) {
      preserved.push({ threadId: t.id!, subject: subject.substring(0, 70), bucket });
      continue;
    }

    strip.push({ threadId: t.id!, subject: subject.substring(0, 70), bucket });
  }

  console.log(`Inbox composition:`);
  console.log(`  NOW (correct in inbox):       ${nowCount}`);
  console.log(`  UNCLASSIFIED (stays for now): ${unclassifiedCount}`);
  console.log(`  Non-NOW preserved (PRESERVE list match): ${preserved.length}`);
  console.log(`  Non-NOW to strip INBOX from:  ${strip.length}\n`);

  if (preserved.length > 0) {
    console.log(`PRESERVE-protected (kept in inbox despite non-NOW label):`);
    for (const p of preserved) {
      console.log(`  [${p.bucket}] ${p.subject}`);
    }
    console.log();
  }

  if (strip.length > 0) {
    console.log(`To-strip targets:`);
    for (const s of strip) {
      console.log(`  [${s.bucket}] ${s.subject}`);
    }
    console.log();
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes made. Re-run with --apply to execute.');
    return;
  }

  console.log('Applying changes...\n');
  for (const s of strip) {
    await gmail.users.threads.modify({
      userId: 'me',
      id: s.threadId,
      requestBody: { removeLabelIds: ['INBOX'] },
    });
    console.log(`  ✓ Stripped INBOX from: [${s.bucket}] ${s.subject}`);
  }

  const fs = require('fs');
  const auditPath = `${process.env.HOME}/faraudit-app/ceo/email-ai-strip-inbox-${new Date().toISOString().slice(0,10)}.json`;
  fs.writeFileSync(auditPath, JSON.stringify({
    ran_at: new Date().toISOString(),
    stripped: strip,
    preserved: preserved,
    now_kept_count: nowCount,
    unclassified_count: unclassifiedCount,
  }, null, 2));
  console.log(`\n✓ Audit log written: ${auditPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
