// WEEKLY DIGEST OF WATCHED OPPORTUNITIES — the send the Notifications toggle has been
// saving a choice for.
//
// Everything here is PURE: rows in, a payload or null out. The cron route owns the
// database and Resend; this file owns the one decision that can hurt a customer —
// whether there is anything worth an email at all.
//
// THREE OUTCOMES, NOT TWO. A week with nothing in it and a week we could not read are
// different answers and must not produce the same email:
//   · `send`    — real activity, render it
//   · `skip`    — read fine, genuinely nothing happened; send NOTHING
//   · (errors)  — the caller could not read the rows; it must not call this at all
// An empty digest that says "no activity this week" is indistinguishable from a broken
// pipeline, and it trains a customer to ignore the one that matters (Rule 61).

/** The subset of `watched_notices` this reads. Names match the table. */
export interface WatchedRow {
  id?: string | null;
  audit_id?: string | null;
  title?: string | null;
  agency?: string | null;
  solicitation_number?: string | null;
  notice_type?: string | null;
  /** watching · posted · processing · audited · failed — the values watcher-tick writes. */
  status?: string | null;
  response_deadline?: string | null;
  last_checked_at?: string | null;
  created_at?: string | null;
  /** Supplied by the caller, never derived here — see DigestItem.verdict. */
  verdict?: string | null;
}

export interface DigestItem {
  title: string;
  /** GO | CAUTION | DECLINE | NEEDS_HUMAN_REVIEW — derived by the caller from the SAME
   *  poleToRecommendation the watched-notices page uses, so the email and the screen can
   *  never disagree about one notice. Absent when the row has no completed audit. */
  verdict?: string | null;
  agency: string | null;
  solicitationNumber: string | null;
  deadline: string | null;
  auditUrl: string | null;
}

export interface WatchedDigest {
  posted: DigestItem[];
  newlyTracked: DigestItem[];
  closingSoon: DigestItem[];
  stillWatching: number;
  windowDays: number;
}

const parse = (v: unknown): number => {
  const t = Date.parse(String(v ?? ""));
  return Number.isNaN(t) ? NaN : t;
};

const item = (r: WatchedRow, appBaseUrl: string): DigestItem => ({
  title: String(r.title ?? "").trim() || "Untitled notice",
  agency: r.agency ? String(r.agency) : null,
  solicitationNumber: r.solicitation_number ? String(r.solicitation_number) : null,
  deadline: r.response_deadline ? String(r.response_deadline) : null,
  auditUrl: r.audit_id ? `${appBaseUrl.replace(/\/$/, "")}/audit/${r.audit_id}` : null,
  verdict: r.verdict ?? null,
});

export interface BuildDigestOptions {
  nowIso: string;
  appBaseUrl: string;
  /** Look-back for "this week". */
  windowDays?: number;
  /** Look-ahead for "closing soon". */
  closingWithinDays?: number;
}

/** Rows → a digest worth sending, or null when the week was genuinely quiet.
 *  Pure. A row with an unparseable date is EXCLUDED from the dated sections rather than
 *  guessed into one — a digest that invents a deadline is worse than one that omits it. */
export function buildWatchedDigest(
  rows: readonly WatchedRow[] | null | undefined,
  opts: BuildDigestOptions,
): WatchedDigest | null {
  const now = parse(opts.nowIso);
  if (Number.isNaN(now)) return null; // no clock, no claims
  const windowDays = opts.windowDays ?? 7;
  const closingWithin = opts.closingWithinDays ?? 14;
  const since = now - windowDays * 86_400_000;
  const closeBy = now + closingWithin * 86_400_000;
  const all = rows ?? [];

  const within = (v: unknown): boolean => {
    const t = parse(v);
    return !Number.isNaN(t) && t >= since && t <= now;
  };

  const posted = all.filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    return (s === "posted" || s === "audited") && within(r.last_checked_at);
  });
  const postedIds = new Set(posted.map((r) => String(r.id ?? "")).filter(Boolean));

  // A notice tracked AND posted in the same week belongs in one section, not two.
  const newlyTracked = all.filter((r) => within(r.created_at) && !postedIds.has(String(r.id ?? "")));

  const closingSoon = all.filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    if (s === "failed") return false;
    const d = parse(r.response_deadline);
    return !Number.isNaN(d) && d > now && d <= closeBy;
  });

  // "Still watching" is CONTEXT, never the reason to send. A digest whose only content is
  // "you are still watching 6 things" is a heartbeat, not news.
  if (!posted.length && !newlyTracked.length && !closingSoon.length) return null;

  const map = (rs: WatchedRow[]) => rs.map((r) => item(r, opts.appBaseUrl));
  return {
    posted: map(posted),
    newlyTracked: map(newlyTracked),
    closingSoon: map(closingSoon),
    stillWatching: all.filter((r) => String(r.status ?? "").toLowerCase() === "watching").length,
    windowDays,
  };
}

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const fmtDate = (iso: string | null): string | null => {
  const t = parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const BRAND = {
  ink: "#0A1628",        // primary navy
  rule: "#185FA5",       // brand blue — rules and anchors
  accent: "#378ADD",     // mid blue — callouts
  pale: "#E6F1FB",       // pale blue — section wash
  line: "#dbe5f0",
  mute: "#5b6b7f",
  page: "#eef3f9",
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Days until a deadline, or null when it is unparseable/past. Drives the urgency chip. */
function daysUntil(iso: string | null, nowIso: string): number | null {
  const d = parse(iso), n = parse(nowIso);
  if (Number.isNaN(d) || Number.isNaN(n) || d <= n) return null;
  return Math.ceil((d - n) / 86_400_000);
}

/** THE VERDICT IS THE PRODUCT, so it gets the strongest position in the row. Colour is
 *  earned, never decorative: green only for a clean GO, amber for caution, red for a
 *  decline, and GREY for needs-human-review — an honest "we could not settle this" must
 *  never wear the same colour as an answer. An unknown or absent verdict renders NOTHING
 *  rather than a neutral chip, because an empty badge reads as a verdict of its own. */
function verdictBadge(v: string | null | undefined): string {
  const k = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, { label: string; fg: string; bg: string; br: string }> = {
    GO:                  { label: "GO",       fg: "#047857", bg: "#ecfdf5", br: "#a7f3d0" },
    BID:                 { label: "GO",       fg: "#047857", bg: "#ecfdf5", br: "#a7f3d0" },
    BID_WITH_CAUTION:    { label: "CAUTION",  fg: "#b45309", bg: "#fffbeb", br: "#fde68a" },
    CAUTION:             { label: "CAUTION",  fg: "#b45309", bg: "#fffbeb", br: "#fde68a" },
    NO_BID:              { label: "DECLINE",  fg: "#b91c1c", bg: "#fef2f2", br: "#fecaca" },
    DECLINE:             { label: "DECLINE",  fg: "#b91c1c", bg: "#fef2f2", br: "#fecaca" },
    INELIGIBLE:          { label: "DECLINE",  fg: "#b91c1c", bg: "#fef2f2", br: "#fecaca" },
    NEEDS_HUMAN_REVIEW:  { label: "REVIEW",   fg: "#475569", bg: "#f1f5f9", br: "#cbd5e1" },
    INCOMPLETE:          { label: "REVIEW",   fg: "#475569", bg: "#f1f5f9", br: "#cbd5e1" },
  };
  const m = map[k];
  if (!m) return "";
  return `<span style="display:inline-block;font:700 10px/1 ${SANS};letter-spacing:.08em;padding:5px 9px;border-radius:5px;color:${m.fg};background:${m.bg};border:1px solid ${m.br}">${m.label}</span>`;
}

/** ONE ROW. A table, not a div: Outlook ignores flex and margin collapses differently in
 *  every client, so the layout that survives is the one built from table cells. */
function row(i: DigestItem, nowIso: string): string {
  const meta = [i.agency, i.solicitationNumber].filter(Boolean).map(esc).join(" &middot; ");
  const due = fmtDate(i.deadline);
  const left = daysUntil(i.deadline, nowIso);
  // The urgency chip earns its colour: red is spent only inside a week.
  const chip = left === null ? "" :
    `<span style="display:inline-block;font:600 11px/1 ${SANS};padding:4px 8px;border-radius:99px;` +
    (left <= 7
      ? "color:#b91c1c;background:#fef2f2;border:1px solid #fecaca"
      : `color:${BRAND.rule};background:${BRAND.pale};border:1px solid ${BRAND.line}`) +
    `">${left} day${left === 1 ? "" : "s"} left</span>`;
  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${BRAND.line}">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="font:600 15px/1.35 ${SANS};color:${BRAND.ink};padding-right:10px">${esc(i.title)}</td>
      <td align="right" style="white-space:nowrap;vertical-align:top">${verdictBadge(i.verdict)}${verdictBadge(i.verdict) && chip ? "&nbsp;" : ""}${chip}</td>
    </tr></table>
    ${meta ? `<div style="font:12px/1.6 ${SANS};color:${BRAND.mute};margin-top:3px">${meta}</div>` : ""}
    ${due ? `<div style="font:12px/1.6 ${SANS};color:${BRAND.mute}">Responses due ${esc(due)}</div>` : ""}
    ${i.auditUrl ? `<div style="margin-top:8px"><a href="${esc(i.auditUrl)}" style="font:600 12px/1 ${SANS};color:#fff;background:${BRAND.rule};text-decoration:none;padding:9px 14px;border-radius:6px;display:inline-block">Open the audit</a></div>` : ""}
  </td></tr>`;
}

function section(heading: string, items: DigestItem[], nowIso: string): { html: string; text: string } {
  if (!items.length) return { html: "", text: "" };
  const html = `<tr><td style="padding:26px 34px 0">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font:700 11px/1 ${SANS};letter-spacing:.10em;text-transform:uppercase;color:${BRAND.rule};padding-bottom:2px">${esc(heading)}</td>
        <td align="right" style="font:700 11px/1 ${SANS};color:${BRAND.mute}">${items.length}</td>
      </tr></table>
      <div style="height:2px;background:${BRAND.rule};width:26px;margin:8px 0 2px"></div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${items.map((i) => row(i, nowIso)).join("")}</table>
    </td></tr>`;
  const text = `${heading.toUpperCase()} (${items.length})\n` + items.map((i) => {
    const bits = [i.title, i.agency, i.solicitationNumber].filter(Boolean).join(" \u00b7 ");
    const due = fmtDate(i.deadline);
    const v = i.verdict ? `[${String(i.verdict).toUpperCase().replace(/_/g, " ")}] ` : "";
    return `  - ${v}${bits}${due ? ` (due ${due})` : ""}${i.auditUrl ? `\n    ${i.auditUrl}` : ""}`;
  }).join("\n") + "\n";
  return { html, text };
}

export interface WatchedDigestEmail { subject: string; html: string; text: string }

/** Digest → the email. Pure. The subject NAMES the week's headline rather than being
 *  generic, because a subject that reads the same every week is the first thing filtered. */
export function buildWatchedDigestEmail(d: WatchedDigest, settingsUrl: string, nowIso?: string): WatchedDigestEmail {
  const now = nowIso ?? new Date(0).toISOString();
  const counts: string[] = [];
  if (d.posted.length) counts.push(`${d.posted.length} posted`);
  if (d.newlyTracked.length) counts.push(`${d.newlyTracked.length} newly tracked`);
  if (d.closingSoon.length) counts.push(`${d.closingSoon.length} closing soon`);

  // THE SUBJECT LEADS WITH THE ACTION, not the newsletter name. "Posted" is the event a
  // customer is waiting for, so it goes first when it happened at all; otherwise the
  // nearest deadline is the reason to open. A subject identical every week gets filtered.
  const soonest = d.closingSoon
    .map((i) => daysUntil(i.deadline, now)).filter((n): n is number => n !== null).sort((a, b) => a - b)[0];
  const subject = d.posted.length
    ? `${d.posted.length} watched ${d.posted.length === 1 ? "notice has" : "notices have"} posted — audit ready`
    : soonest !== undefined
      ? `${d.closingSoon.length} closing soon — the first in ${soonest} day${soonest === 1 ? "" : "s"}`
      : `Your watched opportunities — ${counts.join(", ")}`;

  const stat = (n: number, label: string, tone: string) => `<td width="33%" align="center" style="padding:14px 6px">
      <div style="font:700 26px/1 ${SANS};color:${tone}">${n}</div>
      <div style="font:600 10px/1.3 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.mute};margin-top:5px">${label}</div></td>`;

  const secs = [
    section("Posted this week", d.posted, now),
    section("Newly tracked", d.newlyTracked, now),
    section("Closing soon", d.closingSoon, now),
  ];
  const foot = `You receive this because the weekly digest is on in your notification preferences.`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(counts.join(" \u00b7 "))} across the notices you are watching.</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.page};padding:28px 12px">
<tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden">

    <tr><td style="background:${BRAND.ink};padding:20px 34px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font:700 17px/1 ${SANS};color:#fff;letter-spacing:-.01em">FAR<span style="color:${BRAND.accent}">audit</span></td>
        <td align="right" style="font:600 10px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${BRAND.pale}">Weekly digest</td>
      </tr></table></td></tr>

    <tr><td style="padding:26px 34px 4px">
      <div style="font:700 22px/1.25 ${SANS};color:${BRAND.ink};letter-spacing:-.01em">Your watched opportunities</div>
      <div style="font:13px/1.6 ${SANS};color:${BRAND.mute};margin-top:5px">The last ${d.windowDays} days${d.stillWatching ? ` &middot; ${d.stillWatching} still being watched` : ""}</div>
    </td></tr>

    <tr><td style="padding:16px 28px 0">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.pale};border:1px solid ${BRAND.line};border-radius:10px"><tr>
        ${stat(d.posted.length, "Posted", BRAND.ink)}
        ${stat(d.newlyTracked.length, "Newly tracked", BRAND.ink)}
        ${stat(d.closingSoon.length, "Closing soon", d.closingSoon.length ? "#b45309" : BRAND.ink)}
      </tr></table></td></tr>

    ${secs.map((s) => s.html).join("")}

    <tr><td align="center" style="padding:26px 34px 4px">
      <a href="${esc(settingsUrl.replace(/\/settings$/, "/pipeline"))}" style="font:600 13px/1 ${SANS};color:#fff;background:${BRAND.ink};text-decoration:none;padding:13px 22px;border-radius:8px;display:inline-block">See everything you are watching</a>
    </td></tr>

    <tr><td style="padding:22px 34px 28px">
      <div style="border-top:1px solid ${BRAND.line};padding-top:14px;font:11px/1.7 ${SANS};color:#8a97a8">
        ${esc(foot)}<br><a href="${esc(settingsUrl)}" style="color:${BRAND.rule};text-decoration:none;font-weight:600">Manage notifications</a>
      </div></td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = `YOUR WATCHED OPPORTUNITIES\nThe last ${d.windowDays} days${d.stillWatching ? ` \u00b7 ${d.stillWatching} still being watched` : ""}\n\n${d.posted.length} posted \u00b7 ${d.newlyTracked.length} newly tracked \u00b7 ${d.closingSoon.length} closing soon\n\n${secs.map((s) => s.text).filter(Boolean).join("\n")}\n${foot}\n${settingsUrl}\n`;
  return { subject, html, text };
}
