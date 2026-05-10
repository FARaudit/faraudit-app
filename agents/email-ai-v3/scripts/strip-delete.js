// strip-delete.js
// One-time bulk operation: removes 🗑️ DELETE label from all currently-labeled threads,
// then deletes the label itself from Gmail.
// Idempotent: if no DELETE label exists, no-op.
// Run via: railway run --service email-ai-v3 -- node scripts/strip-delete.js

const { google } = require("googleapis");

const DELETE_LABEL_NAME = "🗑️ DELETE";

async function main() {
  const oauth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  const { data: labels } = await gmail.users.labels.list({ userId: "me" });
  const deleteLabel = (labels.labels || []).find((l) => l.name === DELETE_LABEL_NAME);
  if (!deleteLabel) {
    console.log(`No ${DELETE_LABEL_NAME} label found. Nothing to strip.`);
    return;
  }

  // Strip from all threads
  const list = await gmail.users.threads.list({
    userId: "me",
    labelIds: [deleteLabel.id],
    maxResults: 500,
  });
  const threads = list.data.threads || [];
  console.log(`Found ${threads.length} threads with ${DELETE_LABEL_NAME} label.`);

  for (const t of threads) {
    try {
      await gmail.users.threads.modify({
        userId: "me",
        id: t.id,
        requestBody: { removeLabelIds: [deleteLabel.id] },
      });
    } catch (e) {
      console.error(`Failed to strip from thread ${t.id}: ${e.message}`);
    }
  }
  console.log(`Stripped ${DELETE_LABEL_NAME} from ${threads.length} threads.`);

  // Delete the label itself (permanent)
  await gmail.users.labels.delete({ userId: "me", id: deleteLabel.id });
  console.log(`Deleted label '${DELETE_LABEL_NAME}' from Gmail (permanent).`);
}

main().catch((e) => {
  console.error("strip-delete failed:", e.message);
  process.exit(1);
});
