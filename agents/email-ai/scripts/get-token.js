#!/usr/bin/env node
// Email-AI OAuth refresh-token bootstrap.
//
// The local-script flow was deprecated after recurring "Access blocked:
// request is invalid" errors on the redirect-URI handshake. We now use
// Google's official OAuth Playground, which handles the loopback portion
// inside Google's own infra so there is nothing to register or match.
//
// Run this script (`node scripts/get-token.js`) any time you need to
// regenerate the refresh token. It prints the exact 9-step flow.

const lines = [
  '',
  '━━ EMAIL-AI · GMAIL REFRESH TOKEN — OAuth Playground flow ━━',
  '',
  'The local OAuth script was retired. Use Google\'s OAuth Playground instead:',
  '',
  '  1. Open https://developers.google.com/oauthplayground',
  '',
  '  2. Click the gear icon (top right)',
  '     → check "Use your own OAuth credentials"',
  '',
  '  3. Paste from 1Password "email-ai-v2":',
  '     · OAuth Client ID',
  '     · OAuth Client secret',
  '',
  '  4. In the left panel, scroll to "Gmail API v1" and select BOTH:',
  '     · https://www.googleapis.com/auth/gmail.modify',
  '     · https://www.googleapis.com/auth/gmail.labels',
  '',
  '  5. Click "Authorize APIs"',
  '     → sign in as jose@faraudit.com',
  '     → click Allow',
  '',
  '  6. On the next screen, click "Exchange authorization code for tokens"',
  '',
  '  7. Copy the "Refresh token" value (long string starting with 1// or 4/0)',
  '',
  '  8. Save to 1Password as: "Email-AI Gmail Refresh Token v2"',
  '',
  '  9. Update Railway:',
  '     cd ~/faraudit-app/agents/email-ai',
  '     railway variables --set GMAIL_REFRESH_TOKEN=<paste-token-here>',
  '     railway redeploy',
  '',
  'After redeploy, the next 30-min cron tick will print boot diagnostics',
  'including the new GMAIL_REFRESH_TOKEN length. If the token is valid,',
  'you should see "inbox threads: N" instead of an OAUTH FAIL line.',
  ''
];

console.log(lines.join('\n'));
