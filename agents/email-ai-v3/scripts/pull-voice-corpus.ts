/**
 * pull-voice-corpus.ts
 *
 * Fetches last 30 days of substantive SENT mail to build the CEO voice corpus.
 * Filters out: noreply, system notifications, self-sends, agent self-emails, short replies (<30 words).
 * Writes JSON to /tmp/voice-corpus.json for reply-drafter.ts to consume.
 *
 * Cost: Gmail API only, no LLM.
 * Cadence: regenerate weekly or on-demand. Drafter caches it.
 *
 * Usage:
 *   npx -y dotenv-cli -e ~/faraudit-app/.env.local -- npx tsx scripts/pull-voice-corpus.ts
 *
 * Note: GMAIL_* must be in .env.local OR script falls back to subject-only voice signal.
 */
import { google } from "googleapis";
import { writeFileSync } from "fs";

const CI = process.env.GMAIL_CLIENT_ID;
const CS = process.env.GMAIL_CLIENT_SECRET;
const RT = process.env.GMAIL_REFRESH_TOKEN;

if (!CI || !CS || !RT) {
  console.error("[voice-corpus] Missing GMAIL_* env vars in .env.local");
  console.error("[voice-corpus] Pull from Railway dashboard → email-ai-v3 → Variables");
  console.error("[voice-corpus] Per P1-15, these don't yet live in .env.local");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CI, CS);
oauth2.setCredentials({ refresh_token: RT });
const gmail = google.gmail({ version: "v1", auth: oauth2 });

const EXCLUDE_RECIPIENTS = [
  "noreply", "notifications", "no-reply", "hello@",
  "jose@faraudit.com", "jose@bullrize.com", "jose@lexanchor.ai",
];
const EXCLUDE_SENDERS = [
  "marketing@faraudit.com", "sales@faraudit.com",
  "noreply", "notifications",
];
const MIN_WORDS = 30;
const TARGET_SAMPLES = 25;
const MAX_PULL = 100;

function extractTextBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  const parts = payload.parts ?? [];
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      return Buffer.from(p.body.data, "base64").toString("utf-8");
    }
  }
  for (const p of parts) {
    const nested = extractTextBody(p);
    if (nested) return nested;
  }
  return "";
}

function isExcluded(to: string, from: string): boolean {
  const t = (to || "").toLowerCase();
  const f = (from || "").toLowerCase();
  return EXCLUDE_RECIPIENTS.some((x) => t.includes(x)) ||
         EXCLUDE_SENDERS.some((x) => f.includes(x));
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function main() {
  console.log("[voice-corpus] Pulling SENT mail last 30 days...");
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "in:sent newer_than:30d",
    maxResults: MAX_PULL,
  });

  const ids = (res.data.messages ?? []).map((m: any) => m.id);
  console.log(`[voice-corpus] Found ${ids.length} sent messages, filtering...`);

  const samples: any[] = [];
  for (const id of ids) {
    if (samples.length >= TARGET_SAMPLES) break;
    try {
      const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const headers = msg.data.payload?.headers ?? [];
      const to = getHeader(headers, "To");
      const from = getHeader(headers, "From");
      const subject = getHeader(headers, "Subject");
      if (isExcluded(to, from)) continue;
      const body = extractTextBody(msg.data.payload);
      const wordCount = body.split(/\s+/).filter(Boolean).length;
      if (wordCount < MIN_WORDS) continue;
      const cleanedBody = body
        .split(/\n>|\nOn .* wrote:/)[0]
        .trim()
        .slice(0, 2000);
      if (cleanedBody.split(/\s+/).filter(Boolean).length < MIN_WORDS) continue;

      samples.push({
        id,
        to,
        subject,
        body: cleanedBody,
        wordCount,
      });
    } catch (e: any) {
      console.warn(`[voice-corpus] skip ${id}: ${e?.message ?? e}`);
    }
  }

  console.log(`[voice-corpus] Collected ${samples.length} substantive samples`);
  writeFileSync("/tmp/voice-corpus.json", JSON.stringify(samples, null, 2));
  console.log("[voice-corpus] Written to /tmp/voice-corpus.json");
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
