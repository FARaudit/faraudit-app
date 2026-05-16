// Path 3: replay 11 historical LLM rows with REAL Gmail body snippets,
// not subject proxy. Uses the same OAuth credentials production cron uses.

import fs from "fs";
import { google } from "googleapis";
import { classifyLLM } from "../src/anthropic";
import type { EmailMeta, CompanyTag } from "../src/types";

const HISTORICAL_ROWS = JSON.parse(
  fs.readFileSync("/tmp/llm-rows-historical.json", "utf-8")
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

async function fetchThreadSnippet(threadId: string): Promise<string> {
  try {
    const resp = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });
    const messages = resp.data.messages ?? [];
    if (messages.length === 0) return "";

    const msg = messages[0];

    function findPlainText(payload: any): string | null {
      if (!payload) return null;
      if (payload.mimeType === "text/plain" && payload.body?.data) {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
      }
      for (const part of payload.parts ?? []) {
        const text = findPlainText(part);
        if (text) return text;
      }
      return null;
    }

    const plainText = findPlainText(msg.payload);
    if (plainText) return plainText.slice(0, 500);

    return msg.snippet ?? "";
  } catch (e: any) {
    console.error(`  Failed to fetch ${threadId}: ${e.message}`);
    return "";
  }
}

async function main() {
  console.log(`Path 3 replay: ${HISTORICAL_ROWS.length} rows with REAL bodies`);
  console.log(`Model: ${process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"}`);
  console.log("");

  const results: any[] = [];
  let same = 0, improved = 0, regressed = 0;

  for (const row of HISTORICAL_ROWS) {
    process.stdout.write(`Fetching ${row.thread_id.slice(0, 16)}... `);
    const realSnippet = await fetchThreadSnippet(row.thread_id);
    console.log(`${realSnippet.length} chars`);

    if (!realSnippet) {
      results.push({
        thread_id: row.thread_id,
        skipped: "no body retrievable",
      });
      continue;
    }

    const meta: EmailMeta = {
      threadId: row.thread_id,
      senderEmail: row.sender_email,
      senderName: "",
      recipient: "jose@faraudit.com",
      subject: row.subject || "",
      snippet: realSnippet,
      date: row.classified_at,
      ageDays: 0,
      hasReply: false,
    };

    try {
      const newResult = await classifyLLM(meta, "FARaudit" as CompanyTag);
      const oldBucket = row.bucket;
      const newBucket = newResult.urgency;

      let verdict: string;
      if (newBucket === oldBucket) {
        verdict = "SAME"; same++;
      } else if (oldBucket === "ARCHIVE" && ["NOW", "THIS_WEEK"].includes(newBucket)) {
        verdict = "IMPROVED"; improved++;
      } else if (["NOW", "THIS_WEEK"].includes(oldBucket) && newBucket === "ARCHIVE") {
        verdict = "REGRESSED"; regressed++;
      } else {
        verdict = "NEUTRAL";
      }

      results.push({
        thread_id: row.thread_id,
        sender: row.sender_email,
        subject: (row.subject || "").slice(0, 80),
        body_preview: realSnippet.slice(0, 120),
        old_bucket: oldBucket,
        new_bucket: newBucket,
        old_confidence: row.confidence,
        new_confidence: newResult.confidence,
        verdict,
        new_reasoning: (newResult.reasoning || "").slice(0, 200),
      });
    } catch (e: any) {
      console.log(`  classifyLLM error: ${e.message}`);
      results.push({ thread_id: row.thread_id, error: e.message });
    }
  }

  fs.writeFileSync("/tmp/llm-replay-real-bodies.json", JSON.stringify(results, null, 2));

  console.log("");
  console.log(`═══ PATH 3 SUMMARY ═══`);
  const neutral = HISTORICAL_ROWS.length - same - improved - regressed;
  console.log(`Total: ${HISTORICAL_ROWS.length}`);
  console.log(`SAME: ${same}`);
  console.log(`IMPROVED: ${improved}`);
  console.log(`REGRESSED: ${regressed}`);
  console.log(`NEUTRAL: ${neutral}`);
  console.log("");
  console.log(`Gate: SAME + IMPROVED + NEUTRAL ≥ 10/11 (≥91%) AND REGRESSED = 0 → SHIP`);
  console.log(`Result: SAME+IMPROVED+NEUTRAL = ${same + improved + neutral}, REGRESSED = ${regressed}`);

  console.log("");
  console.log("═══ Non-SAME rows for review ═══");
  for (const r of results) {
    if (r.verdict && r.verdict !== "SAME") {
      console.log(`[${r.verdict}] ${r.old_bucket} → ${r.new_bucket}`);
      console.log(`  ${r.sender} | ${r.subject}`);
      console.log(`  body: "${r.body_preview}..."`);
      console.log(`  new reasoning: ${r.new_reasoning}`);
      console.log("");
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
