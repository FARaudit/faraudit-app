// Header parsing + DB-driven detectors for Email-AI v2.

import { isKnownOutreachRecipient, findAuditByKoEmail } from './db.js';

// Extract a bare email address from a header value like
// `"Jane Doe" <jane@acme.com>` or `jane@acme.com`.
export function extractEmail(headerValue) {
  if (!headerValue) return null;
  const m = headerValue.match(/<([^>]+)>/) || headerValue.match(/([^\s<>]+@[^\s<>]+)/);
  if (!m) return null;
  return m[1].trim().toLowerCase();
}

// RFC 8058 / RFC 2369 List-Unsubscribe header parser.
// Returns { url, mailto } — either may be null. The header carries 1+ entries
// like `<https://example.com/u?id=1>, <mailto:unsub@example.com>`.
export function parseListUnsubscribe(headerValue) {
  if (!headerValue) return { url: null, mailto: null };
  const entries = [...headerValue.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  let url = null;
  let mailto = null;
  for (const e of entries) {
    if (/^mailto:/i.test(e)) mailto = e.replace(/^mailto:/i, '');
    else if (/^https?:/i.test(e)) url = e;
  }
  return { url, mailto };
}

// Heuristic: is this thread a reply to one of Jose's outreach emails?
// Uses the outreach_log table — only matches if the From sender is in the
// log AND the subject starts with "Re:" (case-insensitive).
export async function detectProspectReply(message) {
  const fromEmail = extractEmail(message.from);
  if (!fromEmail) return false;
  if (!/^re:/i.test(message.subject || '')) return false;
  return isKnownOutreachRecipient(fromEmail);
}

// Heuristic: is this thread a KO reply to a clarification email we sent?
// Two signals:
//   1. From: ends in `.mil` (federal email)
//   2. Subject starts with "Re:" AND we have an audit row whose
//      ko_email_recipient matches the sender
// Returns the matching audit row (for context-aware draft) or null.
export async function detectKoReply(message) {
  const fromEmail = extractEmail(message.from);
  if (!fromEmail) return null;
  if (!fromEmail.endsWith('.mil') && !fromEmail.endsWith('.gov')) return null;
  if (!/^re:/i.test(message.subject || '')) return null;
  return findAuditByKoEmail(fromEmail);
}
