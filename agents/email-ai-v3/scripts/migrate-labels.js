// migrate-labels.js
// Renames legacy v3 labels to v3.1 names AND creates new domain/company labels.
// Idempotent: skips renames if target already exists, skips creates if name exists.
// Run via: railway run --service email-ai-v3 -- node scripts/migrate-labels.js

const { google } = require("googleapis");

// Old → New rename map (preserves existing label IDs and threads-with-label state)
const RENAMES = {
  "🟡 THIS WEEK": "🟠 THIS WEEK",
  "🟢 WAITING": "🟡 WAITING",
  "🔵 READ": "🔵 REFERENCE",
};

// New labels to create if absent
const TO_CREATE = [
  "🟢 PROSPECT",
  "🟣 ATLAS-LEGAL",
  "🟤 INFRA",
  "[FARaudit]",
  "[Bullrize]",
  "[LexAnchor]",
];

async function main() {
  const oauth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  const { data } = await gmail.users.labels.list({ userId: "me" });
  const byName = Object.fromEntries((data.labels || []).map((l) => [l.name, l]));

  let renamed = 0;
  let skipped = 0;
  let created = 0;

  for (const [oldName, newName] of Object.entries(RENAMES)) {
    if (byName[oldName] && !byName[newName]) {
      await gmail.users.labels.update({
        userId: "me",
        id: byName[oldName].id,
        requestBody: { name: newName },
      });
      console.log(`Renamed: ${oldName} → ${newName}`);
      renamed += 1;
    } else if (byName[newName]) {
      console.log(`Skipped (target exists): ${oldName} → ${newName}`);
      skipped += 1;
    } else {
      console.log(`Skipped (source not found): ${oldName}`);
      skipped += 1;
    }
  }

  for (const name of TO_CREATE) {
    if (byName[name]) {
      console.log(`Skipped (exists): ${name}`);
      skipped += 1;
      continue;
    }
    await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    console.log(`Created: ${name}`);
    created += 1;
  }

  console.log(
    `Label migration complete · renamed=${renamed} · created=${created} · skipped=${skipped}`
  );
}

main().catch((e) => {
  console.error("migrate-labels failed:", e.message);
  process.exit(1);
});
