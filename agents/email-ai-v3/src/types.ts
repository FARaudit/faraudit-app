// Orthogonal axis classification (Phase 2 — May 10 2026)
// One thread can have: 1 urgency + 0-1 domain + 1 company

export type UrgencyBucket =
  | "NOW"
  | "THIS_WEEK"
  | "WAITING"
  | "REFERENCE"
  | "ARCHIVE";

export type DomainTag =
  | "PROSPECT"
  | "ATLAS_LEGAL"
  | "INFRA"
  | null;

export type CompanyTag =
  | "FARaudit"
  | "Bullrize"
  | "LexAnchor";

export const VALID_URGENCY: UrgencyBucket[] = [
  "NOW", "THIS_WEEK", "WAITING", "REFERENCE", "ARCHIVE"
];

export const URGENCY_TO_GMAIL_LABEL: Record<UrgencyBucket, string> = {
  NOW: "🔴 NOW",
  THIS_WEEK: "🟠 THIS WEEK",
  WAITING: "🟡 WAITING",
  REFERENCE: "🔵 REFERENCE",
  ARCHIVE: "⚫ ARCHIVE",
};

export const DOMAIN_TO_GMAIL_LABEL: Record<Exclude<DomainTag, null>, string> = {
  PROSPECT: "🟢 PROSPECT",
  ATLAS_LEGAL: "🟣 ATLAS-LEGAL",
  INFRA: "🟤 INFRA",
};

export const COMPANY_TO_GMAIL_LABEL: Record<CompanyTag, string> = {
  FARaudit: "[FARaudit]",
  Bullrize: "[Bullrize]",
  LexAnchor: "[LexAnchor]",
};

// All v3 urgency labels (used for idempotency strip + DELETE migration)
export const ALL_V3_URGENCY_LABELS = [
  "🔴 NOW", "🟠 THIS WEEK", "🟡 WAITING", "🔵 REFERENCE", "⚫ ARCHIVE",
  "🟡 THIS WEEK", "🔵 READ", "🟢 WAITING", "🗑️ DELETE",  // legacy v3
];

export interface ClassificationResult {
  urgency: UrgencyBucket;
  domain: DomainTag;
  company: CompanyTag;
  confidence: number;
  reasoning: string;
  bypassLLM: boolean;
  stage: "deterministic" | "llm";
  rule_matched?: string;
  draft_recommended: boolean;
}

export interface EmailMeta {
  threadId: string;
  senderEmail: string;
  senderName: string;
  recipient: string;
  subject: string;
  snippet: string;
  date: string;
  ageDays: number;
  hasReply: boolean;
}

export interface RunMetrics {
  runStart: Date;
  threadsProcessed: number;
  classifiedDeterministic: number;
  classifiedLLM: number;
  draftsCreated: number;
  errors: number;
  totalCostUSD: number;
  errorLog: Array<{
    threadId: string;
    senderEmail: string;
    step: string;
    message: string;
    ts: string;
  }>;
}

// ─────────────────────────────────────────────────────────────
// Gmail SDK helper types (preserved from v3 — used by gmail.ts + index.ts)
// Not part of the v3.1 design surface; SDK shape aliases only.
// ─────────────────────────────────────────────────────────────

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
