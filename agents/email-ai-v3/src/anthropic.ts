import Anthropic from "@anthropic-ai/sdk";
import type { ThreadClassification, Bucket } from "./types";

let cached: Anthropic | null = null;

function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  cached = new Anthropic({ apiKey });
  return cached;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Sonnet 4.6 list pricing (USD per 1M tokens). Override via env if pricing changes.
const INPUT_PRICE_PER_M = Number(process.env.ANTHROPIC_INPUT_PRICE_PER_M || "3.00");
const OUTPUT_PRICE_PER_M = Number(process.env.ANTHROPIC_OUTPUT_PRICE_PER_M || "15.00");
// Cache reads are 0.1x input price; cache writes are 1.25x. Conservative — count cache_read at 0.1 if reported.
const CACHE_READ_PRICE_PER_M = INPUT_PRICE_PER_M * 0.1;
const CACHE_WRITE_PRICE_PER_M = INPUT_PRICE_PER_M * 1.25;

const VALID_BUCKETS: readonly Bucket[] = [
  "NOW",
  "THIS WEEK",
  "WAITING",
  "READ",
  "ARCHIVE",
  "DELETE",
] as const;

const CLASSIFY_SYSTEM = `You are an email triage classifier for jose@faraudit.com. Output JSON only.

Buckets:
- NOW = needs CEO decision today (real human writing personally, customer reply, legal/financial deadline that requires email response, infrastructure outage requiring CEO acknowledgement)
- THIS WEEK = important but can wait days (prospect follow-ups, vendor decisions)
- WAITING = CEO sent message and is waiting on reply
- READ = ambient reading, opted-in newsletters
- ARCHIVE = receipts, confirmations, automated alerts CEO acts on outside email (Atlas filings, Stripe receipts, deploy notifications, security alerts)
- DELETE = uncertain noise (marketing, unknown senders, low confidence)

HARD RULE 1 — UNREPLYABLE SENDER GUARD (applies BEFORE all category rules):
A 'no-reply sender' is any From address matching ANY of these patterns (case-insensitive substring match):
  - contains 'noreply' or 'no-reply' or 'donotreply' or 'do-not-reply'
  - starts with 'notifications@' or 'notification@'
  - starts with 'alerts@' or 'alert@'
  - starts with 'team@' or 'hello@' or 'info@' or 'updates@'
  - domain segment after @ starts with 'notify.', 'email.', 'mailer.', 'bounce.', 'mail.', 'news.' (e.g. @notify.railway.app, @email.linkedin.com)
  - contains 'mailer-daemon' or 'postmaster'
  - any '*-noreply@' or '*-no-reply@' address (e.g. workspace-noreply@, jobs-noreply@)

NOTE: 'support@' and 'help@' addresses are NOT auto-flagged — they are typically monitored human helpdesks. Apply category rules normally to them.

If sender matches ANY of the unreplyable patterns above, the email is UNREPLYABLE:
  - If content is confirmation/receipt/log → ARCHIVE
  - If content is deadline/alert/failure CEO must act on outside email → ARCHIVE with reasoning prefix 'unreplyable but actionable —'
  - NEVER NOW. NEVER WAITING. NEVER draft a reply. The agent on the other side cannot read replies.

HARD RULE 2 — THREAD AGE GUARD:
If 'last_message_age_days' value passed in user prompt is greater than 3, the email is stale:
  - Cannot be NOW regardless of content
  - Confirmations → ARCHIVE
  - Anything else → READ or DELETE based on signal value

CATEGORY RULES (applied AFTER hard rules above):
- Real human writing personally to jose (sender is a named person at a real company domain, NOT a noreply pattern from Hard Rule 1) → NOW
- LinkedIn DMs from named humans (sender contains person name + title + company in body) → NOW
- Atlas/Stripe/Vercel/Railway/Anthropic confirmations → ARCHIVE
- Atlas/Stripe billing failure or account-lock alerts → ARCHIVE (CEO acts in dashboard, not email reply)
- Newsletters CEO opted into → READ
- Cannot confidently bucket → DELETE with low confidence

Output JSON:
{"bucket":"NOW|THIS WEEK|WAITING|READ|ARCHIVE|DELETE","confidence":0.0-1.0,"reasoning":"one sentence including which hard rule applied if any"}

No prose. No markdown.`;

const DRAFT_SYSTEM = `Drafting reply for jose@faraudit.com. Tone: direct, brief, no hype, no apology, no exclamation marks. CEO-of-Lockheed register. Output draft body only — no subject, no headers, no markdown. 2-4 sentences. Acknowledge what's needed, state action, end.`;

interface ClassifyInput {
  senderEmail: string;
  subject: string;
  snippet: string;
  lastCeoMessageInThread: string | null; // ISO ts string or null
  lastMessageAgeDays: number;            // age of most recent message (any sender) in days
}

interface UsageWithCache {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function computeCost(usage: UsageWithCache): number {
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  return (
    (inTok * INPUT_PRICE_PER_M) / 1_000_000 +
    (outTok * OUTPUT_PRICE_PER_M) / 1_000_000 +
    (cacheWrite * CACHE_WRITE_PRICE_PER_M) / 1_000_000 +
    (cacheRead * CACHE_READ_PRICE_PER_M) / 1_000_000
  );
}

function extractText(msg: Anthropic.Messages.Message): string {
  const block = msg.content[0];
  if (block && block.type === "text") return block.text;
  return "";
}

function isValidBucket(value: unknown): value is Exclude<Bucket, "SKIPPED"> {
  return typeof value === "string" && (VALID_BUCKETS as readonly string[]).includes(value);
}

export async function classifyThread(input: ClassifyInput): Promise<ThreadClassification> {
  const client = getClient();

  const userPrompt = [
    `Sender: ${input.senderEmail}`,
    `Subject: ${input.subject}`,
    input.lastCeoMessageInThread
      ? `Last CEO message in thread: ${input.lastCeoMessageInThread}`
      : `Last CEO message in thread: none`,
    `Last message age (days): ${input.lastMessageAgeDays}`,
    "",
    "Snippet (first 500 chars):",
    input.snippet.slice(0, 500),
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: CLASSIFY_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = extractText(response).trim();

  // Strip code fences if model adds them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `classifier returned non-JSON: ${cleaned.slice(0, 200)} (parse error: ${(e as Error).message})`
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (!isValidBucket(obj.bucket)) {
    throw new Error(`classifier returned invalid bucket: ${JSON.stringify(obj.bucket)}`);
  }

  const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";

  const usage = response.usage as UsageWithCache;
  return {
    bucket: obj.bucket,
    confidence,
    reasoning,
    model_used: MODEL,
    input_tokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
    output_tokens: usage.output_tokens || 0,
    cost_usd: computeCost(usage),
  };
}

interface DraftInput {
  senderEmail: string;
  subject: string;
  snippet: string;
}

export interface DraftResult {
  body: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export async function generateDraftReply(input: DraftInput): Promise<DraftResult> {
  const client = getClient();

  const userPrompt = [
    `Original sender: ${input.senderEmail}`,
    `Original subject: ${input.subject}`,
    "",
    "Original snippet:",
    input.snippet.slice(0, 500),
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: DRAFT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const body = extractText(response).trim();
  const usage = response.usage as UsageWithCache;
  return {
    body,
    input_tokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
    output_tokens: usage.output_tokens || 0,
    cost_usd: computeCost(usage),
  };
}

export const ACTIVE_MODEL = MODEL;
