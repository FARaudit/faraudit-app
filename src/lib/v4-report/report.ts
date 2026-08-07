// renderV4ReportFromRow(audit) — the live v4 report entry. Composes:
//   buildV4Data(row) → renderRichWeb(data) → server HTML shell (topbar · sidebar · rail · sheet) + CSS + fonts + interactivity JS.
// This REPLACES the v3 renderer at the route (no fallback). Self-contained HTML (PDF-safe).
import { renderRichWeb, type V4Section } from "@/lib/v4-report/render";
import { buildV4Data } from "@/lib/v4-report/build-data";
import { REPORT_CSS } from "@/lib/v4-report/styles";
import { FONT_CSS } from "@/lib/v4-report/fonts";
import { shouldGateExport } from "@/lib/audit-display";
import { TODAY, WORKFLOW, SECTIONS, type RailItem } from "@/lib/nav/rail";

const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* THE SAME LIST OF DESTINATIONS THE REST OF THE PRODUCT USES.
   This shell wrote its own four links — "Run audit" at /run-audit and "Past audits" —
   against the shared rail's fifteen at /audit and "Decisions". This renderer is the
   fallback behind AUDIT_REPORT_V5, so the fork is dormant rather than gone: the moment
   that flag is turned off, every report reverts to a navigation the rest of the app
   stopped using. Items come from the rail; the markup keeps this shell's own classes,
   and the rail's icon paths sit in the existing 16px .an-i slot. */
function appNav(activeKey: string): string {
  const row = (i: RailItem) =>
    `<a class="an-item${i.key === activeKey ? " on" : ""}" href="${i.href}">`
    + `<span class="an-i"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">${i.icon}</svg></span>`
    + `${esc(i.label)}</a>`;
  const group = (label: string | null, items: RailItem[]) =>
    `<div class="an-sect">${label ? `<div class="an-h">${esc(label)}</div>` : ""}${items.map(row).join("")}</div>`;
  return group(null, [TODAY])
    + group("Workflow", WORKFLOW)
    + SECTIONS.map((s) => group(s.label, s.items)).join("");
}

function railItems(sections: V4Section[]): string {
  return sections
    .map((s) => `<button class="rail-item" data-target="${esc(s.id)}"${s.tone ? ` data-tone="${esc(s.tone)}"` : ""}><span class="rdot"></span>${esc(s.label)}</button>`)
    .join("");
}

export function renderV4ReportFromRow(audit: Record<string, unknown>): string {
  const data = buildV4Data(audit);
  const { html: reportHtml, sections } = renderRichWeb(data);
  const rail = railItems(sections);
  const auditId = esc(data.shell?.auditId || "");
  const auditIdRaw = String(data.shell?.auditId || ""); // unescaped — for esc()'d contexts (avoid double-escape)
  const gated = shouldGateExport(audit); // single source of truth — mirrors the PDF-route 409, cannot diverge

  // Print CSS. Gated (honest-fail/incomplete) → block printing entirely (no clean PDF leaves). Non-gated →
  // NEUTRALIZE the entrance animation for print: sections + masthead start at opacity:0 under html.anim, and
  // headless-Chromium PDF export would otherwise capture a mid-animation frame showing only the verdict band.
  const printGateCss = gated
    ? "@media print{html,body{display:none!important}} /* report cannot be exported — gated */"
    : "@media print{html.anim .sec,html.anim .mast{opacity:1!important;animation:none!important}html.anim .cov-fill{animation:none!important;width:var(--pct,100%)!important}}";

  // Export affordance (Design Gate-2 Δ2) — the PRIMARY terminal action: a solid accent pill (.tb-export), peer
  // to and placed LEFT of the KO outline pill. Bound to the REAL 409/PDF-endpoint gate (shouldGateExport) — NOT
  // verdict.noVerdict, which is only the mock's stand-in. Gated → the SAME pill disabled + honest label, NEVER
  // hidden (a disabled honest pill teaches the gate; hiding it leaves the user unsure export exists — no black
  // box). Clean → the pill is an <a> to the 409-honoring PDF endpoint (never window.print()).
  const exportAffordance = gated
    ? `<button class="tb-export" type="button" disabled aria-disabled="true" title="Available once the audit reaches a verdict and clears its gates">⭳ Export unavailable</button>`
    : `<a class="tb-export" href="/api/audit/${auditId}/pdf" title="Export a clean PDF of this report">⭳ Export PDF</a>`;

  return `<!doctype html>
<html lang="en" data-dir="B"${gated ? ' data-export-gated="1"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FARaudit · ${esc(data.masthead.solicitation || auditIdRaw)}</title>
<style>${FONT_CSS}</style>
<style>${REPORT_CSS}</style>
<style>${printGateCss}</style>
</head>
<body>
<header class="topbar">
  <div class="tb-l">
    <span class="tb-brand">FAR<span class="au">audit</span></span>
    <nav class="tb-crumb"><span>Audits</span><span class="sep">/</span><span class="cur" id="tbCur">${auditId || "—"}</span></nav>
  </div>
  <div class="tb-r">
    <span class="tb-live">Live</span>
    ${exportAffordance}
    <button class="tb-ko" id="koBtn" type="button" data-audit="${auditId}" title="Generate a clarification email to the Contracting Officer">✎ KO clarification</button>
    <span class="tb-ico" title="Search">⌕</span>
    <span class="tb-ico" title="Notifications">◔</span>
    <span class="tb-user">CE</span>
  </div>
</header>

<div class="stage">
  <aside class="appnav" id="appnav">
    <div class="an-brand"><span class="an-mk">F</span><span class="an-wm">FAR<span class="au">audit</span></span></div>
    ${appNav("past-audits")}
    <div class="an-sect an-report">
      <div class="an-h">This audit</div>
      <div class="rail-list" id="railListC">${rail}</div>
    </div>
  </aside>
  <aside class="rail">
    <div class="rail-h">On this report</div>
    <div class="rail-list" id="railList">${rail}</div>
  </aside>
  <main class="main"><div class="sheet" id="sheet">${reportHtml}</div></main>
</div>

<script>
(function () {
  'use strict';
  var sheet = document.getElementById('sheet');
  // findings expand / collapse
  sheet.querySelectorAll('.find-top').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.find');
      if (!card) return;
      if (card.hasAttribute('data-open')) { card.removeAttribute('data-open'); btn.setAttribute('aria-expanded', 'false'); }
      else { card.setAttribute('data-open', '1'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });
  // rail click + scrollspy (both sidebar + rail mirror)
  function railItemsAll() { return document.querySelectorAll('.rail-list .rail-item'); }
  railItemsAll().forEach(function (it) {
    it.addEventListener('click', function () {
      var el = document.getElementById(it.dataset.target);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 66, behavior: 'smooth' });
    });
  });
  var map = {};
  railItemsAll().forEach(function (it) { (map[it.dataset.target] = map[it.dataset.target] || []).push(it); });
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          railItemsAll().forEach(function (x) { x.classList.remove('on'); });
          (map[e.target.id] || []).forEach(function (x) { x.classList.add('on'); });
        }
      });
    }, { rootMargin: '-60px 0px -70% 0px', threshold: 0 });
    sheet.querySelectorAll('[data-sec], .mast').forEach(function (el) { if (el.id) obs.observe(el); });
  }
  // entrance motion — gated behind visibility + reduced-motion (never strands content invisible)
  var root = document.documentElement;
  if (!document.hidden && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    void sheet.offsetWidth; root.classList.add('anim');
  }
  // KO clarification — on-demand action → real ko-email route (never a report section)
  var ko = document.getElementById('koBtn');
  if (ko) ko.addEventListener('click', function () {
    var id = ko.getAttribute('data-audit');
    if (id) window.location.href = '/api/audit/' + encodeURIComponent(id) + '/ko-email';
  });
})();
</script>
</body>
</html>`;
}
