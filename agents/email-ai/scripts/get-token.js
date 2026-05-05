#!/usr/bin/env node
// Email-AI OAuth refresh-token bootstrap (Desktop client, loopback redirect).
//
// Replaces the manual OAuth Playground flow. Uses the modern loopback
// redirect (http://127.0.0.1:<random-port>) — Google deprecated the old
// urn:ietf:wg:oauth:2.0:oob redirect in Oct 2022 and Desktop clients now
// support any port on 127.0.0.1 / localhost.
//
// Required env: GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET (Desktop type)
//
// On success, writes all three GMAIL_* env vars directly to the Railway
// service "Email-AI" via the `railway` CLI — the refresh token is never
// printed to stdout. Run from this directory:
//
//   GMAIL_CLIENT_ID=...apps.googleusercontent.com \
//   GMAIL_CLIENT_SECRET=GOCSPX-... \
//   node scripts/get-token.js

import http from 'node:http';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { google } from 'googleapis';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('FAIL: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in env.');
  console.error('Usage: GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/get-token.js');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

const server = http.createServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve());
});
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}/callback`;

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n━━ EMAIL-AI OAUTH BOOTSTRAP ━━\n');
console.log('Open this URL in a browser, sign in as jose@faraudit.com, and grant consent:\n');
console.log(authUrl);
console.log(`\nWaiting for redirect to ${redirectUri} ... (5 min timeout)\n`);

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    reject(new Error('Timed out waiting for browser callback (5 min).'));
  }, 5 * 60 * 1000);

  server.on('request', (req, res) => {
    try {
      const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
      if (parsed.pathname !== '/callback') {
        res.writeHead(404).end('not found');
        return;
      }
      const c = parsed.searchParams.get('code');
      const e = parsed.searchParams.get('error');
      if (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`OAuth error: ${e}`);
        clearTimeout(timer);
        reject(new Error(`OAuth error: ${e}`));
        return;
      }
      if (!c) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code parameter');
        clearTimeout(timer);
        reject(new Error('Missing code parameter'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Auth complete. You can close this tab. Refresh token will be written to Railway.');
      clearTimeout(timer);
      resolve(c);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
});

server.close();

const { tokens } = await oauth2.getToken(code);
if (!tokens.refresh_token) {
  console.error('FAIL: no refresh_token returned. Confirm prompt=consent fired and the OAuth client TYPE is Desktop (not Web).');
  process.exit(1);
}

console.log(`\n✓ Tokens received. refresh_token length=${tokens.refresh_token.length}, access_token length=${tokens.access_token?.length ?? 0}.`);
console.log('\nWriting all three GMAIL_* env vars to Railway service "Email-AI" ...\n');

// Pass values as argv elements (not via shell) so they don't leak through
// shell history or expansion. spawnSync inherits stdio so railway CLI's
// progress/confirmation appears live; the actual token VALUE is never
// echoed by railway variables --set.
const setResult = spawnSync(
  'railway',
  [
    'variables',
    '--service', 'Email-AI',
    '--set', `GMAIL_CLIENT_ID=${CLIENT_ID}`,
    '--set', `GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`,
    '--set', `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`,
  ],
  { stdio: 'inherit' }
);

if (setResult.status !== 0) {
  console.error('\nFAIL: railway variables --set exited non-zero. Manual fallback:');
  console.error('  railway variables --service Email-AI --set "GMAIL_REFRESH_TOKEN=<paste>"');
  process.exit(1);
}

console.log('\n✓ Railway env updated. Email-AI will auto-redeploy.');
console.log('  Refresh token NOT printed. To verify, watch logs of the next deploy:');
console.log('  railway logs --service Email-AI --lines 60');
