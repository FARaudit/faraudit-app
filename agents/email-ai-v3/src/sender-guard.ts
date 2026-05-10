// ────────────────────────────────────────────────────────────
// Sender + age guards — closes the no-reply draft hole from tick 1
//
// Two checks applied AFTER classification, BEFORE draft creation:
//   1. isUnreplyable(senderEmail) — overrides NOW → ARCHIVE if From matches
//      a known unreplyable pattern (no-reply, notifications, etc.)
//   2. isStale(lastMessageDate, maxAgeDays) — overrides NOW → ARCHIVE if
//      thread's most recent message is older than maxAgeDays (default 3).
//
// NOTE: 'support@' and 'help@' are deliberately NOT flagged — typically
// monitored human helpdesks (Anthropic support, GitHub help, etc.).
// ────────────────────────────────────────────────────────────

const UNREPLYABLE_PATTERNS: RegExp[] = [
  // Explicit no-reply markers in local part
  /noreply/i,
  /no-reply/i,
  /donotreply/i,
  /do-not-reply/i,

  // Common unmonitored mailbox prefixes
  /^notifications?@/i,
  /^alerts?@/i,
  /^team@/i,
  /^hello@/i,
  /^info@/i,
  /^updates@/i,

  // Bulk-email infrastructure subdomains (after @)
  /@notify\./i,
  /@email\./i,
  /@mailer\./i,
  /@bounce\./i,
  /@mail\./i,
  /@news\./i,

  // System-generated bounces
  /mailer-daemon/i,
  /postmaster/i,
];

export function isUnreplyable(senderEmail: string | null | undefined): boolean {
  if (!senderEmail) return true;
  return UNREPLYABLE_PATTERNS.some((rx) => rx.test(senderEmail));
}

export function isStale(lastMessageDate: Date | null, maxAgeDays = 3): boolean {
  if (!lastMessageDate) return false;
  const ageDays = (Date.now() - lastMessageDate.getTime()) / 86_400_000;
  return ageDays > maxAgeDays;
}

export function ageInDays(lastMessageDate: Date | null): number {
  if (!lastMessageDate) return 0;
  return Math.floor((Date.now() - lastMessageDate.getTime()) / 86_400_000);
}
