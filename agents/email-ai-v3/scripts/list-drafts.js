#!/usr/bin/env node
// list-drafts.js
// Lists all current Gmail drafts (sender/recipient/subject only — NEVER body).
// Output: count + array of {draft_id, thread_id, to, from, subject, internalDate}
// Per CEO Rule 32: do not log or print body content of drafts.
// Run via: railway run --service email-ai-v3 -- node scripts/list-drafts.js

const { google } = require("googleapis");

async function main() {
  const oauth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  const list = await gmail.users.drafts.list({ userId: "me", maxResults: 200 });
  const drafts = list.data.drafts || [];

  const findHeader = (headers, name) =>
    (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const out = [];
  for (const d of drafts) {
    try {
      const r = await gmail.users.drafts.get({
        userId: "me",
        id: d.id,
        format: "metadata",
        // metadataHeaders restricts fields returned — body is NOT fetched
        metadataHeaders: ["To", "From", "Subject"],
      });
      const msg = r.data.message || {};
      out.push({
        draft_id: d.id,
        thread_id: msg.threadId || null,
        to: findHeader(msg.payload?.headers, "To"),
        from: findHeader(msg.payload?.headers, "From"),
        subject: findHeader(msg.payload?.headers, "Subject"),
        internalDate: msg.internalDate
          ? new Date(parseInt(msg.internalDate, 10)).toISOString()
          : null,
      });
    } catch (e) {
      out.push({ draft_id: d.id, error: e.message });
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        meta: {
          generated_at: new Date().toISOString(),
          total_drafts: out.length,
          note: "metadata only — body deliberately excluded per Rule 32",
        },
        drafts: out,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(`list-drafts failed: ${e.message}`);
  process.exit(1);
});
