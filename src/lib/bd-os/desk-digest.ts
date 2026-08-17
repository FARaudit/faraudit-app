import { groupOfficers } from "@/lib/bd-os/ko-directory";
import { inferLevel } from "@/lib/bd-os/cmmc-levels";
import type { OpportunityRow } from "@/lib/bd-os/queries";
import type { RegRow } from "@/lib/federal-register";
import type { SpendingResult } from "@/lib/bd-os/defense-spending";

/* THE ONE CROSS-DESK QUERY. Today's two biggest panels — the Priority Action
 * Feed and the Signals grid — were built, styled and left unfed, each shipping a
 * sentence admitting it. They were treated as two problems; they are one. Both
 * ask each desk the same pair of questions: what is your headline, and what is
 * the worst deadline you own. This module answers that once, so the panels can
 * never state different things about the same desk.
 *
 * IT IS PURE. Every input is already-fetched data, so the ranking is testable
 * without a request context and without spending a single upstream call. The
 * route does the reading; this does the shaping.
 *
 * WHAT IT WILL NOT DO. A desk with no query behind it returns `not-sourced` and
 * NAMES what is missing. It does not borrow a number from a neighbouring desk,
 * and it does not turn a failed read into a zero — the two states the panels
 * must be able to tell apart are exactly the two this file keeps apart. */

export type DeskKey = "opp" | "pipe" | "co" | "cmmc" | "far" | "gao" | "team" | "spend" | "wage" | "news";

/** Every desk on Today, in the order the Feed considers them. The Signals grid
 *  renders its own subset; both read from this one list. */
export const DESK_KEYS: DeskKey[] = ["opp", "pipe", "co", "cmmc", "far", "spend", "news", "gao", "team", "wage"];

export type DeskStatus =
  /** The headline is a measurement taken from data this desk actually read. */
  | "ok"
  /** The desk's source ANSWERED and holds nothing. A real zero. */
  | "empty"
  /** The desk's source failed. Not a zero — nothing was measured. */
  | "unavailable"
  /** No query exists for this desk yet. `reason` names what is missing. */
  | "not-sourced";

/** Urgency bands. Same thresholds the Week Ahead calendar already uses for a
 *  government date, so one deadline cannot read as critical in one panel and
 *  routine in the other. */
export type Urgency = "crit" | "warn" | "ok";

export interface DeskSummary {
  desk: DeskKey;
  status: DeskStatus;
  /** The single most urgent item on this desk. null unless status is "ok". */
  title: string | null;
  /** Why THIS item is the one surfaced — never a restatement of the title. */
  why: string | null;
  /** The desk's own count, already formatted ("12 live notices"). null when
   *  there is nothing to state. */
  value: string | null;
  /** The same count as a bare number, for the feed's narrow value column — a
   *  formatted phrase there pushes the card body out of shape. null whenever
   *  `value` is null, so the two can never disagree about whether one exists. */
  count: number | null;
  /** Whole days until the soonest FUTURE deadline this desk owns. null = the
   *  desk has no dated obligation, which is different from a deadline of 0. */
  days: number | null;
  urg: Urgency;
  /** Present iff status !== "ok". The words the panel shows instead of a number. */
  reason: string | null;
}

export interface DeskDigestInput {
  /** Live SAM rows, deduped by the caller. null = the SAM read FAILED. */
  opportunities: OpportunityRow[] | null;
  /** The customer's audits carrying `compliance_json`. null = the read FAILED.
   *  Rows WITHOUT compliance_json cannot answer the CMMC question either way and
   *  are counted as unanalyzed rather than as "not required". */
  cmmcAudits: Array<Record<string, unknown>> | null;
  /** Federal Register rows. null = the read FAILED. */
  regRules: RegRow[] | null;
  /** The customer's own pipeline rows. null = the read FAILED. */
  pipeline: Array<Record<string, unknown>> | null;
  /** Defence-news headlines, UNJUDGED. null = the read FAILED. Optional so an
   *  existing caller that does not supply news gets a "did not answer" row rather
   *  than a silently absent desk. */
  news?: NewsRow[] | null;
  /** Defense-spending payload or one of its stated non-payload states.
   *  null = the read THREW. */
  spending: SpendingResult | null;
}

const DAY_MS = 86400000;

/** Whole days from `now` to an ISO date, or null when the date is absent,
 *  unparseable or already past. A past deadline is not an obligation. */
export function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (isNaN(ms) || ms < now) return null;
  return Math.max(0, Math.ceil((ms - now) / DAY_MS));
}

export function urgencyOf(days: number | null): Urgency {
  if (days === null) return "ok";
  // NEGATIVE IS OVERDUE, and overdue is the most urgent thing a desk can hold —
  // it is already too late, which no amount of "plan ahead" covers.
  if (days <= 3) return "crit";
  if (days <= 7) return "warn";
  return "ok";
}

/** Signed days to a date: positive ahead, NEGATIVE once it has passed. Distinct
 *  from `daysUntil`, which drops past dates because a closed solicitation is not
 *  an obligation. A pursuit the customer OWNS is the opposite case — its date
 *  passing is the most important thing about it, so it must survive as a
 *  negative rather than vanish. */
export function daysSigned(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return null;
  return Math.ceil((ms - now) / DAY_MS);
}

/** SAM titles arrive shouted and prefixed. Trimmed for a one-line card without
 *  altering meaning; an empty result is null so the caller can fall back to an
 *  identifier rather than print an empty card. */
export function cleanTitle(t: string | null | undefined, max = 72): string | null {
  if (!t) return null;
  let s = String(t).replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

function blank(desk: DeskKey, status: DeskStatus, reason: string): DeskSummary {
  return { desk, status, title: null, why: null, value: null, count: null, days: null, urg: "ok", reason };
}

function counted(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ── opp · Notices ────────────────────────────────────────────────────────────
 * The desk's headline is the live notice closing soonest, because that is the
 * one whose window shuts first. A feed that did not answer is unavailable, never
 * an empty desk: every count below derives from the same array. */
function deskOpp(rows: OpportunityRow[] | null, now: number): DeskSummary {
  if (rows === null) return blank("opp", "unavailable", "The SAM.gov feed did not answer.");
  if (rows.length === 0) {
    return blank("opp", "empty", "No live notices match your NAICS in the current window.");
  }
  let best: OpportunityRow | null = null;
  let bestDays: number | null = null;
  for (const o of rows) {
    const d = daysUntil(o.response_deadline, now);
    if (d === null) continue;
    if (bestDays === null || d < bestDays) { best = o; bestDays = d; }
  }
  const value = counted(rows.length, "live notice");
  const count = rows.length;
  if (!best) {
    // The feed answered and none of its rows carries a future deadline. That is
    // a fact about the rows, not a failure, and it is said rather than ranked.
    return {
      desk: "opp", status: "ok",
      title: `${rows.length} live notice${rows.length === 1 ? "" : "s"} match your NAICS`,
      why: "None carries a response deadline in the future.",
      value, count, days: null, urg: "ok", reason: null
    };
  }
  return {
    desk: "opp", status: "ok",
    title: cleanTitle(best.title) || best.solicitation_number || best.notice_id,
    why: `Closes first of your ${rows.length} live notice${rows.length === 1 ? "" : "s"}`
       + (best.agency ? ` · ${best.agency}` : ""),
    value, count, days: bestDays, urg: urgencyOf(bestDays), reason: null
  };
}

/* ── co · Contracting Officers ────────────────────────────────────────────────
 * A REGROUPING of the same notices, introducing no facts — the officer surfaced
 * is the one whose own soonest notice closes first, so the card is a deadline
 * about a person the customer can actually write to. */
function deskCo(rows: OpportunityRow[] | null, now: number): DeskSummary {
  if (rows === null) return blank("co", "unavailable", "The SAM.gov feed did not answer, so no contacts could be read.");
  const { officers } = groupOfficers(rows);
  if (officers.length === 0) {
    return blank("co", "empty", "No notice in your window published a contact address.");
  }
  let best = officers[0];
  let bestDays: number | null = null;
  for (const o of officers) {
    for (const n of o.notices) {
      const d = daysUntil(n.response_deadline, now);
      if (d === null) continue;
      if (bestDays === null || d < bestDays) { best = o; bestDays = d; }
    }
  }
  return {
    desk: "co", status: "ok",
    title: best.name,
    why: `${counted(best.noticeCount, "open notice")}`
       + (best.office ? ` · ${best.office}` : best.agency ? ` · ${best.agency}` : ""),
    value: counted(officers.length, "officer"), count: officers.length,
    days: bestDays, urg: urgencyOf(bestDays), reason: null
  };
}

/* ── cmmc · CMMC Readiness ────────────────────────────────────────────────────
 * A REQUIREMENT view, never a posture view — the product holds no
 * self-assessment. One row per solicitation, most recent audit kept, matching
 * the desk's own route so the two cannot disagree on the count.
 *
 * A requirement on a CLOSED solicitation is history, not a task, so the ranked
 * item is the soonest-closing OPEN one; the count still reports every flagged
 * solicitation, because that is what the desk holds. */
function deskCmmc(auditRows: Array<Record<string, unknown>> | null, now: number): DeskSummary {
  if (auditRows === null) return blank("cmmc", "unavailable", "Your audits could not be read.");
  if (auditRows.length === 0) {
    return blank("cmmc", "empty", "You have not audited a solicitation yet, so nothing states a CMMC level.");
  }
  const newestFirst = [...auditRows].sort((x, y) =>
    Date.parse(String(y.created_at ?? 0)) - Date.parse(String(x.created_at ?? 0)));
  const seen = new Set<string>();
  const flagged: Array<{ row: Record<string, unknown>; level: string; trigger: string | null; days: number | null }> = [];
  let unanalyzed = 0;
  for (const a of newestFirst) {
    const key = String(a.solicitation_number ?? "").trim()
      || String(a.notice_id ?? "").trim()
      || `id:${String(a.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // No compliance_json means the row was never analyzed. It cannot answer the
    // question either way, and counting it as "not required" would turn a gap in
    // the data into an all-clear.
    if (!a.compliance_json) { unanalyzed++; continue; }
    const { level, trigger } = inferLevel(a);
    if (level === "0") continue;
    flagged.push({ row: a, level, trigger, days: daysUntil(a.response_deadline as string | null, now) });
  }
  if (flagged.length === 0) {
    return blank(
      "cmmc",
      "empty",
      unanalyzed > 0
        ? `No audited solicitation requires CMMC · ${unanalyzed} not yet analyzed`
        : "No solicitation you have audited carries a CMMC requirement."
    );
  }
  const open = flagged.filter((f) => f.days !== null).sort((a, b) => (a.days as number) - (b.days as number));
  const pick = open[0] ?? flagged[0];
  const row = pick.row;
  return {
    desk: "cmmc", status: "ok",
    title: cleanTitle(row.title as string | null)
      || (row.solicitation_number as string | null)
      || String(row.id),
    why: `Requires CMMC Level ${pick.level}`
       + (pick.trigger ? ` · matched on ${pick.trigger}` : "")
       + (open.length === 0 ? " · no open deadline" : ""),
    value: counted(flagged.length, "solicitation"), count: flagged.length,
    days: pick.days, urg: urgencyOf(pick.days), reason: null
  };
}

/* ── far · FAR/DFARS ──────────────────────────────────────────────────────────
 * TWO DATES, AND ONLY ONE OF THEM IS ACTIONABLE. A comment window is something a
 * reader can DO something about; an effective date is something they can only be
 * ready for. So the comment deadline ranks first and the effective date is the
 * fallback, and the card always says which kind it is showing.
 *
 * Ranking on the effective date alone made this desk structurally dead. Measured
 * against the live feed 2026-08-13: **0 of 40** documents carried a future
 * effective date, while four carried an open comment window — so the desk could
 * never surface a deadline and fell to its own fallback sentence permanently. It
 * rendered a card, which is why reading the code could not catch it.
 *
 * THE CARD MAY NOT SAY "AMENDS". `affects_clauses` on these rows is built from
 * the title and abstract by a MENTION recognizer, and a mention is not an
 * amendment: one rule in this corpus carries hundreds of citations and changes
 * none of them, and another cites a clause only to say a comparable requirement
 * exists there. The verdict version of that question keys on the amendatory
 * instruction in the rule's FULL TEXT, which these rows do not carry.
 *
 * So the card states what the row supports — which regulation issued it and when
 * it binds — and offers the clause list as REFERENCES. The empty case says
 * nothing at all rather than "amends no section": measured over 40 documents the
 * abstract names a clause on four, so an empty list is overwhelmingly a silent
 * abstract and not a rule that changes nothing. */
function deskFar(rules: RegRow[] | null, now: number): DeskSummary {
  if (rules === null) return blank("far", "unavailable", "The Federal Register did not answer.");
  if (rules.length === 0) {
    return blank("far", "empty", "No FAR or DFARS rulemaking in the current window.");
  }
  const value = counted(rules.length, "rule");
  const count = rules.length;

  // Comment windows first, then effective dates. Within each kind, soonest wins.
  const dated = rules
    .flatMap((r) => [
      { r, days: daysUntil(r.comments_close_on, now), kind: "comment" as const },
      { r, days: daysUntil(r.effective_date, now), kind: "effective" as const },
    ])
    .filter((x) => x.days !== null)
    .sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "comment" ? -1 : 1)
      || (a.days as number) - (b.days as number));

  if (dated.length === 0) {
    return {
      desk: "far", status: "ok",
      title: cleanTitle(rules[0].title) || rules[0].link,
      why: "Most recent rulemaking · no open comment window or future effective date",
      value, count, days: null, urg: "ok", reason: null
    };
  }
  const top = dated[0];
  const clauses = Array.isArray(top.r.affects_clauses) ? top.r.affects_clauses : [];
  const reg = top.r.source === "dfars" ? "DFARS" : "FAR";
  return {
    desk: "far", status: "ok",
    title: cleanTitle(top.r.title) || top.r.link,
    why: `${reg} ${top.kind === "comment" ? "comment window closes" : "rulemaking takes effect"}`
       + (clauses.length > 0
          ? ` · references ${clauses.slice(0, 3).join(", ")}${clauses.length > 3 ? ` +${clauses.length - 3}` : ""}`
          : ""),
    value, count, days: top.days, urg: urgencyOf(top.days), reason: null
  };
}

/* ── spend · Defense Spending ─────────────────────────────────────────────────
 * The desk's dated obligation is a RECOMPETE: a contract in the customer's codes
 * whose period of performance ends, which is the one spending fact that carries
 * a date they can act before. RECOMPETES_MEASURED false means nothing was ever
 * pulled — an empty list under it would be a claim about a quiet market. */
function deskSpend(spending: SpendingResult | null, now: number): DeskSummary {
  if (spending === null) return blank("spend", "unavailable", "Federal spending could not be read.");
  if (spending.state === "no-profile-codes") {
    return blank("spend", "empty", "No NAICS codes on file, so there is nothing to scope spending to.");
  }
  if (spending.state === "no-rows") {
    return blank("spend", "empty", `Spending has not been pulled for ${spending.requested.join(", ")} yet.`);
  }
  if (!spending.RECOMPETES_MEASURED) {
    return blank("spend", "not-sourced", "Recompete windows have never been pulled for your codes.");
  }
  const live = spending.RECOMPETES
    .filter((r) => !r.expired)
    .map((r) => ({ r, days: daysUntil(r.end_date, now) }))
    .filter((x) => x.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number));
  if (live.length === 0) {
    return blank("spend", "empty", "Nothing in your codes expires in the tracked window.");
  }
  const top = live[0];
  /* THE COUNT IS OUR OWN CEILING ON SOME CODES. The worker stops collecting a
     code's recompetes at a fixed limit, so where a code is pinned there the list
     is truncated and the number under it is a loop bound wearing the clothes of
     a measurement. The card says so.

     It says "at least", never "N of M": the rows above the cap were never
     collected, so the true total is not knowable here and inventing one would
     replace our cap with a second made-up number. */
  const capped = Array.isArray(spending.RECOMPETES_AT_CAP) ? spending.RECOMPETES_AT_CAP : [];
  return {
    desk: "spend", status: "ok",
    title: top.r.recipient || top.r.award_id || "Contract expiring",
    why: `Incumbent contract ends${top.r.agency ? ` · ${top.r.agency}` : ""}`
       + (capped.length > 0
          ? ` · list capped in ${counted(capped.length, "code")}, more exist`
          : ""),
    value: (capped.length > 0 ? "at least " : "") + counted(live.length, "recompete"),
    count: live.length,
    days: top.days, urg: urgencyOf(top.days), reason: null
  };
}

/* ── pipe · Pipeline ──────────────────────────────────────────────────────────
 * THE CUSTOMER'S OWN PURSUITS, which is the one desk where the rows are theirs
 * rather than the government's — so an overdue row here is not history, it is a
 * date they missed on work they were doing.
 *
 * That is why this desk ranks on SIGNED days while every other desk drops past
 * dates. A solicitation whose deadline passed is off the market; a pursuit whose
 * date passed is still on their board, and saying nothing about it is the
 * failure. Measured on the live account 2026-08-13: two pursuits, one nine days
 * past its date, and no surface on Today said a word about either.
 *
 * The four values behind this — the funnel, the two closing counts and the top
 * rows — were all computed by the route and thrown away for want of a panel to
 * put them in. The panel already existed; it was the desk that was missing. */
function deskPipe(rows: Array<Record<string, unknown>> | null, now: number): DeskSummary {
  if (rows === null) return blank("pipe", "unavailable", "Your pipeline could not be read.");
  if (rows.length === 0) {
    return blank("pipe", "empty", "You have no active pursuits on your board yet.");
  }
  const dated = rows
    .map((c) => ({ c, days: daysSigned(c.due_date as string | null, now) }))
    .filter((x) => x.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const value = counted(rows.length, "pursuit");
  const count = rows.length;
  const undated = rows.length - dated.length;

  if (dated.length === 0) {
    // Real pursuits, none carrying a date. That is a fact about the board and it
    // is said — a pipeline with no dates cannot be ranked, but it is not empty.
    return {
      desk: "pipe", status: "ok",
      title: cleanTitle(rows[0].title as string | null) || "Untitled pursuit",
      why: `On your board · ${counted(rows.length, "pursuit")} with no date set`,
      value, count, days: null, urg: "ok", reason: null
    };
  }
  const top = dated[0];
  const d = top.days as number;
  const overdue = d < 0;
  return {
    desk: "pipe", status: "ok",
    title: cleanTitle(top.c.title as string | null) || "Untitled pursuit",
    why: (overdue
        ? `Your date passed ${counted(-d, "day")} ago`
        : d === 0 ? "Your date is today" : "Soonest date on your board")
      + (undated > 0 ? ` · ${undated} with no date set` : ""),
    value, count, days: d, urg: urgencyOf(d), reason: null
  };
}

/* ── The three desks with no cross-desk query, each naming its own blocker ─────
 * These are NOT failures and they are not empty desks. Saying which is which is
 * the whole point: a customer who reads "not pulled" knows the desk is fine and
 * the summary is missing, and can still open the desk itself. */
const NOT_SOURCED: Record<"gao" | "team" | "wage", string> = {
  gao: "GAO refuses this request upstream, so no protest summary is computed.",
  team: "Partner search runs against a metered SAM.gov quota and is not summarised here.",
  wage: "Wage determinations carry no per-customer summary yet."
};

/** A defence-news headline for the Signals grid.
 *
 *  DELIBERATELY UNJUDGED. /api/defense-news runs a Sonnet judge over every story to
 *  rank it against this customer's desks; that call is what makes the news PAGE worth
 *  opening, and it is priced for a page you open, not for a dashboard that reloads on
 *  every tab switch. Today must cost nothing to run, so this row takes the newest
 *  story from the RSS feed and says only what it can stand behind: what was published
 *  and when. The ranking lives one click away, on the desk itself.
 *
 *  So `why` claims recency, never relevance. Calling an unranked story "most relevant"
 *  would be the judge's claim made without the judge. */
export interface NewsRow { title: string; publishedAt: string; source?: string | null }

export function deskNews(articles: NewsRow[] | null, now: number): DeskSummary {
  if (articles === null) return blank("news", "unavailable", "The news feed did not answer.");
  if (articles.length === 0) return blank("news", "empty", "No defense reporting in the current window.");

  // Newest by publication date. An unparseable date sorts last rather than winning
  // the slot on a NaN comparison.
  const dated = articles
    .map((a) => ({ a, t: Date.parse(a.publishedAt) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((x, y) => y.t - x.t);

  if (dated.length === 0) {
    return blank("news", "empty", "Defense reporting carries no readable publication date.");
  }

  const top = dated[0];
  const ageDays = Math.max(0, Math.floor((now - top.t) / 86_400_000));
  const when = ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays}d ago`;
  return {
    desk: "news",
    status: "ok",
    title: cleanTitle(top.a.title) || top.a.title,
    why: `Newest defense reporting · published ${when}`,
    // "stories", not the default "storys" — counted() takes the plural explicitly
    // for every noun whose plural is not the singular plus an s.
    value: counted(articles.length, "story", "stories"),
    count: articles.length,
    days: null,
    urg: "ok",
    reason: null
  };
}

export function buildDeskDigest(input: DeskDigestInput, now: number = Date.now()): DeskSummary[] {
  return [
    deskOpp(input.opportunities, now),
    deskPipe(input.pipeline, now),
    deskCo(input.opportunities, now),
    deskCmmc(input.cmmcAudits, now),
    deskFar(input.regRules, now),
    deskSpend(input.spending, now),
    deskNews(input.news ?? null, now),
    blank("gao", "not-sourced", NOT_SOURCED.gao),
    blank("team", "not-sourced", NOT_SOURCED.team),
    blank("wage", "not-sourced", NOT_SOURCED.wage)
  ];
}
