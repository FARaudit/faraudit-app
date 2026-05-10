#!/usr/bin/env node
// snapshot-inbox.js
// Dumps current INBOX threads (unread + read) to JSON for v3.1 prompt-rebuild baseline.
// Output schema per thread: {thread_id, sender, recipient, subject, label_ids, snippet, internalDate}
// Run via: railway run --service email-ai-v3 -- node scripts/snapshot-inbox.js > baseline.json
// Or locally: GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... node scripts/snapshot-inbox.js

const { google } = require("googleapis");

async function main() {
  const oauth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  // Pull up to 200 INBOX threads (mix of unread + read) for baseline.
  // For v3.1 prompt design, we want the full sender/subject distribution.
  const list = await gmail.users.threads.list({
    userId: "me",
    q: "in:inbox",
    maxResults: 200,
  });
  const threads = list.data.threads || [];

  // Resolve label id → name for human-readable output
  const labelsResp = await gmail.users.labels.list({ userId: "me" });
  const labelIdToName = new Map();
  for (const lbl of labelsResp.data.labels || []) {
    labelIdToName.set(lbl.id, lbl.name);
  }

  const findHeader = (headers, name) =>
    (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const out = [];
  let labelDist = {};
  for (const t of threads) {
    let thread;
    try {
      const r = await gmail.users.threads.get({
        userId: "me",
        id: t.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject"],
      });
      thread = r.data;
    } catch (e) {
      out.push({ thread_id: t.id, error: e.message });
      continue;
    }
    const messages = thread.messages || [];
    const last = messages[messages.length - 1];
    const labelIds = thread.messages
      ? Array.from(new Set(messages.flatMap((m) => m.labelIds || [])))
      : [];
    const labelNames = labelIds.map((id) => labelIdToName.get(id) || id);
    for (const ln of labelNames) labelDist[ln] = (labelDist[ln] || 0) + 1;

    out.push({
      thread_id: t.id,
      message_count: messages.length,
      sender: findHeader(last?.payload?.headers, "From"),
      recipient: findHeader(last?.payload?.headers, "To"),
      subject: findHeader(last?.payload?.headers, "Subject"),
      label_ids: labelIds,
      label_names: labelNames,
      snippet: (last?.snippet || "").slice(0, 280),
      internalDate: last?.internalDate
        ? new Date(parseInt(last.internalDate, 10)).toISOString()
        : null,
    });
  }

  // Emit to stdout: { meta, threads, label_distribution }
  process.stdout.write(
    JSON.stringify(
      {
        meta: {
          generated_at: new Date().toISOString(),
          total_threads: out.length,
          query: "in:inbox",
          maxResults: 200,
        },
        label_distribution: labelDist,
        threads: out,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(`snapshot-inbox failed: ${e.message}`);
  process.exit(1);
});
