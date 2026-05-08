// Prospect-domain matcher — hardcoded per CEO mandate (FARaudit BD pipeline).
//
// Inbound from any of these domains (or display name) hits the classifier
// with the prospect=true hint flag, which forces NOW + a personalized draft
// reply. Update the lists by editing this file — no DB seeding required.

import { extractEmail } from './detect.js';

// Lower-case bare domains.
const PROSPECT_DOMAINS = new Set([
  'snoeinc.com',
  'pmrglobal.com',
  'southernmachineworks.com',
  'americanvalmark.com',
]);

// Lower-case substrings to match against the From header's display-name
// segment (the part outside the angle brackets). Useful when a contact uses
// a personal Gmail/Outlook address but the display name is recognizable.
const PROSPECT_NAME_SUBSTRINGS = [
  'rachel prevost',
  'john kratzert',
];

// Extract the bare domain from a "Name <user@domain.tld>" header. Returns
// lowercase, no trailing dot, or null if the header isn't parseable.
function domainOf(fromHeader) {
  const email = extractEmail(fromHeader);
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

// True iff the From header is a known prospect (domain match OR name match).
export function isProspect(fromHeader) {
  if (!fromHeader) return false;
  const domain = domainOf(fromHeader);
  if (domain && PROSPECT_DOMAINS.has(domain)) return true;
  const lc = fromHeader.toLowerCase();
  return PROSPECT_NAME_SUBSTRINGS.some((s) => lc.includes(s));
}

// Returns the matched domain, or null. Used as the prospect_domain column
// value in prospects_email_log. Falls back to the parsed domain when the
// match was on a name substring (so the log still has something useful).
export function prospectDomain(fromHeader) {
  if (!fromHeader) return null;
  const domain = domainOf(fromHeader);
  if (domain && PROSPECT_DOMAINS.has(domain)) return domain;
  const lc = fromHeader.toLowerCase();
  if (PROSPECT_NAME_SUBSTRINGS.some((s) => lc.includes(s))) return domain || 'unknown';
  return null;
}

// Best-effort display name extraction from the From header — used as
// prospect_name in the log. Returns null when the header is bare-email only.
export function prospectName(fromHeader) {
  if (!fromHeader) return null;
  const m = fromHeader.match(/^\s*"?([^"<]+?)"?\s*</);
  if (!m) return null;
  const name = m[1].trim();
  return name || null;
}
