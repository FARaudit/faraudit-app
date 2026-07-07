// renderV5ReportFromRow(audit) — the v5 "Gate Brief" web report entry (flag-gated).
//   buildV4Data(row) → renderRichWebV5(data) → v5 chrome shell + REPORT_V5_CSS + interactivity JS.
// Chrome ported 1:1 from the Design v5 host (v5-report.html); dev pole-switcher stripped;
// export gate + KO wired to the REAL production routes (shouldGateExport / pdf / ko-email).
// Self-contained HTML (PDF-safe). Fonts embedded (base64 woff2) via FONTS_CSS — Phase-5 HARD GATE.
import { renderRichWebV5, type V5RenderResult } from "@/lib/v5-report/render";
import { buildV4Data } from "@/lib/v4-report/build-data";
import { REPORT_V5_CSS } from "@/lib/v5-report/styles";
import { FONTS_CSS } from "@/lib/v5-report/fonts";
import { shouldGateExport } from "@/lib/audit-display";

const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function railItems(sections: V5RenderResult["sections"]): string {
  return `<div class="rail-h">On this page</div>` + sections
    .map((s) => `<a href="#${esc(s.id)}" data-rail="${esc(s.id)}"><span class="rdot"></span>${esc(s.label)}</a>`)
    .join("");
}

const SB_ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  past: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/></svg>',
  pipeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5m6 14V9m6 10V13m4 6H2"/></svg>',
  opps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h10"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  ko: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 4h16v12H5.2L4 17.3Z"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>',
  no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M5 5l14 14"/></svg>',
};

export function renderV5ReportFromRow(audit: Record<string, unknown>): string {
  const data = buildV4Data(audit);
  const { html: reportHtml, sections } = renderRichWebV5(data);
  const rail = railItems(sections);
  const auditId = esc(data.shell?.auditId || "");
  const sol = esc(data.masthead.solicitation || auditId || "—");
  const gated = shouldGateExport(audit); // production single-source gate — mirrors the PDF-route 409

  const exportBtn = gated
    ? `<button class="btn btn-primary" id="exportBtn" disabled aria-disabled="true" title="No verdict was reached — there is no committal report to export.">${SB_ICON.no} Export unavailable</button>`
    : `<a class="btn btn-primary" id="exportBtn" href="/api/audit/${auditId}/pdf" title="Save this report as the PDF gate-review artifact">${SB_ICON.dl} Export PDF</a>`;

  const printFoot = `<span><span class="pf-mark">FARaudit</span> — Bid / No-Bid Gate Review</span><span>${sol} · Auditable gate-review artifact</span>`;

  // Gated (honest-fail/incomplete) → block print entirely; non-gated → neutralize the
  // entrance animation for a clean headless-Chromium PDF capture.
  const printGateCss = gated
    ? "@media print{html,body{display:none!important}}"
    : "@media print{.report.anim [data-sec],.report.anim .cmd{opacity:1!important;transform:none!important;animation:none!important}}";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FARaudit · ${sol}</title>
<style>${FONTS_CSS}</style>
<style>${REPORT_V5_CSS}</style>
<style>${printGateCss}</style>
</head>
<body>
<div class="app">
<aside class="sidebar">
  <div class="sb-brand"><span class="dot">◆</span> FARaudit</div>
  <nav class="sb-grp">
    <div class="sb-gh">Workspace</div>
    <a class="sb-i" href="/today"><span class="ic">${SB_ICON.today}</span>Today</a>
    <a class="sb-i" href="/run-audit"><span class="ic">${SB_ICON.run}</span>Run audit</a>
    <a class="sb-i on" href="/past-audits"><span class="ic">${SB_ICON.past}</span>Past audits</a>
    <a class="sb-i" href="/pipeline"><span class="ic">${SB_ICON.pipeline}</span>Pipeline</a>
  </nav>
  <nav class="sb-grp">
    <div class="sb-gh">Intelligence</div>
    <a class="sb-i" href="/opportunities"><span class="ic">${SB_ICON.opps}</span>Opportunities</a>
    <a class="sb-i" href="/defense-news"><span class="ic">${SB_ICON.news}</span>Defense news</a>
  </nav>
  <div class="sb-spring"></div>
  <nav class="sb-grp">
    <a class="sb-i" href="/account"><span class="ic">${SB_ICON.account}</span>Account</a>
  </nav>
</aside>
<div class="main">
  <header class="topbar">
    <div class="tb-crumb"><span>Past audits</span><span class="sep">/</span><span class="cur" id="crumbSol">${sol}</span></div>
    <span class="tb-live">Live web view</span>
    <div class="tb-spring"></div>
    <div class="tb-actions">
      <button class="btn btn-ghost" id="koBtn" data-audit="${auditId}">${SB_ICON.ko} Ask the CO</button>
      ${exportBtn}
    </div>
  </header>
  <div class="stage">
    <article class="report" id="report">${reportHtml}</article>
    <nav class="rail" id="rail" aria-label="On this page">${rail}</nav>
    <footer class="print-foot" id="printFoot" aria-hidden="true">${printFoot}</footer>
  </div>
</div>
</div>
<script>
(function(){
  'use strict';
  var report = document.getElementById('report');
  var rail = document.getElementById('rail');
  if(!report) return;
  // findings expand / collapse
  report.querySelectorAll('.fd-top').forEach(function(btn){
    btn.addEventListener('click', function(){
      var fd = btn.closest('.fd'); if(!fd) return;
      var open = fd.getAttribute('data-open')==='1';
      fd.setAttribute('data-open', open?'0':'1');
      btn.setAttribute('aria-expanded', open?'false':'true');
    });
  });
  // disclosure accordions
  report.querySelectorAll('.disc-top').forEach(function(top){
    if(top.classList.contains('disc-top--flat')) return;
    top.addEventListener('click', function(){
      var d = top.closest('.disc'); if(!d) return;
      var open = d.getAttribute('data-open')==='1';
      d.setAttribute('data-open', open?'0':'1');
      top.setAttribute('aria-expanded', open?'false':'true');
    });
  });
  // expand / collapse all
  var evb = report.querySelector('.ev-toggle');
  if(evb) evb.addEventListener('click', function(){
    var discs = [].slice.call(report.querySelectorAll('.disc')).filter(function(d){return !d.classList.contains('flat');});
    var anyClosed = discs.some(function(d){return d.getAttribute('data-open')!=='1';});
    discs.forEach(function(d){
      d.setAttribute('data-open', anyClosed?'1':'0');
      var t = d.querySelector('.disc-top'); if(t) t.setAttribute('aria-expanded', anyClosed?'true':'false');
    });
    evb.textContent = anyClosed ? 'Collapse all' : 'Expand all';
  });
  // in-page nav (rail + any #anchor)
  function scrollToId(id){ var el = document.getElementById(id); if(el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 66, behavior:'smooth' }); }
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var id = a.getAttribute('href').slice(1);
      if(!id || !document.getElementById(id)) return;
      e.preventDefault(); scrollToId(id);
    });
  });
  // scrollspy
  if('IntersectionObserver' in window){
    var links = {};
    rail.querySelectorAll('[data-rail]').forEach(function(a){ links[a.getAttribute('data-rail')] = a; });
    var obs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          Object.keys(links).forEach(function(k){ links[k].classList.remove('on'); });
          var a = links[e.target.id]; if(a) a.classList.add('on');
        }
      });
    }, { rootMargin:'-20% 0px -70% 0px', threshold:0 });
    report.querySelectorAll('[data-sec]').forEach(function(el){ if(el.id) obs.observe(el); });
  }
  // entrance motion — only when visible + motion allowed (never strand content hidden)
  if(!document.hidden && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)){
    void report.offsetWidth; report.classList.add('anim');
  }
  // KO clarification → real ko-email route
  var ko = document.getElementById('koBtn');
  if(ko) ko.addEventListener('click', function(){
    var id = ko.getAttribute('data-audit');
    if(id) window.location.href = '/api/audit/' + encodeURIComponent(id) + '/ko-email';
  });
})();
</script>
</body>
</html>`;
}
