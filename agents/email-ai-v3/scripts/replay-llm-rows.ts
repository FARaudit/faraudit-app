// Stage 2 verification: replay historical LLM-stage rows against the NEW prompt.
// Reads /tmp/llm-rows-historical.json, calls classifyLLM with current SYSTEM_PROMPT,
// emits side-by-side comparison to /tmp/llm-replay-results.json.

import fs from "fs";
import { classifyLLM } from "../src/anthropic";
import type { EmailMeta, CompanyTag } from "../src/types";

const rows = JSON.parse(fs.readFileSync("/tmp/llm-rows-historical.json", "utf-8"));

async function main() {
  console.log(`Replaying ${rows.length} historical LLM rows against new prompt...`);
  console.log(`Model: ${process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"}`);
  console.log("");

  const results: any[] = [];
  let same = 0;
  let improved = 0;
  let regressed = 0;

  for (const row of rows) {
    const meta: EmailMeta = {
      threadId: row.thread_id,
      senderEmail: row.sender_email,
      senderName: "",
      recipient: "jose@faraudit.com",
      subject: row.subject || "",
      snippet: row.subject || "(no snippet stored — using subject as proxy)",
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
        verdict = "SAME";
        same++;
      } else if (oldBucket === "ARCHIVE" && ["NOW", "THIS_WEEK"].includes(newBucket)) {
        verdict = "IMPROVED";
        improved++;
      } else if (["NOW", "THIS_WEEK"].includes(oldBucket) && newBucket === "ARCHIVE") {
        verdict = "REGRESSED";
        regressed++;
      } else {
        verdict = "NEUTRAL";
      }

      results.push({
        thread_id: row.thread_id,
        sender: row.sender_email,
        subject: (row.subject || "").slice(0, 80),
        old_bucket: oldBucket,
        new_bucket: newBucket,
        old_confidence: row.confidence,
        new_confidence: newResult.confidence,
        verdict,
        new_reasoning: (newResult.reasoning || "").slice(0, 150),
      });

      console.log(`[${verdict.padEnd(9)}] ${oldBucket.padEnd(10)} → ${newBucket.padEnd(10)} | ${(row.sender_email || "").slice(0, 30).padEnd(30)} | ${(row.subject || "").slice(0, 50)}`);
    } catch (e: any) {
      console.log(`[ERROR    ] ${row.sender_email}: ${e.message}`);
      results.push({ thread_id: row.thread_id, error: e.message });
    }
  }

  console.log("");
  console.log(`═══ SUMMARY ═══`);
  console.log(`Total: ${rows.length}`);
  console.log(`SAME: ${same}`);
  console.log(`IMPROVED: ${improved}`);
  console.log(`REGRESSED: ${regressed}`);
  console.log(`NEUTRAL: ${rows.length - same - improved - regressed}`);
  console.log("");
  const passing = same + improved;
  const gate = Math.ceil(rows.length * 0.82);
  console.log(`Gate: SAME + IMPROVED ≥ ${gate} of ${rows.length} (≥82%) → SHIP`);
  console.log(`Result: ${passing} / ${rows.length} = ${Math.round((passing / rows.length) * 100)}%`);

  fs.writeFileSync("/tmp/llm-replay-results.json", JSON.stringify(results, null, 2));
  console.log(`Full results: /tmp/llm-replay-results.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
