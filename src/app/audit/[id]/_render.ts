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
  HierarchyNode,
  EvaluationFactorVM,
  SubmissionRequirementVM
} from "./_view-model";
import { buildV2ViewModelFromShadow, renderV2Surfaces, renderIngestionBannerFromAudit } from "./_v2-render-surfaces";

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

// §M Evaluation Factor row inside #sec-eval .eval-factors. Mirrors the
// design template's .sfactor markup. The tone class flows verbatim onto
// .sf-cov and .sf-bar i — design CSS defines good/warn/bad/mute on .sf-cov
// (line 463-466) and good/ok/warn fills on .sf-bar i (line 377-379). bad
// and mute on the bar have no styled fill, which is intentional: mute
// always carries coverage_pct=0 anyway (Price + no-profile cases).
function renderEvalFactor(f: EvaluationFactorVM): string {
  return `<div class="sfactor">
                  <div class="sf-top"><span class="sf-name"><span class="sf-rank">${f.rank}</span>${escapeHtml(f.name)}<span class="sf-w">${escapeHtml(f.importance)}</span></span><span class="sf-cov ${f.tone}">${escapeHtml(f.coverage)}</span></div>
                  <div class="sf-bar"><i class="${f.tone}" style="width:${Math.max(0, Math.min(100, f.coverage_pct))}%"></i></div>
                  <div class="sf-note">${escapeHtml(f.note)}</div>
                </div>`;
}

// §L Submission Requirement row inside #sec-eval .eval-l. Status drives
// THREE renderable surfaces: the .ready-dot fill class, the SVG icon
// inside the dot, and the .ready-meta status class. Per design CSS at
// line 444-446: ok→.done (green fill + checkmark), warn→.warn (amber +
// alert), todo→.todo (outline only, no fill, no icon — the .todo CSS
// uses `border:1.5px solid var(--mute-2)` and a card-soft background, so
// an inner SVG would be invisible).
function renderReadyRow(r: SubmissionRequirementVM): string {
  const map: Record<SubmissionRequirementVM["status"], { dot: string; icon: string }> = {
    ok:   { dot: "done", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>' },
    warn: { dot: "warn", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 8v5M12 17h.01"/></svg>' },
    todo: { dot: "todo", icon: "" }
  };
  const m = map[r.status];
  return `<div class="ready-row"><span class="ready-dot ${m.dot}">${m.icon}</span><span class="ready-txt">${escapeHtml(r.requirement)}</span><span class="ready-meta ${r.status}">${escapeHtml(r.meta)}</span></div>`;
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

// Provenance badge prefixes each risk title — tells the customer whether the
// risk is anchored to a real clause citation ("✓ Document") or extrapolated
// from typical patterns for this NAICS/contract type ("≈ Pattern"). Inline-
// styled with theme tokens so it adapts to light + dark without template CSS.
function renderProvenanceBadge(provenance: "verified" | "inferred"): string {
  const verifiedStyle = "display:inline-flex;align-items:center;gap:4px;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:var(--green-50);color:var(--green-700);border:1px solid var(--green-200);margin-right:8px;vertical-align:1px;white-space:nowrap";
  const inferredStyle = "display:inline-flex;align-items:center;gap:4px;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:var(--card-soft);color:var(--mute);border:1px solid var(--line);margin-right:8px;vertical-align:1px;white-space:nowrap";
  return provenance === "verified"
    ? `<span style="${verifiedStyle}" title="Anchored to a FAR/DFARS clause in the source"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;flex-shrink:0"><polyline points="1.5,5 4,7.5 8.5,2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Document</span>`
    : `<span style="${inferredStyle}" title="Pattern-derived from typical solicitations in this category"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;flex-shrink:0"><line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Pattern</span>`;
}

function renderRisk(r: Risk, isFirst: boolean): string {
  const openClass = isFirst ? " open" : "";
  const badge = renderProvenanceBadge(r.provenance);
  // Render the .risk-action chip ONLY when the engine produced a specific move.
  // Empty faraudit_action means the engine had no distinct neutralizing step
  // beyond what's in the KO email — surface nothing rather than canned filler.
  const actionBlock = r.faraudit_action
    ? `<div class="risk-action"><div class="ra-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div><div class="ra-txt"><b>FARaudit move</b>${escapeHtml(r.faraudit_action)}</div></div>`
    : "";
  return `<div class="risk${openClass}">
                  <div class="risk-head"><span class="risk-sev ${r.severity}">${r.severity === "high" ? "High" : r.severity === "med" ? "Medium" : "Low"}</span><span class="risk-title">${badge}${escapeHtml(r.title)}</span><span class="risk-cite mono">${escapeHtml(r.citation)}</span><svg class="risk-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></div>
                  <div class="risk-body"><div class="risk-body-inner">
                    <p class="rb-desc">${escapeHtml(r.description)}</p>
                    ${actionBlock}
                  </div></div>
                </div>`;
}

// Card-shape CLIN renderer. Pills are emitted only when their field has a real
// value — empty Type ("—") or empty Qty ("—") fall out so no orphan .cpill ever
// reaches the DOM (conformance gate asserts on this). PSC + NSN appear only
// when the engine extracted them; never invented.
function renderClinCard(c: ClinLineItem): string {
  const cardClass = c.has_flag ? "clin has-flag" : "clin";
  const nsnLine = c.nsn ? `<div class="nsn">${escapeHtml(c.nsn)}</div>` : "";
  const pills: string[] = [];
  if (c.psc && c.psc !== "—") {
    pills.push(`<span class="cpill psc"><i>PSC</i> <span class="v">${escapeHtml(c.psc)}</span></span>`);
  }
  if (c.type && c.type !== "—") {
    pills.push(`<span class="cpill"><i>Type</i> <span class="v">${escapeHtml(c.type)}</span></span>`);
  }
  if (c.qty && c.qty !== "—") {
    pills.push(`<span class="cpill"><i>Qty</i> <span class="v">${escapeHtml(c.qty)}</span></span>`);
  }
  if (c.has_flag) {
    pills.push(`<span class="cpill flag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/></svg>${escapeHtml(c.flag_label || "Flag")}</span>`);
  }
  return `<div class="${cardClass}">
                  <div class="clin-num">${escapeHtml(c.clin)}<span class="sub">CLIN</span></div>
                  <div class="clin-main">
                    <div class="clin-desc">${escapeHtml(c.description)}${nsnLine}</div>
                    <div class="clin-pills">${pills.join("")}</div>
                  </div>
                </div>`;
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

// Dual verdict-block selector. The template ships two sibling .mh-verdict
// elements in the masthead: a scored one (data-state="full") and a
// preliminary-read one (data-state="locked" data-field="preliminary_block").
// Pick which one survives server-side rather than relying on JS toggle — the
// template's @media print rule `[data-state="locked"]{display:none!important}`
// would hide the prelim block on PDF print otherwise.
//
// Mode "scored"      → strip the prelim block; leave scored block to be wired.
// Mode "preliminary" → strip the scored block; un-hide prelim block, clear
//                       its data-state="locked" so the print rule doesn't fire,
//                       AND stamp data-prelim-mode = fetch/watch/upload on it
//                       (drives the CSS .pm-head/.pm-cta visibility selectors).
function pickVerdictBlock(html: string, mode: "scored" | "preliminary", prelimMode?: "fetch" | "watch" | "upload"): string {
  if (mode === "scored") {
    const idx = html.indexOf('<div class="mh-verdict v-unscored"');
    if (idx === -1) return html;
    const range = findMatchingClose(html, idx, "div");
    if (!range) return html;
    let cutEnd = range.closeEnd;
    const ws = html.slice(cutEnd).match(/^\s*/);
    if (ws) cutEnd += ws[0].length;
    return html.slice(0, idx) + html.slice(cutEnd);
  }
  // mode === "preliminary": drop the scored block + un-hide the prelim block.
  const scoredIdx = html.indexOf('<div class="mh-verdict v-');
  if (scoredIdx === -1) return html;
  const scoredMatch = html.slice(scoredIdx).match(/^<div class="mh-verdict (?:v-go|v-caution|v-decline)" data-state="full"/);
  if (!scoredMatch) return html;
  const scoredRange = findMatchingClose(html, scoredIdx, "div");
  if (!scoredRange) return html;
  let out = html.slice(0, scoredIdx) + html.slice(scoredRange.closeEnd);
  out = out.replace(/\n\s*\n(\s*<!-- ═+ PRELIMINARY READ)/, "\n$1");
  // On the prelim block: stamp the real data-prelim-mode, remove inline
  // display:none + data-state="locked" so screen + print treat it normally.
  const pm = prelimMode ?? "upload";
  out = out.replace(
    /(<div class="mh-verdict v-unscored")\s+data-state="locked"\s+data-prelim-mode="fetch"\s+data-field="preliminary_block"\s+style="display:none"/,
    `$1 data-prelim-mode="${pm}" data-field="preliminary_block"`
  );
  // Also drive the inline-script hardcoded setPrelimMode('fetch') so the
  // PRELIM map (band-k / band-unlock / data-pm-btn) reflects the real mode
  // for the moment-band locked variant + §04 / §05 lock teasers.
  out = out.replace(/setPrelimMode\('fetch'\);/, `setPrelimMode('${pm}');`);
  return out;
}

// Tile A omission: when the audit has no response_deadline, drop the entire
// prelim_deadline_tile div. Tile B then spans the prelim_metrics grid.
function removePrelimDeadlineTile(html: string): string {
  return removeFieldElement(html, "prelim_deadline_tile");
}

// Eligibility note omission: when set_aside_eligibility is empty, drop the
// whole .mhv-note line inside prelim_setaside_tile (leaves the .t set-aside
// label + .k "Set-aside fit" caption).
function removePrelimSetasideNote(html: string): string {
  // The note we want to strip is the LAST .mhv-note inside the
  // prelim_setaside_tile div. Anchor by data-field marker + walk.
  const tileIdx = html.indexOf('data-field="prelim_setaside_tile"');
  if (tileIdx === -1) return html;
  const noteRe = /<div class="mhv-note">[\s\S]*?<\/div>/g;
  noteRe.lastIndex = tileIdx;
  const m = noteRe.exec(html);
  if (!m) return html;
  return html.slice(0, m.index) + html.slice(m.index + m[0].length);
}

// is_not_solicitation = true: surgically excise the entire .mh-verdict half
// of the masthead and collapse the grid to single-column. The verdict block
// reads as a confident BID/CAUTION/DECLINE — wrong-doc audits would lie.
function removeVerdictBlock(html: string): string {
  const idx = html.indexOf('<div class="mh-verdict');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "div");
  let out = range ? html.slice(0, idx) + html.slice(range.closeEnd) : html;
  // Collapse the masthead grid (1fr 340px → 1fr) via inline style override.
  out = out.replace(
    /<header class="masthead">/,
    `<header class="masthead" style="grid-template-columns:1fr">`
  );
  return out;
}

// Design Revision A (2026-06-05): when is_not_solicitation === true, strip
// §03 Scope, §04 Compliance Flags, §05 Risk Register, §06 Recommendation.
// Rationale: the model's analysis of these sections is unreliable when the
// document isn't a solicitation; rendering them invites contradictions like
// "no FAR/DFARS clauses detected" alongside a 10-clause risk register.
//
// Implementation: uses the existing removeElementByOpenRe() balanced-range
// helper to strip each section by id. No new CSS, no template change —
// reuses the same surgical-excise pattern as removeVerdictBlock above. The
// rendered HTML feeds both the web page and the headless-Chromium PDF, so
// stripping at the renderer guarantees screen + PDF stay 1:1.
// Defect 3 (2026-06-05): when is_unscored && !is_not_solicitation (the
// metadata-only "NOT YET SCORED" state), §04 Compliance and §05 Risk Register
// render as bare section headers with no body — the data-state="full" content
// blocks have nothing to populate. The template already ships locked-card
// stand-ins (<div class="locked" data-state="locked" style="display:none">)
// for both sections, but the global CSS rule
//   [data-state="locked"]:not(.mh-verdict){display:none!important}
// keeps them hidden by default. Reveal works the same way pickVerdictBlock
// reveals the prelim verdict: drop the full-state content + strip both
// data-state="locked" AND inline display:none from the locked-card wrapper
// so the CSS hide-rule no longer matches.
function revealLockedSectionsForUnscored(html: string): string {
  let out = html;
  // Drop the full-state content blocks — they'd render empty arrays as a
  // bare header otherwise. The locked card below will take their place.
  const fullStateContent: Array<{ tag: string; field: string }> = [
    { tag: "div",  field: "compliance_flags" },
    { tag: "div",  field: "risks" }
  ];
  for (const { tag, field } of fullStateContent) {
    out = removeElementByOpenRe(
      out,
      new RegExp(`<${tag}\\b[^>]*\\bdata-field="${field}"[^>]*>`),
      tag
    );
  }
  // Also drop the right-side summary pills in §04/§05 (e.g. "1 P0 · 2 P1 · 1 P2",
  // "4 open") — they read with stale demo content when the locked card sits
  // below. Match by the data-field markers on the <span class="sh-pill ...">.
  for (const field of ["compliance_summary", "risks_summary"]) {
    out = removeElementByOpenRe(
      out,
      new RegExp(`<span\\b[^>]*\\bdata-field="${field}"[^>]*>`),
      "span"
    );
  }
  // Reveal the locked cards: strip the data-state="locked" attribute (so the
  // CSS hide-rule no longer matches) + the inline display:none. The class
  // "locked" remains so the ghost/veil treatment still applies.
  out = out.replace(
    /(<div class="locked")\s+data-state="locked"\s+style="display:none"/g,
    `$1`
  );
  return out;
}

function removeNotSolicitationSections(html: string): string {
  const sectionIds = ["sec-scope", "sec-compliance", "sec-risks", "sec-reco"];
  let out = html;
  for (const id of sectionIds) {
    out = removeElementByOpenRe(
      out,
      new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`),
      "section"
    );
    // Defect 3 (2026-06-05): strip the matching jump-nav anchor too. The
    // nav lives in <nav class="jump"> with one <a href="#sec-X">...</a> per
    // section. Anchors are simple <a>…</a> pairs (one line each in the
    // template) — a non-greedy single-line regex removes the whole element
    // including the leading whitespace so the nav collapses cleanly. Without
    // this, "JUMP TO 05 Risk register 10" remained visible on a wrong-doc
    // audit even after the section was excised — dead anchors + a phantom
    // "10 risks" badge.
    out = out.replace(
      new RegExp(`\\s*<a\\s+href="#${id}"[^>]*>[\\s\\S]*?</a>`, "g"),
      ""
    );
  }
  return out;
}

// Inject the production CTA handlers for [data-fetch] / [data-track] /
// [data-upload]. The template's bundled handler is a placeholder
// (showToast); these real handlers know the audit id and route accordingly.
// Stamped just before </body> so it wins the addEventListener race against
// the template's bundled handler (last listener registered fires last, but
// both fire — fine for our case since the template's toast is informational).
//
//   data-fetch  → POST /api/audit/<id>/refetch · spinner state on the button
//                  · reload on success · toast on failure.
//   data-track  → toast "Coming soon — auto-audit when the solicitation
//                  posts." The watcher surface isn't built; "watch" mode is
//                  also gated to "upload" rendering until it lands, so this
//                  handler shouldn't fire in production today, but stub it
//                  for safety.
//   data-upload → navigate to /audit (the existing Run Audit page) — that's
//                  where the file picker lives. The audit's notice_id is
//                  passed as ?notice= so the smart-input prefills cleanly.
function injectCtaHandlers(html: string, auditId: string, noticeId: string): string {
  const script = `
<script data-cta-handlers="audit-report">
(function(){
  var AUDIT_ID = ${JSON.stringify(auditId)};
  var NOTICE_ID = ${JSON.stringify(noticeId)};

  function setBusy(btn, busy, label){
    if (!btn) return;
    if (busy) {
      if (!btn.dataset._origText) btn.dataset._origText = btn.innerHTML;
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.7';
      btn.innerHTML = (label || 'Fetching') + '…';
    } else {
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
      if (btn.dataset._origText) { btn.innerHTML = btn.dataset._origText; delete btn.dataset._origText; }
    }
  }

  // Fetch from SAM.gov — re-pull the solicitation server-side + re-audit.
  document.querySelectorAll('[data-fetch]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      setBusy(btn, true, 'Fetching from SAM.gov');
      fetch('/api/audit/' + AUDIT_ID + '/refetch', { method: 'POST', credentials: 'include' })
        .then(function(r){ return r.json().catch(function(){return{}}).then(function(d){ return {ok:r.ok,status:r.status,data:d}; }); })
        .then(function(out){
          if (!out.ok) {
            setBusy(btn, false);
            var msg = (out.data && out.data.error) || ('Fetch failed (HTTP ' + out.status + ')');
            if (typeof window.showToast === 'function') window.showToast(msg);
            else alert(msg);
            return;
          }
          // Reload onto the freshened audit page.
          window.location.href = (out.data && out.data.redirect) || ('/audit/' + AUDIT_ID);
        })
        .catch(function(err){
          setBusy(btn, false);
          var msg = 'Network error: ' + (err && err.message ? err.message : String(err));
          if (typeof window.showToast === 'function') window.showToast(msg);
          else alert(msg);
        });
    });
  });

  // Track this opportunity — POST/DELETE /api/audit/<id>/watch.
  // The template ships a demo click handler that does a visual-only toggle;
  // we clone each button to drop the demo listener before binding ours, so
  // the API round-trip is the single source of truth for the tracking state.
  document.querySelectorAll('[data-track]').forEach(function(btn){
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', function(e){
      e.preventDefault();
      if (fresh.dataset._busy === '1') return;
      fresh.dataset._busy = '1';
      var on = fresh.classList.contains('is-tracking');
      var method = on ? 'DELETE' : 'POST';
      fetch('/api/audit/' + AUDIT_ID + '/watch', { method: method, credentials: 'include' })
        .then(function(r){ return r.json().catch(function(){return{}}).then(function(d){ return {ok:r.ok,status:r.status,data:d}; }); })
        .then(function(out){
          fresh.dataset._busy = '';
          var note = fresh.parentElement && fresh.parentElement.querySelector('.mhv-sub-note');
          if (!out.ok) {
            var msg = (out.data && out.data.error) || ('Could not update tracking (HTTP ' + out.status + ')');
            if (typeof window.showToast === 'function') window.showToast(msg);
            else alert(msg);
            return;
          }
          if (on) {
            fresh.classList.remove('is-tracking');
            fresh.innerHTML = 'Track this opportunity →';
            if (note) note.textContent = 'We’ll auto-run the full audit the moment the RFP posts.';
            if (typeof window.showToast === 'function') window.showToast('Stopped tracking');
          } else {
            fresh.classList.add('is-tracking');
            fresh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12l5 5L20 7"/></svg>Tracking';
            if (note) note.textContent = 'Watching SAM.gov — we’ll email you the moment it posts.';
            if (typeof window.showToast === 'function') window.showToast('Tracking — we’ll auto-run the audit when the solicitation posts');
          }
        })
        .catch(function(err){
          fresh.dataset._busy = '';
          var msg = 'Network error: ' + (err && err.message ? err.message : String(err));
          if (typeof window.showToast === 'function') window.showToast(msg);
          else alert(msg);
        });
    });
  });

  // Upload — navigate to the existing Run Audit page with the notice prefilled.
  document.querySelectorAll('[data-upload]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      // The template's bundled handler also fires (toast); we add the
      // navigation here so the user lands somewhere useful.
      e.preventDefault();
      var dest = '/audit';
      if (NOTICE_ID) dest += '?notice=' + encodeURIComponent(NOTICE_ID);
      window.location.href = dest;
    });
  });
})();
</script>
`;
  // Slot the script just before </body>.
  return html.replace(/<\/body>/, `${script}\n</body>`);
}

// Amber warning banner inserted immediately before the rpt-grid so it sits
// above §05 Risk Register (per DESIGN spec). Inline-styled to match the
// .moment band's amber palette without touching the template's CSS block.
function insertNotSolicitationBanner(html: string): string {
  const bannerStyle = "display:flex;align-items:flex-start;gap:14px;padding:18px 22px;background:linear-gradient(98deg,var(--amber-50),var(--card) 64%);border:1px solid var(--amber-200);border-left:4px solid var(--amber-600);border-radius:16px;box-shadow:var(--shadow);margin:18px 0";
  const icoStyle = "flex-shrink:0;width:32px;height:32px;border-radius:9px;background:var(--amber-600);color:#fff;display:grid;place-items:center";
  const eyebrowStyle = "font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--amber-800);margin:0 0 6px";
  const bodyStyle = "font-size:14px;line-height:1.55;color:var(--ink-2);margin:0;max-width:80ch";
  const banner = `
      <section style="${bannerStyle}" role="status" aria-label="Document is not a solicitation">
        <div style="${icoStyle}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
        <div style="min-width:0"><p style="${eyebrowStyle}">Not a solicitation</p><p style="${bodyStyle}">This document doesn't appear to be a solicitation — award notice, attachment, or no FAR/DFARS clauses detected. <b>Upload the actual RFP/RFQ/IFB to run a full audit.</b></p></div>
      </section>
`;
  // Insert directly before the rpt-grid so it lands between the masthead/key-
  // dates region and the §04/§05 sections that follow.
  return html.replace(
    /(<div class="rpt-grid">)/,
    `${banner}      $1`
  );
}

// FA-136: PARTIAL INGESTION banner — page-level (above the rpt-grid, same
// anchor as the not-solicitation/expired banners) when the multi-attachment
// document set was only partially ingested or the form couldn't be
// identified. Amber: the audit is real but its input set is incomplete —
// a different severity class than FA-137's red §05 collapse.
function insertIngestionBanner(html: string, note: string): string {
  const bannerStyle = "display:flex;align-items:flex-start;gap:14px;padding:18px 22px;background:linear-gradient(98deg,var(--amber-50),var(--card) 64%);border:1px solid var(--amber-200);border-left:4px solid var(--amber-600);border-radius:16px;box-shadow:var(--shadow);margin:18px 0";
  const icoStyle = "flex-shrink:0;width:32px;height:32px;border-radius:9px;background:var(--amber-600);color:#fff;display:grid;place-items:center";
  const eyebrowStyle = "font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--amber-800);margin:0 0 6px";
  const bodyStyle = "font-size:14px;line-height:1.55;color:var(--ink-2);margin:0;max-width:80ch";
  const banner = `
      <section style="${bannerStyle}" role="status" data-ingestion-incomplete aria-label="Document set partially ingested">
        <div style="${icoStyle}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
        <div style="min-width:0"><p style="${eyebrowStyle}">Document set partially ingested</p><p style="${bodyStyle}">${escapeHtml(note)}</p></div>
      </section>
`;
  return html.replace(
    /(<div class="rpt-grid">)/,
    `${banner}      $1`
  );
}

// FA-137: CALL-3 DEGRADED banner — injected as the first child of §05 Risk
// Register when compliance_json.call3.outcome === "collapsed". A collapsed
// risks call must never render as a silently empty section. Red theme +
// inline styles mirror the not-solicitation/expired banner pattern (no
// template CSS touch); data-call3-degraded is the conformance hook.
function insertCall3CollapsedBanner(html: string, note: string): string {
  const bannerStyle = "display:flex;align-items:flex-start;gap:14px;padding:18px 22px;background:linear-gradient(98deg,var(--red-50),var(--card) 64%);border:1px solid var(--red-200);border-left:4px solid var(--red-700);border-radius:16px;box-shadow:var(--shadow);margin:0 0 18px";
  const icoStyle = "flex-shrink:0;width:32px;height:32px;border-radius:9px;background:var(--red-700);color:#fff;display:grid;place-items:center";
  const eyebrowStyle = "font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--red-700);margin:0 0 6px";
  const bodyStyle = "font-size:14px;line-height:1.55;color:var(--ink-2);margin:0;max-width:80ch";
  const banner = `
        <section style="${bannerStyle}" role="status" data-call3-degraded aria-label="Risk register degraded">
          <div style="${icoStyle}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
          <div style="min-width:0"><p style="${eyebrowStyle}">Risk register degraded</p><p style="${bodyStyle}">${escapeHtml(note)}</p></div>
        </section>
`;
  // First child of §05 so the degradation is read before any risk rows.
  return html.replace(
    /(<section class="sec" id="sec-risks">)/,
    `$1${banner}`
  );
}

// FA-107: SOLICITATION CLOSED banner — injected above the recommendation card
// when vm.is_expired (response_deadline has passed). Red theme mirrors the
// amber not-solicitation banner pattern. The KO email card is suppressed
// separately at the renderKoEmailCard call site.
function insertExpiredBanner(html: string, responseDeadlineShort: string): string {
  const bannerStyle = "display:flex;align-items:flex-start;gap:14px;padding:18px 22px;background:linear-gradient(98deg,var(--red-50),var(--card) 64%);border:1px solid var(--red-200);border-left:4px solid var(--red-700);border-radius:16px;box-shadow:var(--shadow);margin:18px 0";
  const icoStyle = "flex-shrink:0;width:32px;height:32px;border-radius:9px;background:var(--red-700);color:#fff;display:grid;place-items:center";
  const eyebrowStyle = "font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--red-700);margin:0 0 6px";
  const bodyStyle = "font-size:14px;line-height:1.55;color:var(--ink-2);margin:0;max-width:80ch";
  const deadlinePhrase = responseDeadlineShort ? `Offer deadline ${escapeHtml(responseDeadlineShort)} has passed.` : "Offer deadline has passed.";
  const banner = `
      <section style="${bannerStyle}" role="status" aria-label="Solicitation is closed">
        <div style="${icoStyle}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
        <div style="min-width:0"><p style="${eyebrowStyle}">Solicitation closed</p><p style="${bodyStyle}"><b>${deadlinePhrase}</b> This audit is for reference only — no submission action is available.</p></div>
      </section>
`;
  // Insert directly before the rpt-grid so it lands between the masthead/key-
  // dates region and the §04/§05 sections that follow — same anchor as
  // insertNotSolicitationBanner for visual consistency.
  return html.replace(
    /(<div class="rpt-grid">)/,
    `${banner}      $1`
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

// ─── strip reviewer-only controls (Preview State toggle + Metadata case cycler) ─
//
// The template ships two design-review aids fixed to the bottom of the page:
//   #demoToggle   — flips IS_METADATA_ONLY at runtime so reviewers can preview
//                   full-vs-locked rendering without re-running an audit.
//   #prelimModes  — pill row that cycles data-prelim-mode (fetch/watch/upload)
//                   so reviewers can sanity-check all three preliminary states.
// Both are gated by visibility in the design (locked-only) but they're real
// DOM at production and leaked on the live audit page. Strip both server-side.
//
// The same IIFE that owns the click handlers also drives apply() and
// drawRing() — both of which we still need — so we add null guards to the
// few lines that reference the now-stripped #demoToggle, and drop the dead
// click-handler bindings entirely.
function stripReviewerControls(html: string): string {
  let out = html;
  // Strip the demo-toggle wrapper.
  const demoOpenRe = /<div class="demo-toggle" id="demoToggle">/;
  out = removeElementByOpenRe(out, demoOpenRe, "div");
  // Strip the prelim-modes cycler.
  const modesOpenRe = /<div class="prelim-modes" id="prelimModes"[^>]*>/;
  out = removeElementByOpenRe(out, modesOpenRe, "div");
  // Collapse the preceding HTML comments that documented the stripped blocks.
  out = out.replace(
    /\s*<!-- metadata-only demo toggle \(reviewer aid[^>]*-->\s*/,
    "\n"
  );
  out = out.replace(
    /\s*<!-- prelim-mode cycler \(reviewer aid[^>]*-->\s*/,
    ""
  );
  // Null-guard the lines inside apply() that touch the now-absent elements.
  out = out.replace(
    /toggle\.classList\.toggle\('on', meta\);/,
    "if(toggle) toggle.classList.toggle('on', meta);"
  );
  out = out.replace(
    /label\.textContent = meta\?'Metadata only':'Full report';/,
    "if(label) label.textContent = meta?'Metadata only':'Full report';"
  );
  // Drop the reviewer click bindings — they're dead with the controls stripped.
  out = out.replace(
    /\n\s*toggle\.addEventListener\('click', function\(\)\{ IS_METADATA_ONLY=!IS_METADATA_ONLY; apply\(IS_METADATA_ONLY\); \}\);/,
    ""
  );
  out = out.replace(
    /\n\s*if\(modesEl\) modesEl\.querySelectorAll\('\.pm-pill'\)\.forEach\(function\(p\)\{ p\.addEventListener\('click', function\(\)\{ setPrelimMode\(p\.getAttribute\('data-mode'\)\); \}\); \}\);/,
    ""
  );
  return out;
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

// FA-E2E Fix 5 (2026-06-18): strip leaked DEVELOPER / IMPLEMENTATION HTML
// comments from the shipped report. The design template documents the renderer
// wiring inline ("renderIncumbentBranch() in _render.ts", ".cmx-row repeater",
// "← matrix_rollup.reference_count", "for harness probing", "Repeater: …",
// "Renderer rebuilds inner."). These don't render visibly but ship in every
// response and leak the internal schema + code structure via View-Source / the
// PDF source. We remove only comments that reference code internals so genuine
// content comments (and the PRELIMINARY-READ anchor consumed earlier in the
// pipeline) are untouched. Runs AFTER all comment-anchored passes.
function stripDevComments(html: string): string {
  // Marker tokens that identify a comment as developer-only implementation
  // detail rather than customer-facing content.
  const devMarkers = /_render\.ts|repeater|Renderer\b|matrix_rollup|harness\s+prob|data-field|data-bucket|reviewer aid|data-state=|post hero-dedup|Renderer rebuilds/i;
  return html.replace(/<!--[\s\S]*?-->/g, (m) => (devMarkers.test(m) ? "" : m));
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
// markup can't bleed the match. Phase 2 #4 (Jun 8 2026) re-sync: .kd-sep
// divs are gone — the divider is a `.kd-item + .kd-item::before` pseudo
// that auto-reflows when a sibling is omitted, so no trailing-sep eat needed.
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
  return html.slice(0, openIdx) + html.slice(range.closeEnd);
}

// Strip the inner .cnt span (the countdown / quarter pill) from a single
// .kd-item, identified by its primary data-field (qa_deadline, response_deadline,
// award_date). Used when the secondary value is uncomputable — the date itself
// still renders, just without its sub-pill. Brief: "hide the .cnt if uncomputable".
function removeKdCnt(html: string, primaryField: string): string {
  const marker = `data-field="${primaryField}"`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return html;
  const before = html.slice(0, markerIdx);
  const itemOpen = before.lastIndexOf('<div class="kd-item');
  if (itemOpen === -1) return html;
  const itemRange = findMatchingClose(html, itemOpen, "div");
  if (!itemRange) return html;
  const itemHtml = html.slice(itemOpen, itemRange.closeEnd);
  const stripped = itemHtml.replace(/<span class="cnt"[^>]*>[\s\S]*?<\/span>/, "");
  if (stripped === itemHtml) return html;
  return html.slice(0, itemOpen) + stripped + html.slice(itemRange.closeEnd);
}

// Move the `urgent` class to whichever .kd-item carries the field with the
// smallest positive countdown. Template hardcodes urgent on the Questions-due
// item; we strip it everywhere then re-apply to the computed winner (or strip
// it entirely when no upcoming date exists). Idempotent — running twice is safe.
function applyUrgentKdItem(html: string, urgentField: "" | "qa_deadline" | "response_deadline" | "award_date"): string {
  // 1. Strip any existing `urgent` class anywhere on a .kd-item open tag.
  let out = html.replace(/<div class="kd-item urgent"/g, '<div class="kd-item"');
  if (!urgentField) return out;
  // 2. Find the .kd-item containing the target field and re-add urgent.
  const marker = `data-field="${urgentField}"`;
  const markerIdx = out.indexOf(marker);
  if (markerIdx === -1) return out;
  const before = out.slice(0, markerIdx);
  const itemOpen = before.lastIndexOf('<div class="kd-item"');
  if (itemOpen === -1) return out;
  return out.slice(0, itemOpen) + '<div class="kd-item urgent"' + out.slice(itemOpen + '<div class="kd-item"'.length);
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

// Drop §M/§L Evaluation section entirely + its jump-nav entry. Same false-
// precision gate as #sec-scorecard: when evaluation_factors is empty/null,
// the data isn't there — render nothing rather than an empty shell.
function removeEvalSection(html: string): string {
  const idx = html.indexOf('<section class="sec eval" id="sec-eval">');
  if (idx === -1) return html;
  const range = findMatchingClose(html, idx, "section");
  let out = range ? html.slice(0, idx) + html.slice(range.closeEnd) : html;
  out = out.replace(/<a href="#sec-eval">[\s\S]*?<\/a>\s*/, "");
  return out;
}

// Strip the masthead's score-benchmark .mhv-bench element specifically (the
// template has TWO .mhv-bench divs — one for score_benchmark, one for
// win_probability_benchmark — so we anchor on the inner data-field rather
// than the outer class to avoid stripping the win-probability chip too).
// Used when score_benchmark is null (compliance_score <60) so the design's
// static "Top quartile of your audits" text can't leak onto a low score.
function removeMhvBench(html: string): string {
  // Anchor: a .mhv-bench wrapper whose inner span carries
  // data-field="score_benchmark". We locate the inner span first, then walk
  // backward to the wrapper's opening `<div`.
  const spanIdx = html.indexOf('<span data-field="score_benchmark"');
  if (spanIdx === -1) return html;
  const wrapperStart = html.lastIndexOf('<div class="mhv-bench">', spanIdx);
  if (wrapperStart === -1) return html;
  const range = findMatchingClose(html, wrapperStart, "div");
  return range ? html.slice(0, wrapperStart) + html.slice(range.closeEnd) : html;
}

// Wire #sec-eval — either strip the whole section (false-precision gate on
// evaluation_factors) or replace the five data-field surfaces with engine
// output. eval_basis lives on .award-basis (icon + text); eval_basis_label
// + submission_summary live on the head pills; evaluation_factors and
// submission_requirements are repeating-row containers.
function setEvaluationSection(html: string, vm: AuditViewModel): string {
  if (vm.evaluation_factors.length === 0) {
    return removeEvalSection(html);
  }
  let out = html;
  // eval_basis_label pill — replace text when present, remove the element when null.
  if (vm.eval_basis_label) {
    out = replaceFieldInner(out, "eval_basis_label", escapeHtml(vm.eval_basis_label));
  } else {
    out = removeFieldElement(out, "eval_basis_label");
  }
  // eval_basis — replace .award-basis innerHTML (icon + text) or remove the div.
  if (vm.eval_basis) {
    const iconSvg = '<div class="ab-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg></div>';
    out = replaceFieldInner(out, "eval_basis", `${iconSvg}<div class="ab-txt">${escapeHtml(vm.eval_basis)}</div>`);
  } else {
    out = removeFieldElement(out, "eval_basis");
  }
  // evaluation_factors — repeating .sfactor rows.
  out = replaceFieldInner(out, "evaluation_factors", vm.evaluation_factors.map(renderEvalFactor).join("\n"));
  // submission_requirements — repeating .ready-row.
  out = replaceFieldInner(out, "submission_requirements", vm.submission_requirements.map(renderReadyRow).join("\n"));
  // submission_summary pill — show "N to clear" or hide entirely when null/empty.
  if (vm.submission_summary) {
    out = replaceFieldInner(out, "submission_summary", escapeHtml(vm.submission_summary));
  } else {
    out = removeFieldElement(out, "submission_summary");
  }
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
  // Use balanced walker — the lazy regex variant stops at the inner .ready
  // close and leaves the outer rail-card </div> as an orphan, which then
  // consumes the rail aside's </aside> during HTML parsing.
  const headerRe = /<div class="rail-card">\s*<div class="rc-h">Pre-quote readiness<\/div>/;
  const m = headerRe.exec(html);
  if (!m) return html;
  const range = findMatchingClose(html, m.index, "div");
  if (!range) return html;
  return html.slice(0, m.index) + html.slice(range.closeEnd);
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
                  <b style="color:var(--ink-2);font-weight:700">Clause-level detail not available for this solicitation.</b><br>The engine extracted clause references but not the required-action prose needed to render §​04. See §​07 below for the full requirement landscape.
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

// Replace the CLIN cards container with an empty-state notice when no line
// items. Card layout shares the same data-field anchor (<div class="clins">)
// so we reuse replaceFieldInner which walks balanced div boundaries (a flat
// tbody regex no longer works — children are <div class="clin"> not <tr>).
function setClinEmptyState(html: string): string {
  return replaceFieldInner(
    html,
    "clin_table",
    `\n                <div class="clin-empty" style="padding:18px 16px;text-align:center;color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:11.5px;border:1px dashed var(--line);border-radius:13px">CLIN structure not extracted — upload the full PDF to surface the line items.</div>\n              `
  );
}

// Replace the win_probability metric tile contents when the value is null
// (basis=0 / unknown). DESIGN ruling 2026-06-04: don't render 0% — it reads
// as "0% chance". Show "—" + hide the bar.
// Gap 4 (FA-119): basis is only written by the on-demand /api/win-probability
// endpoint, so a fresh audit lands here with value "—" AND benchmark "—" — a
// fully blank tile. Override the benchmark sub-line with an explicit pending
// affordance so the tile reads as "not computed yet", not "no data". We do NOT
// trigger the endpoint from the render path — it stays on-demand.
function setWinProbabilityNull(html: string): string {
  const withDash = html
    .replace(
      /(<div class="mhv-metric">[\s\S]*?<span data-field="win_probability">)\d+(<\/span><span class="u">)%(<\/span>)/,
      `$1—$2$3`
    )
    .replace(
      /(<div class="mhv-metric">[\s\S]*?<span data-field="win_probability">[\s\S]*?<div class="mhv-bar"><i style="width:)\d+%(")/,
      `$10%$2`
    );
  return replaceFieldText(withDash, "win_probability_benchmark", "Win probability — available after audit opens");
}

// ─── main entry ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// Fork 3 wiring (2026-06-05). Six new surfaces from Design's capture package.
// Each repeater follows the same pattern: locate the container by its
// data-field attribute, replace the entire inner HTML with one rendered node
// per VM data item. This strips Design's static demo children automatically
// (the CEO-flagged binding gotcha #1) — no leftover demo siblings remain.
// ═══════════════════════════════════════════════════════════════════════════

// Replace the inner HTML of an element identified by a data-field attribute.
// Tag-name discriminated because the same data-field can land on a <div>, <ol>,
// <tbody>, or <section>; we walk the matching close to know where the slice
// ends. Returns the original html unchanged when the field isn't present
// (defense-in-depth — older templates without the marker won't crash).
function setFieldInner(html: string, field: string, tagName: string, innerHtml: string): string {
  const re = new RegExp(`<${tagName}\\b[^>]*\\bdata-field="${field}"[^>]*>`);
  const m = re.exec(html);
  if (!m) return html;
  const range = findMatchingClose(html, m.index, tagName);
  if (!range) return html;
  return html.slice(0, range.contentStart) + innerHtml + html.slice(range.contentEnd);
}

// Gotcha #2 — the .exec-sum section ships hardcoded with `es-caution`. Swap to
// vm.exec_class (es-go / es-caution / es-nobid) before any inner-field work
// runs. Single replacement; the class is unique on the element.
function setExecClass(html: string, execClass: "es-go" | "es-caution" | "es-nobid"): string {
  return html.replace(
    /(<section class="exec-sum )es-(?:go|caution|nobid)(" id="sec-exec")/,
    `$1${execClass}$2`
  );
}

function renderExecFactors(html: string, factors: string[]): string {
  if (factors.length === 0) {
    // No factors to render — collapse the whole .es-factors block to keep the
    // grid layout intact (the renderer never invents content when data is empty).
    return setFieldInner(html, "exec_factors", "ol", "");
  }
  const inner = factors.map((f) => `<li>${escapeHtml(f)}</li>`).join("");
  return setFieldInner(html, "exec_factors", "ol", inner);
}

function renderExecActions(html: string, actions: Array<{ when: string; text: string }>): string {
  if (actions.length === 0) return setFieldInner(html, "exec_actions", "div", "");
  // FA-114: when the VM clamps a date past response_deadline it emits when=""
  // — skip the es-when span entirely so the action text doesn't sit next to
  // an empty CSS-styled pill.
  const inner = actions
    .map((a) => {
      const whenSpan = a.when ? `<span class="es-when">${escapeHtml(a.when)}</span>` : "";
      return `<div class="es-act">${whenSpan}<span>${escapeHtml(a.text)}</span></div>`;
    })
    .join("");
  return setFieldInner(html, "exec_actions", "div", inner);
}

// Gotcha #3 — the final gate must carry class "end" (the submission-deadline
// accent treatment in Design's CSS). All non-final gates take their status
// class (ok / warn / bad). One node per VM data item; demo siblings stripped.
function renderTimelineGates(
  html: string,
  gates: Array<{ date: string; label: string; status: "ok" | "warn" | "bad" }>
): string {
  if (gates.length === 0) return setFieldInner(html, "timeline_gates", "div", "");
  const inner = gates
    .map((g, i) => {
      const cls = i === gates.length - 1 ? "end" : g.status;
      return `<div class="tl-node ${cls}"><span class="tl-dot"></span><span class="tl-date">${escapeHtml(g.date)}</span><span class="tl-lbl">${escapeHtml(g.label)}</span></div>`;
    })
    .join("");
  return setFieldInner(html, "timeline_gates", "div", inner);
}

function renderComplianceMatrix(
  html: string,
  rows: Array<{ requirement: string; source: string; status: "action" | "risk" | "clear" }>
): string {
  if (rows.length === 0) return setFieldInner(html, "compliance_matrix", "div", "");
  // The .cmatrix data-field is on the outer <div class="cmatrix">; preserve
  // the <table> + <thead> structure and only swap the <tbody> rows. We rebuild
  // the whole inner so the template's thead chrome stays intact regardless of
  // future markup changes Design might make to it.
  const STATUS_LABEL: Record<"action" | "risk" | "clear", string> = {
    action: "Action",
    risk: "At Risk",
    clear: "Clear"
  };
  const tbody = rows
    .map((r) => `<tr><td class="cm-req">${escapeHtml(r.requirement)}</td><td><span class="cm-src">${escapeHtml(r.source)}</span></td><td><span class="cm-status ${r.status}"><span class="d"></span>${STATUS_LABEL[r.status]}</span></td></tr>`)
    .join("");
  const inner = `<table><thead><tr><th class="cm-req">Requirement</th><th>Source</th><th>Status</th></tr></thead><tbody>${tbody}</tbody></table>`;
  return setFieldInner(html, "compliance_matrix", "div", inner);
}

// §04 matrix-rollup tally render (FA-115 Pass 4 Item 3). The .cmx-counts
// strip inside §04 ships hardcoded "0 traps · 0 full-text · 0 by reference"
// because no renderer was filling matrix_rollup.{trap_count,fulltext_count,
// reference_count}. FA-103's fallback populated the flag rows but not these
// rollup tallies, leaving the badge contradicting §04's flag header above.
//
// Single-source-of-truth fix: derive trap_count from the SAME compliance_flags
// array the §04 header pill reads. Traps = P0/P1 dfars flags (the items §04
// renders as P0 hex chrome + P1 amber rows). fulltext_count + reference_count
// come from compliance_matrix (status === "action" for full-text, the rest
// reference-only). The badge can never disagree with §04 again because both
// surfaces read the same VM array.
// Trap tally chokepoint: the §04 .cmx-tally trap count ALWAYS derives from the
// same P0/P1 compliance_flags the §04 header pill reads — the V2 overlay's
// matrix-badge-derived count can contradict it, so this re-pins after overlay.
function renderTrapTally(html: string, flags: ComplianceFlag[]): string {
  const trapCount = flags.filter((f) => f.severity === "P0" || f.severity === "P1").length;
  return html.replace(
    /(<span[^>]*\bdata-field="matrix_rollup\.trap_count"[^>]*>)[\s\S]*?(<\/span>)/g,
    `$1${trapCount}$2`
  );
}

function renderMatrixRollupCounts(
  html: string,
  flags: ComplianceFlag[],
  matrixRows: Array<{ requirement: string; source: string; status: "action" | "risk" | "clear" }>
): string {
  const fulltextCount = matrixRows.filter((r) => r.status === "action").length;
  const referenceCount = Math.max(0, matrixRows.length - fulltextCount);
  let out = renderTrapTally(html, flags);
  out = out.replace(
    /(<span[^>]*\bdata-field="matrix_rollup\.fulltext_count"[^>]*>)[\s\S]*?(<\/span>)/g,
    `$1${fulltextCount}$2`
  );
  out = out.replace(
    /(<(?:span|b)[^>]*\bdata-field="matrix_rollup\.reference_count"[^>]*>)[\s\S]*?(<\/(?:span|b)>)/g,
    `$1${referenceCount}$2`
  );
  return out;
}

// §07 matrix-artifact card render — Jun 8 2026 export-parity Phase 1.
// Drives the compact export card markup (canonical §07) from the same
// vm.compliance_matrix array the old table render used. Populates the
// header count pill (matrix_count) + the body summary sentence
// (matrix_rollup.summary). The export link href is set separately in the
// main render flow via the data-field="matrix_export_url" regex.
function renderMatrixArtifact(
  html: string,
  rows: Array<{ requirement: string; source: string; status: "action" | "risk" | "clear" }>
): string {
  const total = rows.length;
  const actionCount = rows.filter((r) => r.status === "action").length;
  const riskCount = rows.filter((r) => r.status === "risk").length;
  const clearCount = total - actionCount - riskCount;

  const countPill = total === 1 ? "1 requirement" : `${total} requirements`;
  // Summary sentence mirrors canonical voice. When zero requirements are
  // extracted (metadata-only paths or pre-render edge cases), emit a
  // truthful empty-state instead of a contradictory "All 0 mapped" string.
  // FA-127d: the rollup must count what the rows actually say. The old line
  // lumped 'risk' rows into "present and verified" and printed "0 need
  // offeror action" beside open risks — now each status gets its own segment
  // and zero-count segments are omitted instead of printed as "0 need …".
  let summary: string;
  if (total === 0) {
    summary = "Compliance matrix not yet available for this audit.";
  } else {
    const segs: string[] = [];
    if (actionCount > 0) segs.push(`<b>${actionCount} need${actionCount === 1 ? "s" : ""} offeror action</b>`);
    if (riskCount > 0) segs.push(`${riskCount} requirement${riskCount === 1 ? "" : "s"} flagged for review`);
    if (clearCount > 0) segs.push(`${clearCount} ${clearCount === 1 ? "is a standard clause" : "are standard clauses"} incorporated by reference, present and verified`);
    const tail = segs.length > 0
      ? segs.join(", ")
      : "<b>none need offeror action</b>";
    summary = `All ${total} solicitation requirements mapped to a response obligation &mdash; ${tail}.`;
  }

  // <span data-field="matrix_count"> in the sec-head pill
  let out = html.replace(
    /(<span[^>]*\bdata-field="matrix_count"[^>]*>)[\s\S]*?(<\/span>)/,
    `$1${escapeHtml(countPill)}$2`
  );
  // <p class="ma-h" data-field="matrix_rollup.summary"> in the card body — keep
  // bolded action count by injecting raw HTML (escapeHtml the dynamic counts).
  out = out.replace(
    /(<p class="ma-h" data-field="matrix_rollup\.summary">)[\s\S]*?(<\/p>)/,
    `$1${summary}$2`
  );
  return out;
}

// Gotcha #4 — the .checklist denominator ("N/10") is computed CLIENT-SIDE by
// the resolver JS (totalEl.textContent = items.length). We do NOT pre-compute
// the count or stamp it in the server-rendered markup; the JS auto-corrects
// off the rendered <label> count. Just render the groups + items verbatim.
// §09 — Phase 2 #1 (F1 catastrophic fix, Jun 8 2026). Emits up to 6 .ck-group
// blocks (deadline → registration → mandatory_doc → representation → format
// → other) inside the canonical's data-field="submission_checklist_filtered"
// wrapper. Critical buckets get .ck-group.is-critical styling. Items are
// already deduped + bucketed in the viewmodel.
function renderSubmissionChecklist(
  html: string,
  groups: AuditViewModel["submission_checklist_filtered"]
): string {
  if (groups.length === 0) return setFieldInner(html, "submission_checklist_filtered", "div", "");
  const inner = groups
    .map((g) => {
      const items = g.items
        .map(
          (it) =>
            `<label class="ck-item${it.isCritical ? " is-critical" : ""}"><input type="checkbox"><span class="ck-box"></span><span class="ck-txt">${escapeHtml(it.text)}<span class="ck-csrc">${escapeHtml(it.source)}</span></span></label>`
        )
        .join("");
      return `<div class="ck-group${g.critical ? " is-critical" : ""}" data-bucket="${g.bucket}"><div class="ck-gh">${escapeHtml(g.label)}</div>${items}</div>`;
    })
    .join("");
  return setFieldInner(html, "submission_checklist_filtered", "div", inner);
}

// §02 incumbent branch. The template ships both .incumbent (visible) and
// .inc-none (hidden via inline display:none + data-state="none"). When
// vm.has_incumbent is true, strip the .inc-none block entirely (keeps the
// default-rendered .incumbent unchanged). When false, swap: strip .incumbent
// and reveal .inc-none by removing the inline style + data-state attrs.
//
// Brain QA Item 2 (2026-06-05): SPRRA had no incumbent and §02 came out
// empty (jump-nav + body both jumped 01→03). The prior reveal regex demanded
// data-state + style attrs in a strict order with single whitespace between;
// it didn't match Design's emitted markup in all variants. Switched to two
// independent attribute strips so order/spacing variations don't matter.
function renderIncumbentBranch(html: string, hasIncumbent: boolean): string {
  if (hasIncumbent) {
    // Strip the .inc-none block — broader opener-regex so attribute order
    // doesn't matter. The element wrapper is removed; §02 still renders
    // the live .incumbent block below.
    return removeElementByOpenRe(
      html,
      /<div\b[^>]*\bclass="inc-none"[^>]*>/,
      "div"
    );
  }
  // No incumbent. Strip the .incumbent block (broader regex tolerates
  // additional classes / attributes / whitespace) and REWRITE the
  // .inc-none opener wholesale to a clean `<div class="inc-none">` —
  // strips every "hidden by default" attribute in one shot. The prior
  // per-attribute regex was order-sensitive and missed Design's emitted
  // variants on real audits. §02 sec-incumbent wrapper stays intact;
  // the .inc-none copy renders inside it.
  let out = removeElementByOpenRe(
    html,
    /<div\b[^>]*\bclass="incumbent"[^>]*>/,
    "div"
  );
  out = out.replace(
    /<div\b[^>]*\bclass="inc-none"[^>]*>/,
    '<div class="inc-none">'
  );
  return out;
}

// Replace inner HTML by class name (rather than data-field). Used when two
// elements share the same data-field key but live in different containers
// (gate_conditions appears on .mhv-gates masthead and .g-rows in §06 — both
// need DIFFERENT inner content per surface).
function setInnerByClass(html: string, className: string, tagName: string, innerHtml: string): string {
  const re = new RegExp(`<${tagName}\\b[^>]*\\bclass="${className}\\b[^"]*"[^>]*>`);
  const m = re.exec(html);
  if (!m) return html;
  const range = findMatchingClose(html, m.index, tagName);
  if (!range) return html;
  return html.slice(0, range.contentStart) + innerHtml + html.slice(range.contentEnd);
}

// Brain QA Item 1 (2026-06-05 follow-up): gate-mode wiring. Two surfaces
// carry the same data-field="gate_conditions" but live in distinct class
// containers — .mhv-gates (masthead) needs compact one-line rows; .g-rows
// (§06 interactive card) needs verbose detail rows + blocker notes. The
// prior implementation used setFieldInner twice with the same data-field
// key, but setFieldInner is single-match and both calls hit the masthead,
// leaving §06 at its static demo. Switched to setInnerByClass for both —
// each surface targeted by its unique class name.
function renderGateConditions(
  html: string,
  conditions: Array<{ title: string; context: string; citation: string; blocker_note: string }>,
  gateModeActive: boolean
): string {
  if (!gateModeActive || conditions.length === 0) {
    // No real gate applies to THIS solicitation. The template ships the gate
    // shells with HARDCODED DoD demo tiles (SPRS / JCP / CAGE / an H-60 part
    // number) as design mock content. If we leave them and the client reveals
    // the gate (score_locked → applyVerdictMode('gate')), that fabricated
    // defense content ships on a non-defense report. The prior element-removal
    // (removeElementByOpenRe) missed the nested .mhv-gates, so the demo leaked.
    // CLEARING the inner content is nesting-proof and guarantees nothing fake
    // can render — empty containers show nothing.
    let cleared = setInnerByClass(html, "mhv-gates", "div", "");
    cleared = setInnerByClass(cleared, "g-rows", "div", "");
    return cleared;
  }
  // Masthead .mhv-gates — preserves the cap "<p class='mhv-gates-cap'>" prelude.
  const mhvCap = `<p class="mhv-gates-cap">Bid only if — all true today</p>`;
  const mhvRows = conditions
    .map((c) => {
      const detail = c.context
        ? `${escapeHtml(c.context)}${c.citation && c.citation !== "—" ? ` &middot; ${escapeHtml(c.citation)}` : ""}`
        : (c.citation && c.citation !== "—" ? escapeHtml(c.citation) : "");
      return `<div class="mhv-gate"><span class="gk"></span><span class="gx"><b>${escapeHtml(c.title)}</b>${detail ? ` — ${detail}` : ""}</span></div>`;
    })
    .join("");
  let out = setInnerByClass(html, "mhv-gates", "div", mhvCap + mhvRows);
  // §06 .g-rows — verbose detail rows.
  const gRows = conditions
    .map((c) => {
      const detail = `<code>${escapeHtml(c.citation)}</code>${c.context ? ` — ${escapeHtml(c.context)}` : ""}`;
      const blocker = c.blocker_note ? `<span class="g-blocker">${escapeHtml(c.blocker_note)}</span>` : "";
      return `<div class="g-row"><span class="gbx"></span><div><div class="gt">${escapeHtml(c.title)}</div><div class="gd">${detail}${blocker}</div></div></div>`;
    })
    .join("");
  out = setInnerByClass(out, "g-rows", "div", gRows);
  // .gs-cnt initial denominator — resolver IIFE recomputes on click but
  // the static initial render needs the correct N.
  out = out.replace(
    /<span class="gs-cnt">0 \/ \d+<\/span>/,
    `<span class="gs-cnt">0 / ${conditions.length}</span>`
  );
  return out;
}

// Canonicalization layer wiring (Brain ruling 2026-06-06). Applies the
// canonical verdict word + canonical §06 gate-card prose server-side, so
// every surface (masthead, exec, §06 verdict + lead + count + pill) reads
// the SAME computed values. The template's display-layer IIFEs (verdict
// normalizer, gate resolver) run idempotently over canonical values —
// they'd compute the same thing.
//
// Specifically replaces these hardcoded Design demo strings:
//   "NO-BID — unless all three are true today"  → vm.gate_card.verdict_text
//   "This is a small-business LPTA …"           → vm.gate_card.lead_text
//   "0 / 3"                                      → vm.gate_card.count_text
function applyCanonicalVerdict(html: string, vm: AuditViewModel): string {
  let out = html;
  // 1. Masthead .mhv-word — set to canonical word (already set by
  //    pickVerdictBlock/normalizer chain; this is belt-and-suspenders).
  //    The verdict-word IIFE in the template will re-set this to the same
  //    value off the TONE class — idempotent.
  out = replaceFieldInner(out, "recommendation", escapeHtml(vm.verdict_word));
  // 2. Exec card .es-vw verdict word.
  out = replaceFieldInner(out, "exec_verdict", escapeHtml(vm.verdict_word));
  // 3. §06 gate-card surfaces:
  //    .gate-verdict (inside .gc-h)         ← gate_card.verdict_text
  //    .gc-lead                              ← gate_card.lead_text
  //    .gs-cnt                               ← gate_card.count_text
  //    .gs-pill                              ← gate_card.pill_text
  out = replaceFieldInner(out, "gate_verdict", escapeHtml(vm.gate_card.verdict_text));
  out = replaceFieldInner(out, "gate_lead", escapeHtml(vm.gate_card.lead_text));
  // .gs-cnt is the small <span class="gs-cnt"> inside the .g-status row.
  // No data-field marker — match by class.
  out = out.replace(
    /(<span class="gs-cnt">)[^<]*(<\/span>)/g,
    `$1${escapeHtml(vm.gate_card.count_text)}$2`
  );
  // .gs-pill — set initial text to the canonical pill_text. Initial render
  // state only; the §06 resolver IIFE flips this to BID when all rows are
  // ticked client-side.
  out = out.replace(
    /(<span class="gs-pill )(?:go|no|caution)("[^>]*>)[^<]*(<\/span>)/g,
    `$1${vm.gate_card.pill_text === "BID" ? "go" : vm.gate_card.pill_text === "CAUTION" ? "caution" : "no"}$2${escapeHtml(vm.gate_card.pill_text)}$3`
  );
  // FA-165: flag curability on the gate card so the §06 resolver renders an
  // uncleared curable gate as CAUTION (amber), matching the masthead — not a
  // hard NO-BID. (curable = pill_text is anything other than "NO-BID".)
  out = out.replace(
    '<div class="gate-card" id="reco-gate" style="display:none" data-field="gate_block">',
    `<div class="gate-card" id="reco-gate" style="display:none" data-curable="${vm.gate_card.pill_text === "NO-BID" ? "false" : "true"}" data-field="gate_block">`
  );
  // Phase 3 E7 (F7) — .g-oc.win and .g-oc.no <b>...</b> outcome lead words.
  // Template ships hardcoded 'All three ✓' / 'Any ✗' which contradicts a
  // 2-gate audit's actual gate count. Renderer regex-replaces only the <b>
  // content with vm.gate_card.outcome_win_lead / outcome_no_lead, which are
  // derived from gate count in deriveGateCardProse (Both for n=2, All three
  // for n=3, All N for n≥4, conditional for n=1).
  out = out.replace(
    /(<div class="g-oc win"><b>)[\s\S]*?(<\/b>)/,
    `$1${escapeHtml(vm.gate_card.outcome_win_lead)}$2`
  );
  out = out.replace(
    /(<div class="g-oc no(?:\s+active)?"><b>)[\s\S]*?(<\/b>)/,
    `$1${escapeHtml(vm.gate_card.outcome_no_lead)}$2`
  );
  // FA-115 Pass 4 Item 5 — outcome TAILS (text after </b>). The template's
  // demo tail ("→ straightforward LPTA win on price + packaging. Low
  // competition.") previously leaked on active gate-mode reports and could
  // contradict §M's award basis. VM-derived tails reference the single
  // evaluation framing (eval_basis_label). applyClosedBidGate still runs
  // after this for expired reports and overwrites with past-tense framing.
  out = out.replace(
    /(<div class="g-oc win"><b>[\s\S]*?<\/b>)[^<]*(<\/div>)/,
    `$1${escapeHtml(vm.gate_card.outcome_win_tail)}$2`
  );
  out = out.replace(
    /(<div class="g-oc no(?:\s+active)?"><b>[\s\S]*?<\/b>)[^<]*(<\/div>)/,
    `$1${escapeHtml(vm.gate_card.outcome_no_tail)}$2`
  );
  return out;
}

// Inject the applyVerdictMode('gate') call after DOM load. The template
// already defines window.applyVerdictMode; we just need to invoke it once.
// Stamped just before </body> so the template's own setup IIFEs (which
// register applyVerdictMode + the interactive resolver) have already
// executed by the time this fires.
function injectVerdictModeCall(html: string): string {
  const script = `<script data-verdict-mode-gate>document.addEventListener('DOMContentLoaded',function(){if(typeof window.applyVerdictMode==='function')window.applyVerdictMode('gate');});</script>`;
  return html.replace(/<\/body>/, `${script}\n</body>`);
}

// KO email card — to/subject/preview. The .to anchor wraps a Cloudflare
// email-decode artifact (data-cfemail obfuscation auto-pasted by Design's
// static-host export); replacing the data-field inner with the real address
// strips the obfuscation wrapper cleanly.
//
// Switched 2026-06-05 from setFieldInner (single-match, tag-discriminated)
// to replaceFieldInner (global walker, tag-agnostic) per the Design QA
// dedup gotcha. If the template ever ships with the same data-field on
// multiple elements (e.g. a future drawer mirror of the card preview), the
// global walker keeps both in sync rather than letting one drift to the
// static demo value.
// §03 — Phase 2 #3 (Jun 8 2026). Reveals EXACTLY ONE of the two .ws-reveal
// blocks. Floor invariant: §03 never silently loses the reveal — the unknown
// amber variant is the no-data state, NOT the no-render state.
//
// Implementation: do NOT strip the unused block. Both blocks ship with
// style="display:none" in the template; we remove that inline style from
// the CHOSEN block (un-hiding it) and leave the OTHER block exactly as-is
// (still display:none, invisible to users + filtered out by the E13
// detector). This avoids tag-balanced strip regex pitfalls — earlier attempt
// used /[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/ which non-greedy-matched
// THROUGH both blocks (the known block only ends in 2 trailing </div>; the
// first 3-in-a-row appears at the end of the unknown block).
function renderWorkStatementReveal(
  html: string,
  ws: AuditViewModel["work_statement"],
  wsu: AuditViewModel["work_statement_unknown"]
): string {
  if (ws) {
    // Un-hide known. Unknown stays display:none.
    let out = html.replace(
      /<div class="ws-reveal" data-state="known" data-field="work_statement" style="display:none">/,
      `<div class="ws-reveal" data-state="known" data-field="work_statement">`
    );
    out = out.replace(
      /(<span data-field="work_statement\.confidence_label">)[\s\S]*?(<\/span>)/,
      `$1${escapeHtml(ws.confidence)}$2`
    );
    out = out.replace(
      /(<span class="ws-abbr" data-field="work_statement\.abbr">)[\s\S]*?(<\/span>)/,
      `$1${escapeHtml(ws.abbr)}$2`
    );
    out = out.replace(
      /(<span class="ws-full" data-field="work_statement\.full">)[\s\S]*?(<\/span>)/,
      `$1${escapeHtml(ws.full)}$2`
    );
    out = out.replace(
      /(<p class="ws-mean" data-field="work_statement\.meaning">)[\s\S]*?(<\/p>)/,
      `$1${ws.meaning}$2`
    );
    out = out.replace(
      /(<span class="ev-cite" data-field="work_statement\.evidence">)[\s\S]*?(<\/span>)/,
      `$1${escapeHtml(ws.evidence)}$2`
    );
    out = out.replace(
      /(<p class="wst-t" data-field="work_statement\.bid_strategy">)[\s\S]*?(<\/p>)/,
      `$1${ws.bid_strategy}$2`
    );
    return out;
  }
  if (wsu) {
    // Un-hide unknown. Known stays display:none.
    let out = html.replace(
      /<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown" style="display:none">/,
      `<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown">`
    );
    out = out.replace(
      /(<span class="ws-full" data-field="work_statement_unknown\.head">)[\s\S]*?(<\/span>)/,
      `$1${escapeHtml(wsu.head)}$2`
    );
    out = out.replace(
      /(<p class="ws-mean" data-field="work_statement_unknown\.reason">)[\s\S]*?(<\/p>)/,
      `$1${wsu.reason}$2`
    );
    out = out.replace(
      /(<span class="wsi-t" data-field="work_statement_unknown\.action">)[\s\S]*?(<\/span>)/,
      `$1${wsu.action}$2`
    );
    return out;
  }
  // Floor invariant: should never reach here (derivation always returns one
  // of the two). If we do, leave the template's hidden defaults — better
  // than throwing in the render path.
  return html;
}

// §03 contract: the final DOM carries EXACTLY ONE .ws-reveal block. V1
// (renderWorkStatementReveal above) and the V2 overlay (renderWorkStatement in
// _v2-render-surfaces.ts) each un-hide their OWN derivation's block without
// touching the other; when they disagree, both end up visible (Army live-DOM
// case, Jun 11). Runs as a final pass in renderAuditReportComplete — after the
// V2 overlay — and removes the loser via the tag-balanced walker (E13 lesson:
// never strip with a non-greedy [\s\S]*? regex, it matched THROUGH both
// blocks). Known wins ties because it is only ever un-hidden when populated;
// if neither was un-hidden, the unknown no-data variant is kept (still hidden)
// so the count invariant holds without inventing visible content.
function enforceSingleWorkStatementReveal(html: string): string {
  const knownOpenRe =
    /<div class="ws-reveal" data-state="known" data-field="work_statement"[^>]*>/;
  const unknownOpenRe =
    /<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown"[^>]*>/;
  const known = knownOpenRe.exec(html);
  const unknown = unknownOpenRe.exec(html);
  if (!known || !unknown) return html;
  const knownVisible = !/display:\s*none/.test(known[0]);
  const unknownVisible = !/display:\s*none/.test(unknown[0]);
  if (knownVisible && unknownVisible) {
    console.warn(
      "[ws-reveal] V1/V2 disagreement: both blocks visible — keeping known, removing unknown"
    );
  }
  return removeElementByOpenRe(html, knownVisible ? unknownOpenRe : knownOpenRe, "div");
}

function renderKoEmailCard(
  html: string,
  ko: { to: string; to_found: boolean; subject: string; preview: string; has_asks: boolean }
): string {
  let out = replaceFieldInner(html, "ko_email.to", escapeHtml(ko.to));
  out = replaceFieldInner(out, "ko_email.subject", escapeHtml(ko.subject));
  out = replaceFieldInner(out, "ko_email.preview", escapeHtml(ko.preview).replace(/\n/g, "<br>"));
  // Brain QA Item 3 (2026-06-05): preview-duplicate defense. If any
  // additional <p class="ko-preview">…</p> elements exist in the rendered
  // HTML beyond the canonical one (cloned by some downstream pass, or a
  // hidden Design variant the re-pull pasted), keep the first and remove
  // the rest. Single-source-of-truth guarantee for the preview surface.
  out = dedupeKoPreview(out);
  // FA-125 clarifiability gate — when no substantive asks exist there is no
  // draft email: the "Draft ready" pill and the open/copy actions would
  // promise one. Swap the §08 header chrome to the no-clarifications state
  // and drop the action buttons (which also makes the drawer unreachable).
  if (!ko.has_asks) {
    out = applyKoClarifiabilityGate(out);
  }
  return out;
}

function applyKoClarifiabilityGate(html: string): string {
  // No trailing ">" — the opener carries data-hide-when-empty="ko_email".
  const start = html.indexOf('<section class="sec" id="sec-ko"');
  if (start === -1) return html;
  const end = html.indexOf("</section>", start);
  if (end === -1) return html;
  let block = html.slice(start, end);
  block = block.replace(
    /<span class="sh-pill ok">[\s\S]*?<\/span>/,
    '<span class="sh-pill">No clarifications needed</span>'
  );
  block = block.replace(
    /<span class="st-sub">[\s\S]*?<\/span>/,
    '<span class="st-sub">No Contracting Officer questions required for this audit</span>'
  );
  // Buttons contain only svg/path children, so the lazy match closes on the
  // ko-actions div itself.
  block = block.replace(/<div class="ko-actions">[\s\S]*?<\/div>/, "");
  return html.slice(0, start) + block + html.slice(end);
}

function dedupeKoPreview(html: string): string {
  const re = /<p class="ko-preview"\b[^>]*>[\s\S]*?<\/p>/g;
  let count = 0;
  return html.replace(re, (match) => {
    count++;
    return count === 1 ? match : "";
  });
}

// FA-112: visibility suppression for the .ko-card section. Used when
// vm.is_expired === true. Anchors INSIDE the card are still replaced by
// renderKoEmailCard before this strip runs — preserves the no-demo-leak
// invariant even though the card never reaches the viewport.
function removeKoEmailCard(html: string): string {
  // Regex note: no `\b` after the quoted class — \b doesn't match between two
  // non-word chars (`"` and the following space/`>`), so removeElementByOpenRe
  // would silently no-op. [^>]*> handles any following attributes safely.
  return removeElementByOpenRe(html, /<div class="ko-card"[^>]*>/, "div");
}

// §08 KO-email empty-guard (canonical, Jun 11) — server-side mirror of the
// template's sec-ko IIFE for PDF/no-JS readers. Canonical rule: zero text in
// the first of .ko-preview/.ko-print-full/.ko-card → hide §08, its jump-nav
// entry, and every [data-open-ko] outside #sec-ko (incl. the masthead
// .ma-btn — a dead "Fix it in the KO email" CTA). Trigger case: closed-mode
// removeKoEmailCard strips the whole .ko-card, leaving a "ready to send"
// header over an empty body with a live "Send KO email" CTA on a dead
// deadline (FA930126Q0017). Open-mode cards always carry To/Subject label
// text, so this is a no-op for active audits with a draft.
function stripEmptyKoSection(html: string): string {
  const secOpenRe = /<section class="sec" id="sec-ko"[^>]*>/;
  const secM = secOpenRe.exec(html);
  if (!secM) return html;
  const secEnd = html.indexOf("</section>", secM.index);
  if (secEnd === -1) return html;
  const section = html.slice(secM.index, secEnd);
  const bodyM = /<(p|div) class="(?:ko-preview|ko-print-full|ko-card)"[^>]*>/.exec(section);
  let text = "";
  if (bodyM) {
    const range = findMatchingClose(section, bodyM.index, bodyM[1]);
    if (range) {
      text = section
        .slice(range.contentStart, range.contentEnd)
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, "");
    }
  }
  if (text) return html;
  let out = removeElementByOpenRe(html, secOpenRe, "section");
  out = out.replace(/<a href="#sec-ko">[\s\S]*?<\/a>\s*/i, "");
  // Section removal already dropped the in-section KO buttons; every markup
  // [data-open-ko] left (rail CTA, masthead .ma-btn) is a <button> and dies
  // here. Script-text mentions of the attribute don't match the open-tag re.
  for (;;) {
    const next = removeElementByOpenRe(out, /<button[^>]*\sdata-open-ko[^>]*>/, "button");
    if (next === out) break;
    out = next;
  }
  return out;
}

// ─── FA-114: closed-state report-wide mode ────────────────────────────────
// All functions below are no-ops on active audits and only invoked when
// vm.is_expired === true. They run AFTER the normal renderers populate the
// dynamic data-field anchors, so they operate on the final rendered HTML
// (real data already in place). Demo-leak guard runs as the LAST step in
// renderAuditReportComplete and catches any residue.

// (1) Hero gate — strip "today" voice from the gate_verdict / .gs-k counter.
// The recommendation word (NO-BID / PROCEED / CAUTION) stays — it's the
// historical verdict, valid regardless of whether the solicitation is still
// open. Only the imperative-present-tense framing changes.
function applyClosedHeroGate(html: string): string {
  let out = html;
  // gate_verdict text: drop "today" imperative (template uses unicode "—" not "&mdash;")
  out = out.replace(/unless all three are true today/gi, "based on conditions as posted");
  out = out.replace(/are true today/gi, "were true as posted");
  // .gs-k header structure: <span class="gs-k">Bid gate — <b><span class="gs-cnt">N / M</span></b> cleared</span>
  // Match through the nested <b><span>...</span></b> and any text after, ending at the OUTER </span>.
  out = out.replace(
    /(<span class="gs-k">)Bid gate (?:—|&mdash;)[\s\S]*?<\/b>[^<]*(<\/span>)/,
    "$1Bid gate &mdash; <b>as posted</b>$2"
  );
  return out;
}

// (2) Critical path — replace the .tl-sub "Submit by ... N steps" with a
// reference-mode "Closed ... — requirements as posted" line.
function applyClosedCriticalPath(html: string, responseDeadlineShort: string): string {
  const dateLabel = responseDeadlineShort && responseDeadlineShort.trim().length > 0
    ? escapeHtml(responseDeadlineShort)
    : "the response deadline";
  return html.replace(
    /<div class="tl-sub">[\s\S]*?<\/div>/,
    `<div class="tl-sub">Closed ${dateLabel} &mdash; requirements as posted</div>`
  );
}

// (3) Strip the entire "Next 48 hours" .es-col block. There are sibling
// .es-col elements (e.g. the verdict-factors column) — anchor on the actual
// "Next 48 hours" header position, then walk BACK to find the enclosing
// .es-col open tag and forward to its matching close.
function removeNext48HoursBlock(html: string): string {
  const headerNeedle = '<p class="es-h">Next 48 hours</p>';
  const headerIdx = html.indexOf(headerNeedle);
  if (headerIdx < 0) return html;
  const before = html.slice(0, headerIdx);
  const esColOpen = before.lastIndexOf('<div class="es-col">');
  if (esColOpen < 0) return html;
  const range = findMatchingClose(html, esColOpen, "div");
  if (!range) return html;
  return html.slice(0, esColOpen) + html.slice(range.closeEnd);
}

// (4) §09 Submission Checklist — swap header subtitle to reference framing,
// and strip interactive checkbox inputs inside the .checklist (items render
// as plain reference list). The "N / M complete" counter is REMOVED (CEO,
// Jun 11 — reverses the earlier counter-STAYS ruling): a progress tracker on
// a closed bid is incoherent (FA930126Q0017 showed "0 / 1 complete"). The
// removal is tag-balanced — the JLG pg-13 bug came from a non-greedy regex
// that ended at the NESTED ckTotal </span>, leaving a dangling "complete".
function applyClosedChecklistHeader(html: string): string {
  let out = html;
  out = removeElementByOpenRe(out, /<span class="ck-prog"[^>]*>/, "span");
  // Target the §09 st-sub specifically (multiple st-sub spans exist in the
  // template; .replace without /g would otherwise hit the first one). The
  // <span> directly follows "Submission Checklist" text.
  out = out.replace(
    /(>Submission Checklist<span class="st-sub">)[^<]*(<\/span>)/,
    "$1Reference &mdash; submission requirements as posted$2"
  );
  // Strip interactive checkbox inputs within the checklist section. Use a
  // permissive regex so attribute order / quoting style doesn't matter.
  const checklistOpen = out.indexOf('<div class="checklist"');
  const checklistEnd = checklistOpen >= 0 ? out.indexOf("</section>", checklistOpen) : -1;
  if (checklistOpen >= 0 && checklistEnd > checklistOpen) {
    const segment = out.slice(checklistOpen, checklistEnd);
    const stripped = segment.replace(/<input\b[^>]*type=['"]?checkbox['"]?[^>]*>/gi, "");
    out = out.slice(0, checklistOpen) + stripped + out.slice(checklistEnd);
  }
  // With the inputs stripped, the canonical §09 IIFE counts zero
  // `.ck-item input` and hides the section + jump-nav (its empty guard) —
  // then would overwrite ckTotal with 0. Closed mode is a static reference
  // list with a server-rendered counter, so remove the IIFE entirely.
  out = out.replace(/\/\* ───── §09 submission checklist[\s\S]*?\}\)\(\);/, "");
  return out;
}

// (5) §06 Bid Gate outcomes — past-tense framing. applyCanonicalVerdict
// already touches the <b>...</b> lead words; we swap the trailing text after
// each <b>. The "no" outcome's "Track for the next solicitation" becomes the
// primary forward-looking action. Factual — no invented recompete dates.
function applyClosedBidGate(html: string): string {
  let out = html;
  out = out.replace(
    /(<div class="g-oc win"><b>[\s\S]*?<\/b>)[^<]*(<\/div>)/,
    "$1 &mdash; conditions required at submission to win.$2"
  );
  out = out.replace(
    /(<div class="g-oc no(?:\s+active)?"><b>[\s\S]*?<\/b>)[^<]*(<\/div>)/,
    "$1 &mdash; track the next acquisition for this requirement.$2"
  );
  return out;
}

// (6) Inverse of the FA-114 closed passes: when vm.is_expired === false the
// solicitation is OPEN, but a report PERSISTED while its deadline read as past
// (e.g. the 2031-PoP-end VM bug, or a passed interim-milestone date) carries
// engine-emitted closed-state prose in exec_what / exec_actions / verdict
// strings — see audit-engine.ts emitting "this solicitation has closed …",
// "Response deadline has passed. …" into complianceJson.executive_summary.
// On an open sol those assertions are flatly wrong (audit-3: OPEN chip but
// "has closed" prose). Neutralize ONLY the clauses that ASSERT closure/expiry,
// rewriting to forward/neutral language. Conservative by design: leaves all
// legitimate forward-looking copy ("submit by", "due", "deadline: <date>") and
// the recompete-TIMELINE copy (incumbent/expiry section) untouched — those
// never contain a "has closed"/"has passed" assertion. Mirrors the apply*
// string-transform style above.
function scrubStaleClosedLanguage(html: string): string {
  let out = html;
  // exec_what (engine: deadlineClosed branch) — full sentence, neutral rewrite.
  out = out.replace(
    /this solicitation has closed (?:—|&mdash;) use this analysis for recompete preparation and incumbent benchmarking\./gi,
    "the solicitation is open — use this analysis to prepare a competitive response."
  );
  // exec_actions[0] "Closed" note (engine: execActionsFinal closed branch).
  out = out.replace(
    /Response deadline has passed\. Use this audit for recompete preparation and incumbent benchmarking ahead of the next cycle\./gi,
    "Response deadline is still open. Use this audit to drive the bid decision and shape a compliant response."
  );
  // metadata-only bidStrategy closed branch.
  out = out.replace(
    /Response deadline has passed\. Confirm whether the opportunity is still active before pursuing\./gi,
    "Confirm the response deadline against the live SAM.gov posting before committing resources."
  );
  // Generic backstops — ONLY for assertions anchored to the SOLICITATION or the
  // OFFER SUBMISSION window (the overall open/closed state we positively know is
  // OPEN here). Deliberately NOT scrubbing bare "deadline has passed" / "has
  // closed": those can legitimately describe a passed SUB-window (Q&A, site
  // visit, registration) that is genuinely closed even on an open sol — a false
  // rewrite there would invent a fact (conservative: under-scrub > lie).
  out = out.replace(/the submission window has closed/gi, "the submission window is open");
  out = out.replace(/submission window has closed/gi, "submission window is open");
  out = out.replace(/this solicitation has closed/gi, "this solicitation is open");
  // RC4(e) (2026-06-19) — extend the backstops to model-emitted closure
  // ASSERTIONS anchored to the overall opportunity/offer state, which we
  // positively know is OPEN here (is_expired === false). These were leaking
  // through the verdict/recommendation tagline (model-authored) when the engine
  // had mis-read the deadline as past. STILL deliberately NOT scrubbing bare
  // "deadline has passed" / "has expired" / "recompete" — those legitimately
  // describe a genuinely-passed SUB-window (Q&A, site visit) or forward-looking
  // recompete guidance; a blanket rewrite there would invent a fact.
  out = out.replace(/this (?:opportunity|solicitation|procurement) has (?:closed|expired)/gi, (m) => m.replace(/has (?:closed|expired)/i, "is open"));
  out = out.replace(/the (?:offer|proposal|quote|response|submission) deadline has (?:passed|expired|closed)/gi, (m) => m.replace(/^the/i, "the").replace(/has (?:passed|expired|closed)/i, "is still open"));
  out = out.replace(/no longer accepting (?:offers|proposals|quotes|responses|submissions)/gi, (m) => "still accepting" + m.slice("no longer accepting".length));
  return out;
}

// FA-112: gate_pearl ("catch worth the subscription") render. When VM supplies
// pearl content, replace inner; otherwise strip the entire <div class="g-pearl">
// element from the output so the template's demo procurex/reverse-auction copy
// never leaks. Default for now is null until an engine surface (likely the
// hero L02 catch) is wired into vm.gate_pearl.
function renderGatePearl(html: string, pearl: string | null): string {
  if (pearl && pearl.trim().length > 0) {
    return replaceFieldInner(html, "gate_pearl", escapeHtml(pearl));
  }
  return removeElementByOpenRe(html, /<div class="g-pearl"[^>]*>/, "div");
}

// FA-112: demo-leak guard. Last render step. Scans for known template demo
// markers and blanks the enclosing data-field element (or nearest block element)
// if any survive. Never throws — failure mode is console.warn only so render
// output is never broken by the guard itself.
function demoLeakGuard(html: string): string {
  // Markers must be UNAMBIGUOUS template-default phrases — substrings that
  // can only appear via an unreplaced data-field anchor or an unstripped
  // template element. Pass 1 testing showed that broader substrings
  // ("procurexinc", "H-60", "Rivera") collide with legitimate engine output:
  //   - "procurexinc" is emitted by buildReverseAuctionRisk (audit-engine.ts:1182,1188)
  //     in the L02 reverse-auction risk text
  //   - "H-60" is a real military helicopter platform; appears in real
  //     defense solicitations
  //   - "Rivera" is a common surname; could appear as a real CO name
  // Using those raw substrings as guard markers would blank legitimate
  // engine content. The phrases below are unique to the template's demo
  // defaults at _template.html lines 5, 1111, 1155, 1812, 1854, 1856, 1858,
  // 1998, 2003, 2441.
  const DEMO_MARKERS = [
    "SP4701-26-Q-0942",
    "Ms. Rivera,",
    "Predictive Maintenance Analytics for the H-60",
    "The catch worth the subscription",
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
            console.warn("[DEMO-LEAK]", marker, "in data-field=" + lastFieldMatch.key);
            safetyCounter++;
            continue;
          }
        }
        // Fallback: nearest block element (div / p / span / section / h1-6).
        const blockTagRe = /<(div|p|span|section|h[1-6])\b[^>]*>/g;
        let lastBlockMatch: { tag: string; idx: number } | null = null;
        while ((m = blockTagRe.exec(before)) !== null) {
          lastBlockMatch = { tag: m[1], idx: m.index };
        }
        if (lastBlockMatch) {
          const range = findMatchingClose(out, lastBlockMatch.idx, lastBlockMatch.tag);
          if (range && idx >= range.contentStart && idx < range.contentEnd) {
            out = out.slice(0, range.contentStart) + out.slice(range.contentEnd);
            // eslint-disable-next-line no-console
            console.warn("[DEMO-LEAK]", marker, "(no data-field; stripped <" + lastBlockMatch.tag + ">)");
            safetyCounter++;
            continue;
          }
        }
        // Couldn't resolve enclosing element — warn-only, halt this marker.
        // eslint-disable-next-line no-console
        console.warn("[DEMO-LEAK]", marker, "(could not resolve enclosing element)");
        break;
      }
    }
    return out;
  } catch (e) {
    // Fail-safe: guard must never throw. Surface the error and return original.
    // eslint-disable-next-line no-console
    console.warn("[DEMO-LEAK]", "guard internal error:", e instanceof Error ? e.message : String(e));
    return html;
  }
}

// ═══════════════════════════════════════════════════════════════════════════

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
  // FA-187 — masthead subject line (.mh-title). Empty subject → the element is
  // left empty and .mh-title:empty hides it, so the .mh-id number stands alone.
  html = replaceFieldText(html, "solicitation_subject", vm.solicitation_subject);
  html = replaceFieldText(html, "agency", vm.agency);
  html = replaceFieldText(html, "naics", vm.naics);
  html = replaceFieldText(html, "set_aside", vm.set_aside);
  html = replaceFieldText(html, "contract_type", vm.contract_type);
  html = replaceFieldOrRemove(html, "agency_detail", vm.agency_sub);
  html = replaceFieldOrRemove(html, "naics_label", vm.naics_sub);
  html = replaceFieldOrRemove(html, "set_aside_detail", vm.set_aside_sub);
  html = replaceFieldOrRemove(html, "contract_term", vm.contract_type_sub);

  // Verdict block — three-way branch based on the audit's honesty flags
  // (audit-engine 13f4743+):
  //   1. is_not_solicitation → suppress the verdict half entirely + show a
  //      "not a solicitation" banner above the risk list.
  //   2. is_unscored          → neutralize the gradient + render "—" / "Not
  //      yet scored" / upload-prompt subtext. No green/amber/red allowed.
  //   3. otherwise            → normal verdict colors + score/win-prob fill.
  // FA-137 — call-3 degradation banner lands inside §05 before any other
  // branch can strip/transform the section; on the not-solicitation branch
  // §05 is removed wholesale below and the banner goes with it (correct —
  // that branch has its own page-level banner).
  if (vm.call3_collapsed) {
    html = insertCall3CollapsedBanner(html, vm.call3_degradation_note);
  }
  // FA-136 — partial-ingestion flag (amber, page-level). Renders alongside
  // §05 content; suppressed wholesale on the not-solicitation branch below.
  if (vm.ingestion_incomplete) {
    html = insertIngestionBanner(html, vm.ingestion_note);
  }

  if (vm.is_not_solicitation) {
    html = removeVerdictBlock(html);
    html = insertNotSolicitationBanner(html);
    // Design Revision A: strip §03/§04/§05/§06 entirely so the report cannot
    // contradict the not-a-solicitation banner. Renderer-side strip keeps
    // web + PDF in lockstep (no need for [data-state="locked"] CSS gymnastics
    // since the sections are physically gone).
    html = removeNotSolicitationSections(html);
  } else if (vm.is_unscored) {
    // DESIGN dual-block spec: keep the prelim .v-unscored block, drop the
    // scored block. data-prelim-mode is the classifier output mapped through
    // the watch→upload fallback (until the watcher ships). The matching
    // .pm-head + .pm-cta show via CSS attribute selectors.
    html = pickVerdictBlock(html, "preliminary", vm.rendered_prelim_mode);
    if (vm.prelim_has_deadline) {
      html = replaceFieldText(html, "response_days_num", vm.response_days_num);
      html = replaceFieldText(html, "response_deadline_short", vm.response_deadline_short);
    } else {
      html = removePrelimDeadlineTile(html);
    }
    // set_aside replacement is handled below in the normal masthead pass
    // (data-field="set_aside" exists on both .mh-fact and the prelim tile;
    // when scored block is gone only the prelim copy remains).
    if (vm.set_aside_eligibility) {
      html = replaceFieldText(html, "set_aside_eligibility", vm.set_aside_eligibility);
    } else {
      html = removePrelimSetasideNote(html);
    }
    // Defect 3 (2026-06-05): reveal the locked-card stand-ins for §04 / §05
    // so the metadata-only audit never renders bare section headers. SPE
    // (SPE4A526T213S) was the canonical repro.
    //
    // FA-E2E Fix 2 (2026-06-18): GATE the locked-reveal on is_metadata_only.
    // Previously this fired on ANY null compliance_score, so a FULLY-INGESTED
    // audit that merely lacked a score hijacked the metadata-only presentation
    // — un-hiding "metadata only / Fetch from SAM / N clauses Locked / N traps
    // Locked" teasers ON TOP of real §04/§05 analysis. Only reveal the teasers
    // when the audit is TRULY metadata-only (no PDF retrieved). For a full audit
    // that lacks a score, keep the real §04/§05 content — the prelim verdict
    // block already renders an honest "not yet scored" state above it.
    if (vm.is_metadata_only) {
      html = revealLockedSectionsForUnscored(html);
      // FA-E2E Fix 2: populate the locked-teaser counts from REAL clause/trap
      // data (they were hardcoded "4 DFARS traps / 9 clauses" literals that
      // appeared identically on a Legislative-Branch sol and a USDA buy with
      // zero DFARS clauses). Strip the data-rights sentence unless a real
      // data-rights finding exists. Counts of 0 leave an honest "0".
      html = replaceFieldText(html, "moment_dfars_trap_count", String(vm.dfars_trap_count));
      html = replaceFieldText(html, "moment_far_clause_count", String(vm.far_clause_count));
      html = replaceFieldText(html, "locked_far_clause_count", String(vm.far_clause_count));
      html = replaceFieldText(html, "locked_dfars_trap_count", String(vm.dfars_trap_count));
      if (vm.has_data_rights_finding) {
        html = replaceFieldText(
          html,
          "moment_datarights_sentence",
          " The clause-level traps — including a data-rights exposure on the deliverable CLINs — are extracted only when the full solicitation PDF is read."
        );
      } else {
        html = removeFieldElement(html, "moment_datarights_sentence");
      }
    }
  } else {
    html = pickVerdictBlock(html, "scored");
    html = setVerdictClass(html, vm.recommendation_class);
    html = setMomentDecline(html, vm.recommendation_class === "v-decline");
    html = replaceFieldText(html, "recommendation", vm.recommendation);
    html = replaceFieldText(html, "recommendation_tagline", vm.recommendation_tagline);
    // Fix 2 (2026-06-05 — Ruling 1 wiring): gate audits arrive here with
    // vm.score=null (suppressed in the view-model). Show the score_display
    // string ("—") rather than the scoreNum fallback which would render "0".
    const scoreNum = vm.score ?? 0;
    const scoreText = vm.score === null ? vm.score_display : String(Math.round(scoreNum));
    html = replaceFieldText(html, "score", scoreText);
    // PR#20 / Phase-4 honesty: the masthead Fit/Win tiles ship HONEST DEFAULTS in
    // the template — score_benchmark is SUPPRESSED (score-derived heuristic with no
    // category dataset behind it) and Win Probability defaults to UNSCORED "—"
    // (basis-gated, null pre-revenue; "comparable audits" is not win/loss outcome
    // data). We fill only the real Fit Score + its bar here; the Win tile keeps its
    // unscored default until a genuine outcome-calibrated basis exists. (Engine does
    // not populate win_probability today, so no win number is ever shown.)
    html = html.replace(
      /(<div class="mhv-metric">[\s\S]*?<span data-field="score">[\s\S]*?<div class="mhv-bar"><i style="width:)\d+%(")/,
      `$1${Math.max(0, Math.min(100, scoreNum))}%$2`
    );
    // FUTURE (outcome calibration): when vm carries a real win BAND, fill
    // win_probability_band + win_probability_note and drop .is-unscored here.
  }

  // Key dates ribbon — Phase 2 #4 (Jun 8 2026). Hide-not-fabricate: render
  // only the items whose source date is non-null. .kd-sep divs are gone;
  // .kd-item + .kd-item::before pseudo-divider auto-reflows when a sibling
  // is omitted, so no orphan separators are possible.
  if (vm.has_response_deadline) {
    html = replaceFieldText(html, "response_deadline", vm.response_deadline);
    if (vm.response_days) {
      html = replaceFieldText(html, "response_days", vm.response_days);
    } else {
      html = removeKdCnt(html, "response_deadline");
    }
  } else {
    html = removeKdItem(html, "response_deadline");
    // tl-sub empty-state guard (Option B) — when response_deadline unknown,
    // strip "Submit by <b>[date]</b> &mdash; " prefix so the timeline header
    // reads "N steps between you and a compliant quote" not the demo date.
    html = html.replace(/Submit by <b data-field="response_deadline">[\s\S]*?<\/b> &mdash; /, "");
  }
  if (!vm.has_qa_deadline) {
    html = removeKdItem(html, "qa_deadline");
    html = removeKdNote(html);
    html = removeRailDeadline(html);
  } else {
    html = replaceFieldText(html, "qa_deadline", vm.qa_deadline);
    if (vm.qa_days) {
      html = replaceFieldText(html, "qa_days", vm.qa_days);
      html = replaceFieldText(html, "qa_days_num", vm.qa_days_num);
    } else {
      html = removeKdCnt(html, "qa_deadline");
    }
    // Phase A.0 + Phase 2 #4 — .kd-note honors data-hide-when-empty="key_dates_note".
    // Render real note only when vm.key_dates_note is non-empty; otherwise
    // strip the .kd-note entirely (no demo-text default leaks). The canonical
    // re-sync collapsed the inner text span's data-field — text lives on a
    // child <span>, so we replace its content via positional regex on the
    // .kd-note's last <span>...</span>.
    if (vm.key_dates_note && vm.key_dates_note.trim().length > 0) {
      html = html.replace(
        /(<div class="kd-note"[^>]*>[\s\S]*?<span>)[\s\S]*?(<\/span>\s*<\/div>)/,
        `$1${vm.key_dates_note}$2`
      );
    } else {
      html = removeKdNote(html);
    }
  }
  if (!vm.has_award_date) {
    html = removeKdItem(html, "award_date");
  } else {
    html = replaceFieldText(html, "award_date", vm.award_date);
    if (vm.has_award_quarter) {
      html = replaceFieldText(html, "award_quarter", vm.award_quarter);
    } else {
      html = removeKdCnt(html, "award_date");
    }
  }
  // Compute .urgent off the VM's chosen field (or strip everywhere when no
  // upcoming date remains). Runs after item-drops so the target item still
  // exists when we re-apply the class.
  html = applyUrgentKdItem(html, vm.urgent_field);
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
    // Headline-risk impact text — fall through to the risk description when
    // the engine didn't emit a specific neutralizing action. (Previously this
    // unconditionally wrote faraudit_action; empty action would leave the
    // analyst-flag value blank instead of telling the user what's at stake.)
    html = replaceFieldText(html, "headline_risk.impact",
      vm.headline_risk.faraudit_action || vm.headline_risk.description);
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

  // §M Evaluation Factors + §L Submission Compliance (#sec-eval). Same
  // false-precision gate as score_factors — strip the section entirely
  // when evaluation_factors is empty rather than render an empty shell.
  html = setEvaluationSection(html, vm);

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
  // CLIN cards — render real cards when present, otherwise drop in an empty-
  // state notice (DESIGN #4: leaving the demo "Platform stand-up / Analytics
  // licenses" cards on an "IT Help Desk" notice is worse than the empty state).
  // Was a <table class="clin-tbl">; Jun 8 2026 re-sync flipped to .clin cards.
  if (vm.clin_line_items.length > 0) {
    const cards = vm.clin_line_items.map(renderClinCard).join("\n                ");
    html = replaceFieldInner(html, "clin_table", `\n                ${cards}\n              `);
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

  // Sticky-rail "Work the checklist" action ships a hardcoded demo subtitle
  // ("4 compliance items") with no data-field — bind it to the real §04 flag
  // count so the rail can't contradict the section (the count-mismatch defect).
  {
    const n = vm.compliance_flags.length;
    const sub = n === 0 ? "none flagged" : `${n} compliance item${n === 1 ? "" : "s"}`;
    html = html.replace(
      /(<a class="act" href="#sec-compliance">[\s\S]*?<span class="a-s">)[^<]*(<\/span>)/,
      `$1${sub}$2`
    );
  }

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
  // FA-E2E Fix 5: strip leaked developer/implementation comments (code-internal
  // references, repeater notes, "for harness probing") so they never ship.
  html = stripDevComments(html);

  // Reviewer-only controls (Preview State toggle + Metadata case cycler) —
  // bottom-left of the design template, must not ship to prod.
  html = stripReviewerControls(html);

  // Stamp the initial "✓ Tracking" state on the [data-track] CTA + sub-note
  // when the current user is already watching this notice. The production
  // click handler (below) handles further toggling.
  if (vm.is_watching) {
    html = html.replace(
      '<a class="mhv-cta" data-track>Track this opportunity &rarr;</a>',
      '<a class="mhv-cta is-tracking" data-track><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12l5 5L20 7"/></svg>Tracking</a>'
    );
    // Swap the sub-note paired with the watch CTA. The mock uses the same
    // .mhv-sub-note class for the watch + (future) other modes; we target
    // the one inside the data-pm="watch" container.
    html = html.replace(
      'We&rsquo;ll auto-run the full audit the moment the RFP posts.',
      'Watching SAM.gov — we&rsquo;ll email you the moment it posts.'
    );
  }

  // Production CTA handlers — fetch/track/upload routed to real actions.
  // Stamped late so AUDIT_ID is correct for the in-flight audit.
  html = injectCtaHandlers(
    html,
    vm.audit_id_full,
    (vm.solicitation_number ?? "") // notice_id-or-slug; the run-audit page
                                    // smart-input accepts either form.
  );

  // ─── Fork 3 wiring (2026-06-05) ──────────────────────────────────────────
  // Six new surfaces from Design's capture package. Each repeater swaps the
  // demo children for one rendered node per VM data item (no leftover demo
  // siblings); class toggles + branches handled by dedicated helpers above.
  html = setExecClass(html, vm.exec_class);
  html = replaceFieldText(html, "exec_verdict", vm.exec_verdict);
  html = replaceFieldText(html, "exec_what", vm.exec_what);
  html = renderExecFactors(html, vm.exec_factors);
  html = renderExecActions(html, vm.exec_actions);

  // Brain QA Item 1 (2026-06-05): gate-mode wiring. When the engine emitted
  // a DECISION_GATE verdict, populate the masthead .mhv-gates + the §06
  // .g-rows from vm.gate_conditions[], then inject a script that calls the
  // template's own window.applyVerdictMode('gate') after DOM load — that
  // single call adds .is-gate to .mh-verdict (hides numeric tiles + reveals
  // gates), un-hides #reco-gate, hides .win-themes + .win-h + .st-amend.
  // Gate-mode predicate is shared with the visual toggle below (FA-108): a
  // score_locked report flips is-gate too, so its gate surfaces must bind —
  // not just DECISION_GATE verdicts.
  const gateModeActive = vm.verdict_mode === "gate" || vm.score_locked;
  html = renderGateConditions(html, vm.gate_conditions, gateModeActive);
  // Gap-collapse (Jun 11, Army live-DOM): when gate mode is visually active
  // but the engine emitted no gate_conditions[] (Brain doesn't emit the field
  // for score_locked yet), applyVerdictMode('gate') would reveal the masthead
  // .mhv-gates + §06 #reco-gate with template demo/empty content. Remove both
  // shells server-side until real conditions exist — applyVerdictMode's
  // lookups are null-guarded, so tile suppression still works.
  if (gateModeActive && vm.gate_conditions.length === 0) {
    html = removeElementByOpenRe(html, /<div class="gate-card"[^>]*>/, "div");
    html = removeElementByOpenRe(html, /<div class="mhv-gates"[^>]*>/, "div");
  }
  // Reveal gate-mode (applyVerdictMode('gate') → adds .is-gate, swaps the score
  // tiles for the gate) ONLY when there are real gate conditions to show. Without
  // this guard a score_locked report with zero gates would reveal an EMPTY gate
  // box AND hide the score — and, before the clear above, leak the hardcoded DoD
  // demo tiles. With no real gates we keep the score tiles (their unscored
  // win-probability honesty markers already handle the score_locked case).
  if (gateModeActive && vm.gate_conditions.length > 0) {
    html = injectVerdictModeCall(html);
  }
  // FA-129 — CEO ruling: a NO-BID verdict is final. The interactive bid-gate
  // tile ("tick what you hold — resolves to BID when all true") and the
  // masthead "Bid only if — all true today" rows contradict it, so both are
  // stripped server-side on NO-BID. CAUTION/GO keep the instrument unchanged.
  // applyVerdictMode('gate') still runs above — its #reco-gate lookup is
  // null-guarded, and the masthead numeric-tile suppression + win-themes
  // hiding (FA-108) must survive.
  if (vm.verdict_word === "NO-BID") {
    html = removeElementByOpenRe(html, /<div class="gate-card"[^>]*>/, "div");
    html = removeElementByOpenRe(html, /<div class="mhv-gates"[^>]*>/, "div");
  }

  // Canonicalization wiring (Brain ruling 2026-06-06) — single-source
  // verdict + canonical §06 prose. Replaces hardcoded template demo strings
  // ("NO-BID — unless all three are true today", "20-day window") with VM-
  // derived prose tied to the actual gate set and days-to-deadline. Kills
  // the three run-3 intra-render contradictions:
  //   1. masthead/exec said CAUTION while §06 .gate-verdict said NO-BID
  //   2. "all three gates" while gate_conditions.length === 2
  //   3. "19 days" vs "20-day window" within a single render
  html = applyCanonicalVerdict(html, vm);

  html = renderTimelineGates(html, vm.timeline_gates);

  // §07 — matrix-artifact card (Phase 1 of export-parity re-sync, Jun 8 2026).
  // Canonical's §07 is the compact export-artifact card, not the full clause
  // table. Renders count pill + summary sentence + export link. The full
  // matrix is the downloadable artifact reached via the export link, not a
  // printed re-list of §L. renderComplianceMatrix() kept in this file for
  // legacy callers but no longer invoked by the report render.
  html = renderMatrixArtifact(html, vm.compliance_matrix);
  // FA-115 Item 3 — §04 clause-matrix rollup tallies (traps / full-text /
  // by-reference). Single-sourced from the same compliance_flags array the
  // §04 header pill reads, so the badge can never contradict the flags above.
  html = renderMatrixRollupCounts(html, vm.compliance_flags, vm.compliance_matrix);
  // matrix_export_url: href attribute on the .ma-export anchor (was .cm-export
  // before the Jun 8 canonical re-sync; updated to track the new class).
  html = html.replace(
    /(<a class="ma-export" )href="[^"]*"(\s+data-field="matrix_export_url")/,
    `$1href="${escapeAttr(vm.matrix_export_url)}"$2`
  );

  // FA-112 (FA-107 decouple): anchors are ALWAYS replaced; expiry controls
  // visibility, not replacement. The previous else-only path skipped
  // renderKoEmailCard when is_expired=true, leaking template demo defaults
  // (SP4701 / Ms. Rivera) through unreplaced ko_email.subject and
  // ko_email.preview anchors. Invariant: anchors always populated with real
  // VM data; visibility suppression is additive on top.
  html = renderKoEmailCard(html, vm.ko_email);
  if (vm.is_expired) {
    // FA-107: banner + KO card visibility suppression
    html = insertExpiredBanner(html, vm.response_deadline_short);
    html = removeKoEmailCard(html);
  }
  html = renderGatePearl(html, vm.gate_pearl);

  // §03 work-statement reveal — Phase 2 #3. Floor: never silently vanish.
  html = renderWorkStatementReveal(html, vm.work_statement, vm.work_statement_unknown);

  // Gap 6 (FA-119): on a closed solicitation the §09 Pre-flight Checklist is
  // reference-only — suppress the live submission action items (which imply a
  // submission is still possible) and show a closed notice instead.
  if (vm.is_expired) {
    html = setFieldInner(
      html,
      "submission_checklist_filtered",
      "div",
      `<div class="ck-expired-notice"><span class="ck-expired-badge">Solicitation closed — checklist is reference only</span></div>`
    );
  } else {
    html = renderSubmissionChecklist(html, vm.submission_checklist_filtered);
  }

  html = renderIncumbentBranch(html, vm.has_incumbent);
  html = replaceFieldText(html, "incumbent_none_head", vm.incumbent_none_head);
  html = replaceFieldText(html, "incumbent_none_note", vm.incumbent_none_note);
  // ─────────────────────────────────────────────────────────────────────────

  // V2 cutover B2+B3 (Jun 8 2026): strip pass moved OUT of renderAuditReport.
  // The route handlers now call renderAuditReportComplete (below) which runs
  // V1 → V2 overlay → strip, so V2 can populate l02_catches / confidence_notes
  // BEFORE the strip's length-check decides whether to remove them.
  return html;
}

// ─── Paged-PDF Item 3 — empty-block strip pass ─────────────────────────────
// Tag-balanced walk pulled from _v2-render-surfaces.ts:stripIfEmpty.
// Exported (Jun 8 2026 / V2 cutover B2) so the route-level wrapper can call it
// AFTER V2 overlay populates content — length-check then sees the real shape.
export function stripHideWhenEmptyBlocks(html: string, vm: AuditViewModel): string {
  let out = html;
  // §09 empty-state guard — an audit can map requirements yet derive zero
  // checklist items (USDA Jun 11 case). Count ITEMS, not groups.
  // FA-127c: count the RENDERED rows, not vm.submission_checklist_filtered.
  // This pass runs AFTER the V2 overlay, which replaces the §09 container
  // with its own row set — counting the V1 VM collection here printed
  // ckTotal one off the visible rows (USMS 18/17, FDA 21/20). Both emitters
  // replace the container inner (empty ⇒ ""), so the html count is exact;
  // CSS/JS reference .ck-item without the class=" prefix and never match.
  const checklistItemCount = (out.match(/class="ck-item\b/g) ?? []).length;
  // compliance_flags lives in a <div class="flags" data-hide-when-empty="..."> wrapper (§04).
  // The other two are <section> wrappers.
  const passes: Array<{ field: string; isEmpty: boolean }> = [
    // §04 hide pass — Export Parity Item D. Strip the whole §04 (now wraps
    // header + legend + flags + matrix) when BOTH flags AND matrix are
    // empty. Prevents the "Full clause matrix · 0 traps · 0 full-text ·
    // 0 by reference" all-zero render shown on the Jun 7 SPRRA case.
    {
      field: "compliance_flags",
      isEmpty:
        (!vm.compliance_flags || vm.compliance_flags.length === 0) &&
        (!vm.compliance_matrix || vm.compliance_matrix.length === 0),
    },
    // V2-shadow-only surfaces — strip when V2 wrote nothing for this audit.
    // When V2 overlay populated content (shadow surface length > 0), skip the
    // strip so the V2 payload survives to the user. (Length sourced from
    // vm.v2_surface_lengths, computed in _view-model.ts from compliance_json.v2_shadow.)
    { field: "l02_catches",     isEmpty: (vm.v2_surface_lengths?.l02_catches     ?? 0) === 0 },
    { field: "confidence_notes", isEmpty: (vm.v2_surface_lengths?.confidence_notes ?? 0) === 0 },
    { field: "submission_checklist", isEmpty: checklistItemCount === 0 },
  ];
  for (const p of passes) {
    if (!p.isEmpty) continue;
    out = stripBlockByHideField(out, p.field);
  }
  // §09's jump-nav anchor goes with the section — a stripped section means the
  // client IIFE's section lookup is moot, so the anchor is removed here too.
  if (checklistItemCount === 0) {
    out = out.replace(/<a href="#sec-checklist">[\s\S]*?<\/a>\s*/i, "");
  } else {
    // Server-populate the counter. The template ships demo defaults (0 / 10)
    // and the IIFE only corrects them when client JS runs — the PDF pipeline
    // and no-JS readers otherwise see demo numbers (Design, Jun 11).
    out = out.replace(/<b id="ckDone">\d*<\/b>/, '<b id="ckDone">0</b>');
    out = out.replace(
      /<span id="ckTotal">\d*<\/span>/,
      `<span id="ckTotal">${checklistItemCount}</span>`
    );
  }
  return out;
}

function stripBlockByHideField(html: string, dataField: string): string {
  const openRe = new RegExp(
    `<(section|div)\\b[^>]*\\bdata-hide-when-empty="${dataField.replace(/[.]/g, "\\.")}"[^>]*>`,
    "i"
  );
  const m = openRe.exec(html);
  if (!m) return html;
  const tag = m[1];
  const openTagRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeTagRe = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  const openEnd = m.index + m[0].length;
  openTagRe.lastIndex = openEnd;
  closeTagRe.lastIndex = openEnd;
  while (depth > 0) {
    const o = openTagRe.exec(html);
    const c = closeTagRe.exec(html);
    if (!c) return html;
    if (o && o.index < c.index) {
      depth++;
      closeTagRe.lastIndex = o.index + 1;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(0, m.index) + html.slice(c.index + c[0].length);
      }
      openTagRe.lastIndex = c.index + 1;
    }
  }
  return html;
}

// ─── Phase 4 ⑤.1 — masthead source/provenance chips ───────────────────────
// 3-state honesty per header fact, driven by the VALUE the engine produced —
// never an inference from a blank (FA-185 contract). present → "Extracted";
// contract_type present → "verify" (V1 never exposes it reliably, so we ask
// the reader to confirm rather than assert); absent → the value goes italic
// "Not in documents" and the chip is dropped. We intentionally do NOT claim a
// block-level source ("SF-1449 Blk 9") we can't prove — honest-generic beats
// plausible-but-wrong (honesty flag #3).
export function renderHeaderSourceChips(html: string, vm: AuditViewModel): string {
  const docSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
  const infoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>`;
  const present = (v: unknown): boolean =>
    typeof v === "string" && v.trim().length > 0 && v.trim() !== "—";
  const fields: Array<{ key: "agency" | "naics" | "set_aside" | "contract_type"; verifyHint: string | null }> = [
    { key: "agency", verifyHint: null },
    { key: "naics", verifyHint: null },
    { key: "set_aside", verifyHint: null },
    { key: "contract_type", verifyHint: "Inferred · verify in &sect;B" },
  ];
  let out = html;
  for (const f of fields) {
    const chipRe = new RegExp(`<span class="src-chip[^"]*" data-field="${f.key}_source">[\\s\\S]*?</span>`);
    if (!present(vm[f.key])) {
      out = out.replace(
        new RegExp(`<b([^>]*)data-field="${f.key}"([^>]*)>[\\s\\S]*?</b>`),
        `<b class="notfound" data-field="${f.key}">Not in documents</b>`
      );
      out = out.replace(chipRe, "");
    } else if (f.verifyHint) {
      out = out.replace(chipRe, `<span class="src-chip verify" data-field="${f.key}_source">${infoSvg}${f.verifyHint}</span>`);
    } else if (f.key === "naics" && !vm.naics_from_source) {
      // FA-E2E Fix 5 (2026-06-18): the NAICS is present but came from SAM
      // metadata, NOT the source document. Badging it "Extracted" is a
      // fabrication (AOCSSB: "561210 — Extracted" on a Legislative-Branch sol
      // that states no NAICS). Show an honest "SAM metadata · verify" chip so
      // the reader knows it wasn't read from the document.
      out = out.replace(chipRe, `<span class="src-chip verify" data-field="${f.key}_source">${infoSvg}SAM metadata &middot; verify</span>`);
    } else {
      out = out.replace(chipRe, `<span class="src-chip" data-field="${f.key}_source">${docSvg}Extracted</span>`);
    }
  }
  return out;
}

// ─── V2 cutover wrapper (B2 + B3 coupled, Jun 8 2026) ──────────────────────
// Single source of truth for the V1 → V2 overlay → strip-pass chain. Both the
// web route (/audit/[id]) and PDF route (/api/audit/[id]/pdf) call this so the
// HTML they emit is byte-identical.
//
// Order matters: V2 overlay must populate BEFORE strip runs, so the strip's
// length-check (against vm.v2_surface_lengths) sees the populated shape and
// skips the corresponding sections. If shadow data is absent, v2Input is null,
// V2 step is a no-op, and the strip removes the empty-state template blocks —
// preserving the pre-cutover V1 behavior byte-for-byte.
export function renderAuditReportComplete(
  template: string,
  vm: AuditViewModel,
  audit: Record<string, unknown>
): string {
  let html = renderAuditReport(template, vm);
  const v2Input = buildV2ViewModelFromShadow(audit);
  if (v2Input) {
    html = renderV2Surfaces(html, v2Input);
    // FA-115 Item 3: V2's matrix rollup derives the trap tally from matrix
    // badges, which can contradict the §04 P0/P1 flag count. Re-pin to the
    // single source of truth.
    html = renderTrapTally(html, vm.compliance_flags);
  } else {
    // Phase 4 ⑤.7/⑤.4 — no v2_shadow → those V2 render fns never ran. Strip
    // their placeholders so V1-only audits don't show empty Phase-4 surfaces.
    // (The ingestion banner is NOT stripped here — it renders standalone below
    // from compliance_json.ingestion, which is V1-level and present even when
    // V2 didn't run. Bug fix: it was wrongly coupled to v2_shadow.)
    html = stripBlockByHideField(html, "capture_moves");
    html = stripBlockByHideField(html, "eval_attachment_gap");
  }
  // Phase 4 ⑤.5 — ingestion banner, ALWAYS from compliance_json.ingestion
  // (decoupled from v2_shadow so multi-file audits show it even when V2 didn't
  // run — e.g. the async worker arm). Strips itself when there's no manifest.
  html = renderIngestionBannerFromAudit(html, audit);
  // Phase 4 ⑤.1 — masthead source/provenance chips (runs after the masthead is
  // populated; value-driven 3-state, independent of the V2 overlay).
  html = renderHeaderSourceChips(html, vm);
  // §03 exactly-one contract — must run AFTER the V2 overlay so it sees both
  // V1's and V2's un-hide outcomes (see enforceSingleWorkStatementReveal).
  html = enforceSingleWorkStatementReveal(html);
  html = stripHideWhenEmptyBlocks(html, vm);
  // FA-114: report-wide closed-state framing — operates on FINAL HTML so that
  // checkbox-strip / progress-counter-strip survive renderSubmissionChecklist
  // (which would otherwise re-emit them). Order: hero gate → critical path →
  // next-48 strip → checklist header (last so the checkbox strip lands AFTER
  // renderSubmissionChecklist's injection) → bid gate.
  if (vm.is_expired) {
    html = applyClosedHeroGate(html);
    html = applyClosedCriticalPath(html, vm.response_deadline_short);
    html = removeNext48HoursBlock(html);
    html = applyClosedChecklistHeader(html);
    html = applyClosedBidGate(html);
  } else {
    // OPEN sol: scrub any persisted closed-state prose (exec/verdict strings
    // written when the report's deadline read as past). Inverse of the passes
    // above — see scrubStaleClosedLanguage.
    html = scrubStaleClosedLanguage(html);
  }
  // §08 empty-guard — after the closed-mode passes so it sees the post-
  // removeKoEmailCard shape (the trigger case). Mirrors the template IIFE.
  html = stripEmptyKoSection(html);
  // FA-112: final-stage demo-leak guard. Catches any template demo content
  // (SP4701 / Rivera / H-60 / procurexinc / Predictive Maintenance Analytics)
  // that survived all prior render passes. Warn-only on failure to resolve
  // — never throws.
  return demoLeakGuard(html);
}
