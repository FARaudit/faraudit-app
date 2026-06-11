// FA-116 / Audit Report Transitional States — server renderer.
//
// Renders _states-template.html (whole-block sync of
// ceo/redesign-final/platform/Audit Report States.html) for the two
// non-complete audit statuses: 'processing' → progress state, 'failed' →
// failed state. Exactly ONE state ships per response — the unused
// `.body.only-*` block and its topbar pill are stripped server-side.
//
// Binding doctrine matches _render.ts: surgically rewrite data-field
// elements, hide-not-fabricate (unknown fact cells collapse, the .st-fact
// row reflows), and a final demo-leak guard so template demo values can
// never reach production output. Helpers are duplicated module-private from
// _render.ts on purpose — the two renderers version independently with
// their own templates.

// ─── safe text helpers ──────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ─── tag-balanced range finder (same mechanics as _render.ts) ───────────────

function findMatchingClose(html: string, openStart: number, tagName: string): { contentStart: number; contentEnd: number; closeEnd: number } | null {
  const openEnd = html.indexOf(">", openStart);
  if (openEnd === -1) return null;
  const contentStart = openEnd + 1;
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tagName}\\s*>`, "gi");
  openRe.lastIndex = contentStart;
  closeRe.lastIndex = contentStart;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + 1;
    } else {
      depth--;
      if (depth === 0) {
        return { contentStart, contentEnd: nextClose.index, closeEnd: nextClose.index + nextClose[0].length };
      }
      openRe.lastIndex = nextClose.index + 1;
    }
  }
  return null;
}

interface DataFieldMatch {
  tagName: string;
  openStart: number;
  contentStart: number;
  contentEnd: number;
  closeEnd: number;
}

function findDataField(html: string, key: string, fromIndex = 0): DataFieldMatch | null {
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bdata-field="${key.replace(/[.$]/g, "\\$&")}"[^>]*>`, "g");
  re.lastIndex = fromIndex;
  const m = re.exec(html);
  if (!m) return null;
  const range = findMatchingClose(html, m.index, m[1]);
  if (!range) return null;
  return { tagName: m[1], openStart: m.index, contentStart: range.contentStart, contentEnd: range.contentEnd, closeEnd: range.closeEnd };
}

function replaceFieldInner(html: string, key: string, innerHtml: string): string {
  let out = html;
  let scan = 0;
  while (true) {
    const hit = findDataField(out, key, scan);
    if (!hit) break;
    out = out.slice(0, hit.contentStart) + innerHtml + out.slice(hit.contentEnd);
    scan = hit.contentStart + innerHtml.length;
  }
  return out;
}

function replaceFieldText(html: string, key: string, text: string): string {
  return replaceFieldInner(html, key, escapeHtml(text));
}

function removeFieldElement(html: string, key: string): string {
  let out = html;
  while (true) {
    const hit = findDataField(out, key);
    if (!hit) break;
    out = out.slice(0, hit.openStart) + out.slice(hit.closeEnd);
  }
  return out;
}

function removeElementByOpenRe(html: string, openRe: RegExp, tagName: string): string {
  const m = openRe.exec(html);
  if (!m) return html;
  const range = findMatchingClose(html, m.index, tagName);
  if (!range) return html;
  return html.slice(0, m.index) + html.slice(range.closeEnd);
}

// Collapse an unknown fact: remove the whole enclosing `.st-fact` cell so the
// st-meta row reflows (handoff: "HIDE any fact cell whose value is unknown").
function removeFactCell(html: string, key: string): string {
  let out = html;
  while (true) {
    const hit = findDataField(out, key);
    if (!hit) break;
    const cellIdx = out.lastIndexOf('<div class="st-fact">', hit.openStart);
    if (cellIdx === -1) return removeFieldElement(out, key);
    const range = findMatchingClose(out, cellIdx, "div");
    if (!range || hit.openStart >= range.contentEnd) return removeFieldElement(out, key);
    out = out.slice(0, cellIdx) + out.slice(range.closeEnd);
  }
  return out;
}

// ─── stage rows ──────────────────────────────────────────────────────────────

type StageState = "is-done" | "is-active" | "is-pending" | "is-failed" | "is-skipped";

// Rewrite one `.stage` row: state class, dot content (check svg only when
// done), and status text. Drops the template's demo data-field on the status.
function setStageRow(html: string, stageKey: string, state: StageState, statusText: string): string {
  const openRe = new RegExp(`<div class="stage [^"]*" data-stage="${stageKey}">`);
  const m = openRe.exec(html);
  if (!m) return html;
  const range = findMatchingClose(html, m.index, "div");
  if (!range) return html;
  let inner = html.slice(range.contentStart, range.contentEnd);
  if (state !== "is-done") {
    inner = inner.replace(/<span class="sg-dot">[\s\S]*?<\/span>/, '<span class="sg-dot"></span>');
  }
  inner = inner.replace(/<span class="sg-status"[^>]*>[\s\S]*?<\/span>/, `<span class="sg-status">${escapeHtml(statusText)}</span>`);
  return html.slice(0, m.index) + `<div class="stage ${state}" data-stage="${stageKey}">` + inner + html.slice(range.contentEnd);
}

// ─── demo-leak guard (states edition — same mechanics as _render.ts FA-112) ──

function statesDemoLeakGuard(html: string): string {
  // Unambiguous template-default values from the states design source.
  const DEMO_MARKERS = [
    "FA8118-26-R-0035",
    "8c2f41ab",
    "7e4a9c0b21d34f6e",
    "11:43:07 / 11:44:21",
    "3 queued",
    "DONE · 6S",
    "2 of 2",
  ];
  try {
    let out = html;
    for (const marker of DEMO_MARKERS) {
      let safetyCounter = 0;
      while (safetyCounter < 50) {
        const idx = out.indexOf(marker);
        if (idx < 0) break;
        const before = out.slice(0, idx);
        const fieldTagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\bdata-field="([^"]+)"[^>]*>/g;
        let lastFieldMatch: { tag: string; key: string; idx: number } | null = null;
        let m: RegExpExecArray | null;
        while ((m = fieldTagRe.exec(before)) !== null) {
          lastFieldMatch = { tag: m[1], key: m[2], idx: m.index };
        }
        if (lastFieldMatch) {
          const range = findMatchingClose(out, lastFieldMatch.idx, lastFieldMatch.tag);
          if (range && idx >= range.contentStart && idx < range.contentEnd) {
            out = out.slice(0, range.contentStart) + out.slice(range.contentEnd);
            // eslint-disable-next-line no-console
            console.warn("[DEMO-LEAK][states]", marker, "in data-field=" + lastFieldMatch.key);
            safetyCounter++;
            continue;
          }
        }
        const blockTagRe = /<(div|p|span|section|h[1-6]|b)\b[^>]*>/g;
        let lastBlockMatch: { tag: string; idx: number } | null = null;
        while ((m = blockTagRe.exec(before)) !== null) {
          lastBlockMatch = { tag: m[1], idx: m.index };
        }
        if (lastBlockMatch) {
          const range = findMatchingClose(out, lastBlockMatch.idx, lastBlockMatch.tag);
          if (range && idx >= range.contentStart && idx < range.contentEnd) {
            out = out.slice(0, range.contentStart) + out.slice(range.contentEnd);
            // eslint-disable-next-line no-console
            console.warn("[DEMO-LEAK][states]", marker, "in <" + lastBlockMatch.tag + ">");
            safetyCounter++;
            continue;
          }
        }
        break;
      }
    }
    return out;
  } catch {
    return html;
  }
}

// ─── value formatting ────────────────────────────────────────────────────────

function formatEt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time} ET`;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

// ─── failed-state error classification ──────────────────────────────────────
//
// We persist a single error_message string — no failure-stage telemetry — so
// the human framing (headline / explainer / stage label) is classified from
// the message text. The raw message always ships verbatim in the trace line.

interface ErrorClass {
  headline: string;
  explainer: string; // HTML — fixed copy with <b> emphasis, no user input
  failedStage: string;
  tag: string;
  ledeRetrievalAccurate: boolean;
}

function classifyError(errorMessage: string): ErrorClass {
  if (/sam\.gov|sam api|http 40[34]|attachment|download|retriev|fetch/i.test(errorMessage)) {
    return {
      headline: "The solicitation package could not be retrieved from SAM.gov.",
      explainer: "SAM.gov refused the download request for this notice's attachment package. This usually means the attachments are behind a controlled-access wall (export-controlled or JCP-gated documents), or SAM.gov is rate-limiting automated retrieval. <b>It is not a problem with your account.</b>",
      failedStage: "01 — Document retrieval",
      tag: "Stopped at document retrieval.",
      ledeRetrievalAccurate: true,
    };
  }
  if (/timeout|timed out|abort/i.test(errorMessage)) {
    return {
      headline: "The audit engine timed out before analysis completed.",
      explainer: "The analysis ran longer than the engine's time limit and was stopped before a verdict was produced. Large solicitation packages occasionally exceed the window — this is usually transient, and <b>retrying the audit often succeeds</b>. It is not a problem with your account.",
      failedStage: "02 — Engine analysis",
      tag: "Stopped during engine analysis.",
      ledeRetrievalAccurate: false,
    };
  }
  return {
    headline: "The audit stopped before a verdict was produced.",
    explainer: "The engine hit an unexpected error and stopped before scoring. <b>Retrying the audit often succeeds</b>; if it fails again, upload the solicitation PDF directly — audits run from an uploaded document skip retrieval entirely.",
    failedStage: "",
    tag: "Stopped before a verdict was produced.",
    ledeRetrievalAccurate: false,
  };
}

// ─── public renderer ─────────────────────────────────────────────────────────

export interface TransitionalStateOptions {
  state: "progress" | "failed";
  requestedBy?: string | null;
}

export function renderAuditTransitionalState(
  template: string,
  audit: Record<string, unknown>,
  opts: TransitionalStateOptions
): string {
  const { state } = opts;
  let out = template;

  const auditUuid = str(audit.id);
  const auditShortId = auditUuid.slice(0, 8);
  const solNumber = str(audit.solicitation_number) || str(audit.title) || str(audit.notice_id) || auditShortId;
  const noticeId = str(audit.notice_id);
  const createdAt = str(audit.created_at);

  // ── exactly ONE state per response: strip the other body block + pill ──
  const removeState = state === "progress" ? "failed" : "progress";
  out = removeElementByOpenRe(out, new RegExp(`<div class="body only-${removeState}"[^>]*>`), "div");
  out = out.replace(new RegExp(`\\s*<span class="live-pill (?:running|failed) only-${removeState}">[A-Z]+</span>`), "");

  // ── body attrs: state + poll/elapsed hooks ──
  const startEpoch = createdAt ? new Date(createdAt).getTime() : NaN;
  const bodyAttrs = `<body data-state="${state}" data-audit-id="${escapeAttr(auditUuid)}"` +
    (state === "progress" && !isNaN(startEpoch) ? ` data-start="${startEpoch}"` : "") + ">";
  out = out.replace('<body data-state="progress" data-audit-id="" data-start="">', bodyAttrs);

  // ── title + shared fields ──
  out = out.replace(
    "<title>FARaudit — Audit Report</title>",
    `<title>${state === "progress" ? "Audit in progress" : "Audit failed"} — FARaudit</title>`
  );
  out = replaceFieldText(out, "solicitation_number", solNumber);
  out = replaceFieldText(out, "audit_id", auditShortId || "—");

  if (state === "progress") {
    // started_at — seed display server-side; client ticks elapsed from data-start
    out = createdAt ? replaceFieldText(out, "started_at", formatEt(createdAt)) : removeFieldElement(out, "started_at");

    // fact cells — wire or collapse (hide-not-fabricate)
    const sourceFilename = str(audit.pdf_filename);
    out = sourceFilename ? replaceFieldText(out, "source_filename", sourceFilename) : removeFactCell(out, "source_filename");
    out = removeFactCell(out, "page_count"); // not tracked in the run record
    out = replaceFieldText(out, "intel_calls", "3");
    const requestedBy = str(opts.requestedBy);
    out = requestedBy ? replaceFieldText(out, "requested_by", requestedBy) : removeFactCell(out, "requested_by");

    // stages — no per-stage telemetry exists yet (status endpoint reports the
    // run, not the stage), so render honestly: stage 01 active, rest pending.
    // Demo advancement was reviewer-only and is stripped from the template.
    out = setStageRow(out, "extraction", "is-pending", "PENDING");
    out = setStageRow(out, "retrieval", "is-active", "IN PROGRESS");
    out = out.replace(/<b id="spStageNo">\d+<\/b>/, '<b id="spStageNo">1</b>');
  } else {
    const errorMessage = str(audit.error_message) || "unknown error";
    const cls = classifyError(errorMessage);

    // failed_at — best available timestamp (no dedicated failure column)
    const failedAtIso = str(audit.completed_at) || str(audit.updated_at) || createdAt;
    out = failedAtIso ? replaceFieldText(out, "failed_at", formatEt(failedAtIso)) : removeFieldElement(out, "failed_at");

    // masthead lede — the design copy claims the stop happened "before
    // analysis began", which is only true for retrieval-class failures.
    if (!cls.ledeRetrievalAccurate) {
      out = out.replace("The engine stopped before analysis began", "The engine stopped before the audit finished");
    }

    // fact cells
    out = cls.failedStage ? replaceFieldText(out, "failed_stage", cls.failedStage) : removeFactCell(out, "failed_stage");
    out = removeFactCell(out, "attempt_count"); // not tracked in the run record

    // panel tag + reason card
    out = replaceFieldText(out, "failed_tag", cls.tag);
    out = replaceFieldText(out, "error_headline", cls.headline);
    out = replaceFieldInner(out, "error_explainer", cls.explainer);
    const traceParts = [
      `<b>TRACE</b> — ${escapeHtml(errorMessage)}`,
      `audit ${escapeHtml(auditUuid || auditShortId)}`,
    ];
    if (noticeId) traceParts.push(`notice ID ${escapeHtml(noticeId)}`);
    out = replaceFieldInner(out, "error_trace", traceParts.join(" · "));

    // retry is only meaningful when the audit can be re-pulled from SAM.gov
    // (the refetch endpoint requires a real notice_id). Upload-sourced audits
    // lose the retry CTAs; the upload path stays as the primary action.
    const retryable = !!noticeId && !noticeId.startsWith("pdf-");
    if (!retryable) {
      out = removeElementByOpenRe(out, /<a class="sp-cta ghost" href="" data-action="retry">/, "a");
      out = removeElementByOpenRe(out, /<div class="rec-card" data-block="retry_card">/, "div");
    }
  }

  return statesDemoLeakGuard(out);
}
