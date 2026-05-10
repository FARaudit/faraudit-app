// Phase 2 dry-run: classify every inbox thread WITHOUT applying labels or creating drafts.
// Output: per-thread JSON showing proposed classification + which stage matched + which rule.
// Stage 2 (LLM) is NOT actually invoked in dry-run to save cost; threads that would escalate
// are flagged with stage="llm_pending".
//
// Run via: railway run --service email-ai-v3 -- node scripts/dry-run.js <output-path>

require("ts-node/register");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const { classifyDeterministic } = require("../src/deterministic");
const {
  URGENCY_TO_GMAIL_LABEL,
  DOMAIN_TO_GMAIL_LABEL,
  COMPANY_TO_GMAIL_LABEL,
} = require("../src/types");

async function main() {
  const oauth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  const list = await gmail.users.threads.list({
    userId: "me",
    q: "in:inbox",
    maxResults: 200,
  });

  // Resolve label-id → label-name for current_labels readability
  const labelsResp = await gmail.users.labels.list({ userId: "me" });
  const labelIdToName = new Map();
  for (const lbl of labelsResp.data.labels || []) labelIdToName.set(lbl.id, lbl.name);

  const results = [];
  let dCount = 0;
  let lCount = 0;
  const ruleCounts = {};

  for (const t of list.data.threads || []) {
    let thread;
    try {
      const r = await gmail.users.threads.get({ userId: "me", id: t.id, format: "full" });
      thread = r.data;
    } catch (e) {
      results.push({ thread_id: t.id, error: e.message });
      continue;
    }
    const msgs = thread.messages || [];
    if (msgs.length === 0) continue;
    const last = msgs[msgs.length - 1];
    const headers = last.payload?.headers || [];
    const h = (n) => (headers.find((x) => x.name.toLowerCase() === n.toLowerCase()) || {}).value || "";

    const fromValue = h("From");
    const senderEmail = (fromValue.match(/<([^>]+)>/) || [, fromValue])[1].toLowerCase().trim();
    const senderName = fromValue.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
    const internalMs = parseInt(last.internalDate || "0", 10);

    const meta = {
      threadId: t.id,
      senderEmail,
      senderName,
      recipient: h("To").toLowerCase(),
      subject: h("Subject"),
      snippet: thread.snippet || last.snippet || "",
      date: h("Date"),
      ageDays: internalMs > 0 ? Math.floor((Date.now() - internalMs) / 86400000) : 0,
      hasReply: msgs.length > 1,
    };

    let result;
    const detResult = classifyDeterministic(meta);
    if (detResult) {
      result = detResult;
      dCount++;
      const k = detResult.rule_matched || "unmatched";
      ruleCounts[k] = (ruleCounts[k] || 0) + 1;
    } else {
      // Stage 2 — would call LLM; skip in dry-run to save cost
      result = {
        urgency: "REFERENCE",
        domain: null,
        company: "FARaudit",
        confidence: 0,
        reasoning: "DRY RUN: would escalate to LLM Stage 2 (not actually called)",
        bypassLLM: false,
        stage: "llm_pending",
        rule_matched: null,
        draft_recommended: false,
      };
      lCount++;
    }

    const currentLabelIds = Array.from(new Set(msgs.flatMap((m) => m.labelIds || [])));
    const currentLabelNames = currentLabelIds.map((id) => labelIdToName.get(id) || id);

    results.push({
      thread_id: meta.threadId,
      sender: meta.senderEmail,
      sender_name: meta.senderName,
      recipient: meta.recipient,
      subject: meta.subject,
      snippet_preview: meta.snippet.slice(0, 120),
      age_days: meta.ageDays,
      current_labels: currentLabelNames,
      proposed: {
        urgency: result.urgency,
        domain: result.domain,
        company: result.company,
        urgency_label: URGENCY_TO_GMAIL_LABEL[result.urgency],
        domain_label: result.domain ? DOMAIN_TO_GMAIL_LABEL[result.domain] : null,
        company_label: COMPANY_TO_GMAIL_LABEL[result.company],
        draft: result.draft_recommended,
      },
      stage: result.stage,
      rule_matched: result.rule_matched || null,
      confidence: result.confidence,
      reasoning: result.reasoning,
    });
  }

  const total = results.length;
  const out = {
    meta: {
      generated_at: new Date().toISOString(),
      total_threads: total,
      deterministic_count: dCount,
      llm_pending_count: lCount,
      pct_deterministic: total > 0 ? ((dCount / total) * 100).toFixed(1) + "%" : "0%",
      rule_match_counts: ruleCounts,
    },
    threads: results,
  };

  const rawPath = process.argv[2] || `~/faraudit-app/ceo/email-ai-v3-dryrun-${Date.now()}.json`;
  const outPath = rawPath.replace(/^~/, process.env.HOME);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Dry run written to ${outPath}`);
  console.log(
    `${total} threads · ${dCount} deterministic (${out.meta.pct_deterministic}) · ${lCount} would-LLM`
  );
  console.log(`Rule match counts:`);
  for (const [rule, count] of Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule}: ${count}`);
  }
}

main().catch((e) => {
  console.error("dry-run failed:", e.message);
  console.error(e.stack);
  process.exit(1);
});
