// ── TEMPORAL SIGNAL PRIMITIVE (Verdict Arc, move #4) ──────────────────────────────────────────────────
// PURE + POLICY-FREE. Given the deadlines the engine already extracts (compliance_json.deadlines: {date,label}[])
// plus TODAY, this classifies the objective facts a human uses first: is the response deadline past? is a
// mandatory pre-award event past? what is the latest (governing) response date? It answers "is this date before
// today" — NOT "what verdict does that imply." The verdict POLICY (past-deadline → NO_BID, at what confidence)
// lives in deriveVerdict and is gated by the design panel; this module only supplies the calibrated signal.
//
// FAIL-SAFE BY CONSTRUCTION: an unparseable / ambiguous / absent date yields `null` (unknown), NEVER a false
// "past". A confident past requires a parseable date strictly before today. Callers must treat null as "not proven
// past" (fall to caution/escalation), so a mis-parse can never manufacture a wrong NO_BID.

export interface DeadlineItem { date?: string | null; label?: string | null }

export interface TemporalSignal {
  today: string;                          // the reference date used (ISO yyyy-mm-dd)
  responseDeadline: string | null;        // the governing (latest) response/offer-due date, if identifiable
  responseDeadlinePast: boolean | null;   // true=closed, false=open, null=unknown (unparseable/absent)
  mandatoryEventDates: string[];          // parseable dates tied to mandatory pre-award events (site visit, etc.)
  mandatoryEventPast: boolean | null;     // true=a mandatory event is in the past, false=all future, null=none found
  latestFutureDeadline: string | null;    // nearest still-open deadline, if any
  daysToResponse: number | null;          // signed days from today to the response deadline (negative = past)
}

const MANDATORY_LABEL_RE = /site\s*visit|walk\s*through|pre[- ]?bid|pre[- ]?proposal|mandatory|rsvp|registration deadline|attendance/i;
const RESPONSE_LABEL_RE = /response|offer|quote|proposal|submission|due|close|closing|receipt/i;

/** Parse a solicitation date string to an ISO yyyy-mm-dd, or null if not confidently parseable.
 *  Accepts ISO (2026-07-30), US (07/30/2026, 7/30/26), and "Month D, YYYY" — the forms SAM/notice text use.
 *  Deliberately conservative: anything it cannot resolve to a real Y-M-D returns null (fail toward "unknown"). */
export function parseSolicitationDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // ISO yyyy-mm-dd (optionally with time) — the engine's own deadlines[] format.
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return isoIf(+m[1], +m[2], +m[3]);
  // US m/d/yyyy or m/d/yy
  m = s.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return isoIf(y, +m[1], +m[2]); }
  // Month D, YYYY  (e.g., June 11, 2026 / Jun 11 2026)
  const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) { const mi = MON.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi >= 0) return isoIf(+m[3], mi + 1, +m[2]); }
  return null;
}

/** Parse an UNAMBIGUOUS INSTANT to epoch ms, or null. ULTRA B2 finding F1 (Brain RULING 4).
 *
 *  SAM v2 `responseDeadLine` is ALWAYS `YYYY-MM-DDTHH:MM:SS±HH:MM` — a form `parseSolicitationDate` returns null on
 *  (its ISO regex's trailing `\b` cannot match between a digit and `T`). That made the live-past-deadline CLOSED
 *  branch DEAD CODE in production: CLOSED could only ever fire via `active=false`, so a never-amended solicitation in
 *  the deadline→archive window read OPEN and could reach a committal BID on a closed solicitation.
 *
 *  This function is the ONLY thing the temporal gate may compare, and it deliberately does NOT fall back to a date:
 *  the caller's `now` is derived from `new Date().toISOString()`, which is a **UTC** date. Comparing a UTC date to a
 *  local-offset deadline date arms a timezone off-by-one FALSE-CLOSED (a 10 PM EDT / 3 PM HST same-day deadline reads
 *  as "yesterday" → CLOSED while the solicitation is open) — the silently-fatal class the panel non-negotiable
 *  forbids. So: an instant, or nothing. A string WITHOUT an explicit zone offset is NOT an instant (its true moment
 *  is unknowable), and returns null ⇒ the gate falls through to OPEN, the conservative direction. */
export function parseSolicitationInstant(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // date + time + EXPLICIT zone (Z or ±HH:MM / ±HHMM). No zone ⇒ not an instant ⇒ null (never guess a zone).
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return null;
  const ms = Date.parse(s.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

function isoIf(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Reject overflow (e.g., Feb 30 → Mar 2) — a real calendar date must round-trip.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Days from `today` to `date` (both ISO). Negative = date is in the past. null if either unparseable. */
export function daysBetween(today: string, date: string | null): number | null {
  const a = parseSolicitationDate(today), b = parseSolicitationDate(date);
  if (!a || !b) return null;
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** Classify the extracted deadlines against `today`. Pure. `today` must be ISO yyyy-mm-dd (injected, never new Date()). */
export function classifyTemporal(deadlines: DeadlineItem[] | null | undefined, today: string): TemporalSignal {
  const items = (deadlines ?? []).map((d) => ({ iso: parseSolicitationDate(d.date), label: d.label ?? "" })).filter((x) => x.iso);
  const base: TemporalSignal = {
    today, responseDeadline: null, responseDeadlinePast: null,
    mandatoryEventDates: [], mandatoryEventPast: null, latestFutureDeadline: null, daysToResponse: null,
  };
  if (!items.length) return base;

  // RESPONSE deadline = the GOVERNING (latest) response-typed date — a later amendment supersedes an earlier one.
  const responseDates = items.filter((x) => RESPONSE_LABEL_RE.test(x.label) || !MANDATORY_LABEL_RE.test(x.label));
  const respPool = responseDates.length ? responseDates : items;
  const latestResp = respPool.map((x) => x.iso!).sort().at(-1) ?? null;   // ISO sorts lexically = chronologically
  base.responseDeadline = latestResp;
  if (latestResp) {
    const dd = daysBetween(today, latestResp);
    base.daysToResponse = dd;
    base.responseDeadlinePast = dd === null ? null : dd < 0;
  }

  // MANDATORY pre-award events (site visit etc.) — label-typed.
  const mand = items.filter((x) => MANDATORY_LABEL_RE.test(x.label)).map((x) => x.iso!);
  base.mandatoryEventDates = [...new Set(mand)].sort();
  if (base.mandatoryEventDates.length) {
    base.mandatoryEventPast = base.mandatoryEventDates.some((d) => { const dd = daysBetween(today, d); return dd !== null && dd < 0; });
  }

  // nearest still-open deadline
  const future = items.map((x) => x.iso!).filter((iso) => { const dd = daysBetween(today, iso); return dd !== null && dd >= 0; }).sort();
  base.latestFutureDeadline = future.at(0) ?? null;
  return base;
}

// ── TEMPORAL VERDICT DISPOSITION (Verdict Arc v2, panel-mandated) ──────────────────────────────────────
// The panel (card #668) REVISED the naive "snapshot deadline past → NO_BID": that manufactures a SILENTLY-FATAL
// false-CLOSED on live/extended solicitations (the missing doc IS the extending amendment). CLOSED must be a
// LIVE-SAM fact, and an unread amendment caps to INCOMPLETE (amendments are supremacy docs). This function encodes
// exactly that policy — PURE, so it is fully unit-testable and the SAM I/O lives at the call site.
//
// NON-NEGOTIABLE INVARIANTS (panel):
//   • snapshot dates ALONE may NEVER drive NO_BID — CLOSED requires live-confirmed currency.
//   • live fetch fail / unread amendment / ambiguity → INDETERMINATE (→ INCOMPLETE/escalate), NEVER closed, NEVER bid.
//   • "mandatory site-visit past" is NOT a temporal close (it's a bidder-attribute / #575 class) — handled elsewhere.

export interface LiveSamStatus {
  fetched: boolean;                 // did the verdict-time live-SAM query succeed?
  active: boolean | null;           // SAM `active` flag: true=open, false=archived, null=unknown
  responseDeadline?: string | null; // the LIVE current response date (post-amendment), raw or ISO
  amendmentCount?: number | null;   // live-advertised amendment/attachment count (for completeness reconciliation)
}

// The bundle the orchestrator threads into VerdictInputs (executor computes it at the I/O boundary; the pure
// layers never fetch or call new Date()). All four are required together — a partial bundle is a wiring bug.
export interface TemporalVerdictBundle {
  snapshot: TemporalSignal;          // classifyTemporal(deadlines, today) — activates the gate (disposition reads `live`, not this)
  liveSam: LiveSamStatus | null;     // verdict-time fetchLiveSamStatus(...) — null (fetch-fail/timeout) → INDETERMINATE
  ingestedAmendmentComplete: boolean;// ingested amendment set ⊇ live inventory (conservative: false unless positively confirmed)
  nowIso?: string | null;            // verdict-time INSTANT (full ISO w/ zone) — the ONLY thing the deadline gate compares (F1)
  today: string;                     // injected ISO yyyy-mm-dd
}

export type TemporalDisposition =
  | { kind: "OPEN"; reason: string }                          // live-confirmed open → temporal does NOT block
  | { kind: "CLOSED"; reason: string; evidence: string }      // live-confirmed closed → the ONLY path to NO_BID(CLOSED)
  | { kind: "INDETERMINATE"; reason: string };                // currency unconfirmable → INCOMPLETE/escalate

/** Decide the temporal disposition from the snapshot signal + the verdict-time LIVE-SAM status + amendment completeness.
 *  PURE. `today` ISO. Returns CLOSED only when the LIVE record confirms it AND the ingested amendment set is complete. */
export function deriveTemporalDisposition(
  snapshot: TemporalSignal,
  live: LiveSamStatus | null,
  ingestedAmendmentComplete: boolean,
  today: string,
  nowIso?: string | null,      // verdict-time INSTANT (full ISO w/ zone). Absent ⇒ no instant ⇒ deadline check falls to OPEN.
): TemporalDisposition {
  // (1) No live confirmation → cannot certify open OR closed. Never NO_BID from a snapshot.
  if (!live || !live.fetched) {
    return { kind: "INDETERMINATE", reason: "live SAM currency could not be confirmed at verdict time — a snapshot date cannot prove no extending amendment exists" };
  }
  // (2) Unread amendment → amendments extend deadlines / remove bars → cap to INCOMPLETE, never closed.
  if (!ingestedAmendmentComplete) {
    return { kind: "INDETERMINATE", reason: "the ingested package is missing at least one amendment the live SAM record advertises — amendments can extend the deadline or remove a bar; cannot certify closed or bid" };
  }
  // (3) Live says ARCHIVED → confirmed closed.
  if (live.active === false) {
    return { kind: "CLOSED", reason: "the live SAM record shows this solicitation is archived (inactive)", evidence: `SAM active=false${live.responseDeadline ? ` · response ${live.responseDeadline}` : ""}` };
  }
  // (4) Live ACTIVE — check the LIVE (post-amendment) response deadline, not the snapshot.
  //     INSTANTS ONLY (Brain RULING 4, ULTRA B2 F1). There is deliberately NO date-vs-date path here: `today` is a
  //     UTC date and the deadline carries a local offset, so any date comparison arms a tz off-by-one FALSE-CLOSED.
  //     Both sides must resolve to a true instant or the gate falls through to OPEN.
  if (live.active === true) {
    const deadlineMs = parseSolicitationInstant(live.responseDeadline);
    const nowMs = parseSolicitationInstant(nowIso);
    if (deadlineMs !== null && nowMs !== null && deadlineMs < nowMs) {
      const hrsAgo = Math.floor((nowMs - deadlineMs) / 3_600_000);
      return {
        kind: "CLOSED",
        reason: "the live SAM response deadline has passed",
        evidence: `SAM active=true · live response ${live.responseDeadline} · ${hrsAgo}h ago (instant comparison)`,
      };
    }
    return {
      kind: "OPEN",
      reason: deadlineMs !== null && nowMs !== null
        ? `live SAM response deadline ${live.responseDeadline} is not past`
        : "live SAM record is active (deadline not confidently past — no unambiguous instant to compare)",
    };
  }
  // (5) active unknown + no decisive live signal → indeterminate.
  return { kind: "INDETERMINATE", reason: "the live SAM record did not return a decisive active/deadline status — cannot certify open or closed" };
}
