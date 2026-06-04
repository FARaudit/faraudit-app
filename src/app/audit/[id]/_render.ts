// Renders the audit-report design template against a view model.
//
// Strategy: the design file is the source of truth (1:1 visual port). We
// surgically rewrite the elements carrying data-field attributes to match
// what the API actually returns for the audit, without disturbing the
// surrounding markup, classes, or styles.

import type {
  AuditViewModel,
  ComplianceFlag,
  Risk,
  ScoreFactor,
  ClinLineItem,
  HierarchyNode
} from "./_view-model";

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

// ─── element removal by signature ───────────────────────────────────────────
//
// Removes an entire element (open tag through matching close) when the open
// tag matches `openRe`. Used to drop sections we don't have data for, per the
// hide-not-fabricate rule.

function removeElementByOpenRe(html: string, openRe: RegExp, tagName: string): string {
  const m = openRe.exec(html);
  if (!m) return html;
  const range = findMatchingClose(html, m.index, tagName);
  if (!range) return html;
  return html.slice(0, m.index) + html.slice(range.closeEnd);
}

// ─── tag-balanced range finder ──────────────────────────────────────────────
//
// Given an HTML string and the index of an open tag `<tag ...>`, walk forward
// counting opens/closes of the same tag name and return the index just AFTER
// the matching `</tag>`. Used to swap the inner content of array containers
// like `<div class="flags" data-field="compliance_flags">…lots of nested
// divs…</div>` without a third-party parser.

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

// Locate an element by its `data-field` attribute. Returns the open-tag and
// inner-content bounds. Skips occurrences where the element doesn't exist.

interface DataFieldMatch {
  tagName: string;
  openStart: number;
  openEnd: number;       // first char after `<tag ...>`
  contentStart: number;
  contentEnd: number;    // first char of `</tag>`
  closeEnd: number;
}

function findDataField(html: string, key: string, fromIndex = 0): DataFieldMatch | null {
  // Find an opening tag carrying data-field="<key>". We allow either quoting
  // and any tag name. The design uses double-quoted attrs throughout.
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bdata-field="${key.replace(/[.$]/g, "\\$&")}"[^>]*>`, "g");
  re.lastIndex = fromIndex;
  const m = re.exec(html);
  if (!m) return null;
  const tagName = m[1];
  const openStart = m.index;
  const openEnd = openStart + m[0].length;
  // Some self-closing-style tags? The template uses paired tags everywhere
  // for data-field — assert paired.
  const range = findMatchingClose(html, openStart, tagName);
  if (!range) return null;
  return {
    tagName,
    openStart,
    openEnd,
    contentStart: range.contentStart,
    contentEnd: range.contentEnd,
    closeEnd: range.closeEnd
  };
}

// Replace the inner HTML for every occurrence of an element keyed by data-field.
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

// Replace innerHTML with HTML-escaped text. Use when value is plain text.
function replaceFieldText(html: string, key: string, text: string): string {
  return replaceFieldInner(html, key, escapeHtml(text));
}

// Remove every element carrying data-field="<key>" entirely (open + inner +
// close), so the demo content can't leak through when the source value is
// empty. Use this for SECONDARY FIELDS where Design specced "wire OR HIDE."
function removeFieldElement(html: string, key: string): string {
  let out = html;
  while (true) {
    const hit = findDataField(out, key);
    if (!hit) break;
    out = out.slice(0, hit.openStart) + out.slice(hit.closeEnd);
  }
  return out;
}

// Wire-or-hide: replace innerHTML with the value when non-empty, or remove
// the element entirely when empty. Matches Design's SECONDARY FIELDS rule:
// "do NOT leave demo text."
function replaceFieldOrRemove(html: string, key: string, value: string): string {
  return value ? replaceFieldText(html, key, value) : removeFieldElement(html, key);
}

// ─── child renderers ────────────────────────────────────────────────────────

function renderScoreFactor(f: ScoreFactor): string {
  return `<div class="sfactor${f.drag ? " drag" : ""}">
                    <div class="sf-top"><span class="sf-name">${escapeHtml(f.name)}<span class="sf-w">${f.weight}% weight</span></span><span class="sf-score ${f.tone}">${Math.round(f.score)}</span></div>
                    <div class="sf-bar"><i class="${f.tone}" style="width:${Math.max(0, Math.min(100, f.score))}%"></i></div>
                    <div class="sf-note">${f.note}</div>
                  </div>`;
}

function severityWord(s: "P0" | "P1" | "P2"): string {
  if (s === "P0") return "Blocker";
  if (s === "P1") return "Critical";
  return "Advisory";
}

function renderComplianceFlag(f: ComplianceFlag): string {
  const sevClass = f.severity.toLowerCase();
  return `<div class="flag-row">
                  <div class="sev ${sevClass}"><span class="lvl">${f.severity}</span><span class="wd">${severityWord(f.severity)}</span></div>
                  <div class="flag-main">
                    <div class="flag-top"><span class="flag-clause mono">${escapeHtml(f.clause)}</span><span class="flag-title">${escapeHtml(f.title)}</span></div>
                    <p class="flag-desc">${escapeHtml(f.description)}</p>
                    <div class="flag-action"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12l5 5L20 7"/></svg><span><b>Action:</b> ${escapeHtml(f.required_action)}</span></div>
                  </div>
                </div>`;
}

function renderRisk(r: Risk, isFirst: boolean): string {
  const openClass = isFirst ? " open" : "";
  return `<div class="risk${openClass}">
                  <div class="risk-head"><span class="risk-sev ${r.severity}">${r.severity === "high" ? "High" : r.severity === "med" ? "Medium" : "Low"}</span><span class="risk-title">${escapeHtml(r.title)}</span><span class="risk-cite mono">${escapeHtml(r.citation)}</span><svg class="risk-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></div>
                  <div class="risk-body"><div class="risk-body-inner">
                    <p class="rb-desc">${escapeHtml(r.description)}</p>
                    <div class="risk-action"><div class="ra-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div><div class="ra-txt"><b>FARaudit move</b>${escapeHtml(r.faraudit_action)}</div></div>
                  </div></div>
                </div>`;
}

function renderClinRow(c: ClinLineItem): string {
  const flagClass = c.has_flag ? " class=\"has-flag\"" : "";
  const flagBadge = c.has_flag
    ? `<div class="cflag"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/></svg>${escapeHtml(c.flag_label || "Flag")}</div>`
    : "";
  return `<tr${flagClass}><td class="cid">${escapeHtml(c.clin)}</td><td>${escapeHtml(c.description)}${flagBadge}</td><td>${escapeHtml(c.type)}</td><td class="right">${escapeHtml(c.qty)}</td></tr>`;
}

function renderWinTheme(t: string, i: number): string {
  return `<div class="win-theme"><div class="wt-n">${i + 1}</div><p>${escapeHtml(t)}</p></div>`;
}

function renderHierarchy(nodes: HierarchyNode[]): string {
  // Each node indents by 14px per level; lines connect them.
  return nodes
    .map((n, i) => {
      const indent = i * 14;
      const leafClass = n.leaf ? " leaf" : "";
      const line = i < nodes.length - 1
        ? `<div class="hier-line" style="--ind:${indent}px"></div>`
        : "";
      return `<div class="hier-node${leafClass}"><span class="hdot" style="--ind:${indent}px"></span><span class="htxt">${escapeHtml(n.text)}</span></div>${line}`;
    })
    .join("");
}

// ─── recommendation_block class flip ────────────────────────────────────────
//
// The verdict block reads `<div class="mh-verdict v-caution" data-field="recommendation_block">`.
// Replace the v-* class with the real verdict class.

function setVerdictClass(html: string, verdictClass: "v-go" | "v-caution" | "v-decline"): string {
  // Template: <div class="mh-verdict v-caution" data-field="recommendation_block">
  return html.replace(
    /(<div class="mh-verdict )v-(?:go|caution|decline)("\s+[^>]*data-field="recommendation_block")/,
    `$1${verdictClass}$2`
  );
}

// The KO drawer's "Re" line + the inline mailto subject hard-code the demo
// solicitation number. Replace both with the live one + a generic subject.
function setKoSubject(html: string, solicitationNumber: string): string {
  const subject = `${solicitationNumber} — Pre-quote clarifications`;
  // 1) The "Re" row in the drawer meta block.
  let out = html.replace(
    /(<span class="mk">Re<\/span><span class="mv">)[^<]*(<\/span>)/,
    `$1${escapeHtml(subject)}$2`
  );
  // 2) The hard-coded subject in the inline KO-send script.
  out = out.replace(
    /var sub='[^']*';/,
    `var sub=${JSON.stringify(subject)};`
  );
  return out;
}

// Section.moment gets .is-decline on DECLINE verdicts.
function setMomentDecline(html: string, isDecline: boolean): string {
  if (!isDecline) return html;
  return html.replace(
    /<section class="moment( is-decline)?"/g,
    '<section class="moment is-decline"'
  );
}

// ─── pdf_export_url attribute injection ─────────────────────────────────────

function setPdfExportHref(html: string, href: string): string {
  // The template anchor is:
  //   <a class="act" href="/api/audit/sp4701-26-q-0942/export.pdf" data-field="pdf_export_url">
  // Replace the href attribute on the element that carries data-field="pdf_export_url".
  return html.replace(
    /(<a [^>]*?)href="[^"]*"([^>]*data-field="pdf_export_url"[^>]*>)/,
    `$1href="${escapeAttr(href)}"$2`
  );
}

// ─── IS_METADATA_ONLY ───────────────────────────────────────────────────────

function setMetadataOnly(html: string, isMetaOnly: boolean): string {
  return html.replace(
    /var IS_METADATA_ONLY = (?:true|false);/,
    `var IS_METADATA_ONLY = ${isMetaOnly ? "true" : "false"};`
  );
}

// ─── confidence ring stroke-dashoffset baked-in ─────────────────────────────
//
// The page JS auto-computes the ring after load, but for users with JS off OR
// for the print mode (Cmd+P pre-load) we set the dashoffset server-side too.

function setConfRingDash(html: string, pct: number): string {
  const c = 2 * Math.PI * 46;
  const offset = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return html.replace(
    /<circle class="rfg" id="confRing" cx="52" cy="52" r="46" stroke-dasharray="289" stroke-dashoffset="289"\s*\/>/,
    `<circle class="rfg" id="confRing" cx="52" cy="52" r="46" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>`
  );
}

// ─── score/win bar widths inside .mhv-metric ────────────────────────────────
// The two metric bars are hard-coded width:76% and width:41% in the template.
// Match by surrounding context (mhv-bar inside the mhv-metric that wraps the
// data-field="score" span) and rewrite both.

function setMetricBars(html: string, score: number, winProb: number): string {
  // The first <div class="mhv-metric"> contains data-field="score" and one
  // <i style="width:76%"></i> after it. The second contains data-field="win_probability".
  // Replace both .mhv-bar i style widths positionally between those markers.
  // We do this by scanning each metric block and rewriting its bar width.
  return html.replace(
    /(<div class="mhv-metric">[\s\S]*?<span data-field="score">[\s\S]*?<div class="mhv-bar"><i style="width:)\d+%(")/,
    `$1${Math.max(0, Math.min(100, score))}%$2`
  ).replace(
    /(<div class="mhv-metric">[\s\S]*?<span data-field="win_probability">[\s\S]*?<div class="mhv-bar"><i style="width:)\d+%(")/,
    `$1${Math.max(0, Math.min(100, winProb))}%$2`
  );
}

// ─── inc-track + rd-bar widths ──────────────────────────────────────────────

function setIncTrack(html: string, pct: number): string {
  return html.replace(
    /(<div class="inc-track"><i style="width:)\d+%(">.*?<\/div>)/,
    `$1${Math.round(pct)}%$2`
  );
}

// (rd-bar / qa_days_num setters intentionally omitted — the rail-deadline
// card is removed when qa_deadline is absent. Re-introduce when a real
// qa_deadline lands in schema.)

// ─── strip the dev-only HANDOFF comment ─────────────────────────────────────
//
// The template ends with a long HTML comment documenting the data-field map
// for whoever wires this up. It doesn't render but ships in every response,
// references fields we don't yet surface (score_factors, qa_deadline, etc.),
// and would leak the internal schema via View-Source. Strip in production.

function stripHandoffComment(html: string): string {
  return html.replace(
    /<!--\s*═+\s*CLAUDE CODE · HANDOFF BLOCK[\s\S]*?═+\s*-->/g,
    ""
  );
}

// ─── breadcrumb + page <title> ──────────────────────────────────────────────

function setPageTitle(html: string, title: string): string {
  return html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(title)}</title>`
  );
}

// ─── hide-not-fabricate: drop sections when source data is absent ──────────

// Drop a .kd-item ribbon entry by the data-field it carries (qa_deadline,
// response_deadline, award_date). Uses the balanced-tag finder so nested
// markup can't bleed the match.  Also drops a trailing .kd-sep so we don't
// leave a hanging divider.
function removeKdItem(html: string, fieldKey: string): string {
  // Find the data-field index, walk backward to its enclosing <div class="kd-item …">,
  // then use the balanced finder for the matching </div>.
  const marker = `data-field="${fieldKey}"`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return html;
  const before = html.slice(0, markerIdx);
  const openIdx = before.lastIndexOf('<div class="kd-item');
  if (openIdx === -1) return html;
  const range = findMatchingClose(html, openIdx, "div");
  if (!range) return html;
  let cutEnd = range.closeEnd;
  // Eat optional whitespace + trailing <div class="kd-sep"></div>.
  const sep = html.slice(cutEnd).match(/^\s*<div class="kd-sep"><\/div>/);
  if (sep) cutEnd += sep[0].length;
  return html.slice(0, openIdx) + html.slice(cutEnd);
}

// Drop the entire .keydates ribbon when none of the three dates is real.
function removeKeyDates(html: string): string {
  const idx = html.indexOf('<div class="keydates"');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "div");
  if (!range) return html;
  // Trim trailing whitespace so the next sibling abuts cleanly.
  let cutEnd = range.closeEnd;
  const ws = html.slice(cutEnd).match(/^\s*/);
  if (ws) cutEnd += ws[0].length;
  return html.slice(0, idx) + html.slice(cutEnd);
}

// Drop the hardcoded .kd-note narrative ("data-rights clarification must
// clear before questions close — 14 days") which presumes a real qa_deadline.
function removeKdNote(html: string): string {
  const idx = html.indexOf('<div class="kd-note"');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "div");
  if (!range) return html;
  return html.slice(0, idx) + html.slice(range.closeEnd);
}

// Drop the sticky .rail-deadline card (the big "Questions close in N days"
// clock) when qa_deadline is not available.
function removeRailDeadline(html: string): string {
  const idx = html.indexOf('<div class="rail-card rail-deadline">');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "div");
  if (!range) return html;
  let cutEnd = range.closeEnd;
  const ws = html.slice(cutEnd).match(/^\s*/);
  if (ws) cutEnd += ws[0].length;
  return html.slice(0, idx) + html.slice(cutEnd);
}

// Drop §00 Decision Scorecard entirely + its jump-nav entry. Hidden when no
// score_factors[] (DESIGN ruling 2026-06-04: no derived scorecard).
function removeScorecard(html: string): string {
  // Anchor on the unique id `sec-scorecard`.
  const idx = html.indexOf('<section class="sec scorecard" id="sec-scorecard">');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "section");
  let out = range ? html.slice(0, idx) + html.slice(range.closeEnd) : html;
  // Drop the jump-nav row pointing at it.
  out = out.replace(/<a href="#sec-scorecard">[\s\S]*?<\/a>\s*/, "");
  return out;
}

// (stripMastheadSubs / removeClassificationAlts / removeFarBasisCap retired
// after Design's SECONDARY-FIELDS update — those targets now carry data-field
// hooks and flow through replaceFieldOrRemove. See history if you need to
// resurrect the pure-regex strippers.)

// Drop §02 Incumbent entirely + its jump-nav entry. Hidden when no incumbent
// has been identified (DESIGN ruling: incumbent intel band is alarming + false
// on metadata audits with no incumbent looked up).
function removeIncumbentSection(html: string): string {
  const idx = html.indexOf('<section class="sec" id="sec-incumbent">');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "section");
  let out = range ? html.slice(0, idx) + html.slice(range.closeEnd) : html;
  out = out.replace(/<a href="#sec-incumbent">[\s\S]*?<\/a>\s*/, "");
  return out;
}

// Within §02, drop the .inc-expiry sub-block when we have the incumbent name
// but no expiry date (so the days-left clock + "5-year award" copy don't
// fabricate alarm).
function removeIncExpiry(html: string): string {
  const idx = html.indexOf('<div class="inc-expiry">');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "div");
  if (!range) return html;
  return html.slice(0, idx) + html.slice(range.closeEnd);
}

// (removeIncumbentPill retired — §02 pill is now wired via
// data-field="incumbent_status" through replaceFieldOrRemove.)

// Drop the rail "Pre-quote readiness" card. DESIGN ruling: same gate as the
// derived scorecard — false precision until backed by a real checklist model.
function removeReadinessCard(html: string): string {
  // The card is a .rail-card whose first child .rc-h reads "Pre-quote readiness".
  const re = /<div class="rail-card">\s*<div class="rc-h">Pre-quote readiness<\/div>[\s\S]*?<\/div>\s*<\/div>/;
  return html.replace(re, "");
}

// Hide the Moment band entirely when there are no real risks (DESIGN Q2).
function removeMomentBand(html: string): string {
  // Two <section class="moment"> blocks live in the template (full + locked
  // variants). Find both and remove.
  let out = html;
  for (let i = 0; i < 2; i++) {
    const idx = out.indexOf('<section class="moment"');
    if (idx === -1) break;
    const range = findMatchingClose(out, idx, "section");
    if (!range) break;
    out = out.slice(0, idx) + out.slice(range.closeEnd);
  }
  return out;
}

// Drop the "Win themes — why you, why now" subhead + the .win-themes grid
// when there are no themes (DESIGN Q3: keep rationale always; subhead only
// when content exists). The grid container has nested <div class="win-theme">
// children so the lazy regex would stop at the first nested </div> — use the
// balanced finder. The §06 heading "& Win Themes" suffix is now wired via
// the data-field="win_themes_title_suffix" hook (Design's update) and
// stripped by the caller through replaceFieldOrRemove.
function removeWinThemesSubhead(html: string): string {
  let out = html.replace(/<p class="win-h">[^<]*<\/p>\s*/, "");
  const idx = out.indexOf('<div class="win-themes"');
  if (idx !== -1) {
    const range = findMatchingClose(out, idx, "div");
    if (range) {
      let cutEnd = range.closeEnd;
      const ws = out.slice(cutEnd).match(/^\s*/);
      if (ws) cutEnd += ws[0].length;
      out = out.slice(0, idx) + out.slice(cutEnd);
    }
  }
  return out;
}

// Empty-state row for §05 Risk Register when risks.length === 0 AND we're
// not in metadata-only mode (locked treatment handles that path). DESIGN
// BLOCKER A: the demo template ships 4 demo `.risk` blocks that contradict
// a zero-risks audit; this clears them with a matching empty state.
function setRisksEmptyState(html: string): string {
  const innerHtml = `
                <div style="padding:20px 18px;border:1px dashed var(--line);border-radius:13px;color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:12px;text-align:center;line-height:1.6">
                  <b style="color:var(--ink-2);font-weight:700">No risks surfaced.</b><br>FARaudit ran a clean pass against this notice — proceed with the standard pre-quote checklist.
                </div>
              `;
  return replaceFieldInner(html, "risks", innerHtml);
}

// Empty-state row for §04 Compliance Flags. Same shape + same rationale as
// the risks empty-state above; pre-empts the demo flag rows leaking through
// when no clauses were extracted but we're not in locked mode.
function setComplianceEmptyState(html: string): string {
  const innerHtml = `
                <div style="padding:20px 18px;border:1px dashed var(--line);border-radius:13px;color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:12px;text-align:center;line-height:1.6">
                  <b style="color:var(--ink-2);font-weight:700">No offeror-action clauses flagged.</b><br>The audit engine did not surface a FAR/DFARS trap requiring a clarification step before quoting.
                </div>
              `;
  return replaceFieldInner(html, "compliance_flags", innerHtml);
}

// Scale the 40px days color so amber only fires when ≤ 180d, and neutralize
// the amber gradient on .inc-track when the horizon is long. (.ecap text
// itself flows through the data-field="incumbent.expiry_note" hook.)
function setIncumbentDaysColor(html: string, daysColor: string | null): string {
  if (!daysColor) return html;
  // Inline style on .days overrides both light + dark theme defaults
  // (CSS rules don't use !important, so inline always wins).
  let out = html.replace(
    /<div class="days">/,
    `<div class="days" style="color:${daysColor}">`
  );
  out = out.replace(
    /<div class="inc-track"><i style="width:(\d+)%">/,
    `<div class="inc-track"><i style="width:$1%;background:linear-gradient(90deg,var(--mute-2),var(--ink-2))">`
  );
  return out;
}

// Replace the §04 / §05 / §06 section-header pills with derived text. When
// the text is empty, strip the pill outright.
function setSectionPill(html: string, sectionId: string, pillText: string): string {
  if (pillText) {
    return html.replace(
      new RegExp(`(<section class="sec[^"]*" id="${sectionId}">[\\s\\S]*?<div class="sh-right">)\\s*<span class="sh-pill([^"]*)"[^>]*>[^<]*<\\/span>\\s*(<\\/div>)`),
      `$1<span class="sh-pill$2">${escapeHtml(pillText)}</span>$3`
    );
  }
  return html.replace(
    new RegExp(`(<section class="sec[^"]*" id="${sectionId}">[\\s\\S]*?<div class="sh-right">)\\s*<span class="sh-pill[^"]*"[^>]*>[^<]*<\\/span>\\s*(<\\/div>)`),
    "$1$2"
  );
}

// Wire jump-nav badges to real counts; remove badge when count is 0.
function setJumpBadge(html: string, sectionHref: string, count: number): string {
  if (count > 0) {
    return html.replace(
      new RegExp(`(<a href="#${sectionHref}"[^>]*>[\\s\\S]*?<span class="jb [^"]*">)\\d+(<\\/span>\\s*<\\/a>)`),
      `$1${count}$2`
    );
  }
  // Strip the badge but keep the link itself.
  return html.replace(
    new RegExp(`(<a href="#${sectionHref}"[^>]*>[\\s\\S]*?)<span class="jb [^"]*">\\d+<\\/span>(\\s*<\\/a>)`),
    "$1$2"
  );
}

// Replace the CLIN <tbody> with an empty-state row when no line items.
function setClinEmptyState(html: string): string {
  return html.replace(
    /(<table class="clin-tbl" data-field="clin_table">[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/,
    `$1\n                  <tr><td colspan="4" style="padding:18px 14px;text-align:center;color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:11.5px">CLIN structure not extracted — upload the full PDF to surface the line items.</td></tr>\n                $2`
  );
}

// Replace the win_probability metric tile contents when the value is null
// (basis=0 / unknown). DESIGN ruling 2026-06-04: don't render 0% — it reads
// as "0% chance". Show "—" + hide the bar.
function setWinProbabilityNull(html: string): string {
  return html
    .replace(
      /(<div class="mhv-metric">[\s\S]*?<span data-field="win_probability">)\d+(<\/span><span class="u">)%(<\/span>)/,
      `$1—$2$3`
    )
    .replace(
      /(<div class="mhv-metric">[\s\S]*?<span data-field="win_probability">[\s\S]*?<div class="mhv-bar"><i style="width:)\d+%(")/,
      `$10%$2`
    );
}

// ─── main entry ─────────────────────────────────────────────────────────────

export function renderAuditReport(template: string, vm: AuditViewModel): string {
  let html = template;

  // Page-level
  html = setPageTitle(html, vm.page_title);

  // Identity
  html = replaceFieldText(html, "solicitation_number", vm.solicitation_number);
  html = replaceFieldText(html, "audit_id", vm.audit_id_short);
  html = replaceFieldText(html, "generated_at", vm.generated_at);

  // Masthead — fields + wire-or-hide each <span class="sub"> sub-line via the
  // SECONDARY FIELDS hooks Design added. Empty value → element removed so
  // the demo captions ("Computer Systems Design Svcs" etc.) can't leak.
  html = replaceFieldInner(html, "document_type", `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>${escapeHtml(vm.document_type)}`);
  html = replaceFieldText(html, "title", vm.title);
  html = replaceFieldText(html, "agency", vm.agency);
  html = replaceFieldText(html, "naics", vm.naics);
  html = replaceFieldText(html, "set_aside", vm.set_aside);
  html = replaceFieldText(html, "contract_type", vm.contract_type);
  html = replaceFieldOrRemove(html, "agency_detail", vm.agency_sub);
  html = replaceFieldOrRemove(html, "naics_label", vm.naics_sub);
  html = replaceFieldOrRemove(html, "set_aside_detail", vm.set_aside_sub);
  html = replaceFieldOrRemove(html, "contract_term", vm.contract_type_sub);

  // Verdict block
  html = setVerdictClass(html, vm.recommendation_class);
  html = setMomentDecline(html, vm.recommendation_class === "v-decline");
  html = replaceFieldText(html, "recommendation", vm.recommendation);
  html = replaceFieldText(html, "recommendation_tagline", vm.recommendation_tagline);
  html = replaceFieldText(html, "score", String(Math.round(vm.score)));
  html = replaceFieldText(html, "win_probability_benchmark", vm.win_probability_benchmark);
  if (vm.win_probability == null) {
    // DESIGN #8: don't render "0%" — show "—" + zero the bar.
    html = setWinProbabilityNull(html);
  } else {
    html = replaceFieldText(html, "win_probability", String(vm.win_probability));
    html = setMetricBars(html, vm.score, vm.win_probability);
  }
  // Score bar is always real even when win_prob is null.
  if (vm.win_probability == null) {
    html = html.replace(
      /(<div class="mhv-metric">[\s\S]*?<span data-field="score">[\s\S]*?<div class="mhv-bar"><i style="width:)\d+%(")/,
      `$1${Math.max(0, Math.min(100, vm.score))}%$2`
    );
  }

  // Key dates ribbon — only render items we actually have, per the
  // hide-not-fabricate rule. Drop items whose source date is missing.
  if (vm.has_response_deadline) {
    html = replaceFieldText(html, "response_deadline", vm.response_deadline);
    html = replaceFieldText(html, "response_days", vm.response_days);
  } else {
    html = removeKdItem(html, "response_deadline");
  }
  if (!vm.has_qa_deadline) {
    html = removeKdItem(html, "qa_deadline");
    html = removeKdNote(html);
    html = removeRailDeadline(html);
  } else {
    html = replaceFieldText(html, "qa_deadline", vm.qa_deadline);
    html = replaceFieldText(html, "qa_days", vm.qa_days);
    html = replaceFieldText(html, "qa_days_num", vm.qa_days_num);
  }
  if (!vm.has_award_date) {
    html = removeKdItem(html, "award_date");
  } else {
    html = replaceFieldText(html, "award_date", vm.award_date);
  }
  // If none of the three dates was real, drop the entire ribbon.
  if (!vm.has_response_deadline && !vm.has_qa_deadline && !vm.has_award_date) {
    html = removeKeyDates(html);
  }

  // Headline risk band — drop entirely when zero risks (DESIGN Q2: the band's
  // whole job is "the catch" — no catch, no band; verdict already tells the
  // GO story).
  if (vm.show_moment_band) {
    html = replaceFieldText(html, "headline_risk.citation", vm.headline_risk.citation);
    html = replaceFieldText(html, "headline_risk.title", vm.headline_risk.title);
    html = replaceFieldText(html, "headline_risk.description", vm.headline_risk.description);
    html = replaceFieldText(html, "headline_risk.impact", vm.headline_risk.faraudit_action);
  } else {
    html = removeMomentBand(html);
  }

  // §00 Decision Scorecard — drop the section entirely when score_factors is
  // empty. DESIGN ruling 2026-06-04: don't derive a 4-factor scorecard from
  // arithmetic offsets of the overall score; surface only when a real per-
  // factor model is wired up. The headline score stays in the masthead.
  if (vm.score_factors.length === 0) {
    html = removeScorecard(html);
  } else {
    html = replaceFieldInner(html, "score_factors", vm.score_factors.map(renderScoreFactor).join("\n"));
  }

  // §01 Classification — wire-or-hide the demo alt-chips and the FAR-basis
  // caption via Design's new data-field hooks.
  html = replaceFieldText(html, "document_type_confidence", String(vm.document_type_confidence));
  html = replaceFieldText(html, "document_type_confidence_label", vm.document_type_confidence_label);
  html = replaceFieldText(html, "document_type_full", vm.document_type_full);
  html = replaceFieldText(html, "document_type_reasoning", vm.document_type_reasoning);
  html = setConfRingDash(html, vm.conf_ring_pct);
  html = removeFieldElement(html, "classification_alternatives"); // not in DB yet
  html = removeFieldElement(html, "far_basis"); // not in DB yet

  // §02 Incumbent — drop the entire section when no incumbent has been
  // identified (DESIGN #2 + #3: the days-left clock + "5-year award expiring
  // in <4 months" copy + "Recompete window open" pill are alarming on
  // metadata audits with no incumbent). When name exists but expiry doesn't,
  // drop the .inc-expiry sub-block. Section-header pill only when expiry
  // is within ~6 months.
  if (!vm.incumbent.has_data) {
    html = removeIncumbentSection(html);
  } else {
    html = replaceFieldText(html, "incumbent.name", vm.incumbent.name);
    html = replaceFieldText(html, "incumbent.uei", vm.incumbent.uei);
    html = replaceFieldText(html, "incumbent.award_value", vm.incumbent.award_value);
    html = html.replace(
      /(<div class="inc-logo">)[^<]*(<\/div>)/,
      `$1${escapeHtml(vm.incumbent.initial)}$2`
    );
    if (vm.incumbent.has_expiry) {
      html = replaceFieldText(html, "incumbent.expiry", vm.incumbent.expiry);
      html = replaceFieldText(html, "incumbent.days_to_expiry", String(vm.incumbent.days_to_expiry.toLocaleString("en-US")));
      html = replaceFieldText(html, "incumbent.last_lookup", vm.incumbent.last_lookup);
      html = setIncTrack(html, vm.incumbent.track_width_pct);
      // .ecap text via the new data-field; color override + track recolor
      // remain regex-driven (no data-field hooks for those visual states).
      html = replaceFieldInner(html, "incumbent.expiry_note", vm.incumbent.expiry_note);
      html = setIncumbentDaysColor(html, vm.incumbent.days_color_override);
    } else {
      html = removeIncExpiry(html);
    }
    // §02 section pill via new data-field hook (was setSectionPill regex).
    html = replaceFieldOrRemove(html, "incumbent_status", vm.incumbent.show_status_pill ? vm.incumbent.status_label : "");
  }

  // §03 Scope/CLIN
  html = replaceFieldText(html, "clin_summary", vm.clin_summary);
  html = replaceFieldText(html, "primary_objective", vm.primary_objective);
  html = replaceFieldText(html, "period_of_performance", vm.period_of_performance);
  html = replaceFieldText(html, "customer_office", vm.customer_office);
  html = replaceFieldText(html, "contract_type_detail", vm.contract_type_detail);
  // Customer hierarchy — replace the inner content of the `.hier` block. The
  // design has no data-field on it; identify by the surrounding container.
  html = html.replace(
    /<div class="hier">[\s\S]*?<\/div>(?=\s*<\/div>\s*<\/div>\s*<div class="scope-block">\s*<div class="sb-h">Contract Vehicle)/,
    `<div class="hier">${renderHierarchy(vm.customer_hierarchy)}</div>`
  );
  // CLIN table — render real rows when present, otherwise drop in an empty-
  // state row (DESIGN #4: leaving the demo "Platform stand-up / Analytics
  // licenses" rows on an "IT Help Desk" notice is worse than the empty state).
  if (vm.clin_line_items.length > 0) {
    const tbody = vm.clin_line_items.map(renderClinRow).join("\n                  ");
    html = html.replace(
      /(<table class="clin-tbl" data-field="clin_table">[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/,
      `$1\n                  ${tbody}\n                $2`
    );
  } else {
    html = setClinEmptyState(html);
  }

  // §04 Compliance flags — wire-or-hide the demo rows. Defense in depth:
  // clear demo content even when locked (metadata-only) hides the container.
  if (vm.compliance_flags.length > 0) {
    const rows = vm.compliance_flags.map(renderComplianceFlag).join("\n                ");
    html = replaceFieldInner(html, "compliance_flags", `\n                ${rows}\n              `);
  } else {
    html = setComplianceEmptyState(html);
  }
  // §04 pill via new data-field hook (compliance_summary). Hide on
  // locked/metadata-only or zero flags.
  html = replaceFieldOrRemove(html, "compliance_summary", vm.is_metadata_only ? "" : vm.compliance_pill_text);

  // §05 Risks — same wire-or-empty-state pattern.
  if (vm.risks.length > 0) {
    const blocks = vm.risks.map((r, i) => renderRisk(r, i === 0)).join("\n                ");
    html = replaceFieldInner(html, "risks", `\n                ${blocks}\n              `);
  } else {
    html = setRisksEmptyState(html);
  }
  html = setSectionPill(html, "sec-risks", vm.is_metadata_only ? "" : vm.risk_pill_text);

  // §06 Recommendation — rationale always; themes only when present;
  // "& Win Themes" title suffix flows through the new data-field hook
  // (DESIGN backlog #1) so the heading reads just "Recommendation" when empty.
  html = replaceFieldText(html, "recommendation_rationale", vm.recommendation_rationale);
  if (vm.recommendation_win_themes.length > 0) {
    const themes = vm.recommendation_win_themes.map(renderWinTheme).join("\n                ");
    html = replaceFieldInner(html, "recommendation_win_themes", `\n                ${themes}\n              `);
    // Leave the " &amp; Win Themes" suffix in place — replaceFieldInner above
    // overwrites the win-themes container; the suffix span is separate.
  } else {
    html = removeWinThemesSubhead(html);
    html = replaceFieldOrRemove(html, "win_themes_title_suffix", "");
  }
  // §06 section pill via new data-field hook.
  html = replaceFieldOrRemove(html, "recommendation_status", vm.recommendation_pill_text);

  // Rail clock — already removed above if !has_qa_deadline; nothing to fill
  // when the card has been excised from the markup.

  // Rail "Pre-quote readiness" — DESIGN Q1: HIDE entirely. The hardcoded
  // checklist ("SPRS posted", "NAICS eligible OK", etc.) asserts statuses
  // without checking them.
  html = removeReadinessCard(html);

  // Rail "Jump to" badges — wire compliance + risk counts; strip when 0
  // (locked treatment also reads as 0 since we hide the lists).
  const lockedOrZeroFlags = vm.is_metadata_only || vm.compliance_flags.length === 0;
  const lockedOrZeroRisks = vm.is_metadata_only || vm.risks.length === 0;
  html = setJumpBadge(html, "sec-compliance", lockedOrZeroFlags ? 0 : vm.compliance_flags.length);
  html = setJumpBadge(html, "sec-risks", lockedOrZeroRisks ? 0 : vm.risks.length);

  // KO email
  html = replaceFieldText(html, "ko_email.to", vm.ko_email_to);
  // The body must preserve whitespace — the design wraps it in white-space:pre-wrap.
  html = replaceFieldText(html, "ko_email.body", vm.ko_email_body);

  // PDF export anchor
  html = setPdfExportHref(html, vm.pdf_export_url);

  // KO drawer subject (clears the demo SP4701 from "Re" line + inline mailto)
  html = setKoSubject(html, vm.solicitation_number);

  // Metadata-only flag (drives full/locked state toggle)
  html = setMetadataOnly(html, vm.is_metadata_only);

  // Dev-only HANDOFF block — not for the wire.
  html = stripHandoffComment(html);

  return html;
}
