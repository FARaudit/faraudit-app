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

// D2-A (Brain card 441, flag AUDIT_DEADLINE_RECONCILE, default-OFF) — amendment-supersession deadline reconciliation.
// Off ⇒ the extractor keeps the constant "Offers due (from document)" label + first-wins/cap-3 behavior (byte-identical),
// and no consumer calls reconcileOfferDueDeadlines. On ⇒ the extractor captures the matched LABEL LINE (so "revised /
// amendment / prior / superseded" context survives) and reconcileOfferDueDeadlines resolves the CONTROLLING date.
const RECONCILE_ENABLED = process.env.AUDIT_DEADLINE_RECONCILE === "true";

// Offer-due / quote-due / response-deadline labels (SF1449 Block 8, combined-synopsis, RFQ addenda).
const DUE_LABEL_RE = /(offer\s+due\s+date|due\s+date\s*\/\s*local\s+time|offers?\s+(?:are\s+)?due|quotes?\s+(?:are\s+)?due|responses?\s+(?:are\s+)?due|response\s+(?:date|deadline)|proposals?\s+(?:are\s+)?due|closing\s+(?:date|time)|receipt\s+of\s+(?:offers|quotes|proposals))/i;

// RECONCILIATION vocabulary — MIRRORS the battle-tested V1 reconciler (_view-model.ts:560-570, parseSourceOfferDue), which
// carries real customer-fatal-bug provenance (FA487726 closed a live sol off a superseded 17-Feb date) but is DEAD CODE for
// agentic_v3 (V1 render path). These live here (the engine half) so the V4 render path can reuse them. Kept in sync with V1.
const DEADLINE_EXCLUDE_RE = /site\s*visit|walk\W?through|pre[\s-]?(proposal|bid|award)|conference|registr|question|inquir|\bRF[IPQ]\b|clarification|sources?\s+sought|industry\s+day|q\s*&\s*a|notice\s+of\s+intent|period\s+of\s+performance|option\s+year|delivery|completion|award\s+date|contract\s+(start|award)|issue|posted|effective/i;
const DEADLINE_SUBMISSION_RE = /offer|proposal|quote|\bbid\b|response|receipt|submi|clos(e|ing)|due\s+date/i;
const DEADLINE_BLOCK8_RE = /block\s*8|offers?\s+due|sf[\s-]?1449|sf[\s-]?1442/i;
const DEADLINE_AMEND_UPDATED_RE = /amendment|amended|revised|updated|supersed/i;
// A DEAD date — "Prior proposal due date (superseded by Amendment 0005)" — must NEVER be the controlling date or drive
// open/closed. Excluded from the candidate pool entirely (parsing as the lone survivor closed live solicitations).
const DEADLINE_DEAD_DATE_RE = /superseded|prior\s+proposal|prior\s+offer|previous|cancell?ed|replaced\s+by|\bvoid(?:ed)?\b/i;

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

/** Extract offer-due dates the document itself states (labeled lines only). Empty when none is confidently found.
 *  Flag OFF (default): constant "Offers due (from document)" label, cap 3, first-wins (byte-identical). Flag ON: the
 *  matched LABEL LINE is captured verbatim (up to 8) so reconcileOfferDueDeadlines can read the amendment/prior/superseded
 *  context — first-wins/cap-3 could only ever capture the STALE original in an original+amendment concatenation. */
export function extractDocumentDeadlines(source: string): DocumentDeadline[] {
  if (!source) return [];
  const lines = source.split(/\r?\n/);
  const seen = new Set<string>();
  const out: DocumentDeadline[] = [];
  const cap = RECONCILE_ENABLED ? 8 : 3;
  for (let i = 0; i < lines.length && out.length < cap; i++) {
    if (!DUE_LABEL_RE.test(lines[i])) continue;
    // SF1449 and synopses frequently wrap the value onto the label line or the next 1-2 lines.
    const window = [lines[i], lines[i + 1] || "", lines[i + 2] || ""].join(" ");
    const iso = firstDate(window);
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    // Flag ON: preserve the label LINE (carries "revised / amendment / prior / superseded" context) — trimmed + capped.
    // Flag OFF: the constant label, exactly as before (byte-identical).
    const label = RECONCILE_ENABLED ? (lines[i].replace(/\s+/g, " ").trim().slice(0, 160) || "Offers due (from document)") : "Offers due (from document)";
    out.push({ label, date: iso });
  }
  return out;
}

/** Result of reconciling a document's offer-due dates against amendment supersession: the CONTROLLING (current) offer-due
 *  date + the dates it supersedes (for a "prior/amended" demotion note). Display-only — NEVER a source of open/closed.
 *  `supersession` = there is genuine evidence to reconcile (an amendment/prior/superseded label OR ≥2 distinct submission
 *  dates); the renderer overrides SAM's masthead date ONLY when this is true (a lone plain doc date keeps SAM authoritative). */
export interface ReconciledDeadline { controlling: DocumentDeadline | null; demoted: DocumentDeadline[]; supersession: boolean }

/** Resolve the CONTROLLING offer-due date from a persisted compliance_json.deadlines[] array, honoring amendment
 *  supersession. Pure. MIRRORS the V1 parseSourceOfferDue selection (drop interim + DEAD dates → prefer submission →
 *  amendment-narrow (an amendment may move the date EARLIER) → Block-8 → LATEST-wins) but ALSO returns the demoted
 *  (prior/amended/superseded) dates so the renderer can show them as a labeled note instead of a co-equal "verify".
 *  The dates here are already ISO (extractDocumentDeadlines normalized them), so Date.parse is sufficient. */
export function reconcileOfferDueDeadlines(deadlines: unknown): ReconciledDeadline {
  if (!Array.isArray(deadlines)) return { controlling: null, demoted: [], supersession: false };
  const entries: Array<{ label: string; date: string; ms: number }> = [];
  for (const e of deadlines) {
    const label = typeof e === "object" && e ? String((e as Record<string, unknown>).label ?? "") : "";
    const date = typeof e === "string" ? e : (typeof e === "object" && e ? String((e as Record<string, unknown>).date ?? "") : "");
    if (!date) continue;
    const ms = Date.parse(date);
    if (!Number.isNaN(ms)) entries.push({ label, date, ms });
  }
  if (entries.length === 0) return { controlling: null, demoted: [], supersession: false };
  // Drop interim milestones + DEAD (superseded/prior/cancelled) dates from the candidate pool — they are never controlling.
  const eligible = entries.filter((e) => !DEADLINE_EXCLUDE_RE.test(e.label) && !DEADLINE_DEAD_DATE_RE.test(e.label));
  const submission = eligible.filter((e) => DEADLINE_SUBMISSION_RE.test(e.label) || DEADLINE_SUBMISSION_RE.test(e.date));
  const pool = submission.length > 0 ? submission : eligible;
  const latest = <T extends { ms: number }>(xs: T[]): T => xs.reduce((m, e) => (e.ms > m.ms ? e : m), xs[0]);
  let controlling: { label: string; date: string; ms: number } | null = null;
  if (pool.length > 0) {
    // Amendment SUPERSEDE runs FIRST: narrow to amendment-updated entries when both amended + base exist (an amendment
    // can move the deadline EARLIER — do NOT require amended >= base). Then Block-8/1449/1442 within that pool; LATEST-wins.
    const amended = pool.filter((e) => DEADLINE_AMEND_UPDATED_RE.test(e.label));
    const controllingPool = amended.length > 0 && amended.length < pool.length ? amended : pool;
    const block8 = controllingPool.filter((e) => DEADLINE_BLOCK8_RE.test(e.label));
    controlling = latest(block8.length > 0 ? block8 : controllingPool);
  }
  // Demoted = every OTHER date (priors, superseded, SAM-differing, non-winning submission), deduped by date.
  const demoted: DocumentDeadline[] = [];
  const seenD = new Set<string>();
  for (const e of entries) {
    if (controlling && e.date === controlling.date) continue;
    if (seenD.has(e.date)) continue;
    seenD.add(e.date);
    demoted.push({ label: e.label, date: e.date });
  }
  // Supersession = there is genuine evidence to reconcile: an amendment/prior/superseded label anywhere, OR ≥2 distinct
  // submission-labeled dates (two offer-due dates in one document is itself a conflict to resolve). A lone plain doc date
  // → supersession=false → the renderer keeps SAM authoritative for the masthead (only the existing verify caveat).
  const distinctSubmissionDates = new Set(
    entries.filter((e) => DEADLINE_SUBMISSION_RE.test(e.label) || DEADLINE_SUBMISSION_RE.test(e.date)).map((e) => e.date)
  );
  const supersession = entries.some((e) => DEADLINE_AMEND_UPDATED_RE.test(e.label) || DEADLINE_DEAD_DATE_RE.test(e.label)) || distinctSubmissionDates.size >= 2;
  return { controlling: controlling ? { label: controlling.label, date: controlling.date } : null, demoted, supersession };
}
