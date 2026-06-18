// Phase 5 · item 2 — Defense Intel consolidation.
//
// Spec intent: one "Defense Intel" destination with a News/Spending tab strip,
// default News, the two source pages preserved. The spec floated iframing the
// pages "unchanged" — but each page is a full standalone document with its own
// chrome + (for News) a server-side live-article pipeline, so iframing yields
// double-rail/double-topbar. Lower-risk approach that delivers the same UX:
//   • Each page KEEPS its own route + logic + live data (unchanged content).
//   • We replace the topbar breadcrumb with a shared News|Spending tab strip
//     (links between the two pages); the current page's tab is active.
//   • Both pages mark the rail's "Defense Intel" item active (set in their route).
//   • /defense-intel is the canonical entry → redirects to the News default.
// No iframe, no double-chrome, no duplicated news-feed logic.
//
// DEVIATION FLAGGED FOR DESIGN/CEO: viewing News shows the URL /defense-news (not
// /defense-intel). The destination + tabbed UX match the spec; only the address
// bar differs. Trivial to switch to a rewrite later if the /defense-intel URL is
// required on the tab views.

const TAB_CSS =
  `<style id="di-tabs-css">` +
  `.di-tabs{display:flex;gap:4px;align-items:center}` +
  `.di-tab{font-size:13px;font-weight:600;color:var(--mute,#64748b);text-decoration:none;padding:6px 12px;border-radius:8px;line-height:1;transition:background .12s}` +
  `.di-tab:hover{background:rgba(120,140,170,.12)}` +
  `.di-tab.active{color:var(--ink,#0A1628);background:rgba(55,138,221,.14)}` +
  `[data-theme="dark"] .di-tab{color:rgba(255,255,255,.55)}` +
  `[data-theme="dark"] .di-tab.active{color:#fff;background:rgba(55,138,221,.22)}` +
  `</style>`;

// Replaces the topbar breadcrumb (.crumbs) with the Defense Intel tab strip and
// injects the tab CSS once. Safe no-op if the page has no breadcrumb.
export function injectDefenseTabs(html: string, active: "news" | "spending"): string {
  const tabs =
    `<div class="di-tabs" role="tablist" aria-label="Defense Intel">` +
    `<a class="di-tab${active === "news" ? " active" : ""}" role="tab" aria-selected="${active === "news"}" href="/defense-news">News</a>` +
    `<a class="di-tab${active === "spending" ? " active" : ""}" role="tab" aria-selected="${active === "spending"}" href="/defense-spending">Spending</a>` +
    `</div>`;
  let out = html.replace(/<div class="crumbs">[\s\S]*?<\/div>/, () => tabs);
  if (!out.includes('id="di-tabs-css"')) {
    out = out.includes("</head>") ? out.replace("</head>", `${TAB_CSS}</head>`) : TAB_CSS + out;
  }
  return out;
}
