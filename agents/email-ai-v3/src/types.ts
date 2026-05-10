// ────────────────────────────────────────────────────────────
// Type definitions — Email-AI v3
// ────────────────────────────────────────────────────────────

export type Bucket =
  | "NOW"
  | "THIS WEEK"
  | "WAITING"
  | "READ"
  | "ARCHIVE"
  | "DELETE"
  | "SKIPPED";

export interface BlacklistEntry {
  sender_email: string;
  reason: string | null;
}

export interface ThreadClassification {
  bucket: Bucket;
  confidence: number;
  reasoning: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string; size?: number };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string; size?: number };
      parts?: unknown[];
    }>;
  };
}

export interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface ThreadSummary {
  threadId: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  lastCeoMessageAt: number | null; // unix ms; null if CEO never sent in thread
  rawMessages: GmailMessage[];
}

export interface RunMetrics {
  threadsProcessed: number;
  threadsClassified: number;
  threadsSkippedSelfLoop: number;
  threadsBlacklisted: number;
  draftsCreated: number;
  errorsCaught: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  errorLog: ErrorLogEntry[];
  modelUsed: string | null;
}

export interface ErrorLogEntry {
  threadId?: string;
  senderEmail?: string;
  step: string; // 'fetch' | 'classify' | 'label' | 'draft' | 'persist' | ...
  message: string;
  ts: string;
}

export const ALL_BUCKETS: readonly Bucket[] = [
  "NOW",
  "THIS WEEK",
  "WAITING",
  "READ",
  "ARCHIVE",
  "DELETE",
] as const;

// Display label names that already exist in the user's Gmail (carried from v2 for continuity)
export const BUCKET_TO_GMAIL_LABEL: Record<Exclude<Bucket, "SKIPPED">, string> = {
  NOW: "🔴 NOW",
  "THIS WEEK": "🟡 THIS WEEK",
  WAITING: "🟢 WAITING",
  READ: "🔵 READ",
  ARCHIVE: "⚫ ARCHIVE",
  DELETE: "🗑️ DELETE",
};
