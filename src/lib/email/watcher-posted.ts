// Watcher Phase 2 transactional email — "Your tracked RFP just posted".
//
// Triggered when sam-ingest detects a watched_notices row's resourceLinks
// transitioning []→[url] and the auto-audit completes. The HTML is rendered
// inline (no react-email) to keep the binding tight to the design mock at
// ceo/redesign-final/review/Watcher Email (mock).html — every visible value
// flows from the WatcherPostedEmailInput contract.

import type { PdfSource } from "@/lib/audit-engine";

export interface WatcherPostedEmailInput {
  // Audience
  toEmail: string;

  // Solicitation identity
  title: string;
  solicitationNumber: string | null;
  agency: string | null;
  naics: string | null;
  priorNoticeType: string | null; // e.g. "Presolicitation" → "RFP · was Pre-Solicitation"
  noticeType: string | null;       // e.g. "Solicitation"   → leading word for badge

  // Verdict
  score: number | null;
  recommendation: string | null; // GO | CAUTION | DECLINE (case-insensitive)
  // Defense-in-depth: the row honest-failed (INCOMPLETE/NEEDS_HUMAN_REVIEW) or could not
  // confirm the full document set. When true the email renders amber regardless of
  // recommendation — a watched RFP we couldn't fully judge is NEVER a green opportunity.
  incomplete?: boolean;
  complianceFlagsCount: number;
  risksFlagsCount: number;

  // Deadlines
  responseDeadline: string | null; // ISO
  questionsDueDate?: string | null; // ISO

  // Audit metadata
  auditUrl: string;        // /audit/<id> (absolute)
  watchingUrl: string;     // /watching   (absolute)
  settingsUrl: string;     // /settings   (absolute)
  unsubscribeUrl: string;  // /settings#alerts or one-click route (absolute)

  // Origin (when the notice posted — relative phrasing)
  postedAt: string | null; // ISO
  pdfSource?: PdfSource;
}

export interface WatcherPostedEmailOutput {
  subject: string;
  html: string;
  text: string;
}

const COLOR_GO = { bg: "#ecfdf5", border: "#a7f3d0", ink: "#047857" };
const COLOR_CAUTION = { bg: "#fffbeb", border: "#fde68a", ink: "#b45309" };
const COLOR_DECLINE = { bg: "#fef2f2", border: "#fecaca", ink: "#b91c1c" };

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function daysBetween(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function minutesAgo(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "just now";
  const min = Math.max(1, Math.round((Date.now() - t) / 60_000));
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function verdictPalette(rec: string | null, score: number | null) {
  const r = String(rec || "").toUpperCase();
  // Match BOTH vocabularies that can reach this column: the email's original
  // GO/CAUTION/DECLINE mock AND the agentic-V3 engine's PROCEED /
  // PROCEED_WITH_CAUTION / DECLINE (plus the raw verdict poles). The lethal bug
  // this guards: PROCEED_WITH_CAUTION — the bucket honest-fail (INCOMPLETE /
  // NEEDS_HUMAN_REVIEW) maps to — used to miss `=== "CAUTION"` and, with a null
  // agentic score, fall through to the green "Strong fit" tile. So we substring-
  // match CAUTION, name the honest-fail poles explicitly, and DEFAULT TO CAUTION
  // for any unrecognized/blank verdict — never green. Display word is normalized
  // to the mock's GO/CAUTION/DECLINE so "PROCEED_WITH_CAUTION" never renders raw.
  if (r === "DECLINE" || r === "NO_BID" || r === "INELIGIBLE" || (score != null && score < 50))
    return { palette: COLOR_DECLINE, word: "DECLINE", caption: "Hard pass" };
  // Caution / honest-fail poles ALWAYS amber — a recognized caution verdict DOMINATES the
  // numeric score, so a borderline-high V1 score can never paint a caution verdict green
  // (code-review F1). Checked BEFORE the score>=80 green branch on purpose.
  if (r.includes("CAUTION") || r === "NEEDS_HUMAN_REVIEW" || r === "INCOMPLETE")
    return { palette: COLOR_CAUTION, word: "CAUTION", caption: "Workable" };
  if (r === "PROCEED" || r === "GO" || r === "BID" || (score != null && score >= 80))
    return { palette: COLOR_GO, word: "GO", caption: "Strong fit" };
  // Everything else — mid-band scores or an unrecognized/blank string — fails SAFE to
  // amber. A watched RFP the engine could not confidently judge is "Workable",
  // never a false green opportunity.
  return { palette: COLOR_CAUTION, word: "CAUTION", caption: "Workable" };
}

function priorTypeLabel(prior: string | null, current: string | null): string {
  if (prior && prior.trim() && prior.trim().toLowerCase() !== (current || "").toLowerCase()) {
    return `${(current || "Solicitation").toUpperCase()} · was ${prior}`;
  }
  return (current || "RFP").toUpperCase();
}

export function buildWatcherPostedEmail(input: WatcherPostedEmailInput): WatcherPostedEmailOutput {
  // An honest-fail / unconfirmed-documents row is forced to amber BEFORE the palette can
  // read recommendation+score — so even a PROCEED row over an incomplete read can't go green.
  const v = input.incomplete
    ? { palette: COLOR_CAUTION, word: "CAUTION", caption: "Audit incomplete — verify" }
    : verdictPalette(input.recommendation, input.score);
  const typeBadge = priorTypeLabel(input.priorNoticeType, input.noticeType);
  const daysDue = daysBetween(input.responseDeadline);
  const dueDateStr = fmtDate(input.responseDeadline);
  const qDateStr = fmtDate(input.questionsDueDate);
  const posted = minutesAgo(input.postedAt);
  const totalTraps = input.complianceFlagsCount + input.risksFlagsCount;

  const subject = `📄 Your tracked RFP just posted — ${input.title} (audit ready)`;

  const titleSafe = esc(input.title);
  const idLine = [
    input.solicitationNumber ? `<span style="color:#185FA5;font-weight:600">${esc(input.solicitationNumber)}</span>` : null,
    input.agency ? esc(input.agency) : null,
    input.naics ? `NAICS ${esc(input.naics)}` : null
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const quoteLine = daysDue != null && dueDateStr
    ? `<div class="cv"><span class="big">${daysDue}</span> days</div><div class="csub">${esc(dueDateStr)}${qDateStr ? ` · questions close ${esc(qDateStr)}` : ""}</div>`
    : `<div class="cv">Quote window TBD</div><div class="csub">Check the audit for full timing</div>`;

  const trapsLine = totalTraps > 0
    ? `<b>We flagged ${input.risksFlagsCount} risk${input.risksFlagsCount === 1 ? "" : "s"} and ${input.complianceFlagsCount} compliance clause${input.complianceFlagsCount === 1 ? "" : "s"}</b> in the full document — the details are in your audit.`
    : `Your full scored audit is ready — review the verdict and KO-ready follow-up inside.`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(subject)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:0;background:#e8edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Manrope,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{padding:24px 14px;max-width:640px;margin:0 auto}
.email{background:#fff;border:1px solid #dbe2ea;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px -28px rgba(15,23,42,.35)}
.eh{background:linear-gradient(155deg,#0A1628,#142545 75%,#185FA5);padding:22px 28px;color:#fff}
.eh .row{display:flex;align-items:center;gap:11px}
.eh .logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#378ADD,#185FA5);color:#fff;display:inline-grid;place-items:center;font-weight:800;font-size:13px}
.eh .wm{font-size:16px;font-weight:800;letter-spacing:-.02em;color:#fff}
.eh .wm .au{color:#69a9e8}
.eh .tag{margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.ebody{padding:30px 28px 8px}
.ekick{font-family:monospace;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#185FA5;margin:0 0 12px}
.ekick .pulse{display:inline-block;width:7px;height:7px;border-radius:50%;background:#d97706;margin-right:8px;vertical-align:middle}
h1.eh1{font-size:24px;font-weight:800;letter-spacing:-.02em;color:#0A1628;line-height:1.2;margin:0 0 12px}
h1.eh1 em{font-style:normal;color:#185FA5}
.elede{font-size:14px;line-height:1.6;color:#334155;margin:0 0 22px}
.elede b{color:#0A1628}
.opp{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:20px}
.opp-top{padding:16px 18px;background:#fafcfe;border-bottom:1px solid #eef2f6}
.opp-type{display:inline-block;font-family:monospace;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#185FA5;background:#E6F1FB;border:1px solid #B5D4F4;border-radius:6px;padding:3px 8px;margin-bottom:9px}
.opp-title{font-size:16px;font-weight:800;letter-spacing:-.01em;color:#0A1628;line-height:1.25;margin:0 0 7px}
.opp-meta{font-family:monospace;font-size:11px;color:#64748b;margin:0}
.opp-grid{display:table;width:100%;border-collapse:collapse}
.opp-cell{display:table-cell;padding:15px 18px;background:#fff;border-right:1px solid #eef2f6;width:50%;vertical-align:middle}
.opp-cell:last-child{border-right:0}
.vtile{display:inline-block}
.vtile .vn{display:inline-block;font-family:monospace;font-size:30px;font-weight:600;letter-spacing:-.02em;color:${v.palette.ink};line-height:1;vertical-align:middle;margin-right:11px}
.vtile .vw{display:block;font-size:13px;font-weight:800;color:${v.palette.ink};line-height:1}
.vtile .vc{display:block;font-family:monospace;font-size:9.5px;color:#64748b;margin-top:2px}
.vbox{background:${v.palette.bg};border:1px solid ${v.palette.border};padding:10px 12px;border-radius:11px;display:inline-block}
.ck{font-family:monospace;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.cv{font-size:15px;font-weight:700;color:#0A1628}
.cv .big{font-family:monospace;font-size:22px;font-weight:600;color:#b45309;margin-right:5px}
.csub{font-family:monospace;font-size:10.5px;color:#94a3b8;margin-top:3px}
.catch{display:block;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:22px;font-size:12.5px;line-height:1.5;color:#334155}
.catch b{color:#92400e}
.cta-wrap{text-align:center;margin-bottom:8px}
.ecta{display:inline-block;height:48px;line-height:48px;padding:0 30px;border-radius:11px;background:linear-gradient(180deg,#378ADD,#185FA5);color:#fff;font-size:14.5px;font-weight:800;text-decoration:none;box-shadow:0 12px 24px -10px rgba(55,138,221,.7)}
.ecta2{display:block;text-align:center;margin-top:13px;font-size:12.5px;font-weight:700;color:#64748b;text-decoration:none}
.efoot{margin-top:24px;padding:18px 28px 26px;border-top:1px solid #eef2f6;background:#fafcfe}
.efoot p{margin:0 0 8px;font-size:11.5px;line-height:1.55;color:#94a3b8}
.efoot a{color:#64748b;text-decoration:underline}
.efoot .why{font-size:12px;color:#475569}
.efoot .why b{color:#334155}
</style>
</head>
<body>
<div class="wrap">
  <div class="email">
    <div class="eh">
      <div class="row">
        <span class="logo">F</span>
        <span class="wm">FAR<span class="au">audit</span></span>
        <span class="tag">Watching alert</span>
      </div>
    </div>
    <div class="ebody">
      <p class="ekick"><span class="pulse"></span>It posted</p>
      <h1 class="eh1">The solicitation you were watching <em>just dropped</em> — and we already audited it.</h1>
      <p class="elede">You asked us to track this notice. The full solicitation released <b>${esc(posted)}</b>. FARaudit pulled it, ran the complete scored audit, and it's waiting for you.</p>
      <div class="opp">
        <div class="opp-top">
          <span class="opp-type">${esc(typeBadge)}</span>
          <h2 class="opp-title">${titleSafe}</h2>
          <p class="opp-meta">${idLine}</p>
        </div>
        <div class="opp-grid">
          <div class="opp-cell">
            <div class="vbox">
              <div class="vtile">
                ${input.score != null ? `<span class="vn">${input.score}</span>` : ""}
                <span class="vw">${esc(v.word)}</span>
                <span class="vc">${esc(v.caption)}</span>
              </div>
            </div>
          </div>
          <div class="opp-cell">
            <div class="ck">Quote due</div>
            ${quoteLine}
          </div>
        </div>
      </div>
      <div class="catch">${trapsLine}</div>
      <div class="cta-wrap">
        <a class="ecta" href="${esc(input.auditUrl)}">View your full audit &rarr;</a>
        <a class="ecta2" href="${esc(input.watchingUrl)}">Manage what you're watching →</a>
      </div>
    </div>
    <div class="efoot">
      <p class="why">You're getting this because you hit <b>Track</b> on this notice in FARaudit. It's now also in your Past Audits.</p>
      <p>FARaudit · Federal acquisition intelligence · <a href="${esc(input.watchingUrl)}">Watched opportunities</a> · <a href="${esc(input.settingsUrl)}">Notification settings</a> · <a href="${esc(input.unsubscribeUrl)}">Unsubscribe from watch alerts</a></p>
      <p>Vertex Intelligence Holdings · 1111B S Governors Ave #99083, Dover, DE 19904</p>
    </div>
  </div>
</div>
</body>
</html>`;

  const text = [
    `Your tracked RFP just posted — ${input.title}`,
    "",
    `Posted ${posted}.`,
    `${typeBadge}`,
    input.solicitationNumber ? `Solicitation: ${input.solicitationNumber}` : null,
    input.agency ? `Agency: ${input.agency}` : null,
    input.naics ? `NAICS: ${input.naics}` : null,
    "",
    input.score != null ? `Verdict: ${v.word} · score ${input.score}` : `Verdict: ${v.word}`,
    daysDue != null ? `Quote due in ${daysDue} days (${dueDateStr})` : null,
    qDateStr ? `Questions close ${qDateStr}` : null,
    "",
    totalTraps > 0
      ? `Flagged ${input.risksFlagsCount} risks and ${input.complianceFlagsCount} compliance clauses in the full document.`
      : `Your full scored audit is ready.`,
    "",
    `View your full audit: ${input.auditUrl}`,
    `Manage what you're watching: ${input.watchingUrl}`,
    "",
    `You're getting this because you hit Track on this notice in FARaudit.`,
    `Settings: ${input.settingsUrl}`,
    `Unsubscribe from watch alerts: ${input.unsubscribeUrl}`,
    `Vertex Intelligence Holdings · 1111B S Governors Ave #99083, Dover, DE 19904`
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

export async function sendWatcherPostedEmail(input: WatcherPostedEmailInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const { subject, html, text } = buildWatcherPostedEmail(input);
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const res = await resend.emails.send({
      from: "FARaudit Watching <alerts@faraudit.com>",
      to: input.toEmail,
      subject,
      html,
      text
    });
    if ((res as { error?: unknown }).error) {
      const err = (res as { error: { message?: string } }).error;
      return { ok: false, error: err?.message || "resend error" };
    }
    const id = (res as { data?: { id?: string } }).data?.id;
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown send error" };
  }
}
