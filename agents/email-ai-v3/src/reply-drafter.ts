/**
 * reply-drafter.ts
 *
 * Stage 4: Reply drafter v2
 *
 * Reads email_ai_actions rows where verb='reply' AND confidence>=0.7 AND no draft exists.
 * Pulls full thread from Gmail, generates a CEO-voice reply via Sonnet 4.6,
 * writes draft to Gmail Drafts folder, logs to email_ai_drafts table.
 *
 * NEVER auto-sends. NEVER moves threads. CEO reviews in Gmail Drafts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MIN_REPLY_CONFIDENCE = 0.7;
const VOICE_CORPUS_PATH = "/tmp/voice-corpus.json";

export interface DrafterResult {
  action_id: string;
  thread_id: string;
  gmail_draft_id: string;
  draft_subject: string;
  draft_body: string;
  voice_samples_count: number;
  confidence: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

function loadVoiceCorpus(): any[] {
  if (!existsSync(VOICE_CORPUS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(VOICE_CORPUS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function buildSystemPrompt(voiceSamples: any[]): string {
  const samples = voiceSamples
    .slice(0, 10)
    .map((s, i) => `--- Sample ${i + 1} (subject: ${s.subject}) ---\n${s.body}`)
    .join("\n\n");

  return `You are drafting a reply email on behalf of Jose Antonio Rodriguez Jr, the CEO and sole founder of Vertex Intelligence Holdings.

VERTEX INTELLIGENCE HOLDINGS owns three operating systems:
- FARaudit: defense BD operating system for federal subcontractors
- Bullrize: investor intelligence operating system (agentic-first)
- LexAnchor: parked, revisit Month 6

VOICE GUIDELINES:
- Direct, concise, CEO-of-Lockheed tone — no hype, no marketing speak
- No "AI-powered", no "SaaS" (use "operating system" or "AaaS")
- Bulleted, scannable when listing items
- Confident but never arrogant
- Specific over generic — name the FAR clause, the agency, the contract type

VOICE CALIBRATION (CEO's actual recent replies):
${samples || "(no samples available — use generic CEO-of-Lockheed tone)"}

YOUR JOB:
Draft a reply to the email thread provided. Output ONLY a JSON object:
{
  "subject": "Re: <original subject>",
  "body": "<your draft, no signature — Gmail appends sig>",
  "confidence": <0-1, how confident you are this draft is sendable>
}

RULES:
- Never invent meetings, numbers, prices, or commitments
- If thread asks something you can't answer from context, draft a short reply that asks one clarifying question
- Match the formality level of the inbound email
- Length: ~3-6 sentences typical, longer only if technical specifics needed
- NO greeting like "Hi [name]" — start with the substantive content
- NO sign-off like "Best, Jose" — Gmail signature handles it`;
}

function buildUserPrompt(thread: any, classification: any): string {
  const messages = thread.messages ?? [];
  const threadSummary = messages
    .slice(-5)
    .map((m: any) => {
      const headers = m.payload?.headers ?? [];
      const from = headers.find((h: any) => h.name?.toLowerCase() === "from")?.value ?? "unknown";
      const date = headers.find((h: any) => h.name?.toLowerCase() === "date")?.value ?? "";
      const body = extractTextFromMsg(m).slice(0, 1500);
      return `[From: ${from}, Date: ${date}]\n${body}`;
    })
    .join("\n\n---\n\n");

  return `<thread-history>
${threadSummary}
</thread-history>

<classifier-context>
Bucket: ${classification.bucket}
Reasoning: ${classification.reasoning || "(none)"}
</classifier-context>

Draft a reply to the most recent message in this thread.`;
}

function extractTextFromMsg(msg: any): string {
  const payload = msg.payload;
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64").toString("utf-8");
  const parts = payload.parts ?? [];
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      return Buffer.from(p.body.data, "base64").toString("utf-8");
    }
  }
  return msg.snippet ?? "";
}

function gmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function encodeDraft(to: string, subject: string, body: string, inReplyTo?: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${inReplyTo}` : null,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
  ].filter(Boolean).join("\r\n");
  const raw = Buffer.from(`${headers}\r\n\r\n${body}`).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return raw;
}

export async function draftReply(
  sb: SupabaseClient,
  actionRow: any,
  classification: any
): Promise<DrafterResult | null> {
  if (actionRow.verb !== "reply") {
    console.log(`[drafter] skip ${actionRow.thread_id}: verb is ${actionRow.verb}, not reply`);
    return null;
  }
  if (actionRow.confidence < MIN_REPLY_CONFIDENCE) {
    console.log(`[drafter] skip ${actionRow.thread_id}: confidence ${actionRow.confidence} < ${MIN_REPLY_CONFIDENCE}`);
    return null;
  }

  const { data: existing } = await sb
    .from("email_ai_drafts")
    .select("id")
    .eq("action_id", actionRow.id)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(`[drafter] skip ${actionRow.thread_id}: draft already exists for action ${actionRow.id}`);
    return null;
  }

  const gmail = gmailClient();
  const threadRes = await gmail.users.threads.get({ userId: "me", id: actionRow.thread_id, format: "full" });
  const thread = threadRes.data;

  const lastMsg = (thread.messages ?? []).slice(-1)[0];
  const headers = lastMsg?.payload?.headers ?? [];
  const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === "from")?.value ?? "";
  const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === "subject")?.value ?? "";
  const messageIdHeader = headers.find((h: any) => h.name?.toLowerCase() === "message-id")?.value ?? "";
  const replySubject = subjectHeader.startsWith("Re:") ? subjectHeader : `Re: ${subjectHeader}`;

  const voiceSamples = loadVoiceCorpus();
  const systemPrompt = buildSystemPrompt(voiceSamples);
  const userPrompt = buildUserPrompt(thread, classification);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = completion.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  let parsed: { subject: string; body: string; confidence: number };
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON in response");
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error(`[drafter] failed to parse JSON: ${text.slice(0, 200)}`);
    return null;
  }

  const raw = encodeDraft(fromHeader, parsed.subject || replySubject, parsed.body, messageIdHeader);
  const draftRes = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw, threadId: actionRow.thread_id },
    },
  });

  const draftId = draftRes.data.id!;
  const result: DrafterResult = {
    action_id: actionRow.id,
    thread_id: actionRow.thread_id,
    gmail_draft_id: draftId,
    draft_subject: parsed.subject || replySubject,
    draft_body: parsed.body,
    voice_samples_count: voiceSamples.length,
    confidence: parsed.confidence,
    model: MODEL,
    prompt_tokens: completion.usage.input_tokens,
    completion_tokens: completion.usage.output_tokens,
  };

  const { error: insErr } = await sb.from("email_ai_drafts").insert(result);
  if (insErr) {
    console.error(`[drafter] INSERT email_ai_drafts failed:`, insErr.message);
  }

  console.log(`[drafter] draft created thread=${actionRow.thread_id} gmail_draft=${draftId} confidence=${parsed.confidence}`);
  return result;
}
