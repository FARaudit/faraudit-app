#!/usr/bin/env node
// Email-AI OAuth bootstrap.
// Generates a Gmail refresh token for the email-ai-v2 OAuth client.
//
// Usage:
//   1. Put GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in agents/email-ai/.env
//   2. cd agents/email-ai
//   3. node scripts/get-token.js
//   4. Click the printed URL, sign in as jose@faraudit.com, approve scopes
//   5. Browser will redirect to http://localhost/?code=... (page will fail
//      to load — that's fine). Copy the FULL URL from the address bar.
//   6. Paste the URL when prompted; script prints GMAIL_REFRESH_TOKEN
//   7. Paste that token into Railway:
//      railway variables --set GMAIL_REFRESH_TOKEN=<token>

import 'dotenv/config';
import { google } from 'googleapis';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels'
];

const REDIRECT = 'http://localhost';

async function main() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    console.error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET — populate .env from .env.example before running this script.');
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, REDIRECT);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',           // forces re-issuing a fresh refresh_token
    scope: SCOPES,
    include_granted_scopes: true
  });

  console.log('\n━━ STEP 1 ━━ Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n━━ STEP 2 ━━ Sign in as jose@faraudit.com, approve the scopes.');
  console.log('             Browser will redirect to http://localhost/?code=...');
  console.log('             That page will fail to load — that is fine.');
  console.log('             Copy the FULL URL from the address bar.\n');

  const rl = readline.createInterface({ input, output });
  const pasted = (await rl.question('━━ STEP 3 ━━ Paste full URL or just the code: ')).trim();
  rl.close();

  let code = pasted;
  try {
    if (pasted.startsWith('http')) {
      const u = new URL(pasted);
      const c = u.searchParams.get('code');
      if (c) code = c;
    }
  } catch { /* fall through, treat input as bare code */ }

  if (!code) {
    console.error('No code found in input — aborting.');
    process.exit(1);
  }

  console.log('\nExchanging code for tokens…');
  let tokens;
  try {
    const { tokens: t } = await oauth2.getToken(code);
    tokens = t;
  } catch (err) {
    console.error('Token exchange failed:', err?.message || err);
    process.exit(1);
  }

  if (!tokens.refresh_token) {
    console.error('Google did not return a refresh_token. This usually means the user already granted consent for this client.');
    console.error('Fix: revoke at https://myaccount.google.com/permissions then re-run with prompt=consent (already set).');
    process.exit(1);
  }

  console.log('\n━━ SUCCESS ━━');
  console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
  console.log('\nNext: paste into Railway env:\n');
  console.log('  cd agents/email-ai');
  console.log('  railway variables --set GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
  console.log('\nThen trigger redeploy:');
  console.log('  railway redeploy');
  console.log('');
}

main().catch((err) => { console.error('fatal:', err); process.exit(1); });
