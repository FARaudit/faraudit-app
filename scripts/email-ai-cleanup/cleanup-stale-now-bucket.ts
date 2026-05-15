import { google } from 'googleapis';

const DRY_RUN = !process.argv.includes('--apply');

async function discoverLabels(gmail: any) {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const map = new Map<string, string>();
  for (const l of res.data.labels || []) map.set(l.name, l.id);
  return map;
}

const ARCHIVE_RULES = [
  { sender: 'notify.railway.app', subject: 'Build failed for responsible-perfection', reason: 'P0-6a closed' },
  { sender: 'notify.railway.app', subject: 'Deployment crashed for email-ai-v3', reason: 'P0-6a closed' },
  { sender: 'notify.railway.app', subject: 'Deployment crashed for Audit-AI', reason: 'P0-5/5b closed' },
  { sender: 'mercury.com', subject: '2FA codes', reason: 'Setup complete 2026-05-13' },
  { sender: 'mercury.com', subject: 'New Passkey', reason: 'Setup complete 2026-05-13' },
  { sender: 'mercury.com', subject: 'expedite your application', reason: 'Informational only' },
  { sender: 'mercury.com', subject: 'Verify your email', reason: 'Setup complete 2026-05-12' },
  { sender: 'notifications@stripe.com', subject: 'two-step authentication', reason: 'Setup complete' },
  { sender: 'notifications@stripe.com', subject: 'new passkey', reason: 'Setup complete' },
  { sender: 'notifications@stripe.com', subject: 'You can now accept payments', reason: 'Verified 2026-05-12' },
  { sender: 'notifications@vercel.com', subject: 'Failed preview deployment', reason: 'Preview env, prod unaffected' },
  { sender: 'notifications@vercel.com', subject: 'New sign-in detected', reason: 'Informational' },
  { sender: 'invitations@linkedin.com', subject: 'invitation', reason: 'Cold invite, anti-ICP per LinkedIn discipline' },
];

const PRESERVE_SUBJECTS = [
  'Provide a valid bank account',
  'Stable document scans',
  'Your Mercury application needs',
  'Google Workspace free trial is ending',
];

async function main() {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    console.error('Missing Gmail OAuth env vars.');
    process.exit(1);
  }
  const oauth2Client = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  console.log('Discovering Gmail labels...');
  const labelMap = await discoverLabels(gmail);
  const findLabel = (matchers: string[]) => {
    for (const [name, id] of labelMap.entries()) {
      for (const m of matchers) {
        if (name.includes(m)) return { name, id };
      }
    }
    return null;
  };
  const NOW = findLabel(['🔴 NOW', 'NOW']);
  const ARCHIVE = findLabel(['⚫ ARCHIVE', 'ARCHIVE']);
  if (!NOW || !ARCHIVE) {
    console.error('Required labels not found. Available:');
    for (const [name, id] of labelMap.entries()) console.error(`  ${name} → ${id}`);
    process.exit(1);
  }
  console.log(`NOW label: ${NOW.name} (${NOW.id})`);
  console.log(`ARCHIVE label: ${ARCHIVE.name} (${ARCHIVE.id})\n`);

  const search = await gmail.users.threads.list({ userId: 'me', q: 'in:inbox newer_than:14d', maxResults: 100 });
  const threads = search.data.threads || [];
  console.log(`Scanning ${threads.length} inbox threads...\n`);

  const actions: { threadId: string; subject: string; sender: string; rule: string }[] = [];
  for (const t of threads) {
    const detail = await gmail.users.threads.get({ userId: 'me', id: t.id! });
    const msg = detail.data.messages?.[0];
    const headers = msg?.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    if (PRESERVE_SUBJECTS.some(p => subject.includes(p))) continue;
    const rule = ARCHIVE_RULES.find(r =>
      from.toLowerCase().includes(r.sender.toLowerCase()) &&
      subject.toLowerCase().includes(r.subject.toLowerCase())
    );
    if (rule) actions.push({ threadId: t.id!, subject: subject.substring(0, 70), sender: from.substring(0, 50), rule: rule.reason });
  }

  console.log(`${actions.length} threads matched archive rules:\n`);
  actions.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.subject}`);
    console.log(`     ${a.rule}\n`);
  });

  if (DRY_RUN) { console.log(`[DRY RUN] No changes made. Re-run with --apply to execute.\n`); return; }

  console.log(`Applying changes...\n`);
  for (const a of actions) {
    await gmail.users.threads.modify({
      userId: 'me', id: a.threadId,
      requestBody: { addLabelIds: [ARCHIVE.id], removeLabelIds: [NOW.id, 'INBOX'] },
    });
    console.log(`  Archived: ${a.subject}`);
  }
  const fs = require('fs');
  const auditPath = `${process.env.HOME}/faraudit-app/ceo/email-ai-cleanup-${new Date().toISOString().slice(0,10)}.json`;
  fs.writeFileSync(auditPath, JSON.stringify({ ran_at: new Date().toISOString(), archive_label: ARCHIVE.name, now_label: NOW.name, archived: actions }, null, 2));
  console.log(`\nAudit log written: ${auditPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
