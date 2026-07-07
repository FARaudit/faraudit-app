// ENGINE-5-ROOT #2 (engine half) — deterministic document offer-due-date extraction.
//
// The agentic engine reads the solicitation but never persisted the document's own
// offer-due date, so compliance_json.deadlines was null and the render layer had no
// document date to compare SAM's metadata against — a SAM/document deadline conflict
// (0728: SAM 13 Jul vs the SF1449's 9 Jul) went unsurfaced. This captures the
// document-derived date into compliance_json.deadlines; the render layer
// (build-data.ts deadlineConflictNote) uses it ONLY to add a "verify" caveat when it
// differs from SAM's date. SAM metadata REMAINS authoritative for open/closed and the
// displayed date — a document parse must never override it (a prior attempt closed a
// live, winnable solicitation off a mis-parsed cancelled date).
//
// CONSERVATIVE BY DESIGN: only high-confidence, offer-due-LABELED numeric/ISO dates are
// captured. Ambiguous prose, spelled-out months, and unlabeled dates yield nothing — a
// missed date just means no caveat (same as today), never a wrong date. Because the only
// consumer is a non-authoritative caveat, a stray capture is at worst a harmless
// "double-check" note, never a false open/closed determination.

export interface DocumentDeadline { label: string; date: string }

// Offer-due / quote-due / response-deadline labels (SF1449 Block 8, combined-synopsis, RFQ addenda).
const DUE_LABEL_RE = /(offer\s+due\s+date|due\s+date\s*\/\s*local\s+time|offers?\s+(?:are\s+)?due|quotes?\s+(?:are\s+)?due|responses?\s+(?:are\s+)?due|response\s+(?:date|deadline)|proposals?\s+(?:are\s+)?due|closing\s+(?:date|time)|receipt\s+of\s+(?:offers|quotes|proposals))/i;

/** First ISO (YYYY-MM-DD) or US (M/D/YYYY, M-D-YYYY) date in the text, normalized to YYYY-MM-DD. Null if none/invalid. */
function firstDate(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const mo = +iso[2], d = +iso[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const us = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (us) {
    const mo = +us[1], d = +us[2], y = +us[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

/** Extract offer-due dates the document itself states (labeled lines only). Empty when none is confidently found. */
export function extractDocumentDeadlines(source: string): DocumentDeadline[] {
  if (!source) return [];
  const lines = source.split(/\r?\n/);
  const seen = new Set<string>();
  const out: DocumentDeadline[] = [];
  for (let i = 0; i < lines.length && out.length < 3; i++) {
    if (!DUE_LABEL_RE.test(lines[i])) continue;
    // SF1449 and synopses frequently wrap the value onto the label line or the next 1-2 lines.
    const window = [lines[i], lines[i + 1] || "", lines[i + 2] || ""].join(" ");
    const iso = firstDate(window);
    if (iso && !seen.has(iso)) { seen.add(iso); out.push({ label: "Offers due (from document)", date: iso }); }
  }
  return out;
}
