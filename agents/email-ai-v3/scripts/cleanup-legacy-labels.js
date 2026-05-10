// cleanup-legacy-labels.js
// One-time pass to fix legacy v3-era labeling mess:
// 1. Strip all stacked urgency labels (a thread should have exactly 1, not 2-3)
// 2. Strip the WAITING label from threads that aren't outbound-tracked
// 3. Re-classify every thread via v3.1 deterministic stage
// 4. Apply correct single urgency + 0-1 domain + 1 company label
// 5. Remove INBOX from REFERENCE/WAITING/ARCHIVE-bucketed threads
//
// USAGE:
//   node cleanup-legacy-labels.js --dry        # default, no writes
//   node cleanup-legacy-labels.js --apply      # writes to Gmail
//   node cleanup-legacy-labels.js --apply --limit=10
//
// SAFETY:
// - Always logs what it WOULD do in dry mode
// - In apply mode, processes BATCH_LIMIT threads then halts for CEO check
// - Writes audit log to ~/faraudit-app/ceo/cleanup-legacy-{timestamp}.json
// - Idempotent: re-running on a clean thread is a no-op

require("ts-node/register");
require("dotenv").config({ path: __dirname + "/../.env" });
const fs = require("fs");
const { google } = require("googleapis");
const { classifyDeterministic } = require("../src/deterministic");
const {
  URGENCY_TO_GMAIL_LABEL,
  DOMAIN_TO_GMAIL_LABEL,
  COMPANY_TO_GMAIL_LABEL,
} = require("../src/types");

const DRY = !process.argv.includes("--apply");
const BATCH_LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "10",
  10
);

async function main() {
  const oauth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  // Fetch all labels
  const { data: labelsData } = await gmail.users.labels.list({ userId: "me" });
  const labelByName = Object.fromEntries(labelsData.labels.map((l) => [l.name, l]));
  const labelById = Object.fromEntries(labelsData.labels.map((l) => [l.id, l]));

  // Fetch all threads with ANY v3 label OR with INBOX
  const q =
    "(label:🔴-NOW OR label:🟠-THIS-WEEK OR label:🟡-THIS-WEEK OR label:🟡-WAITING OR label:🟢-WAITING OR label:🔵-REFERENCE OR label:🔵-READ OR label:⚫-ARCHIVE) OR (in:inbox)";
  const list = await gmail.users.threads.list({ userId: "me", q, maxResults: 200 });
  const threads = list.data.threads || [];
  console.log(
    `Found ${threads.length} threads to process. Mode: ${DRY ? "DRY RUN" : "APPLY"}. Limit: ${BATCH_LIMIT}.`
  );

  const audit = {
    meta: {
      generated_at: new Date().toISOString(),
      mode: DRY ? "dry" : "apply",
      total: threads.length,
      limit: BATCH_LIMIT,
    },
    actions: [],
  };
  let processed = 0;

  for (const t of threads) {
    if (processed >= BATCH_LIMIT) break;
    const thread = await gmail.users.threads.get({ userId: "me", id: t.id });
    const first = thread.data.messages[0];
    const headers = first.payload.headers || [];
    const h = (n) =>
      (headers.find((x) => x.name.toLowerCase() === n.toLowerCase()) || {}).value || "";

    const fromHeader = h("From");
    const meta = {
      threadId: t.id,
      senderEmail: ((fromHeader.match(/<([^>]+)>/) || [, fromHeader])[1] || "")
        .toLowerCase()
        .trim(),
      senderName: fromHeader.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, ""),
      recipient: h("To").toLowerCase(),
      subject: h("Subject"),
      snippet: thread.data.snippet || "",
      date: h("Date"),
      ageDays: Math.floor((Date.now() - parseInt(first.internalDate, 10)) / 86400000),
      hasReply: thread.data.messages.length > 1,
    };

    const currentLabelIds = new Set(first.labelIds || []);
    const currentLabelNames = [...currentLabelIds]
      .map((id) => labelById[id]?.name)
      .filter(Boolean);

    // Determine v3.1 correct classification
    const result = classifyDeterministic(meta);
    if (!result) {
      audit.actions.push({
        thread_id: t.id,
        sender: meta.senderEmail,
        subject: meta.subject.slice(0, 80),
        current_labels: currentLabelNames,
        action: "SKIP_LLM_NEEDED",
        reason: "deterministic stage returned null; would need LLM call",
      });
      processed++;
      continue;
    }

    // Compute target labels
    const targetUrgencyLabel = URGENCY_TO_GMAIL_LABEL[result.urgency];
    const targetDomainLabel = result.domain ? DOMAIN_TO_GMAIL_LABEL[result.domain] : null;
    const targetCompanyLabel = COMPANY_TO_GMAIL_LABEL[result.company];
    const shouldRemoveInbox = ["REFERENCE", "WAITING", "ARCHIVE"].includes(result.urgency);

    // Label cohorts (legacy + current names)
    const v3UrgencyLabels = [
      "🔴 NOW",
      "🟠 THIS WEEK",
      "🟡 THIS WEEK",
      "🟡 WAITING",
      "🟢 WAITING",
      "🔵 REFERENCE",
      "🔵 READ",
      "⚫ ARCHIVE",
    ];
    const v3DomainLabels = ["🟢 PROSPECT", "🟣 ATLAS-LEGAL", "🟤 INFRA"];
    const v3CompanyLabels = ["[FARaudit]", "[Bullrize]", "[LexAnchor]"];

    const toRemove = [];
    const toAdd = [];

    // Strip non-target urgency labels; add target if missing
    for (const name of v3UrgencyLabels) {
      if (currentLabelNames.includes(name) && name !== targetUrgencyLabel) {
        if (labelByName[name]) toRemove.push(labelByName[name].id);
      }
    }
    if (labelByName[targetUrgencyLabel] && !currentLabelNames.includes(targetUrgencyLabel)) {
      toAdd.push(labelByName[targetUrgencyLabel].id);
    }

    // Strip non-target domain labels; add target if missing
    for (const name of v3DomainLabels) {
      if (currentLabelNames.includes(name) && name !== targetDomainLabel) {
        if (labelByName[name]) toRemove.push(labelByName[name].id);
      }
    }
    if (
      targetDomainLabel &&
      labelByName[targetDomainLabel] &&
      !currentLabelNames.includes(targetDomainLabel)
    ) {
      toAdd.push(labelByName[targetDomainLabel].id);
    }

    // Strip non-target company labels; add target if missing
    for (const name of v3CompanyLabels) {
      if (currentLabelNames.includes(name) && name !== targetCompanyLabel) {
        if (labelByName[name]) toRemove.push(labelByName[name].id);
      }
    }
    if (
      labelByName[targetCompanyLabel] &&
      !currentLabelNames.includes(targetCompanyLabel)
    ) {
      toAdd.push(labelByName[targetCompanyLabel].id);
    }

    // INBOX removal
    if (shouldRemoveInbox && currentLabelIds.has("INBOX")) {
      toRemove.push("INBOX");
    }

    audit.actions.push({
      thread_id: t.id,
      sender: meta.senderEmail,
      subject: meta.subject.slice(0, 80),
      current_labels: currentLabelNames,
      target: {
        urgency: result.urgency,
        domain: result.domain,
        company: result.company,
        rule_matched: result.rule_matched,
        remove_inbox: shouldRemoveInbox,
      },
      to_remove: toRemove.map((id) => labelById[id]?.name || id),
      to_add: toAdd.map((id) => labelById[id]?.name || id),
      is_no_op: toRemove.length === 0 && toAdd.length === 0,
    });

    if (!DRY && (toRemove.length > 0 || toAdd.length > 0)) {
      await gmail.users.threads.modify({
        userId: "me",
        id: t.id,
        requestBody: {
          addLabelIds: toAdd,
          removeLabelIds: toRemove,
        },
      });
    }

    processed++;
  }

  // Write audit log
  const outPath =
    require("os").homedir() + `/faraudit-app/ceo/cleanup-legacy-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(audit, null, 2));
  console.log(`Audit written to: ${outPath}`);

  // Summary
  const stats = { no_op: 0, with_changes: 0, llm_needed: 0 };
  audit.actions.forEach((a) => {
    if (a.action === "SKIP_LLM_NEEDED") stats.llm_needed++;
    else if (a.is_no_op) stats.no_op++;
    else stats.with_changes++;
  });
  console.log(
    `Summary: ${stats.no_op} no-op | ${stats.with_changes} would change | ${stats.llm_needed} need LLM (skipped)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
