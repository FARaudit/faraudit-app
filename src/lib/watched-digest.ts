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
}

export interface DigestItem {
  title: string;
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

function section(heading: string, items: DigestItem[]): { html: string; text: string } {
  if (!items.length) return { html: "", text: "" };
  const rows = items.map((i) => {
    const meta = [i.agency, i.solicitationNumber].filter(Boolean).map(esc).join(" · ");
    const due = fmtDate(i.deadline);
    const link = i.auditUrl ? `<a href="${esc(i.auditUrl)}" style="color:#185FA5;text-decoration:none;font-weight:600">Open the audit</a>` : "";
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e6eef7">
      <div style="font:600 14px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0A1628">${esc(i.title)}</div>
      ${meta ? `<div style="font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#5b6b7f">${meta}</div>` : ""}
      ${due ? `<div style="font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#5b6b7f">Responses due ${esc(due)}</div>` : ""}
      ${link}</td></tr>`;
  }).join("");
  const text = items.map((i) => {
    const bits = [i.title, i.agency, i.solicitationNumber].filter(Boolean).join(" · ");
    const due = fmtDate(i.deadline);
    return `  - ${bits}${due ? ` (due ${due})` : ""}${i.auditUrl ? `\n    ${i.auditUrl}` : ""}`;
  }).join("\n");
  return {
    html: `<h2 style="font:700 13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#185FA5;margin:26px 0 6px">${esc(heading)}</h2><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`,
    text: `${heading.toUpperCase()}\n${text}\n`,
  };
}

export interface WatchedDigestEmail { subject: string; html: string; text: string }

/** Digest → the email. Pure; the subject NAMES the week's headline rather than being generic,
 *  because a subject that reads the same every week is the first thing a customer filters. */
export function buildWatchedDigestEmail(d: WatchedDigest, settingsUrl: string): WatchedDigestEmail {
  const counts: string[] = [];
  if (d.posted.length) counts.push(`${d.posted.length} posted`);
  if (d.newlyTracked.length) counts.push(`${d.newlyTracked.length} newly tracked`);
  if (d.closingSoon.length) counts.push(`${d.closingSoon.length} closing soon`);
  const subject = `Your watched opportunities — ${counts.join(", ")}`;

  const secs = [
    section("Posted this week", d.posted),
    section("Newly tracked", d.newlyTracked),
    section("Closing soon", d.closingSoon),
  ];
  const foot = `You are receiving this because the weekly digest is switched on in your notification preferences. Turn it off at ${settingsUrl}`;
  const html = `<div style="background:#f4f7fb;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6eef7;border-radius:10px;padding:24px">
    <div style="font:700 18px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0A1628">Your watched opportunities</div>
    <div style="font:13px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#5b6b7f;margin-top:4px">The last ${d.windowDays} days${d.stillWatching ? ` · ${d.stillWatching} still being watched` : ""}</div>
    ${secs.map((s) => s.html).join("")}
    <div style="font:11px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#8a97a8;margin-top:28px;border-top:1px solid #e6eef7;padding-top:12px">${esc(foot)}</div>
  </div></div>`;
  const text = `YOUR WATCHED OPPORTUNITIES\nThe last ${d.windowDays} days${d.stillWatching ? ` · ${d.stillWatching} still being watched` : ""}\n\n${secs.map((s) => s.text).filter(Boolean).join("\n")}\n${foot}\n`;
  return { subject, html, text };
}
