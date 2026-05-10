import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { GmailThread } from "./types";

let cached: gmail_v1.Gmail | null = null;

function buildOAuth(): OAuth2Client {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId) throw new Error("GMAIL_CLIENT_ID missing");
  if (!clientSecret) throw new Error("GMAIL_CLIENT_SECRET missing");
  if (!refreshToken) throw new Error("GMAIL_REFRESH_TOKEN missing");

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return oauth;
}

export function getGmail(): gmail_v1.Gmail {
  if (cached) return cached;
  cached = google.gmail({ version: "v1", auth: buildOAuth() });
  return cached;
}

// ────────────────────────────────────────────────────────────
// Label helpers — resolve display name → label id
// ────────────────────────────────────────────────────────────

export async function listLabels(): Promise<Map<string, string>> {
  const gmail = getGmail();
  const res = await gmail.users.labels.list({ userId: "me" });
  const map = new Map<string, string>();
  for (const lbl of res.data.labels || []) {
    if (lbl.name && lbl.id) map.set(lbl.name, lbl.id);
  }
  return map;
}

// ────────────────────────────────────────────────────────────
// Thread + message helpers
// ────────────────────────────────────────────────────────────

export async function listUnreadThreads(maxResults = 50): Promise<string[]> {
  const gmail = getGmail();
  const res = await gmail.users.threads.list({
    userId: "me",
    q: "is:unread in:inbox",
    maxResults,
  });
  return (res.data.threads || []).map((t) => t.id!).filter(Boolean);
}

export async function getThread(threadId: string): Promise<GmailThread> {
  const gmail = getGmail();
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full", // need labelIds + snippets per message
  });
  return res.data as GmailThread;
}

// ────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────

export async function applyLabel(threadId: string, addLabelId: string): Promise<void> {
  const gmail = getGmail();
  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: { addLabelIds: [addLabelId], removeLabelIds: ["UNREAD"] },
  });
}

export async function moveToTrash(threadId: string): Promise<void> {
  const gmail = getGmail();
  await gmail.users.threads.trash({ userId: "me", id: threadId });
}

// ────────────────────────────────────────────────────────────
// Draft creation — RFC-2047 encode non-ASCII subjects, UTF-8 body
// ────────────────────────────────────────────────────────────

function encodeMimeWord(s: string): string {
  // ASCII-only → return as-is
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const b64 = Buffer.from(s, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function encodeBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface CreateDraftInput {
  threadId?: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

export async function createDraft(input: CreateDraftInput): Promise<string> {
  const gmail = getGmail();
  const headers: string[] = [
    `To: ${input.to}`,
    `Subject: ${encodeMimeWord(input.subject)}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);

  const raw = encodeBase64Url(
    Buffer.from(headers.join("\r\n") + "\r\n\r\n" + input.body, "utf8")
  );

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw,
        ...(input.threadId ? { threadId: input.threadId } : {}),
      },
    },
  });

  if (!res.data.id) throw new Error("createDraft returned no id");
  return res.data.id;
}
