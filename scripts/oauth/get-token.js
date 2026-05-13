#!/usr/bin/env node
// Gmail OAuth refresh-token bootstrap — manual one-time loopback flow.
//
// Rule 19: Desktop OAuth client only. The Google Cloud Console client used
// here MUST be of type "Desktop app" (matches email-ai-v3). Web-type clients
// will reject this loopback redirect.
//
// Rule 32: Never logs client_id, client_secret, access_token, id_token, or
// the authorization code. The refresh_token is the only secret written to
// stdout, prefixed with REFRESH_TOKEN= so it is unambiguous. Nothing is
// persisted to disk.
//
// Flow:
//   1. Reads GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET from env, or prompts.
//   2. Builds auth URL (scope: gmail.modify, access_type=offline, prompt=consent).
//   3. Prints the URL — operator opens it manually in a browser.
//   4. Loopback HTTP server on 127.0.0.1:53682 captures ?code= from /oauth/callback.
//   5. Exchanges code -> tokens, prints REFRESH_TOKEN=<value>, exits.

'use strict';

const http = require('http');
const readline = require('readline');
const { URL } = require('url');
const { OAuth2Client } = require('google-auth-library');

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

function printUsage() {
  process.stdout.write([
    'Usage: node scripts/oauth/get-token.js',
    '',
    'Bootstraps a Gmail OAuth refresh token via loopback flow (Desktop client).',
    '',
    'Env vars (optional — script prompts if missing):',
    '  GMAIL_CLIENT_ID       OAuth Desktop client id',
    '  GMAIL_CLIENT_SECRET   OAuth Desktop client secret',
    '',
    `Redirect URI: ${REDIRECT_URI}`,
    `Scope:        ${SCOPES.join(' ')}`,
    '',
    'Output: a single line "REFRESH_TOKEN=<token>" on stdout.',
    'Save it to 1Password and to Railway/Vercel envs. Do NOT commit.',
    '',
  ].join('\n'));
}

function promptVisible(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Hidden input via stdin raw mode — no echo, supports backspace and Ctrl-C.
function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // No TTY — fall back to visible to avoid hanging non-interactive runs.
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf.trim());
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        if (buf.length > 0) buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, `http://localhost:${PORT}`);
      } catch {
        res.writeHead(400).end('Bad request');
        return;
      }
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      const err = url.searchParams.get('error');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('OAuth error: ' + err);
        server.close();
        reject(new Error('OAuth error from Google: ' + err));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code parameter');
        return;
      }
      res
        .writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('OAuth complete. You may close this tab and return to the terminal.');
      server.close();
      resolve(code);
    });
    server.on('error', (e) => {
      if (e && e.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is in use. Free it and re-run.`));
      } else {
        reject(e);
      }
    });
    server.listen(PORT, '127.0.0.1');
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  let clientId = process.env.GMAIL_CLIENT_ID;
  let clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId) clientId = await promptVisible('GMAIL_CLIENT_ID: ');
  if (!clientSecret) clientSecret = await promptHidden('GMAIL_CLIENT_SECRET (hidden): ');

  if (!clientId || !clientSecret) {
    process.stderr.write('Both GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are required.\n');
    process.exit(1);
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  process.stdout.write('\nOpen this URL in your browser:\n\n');
  process.stdout.write(authUrl + '\n\n');
  process.stdout.write(`Waiting for redirect on ${REDIRECT_URI} ...\n`);

  const code = await waitForCode();

  const { tokens } = await oauth2.getToken(code);
  if (!tokens || !tokens.refresh_token) {
    process.stderr.write(
      'No refresh_token returned. Revoke the prior grant at ' +
        'https://myaccount.google.com/permissions and retry, ' +
        'or confirm the OAuth client is type "Desktop app".\n',
    );
    process.exit(2);
  }

  process.stdout.write('\nREFRESH_TOKEN=' + tokens.refresh_token + '\n\n');
  process.stdout.write('Save this to 1Password and Railway/Vercel envs. Do NOT commit.\n');
}

main().catch((e) => {
  process.stderr.write('Bootstrap failed: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});
