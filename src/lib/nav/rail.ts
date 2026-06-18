// ─────────────────────────────────────────────────────────────────────────────
// SHARED SIDEBAR RAIL — single source of truth (Phase 5)
//
// Before Phase 5 the rail was copy-pasted into ~16 public/*.html files (drift
// waiting to happen). This module is the ONE definition. Each static route
// handler calls injectRail() to replace the page's stale <aside class="sidebar">
// at serve-time, and the /home SPA renders from NAV_GROUPS (see HomeClient).
//
// Design spec: Review/Phase 5 + Merges - Code Build Spec.html (§A). Five weighted
// groups, importance order (never alphabetical). Markup uses the production
// .sb-* classes (their CSS already ships in every page) so no per-page <style>
// changes are needed — purely a structural regroup + the avatar account menu.
//
// Counts: the static rail historically hardcoded literals (15/3/8). Kept as
// defaults here; a route may pass live values via the `counts` arg. Full live
// binding across all static pages is a follow-up (the /home SPA already binds
// live) — flagged in the Phase-5 PR, not silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

export interface RailItem {
  key: string;          // matches the active page (e.g. "defense-intel")
  label: string;
  href: string;
  icon: string;         // inner SVG paths (no <svg> wrapper)
  badge?: { text: string; kind: "new" | "live" | "count" | "danger" | "soon" };
}
export interface RailGroup {
  label: string;        // group header; "" + pinned=true renders the Daily cluster
  pinned?: boolean;     // Daily = pinned cluster at top
  items: RailItem[];
}

// Reused verbatim from the production markup so the icons are pixel-identical.
const I = {
  today: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  runAudit: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l2 2 4-4"/>',
  pastAudits: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pipeline: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  capability: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  opportunities: '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>',
  defenseIntel: '<path d="M12 3L4 8v8l8 5 8-5V8l-8-5z"/>',
  agencies: '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  cos: '<circle cx="9" cy="9" r="3"/><path d="M3 20c1-3 3-5 6-5s5 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M21 17c-.5-2-2-3.5-4-3.5"/>',
  cmmc: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  teaming: '<circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><path d="M2 20c0-3 2.5-5 5-5s5 2 5 5"/><path d="M12 20c0-3 2.5-5 5-5s5 2 5 5"/>',
  naics: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  farDfars: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h8M9 12h8M9 16h5"/><circle cx="18" cy="17" r="2.5" fill="#378ADD" stroke="none"/>',
  wage: '<path d="M3 20h18"/><rect x="5" y="11" width="3" height="9"/><rect x="10.5" y="6" width="3" height="14"/><rect x="16" y="14" width="3" height="6"/>',
  settings: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  signout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
};

// The five weighted groups — importance order within each (spec §A).
// GAO Protests + Acquisition Stages intentionally OFF the rail (routes preserved,
// surfaced contextually). Watching folded into Opportunities → Saved (item 3).
// Defense News + Defense Spending folded into Defense Intel (item 2).
export const NAV_GROUPS: RailGroup[] = [
  {
    label: "Daily",
    pinned: true,
    items: [
      { key: "today", label: "Today", href: "/command-center", icon: I.today },
      { key: "run-audit", label: "Run Audit", href: "/audit", icon: I.runAudit, badge: { text: "New", kind: "new" } },
      { key: "past-audits", label: "Past Audits", href: "/dashboard", icon: I.pastAudits, badge: { text: "15", kind: "count" } },
      { key: "pipeline", label: "Pipeline", href: "/pipeline", icon: I.pipeline, badge: { text: "3", kind: "danger" } },
    ],
  },
  {
    label: "Find & Track",
    items: [
      { key: "opportunities", label: "Opportunities", href: "/opportunities", icon: I.opportunities, badge: { text: "Live", kind: "live" } },
      { key: "capability-statement", label: "Capability Statement", href: "/capability-statement", icon: I.capability },
    ],
  },
  {
    label: "Market Intel",
    items: [
      { key: "defense-intel", label: "Defense Intel", href: "/defense-intel", icon: I.defenseIntel },
      { key: "agencies", label: "Defense Agencies", href: "/agencies", icon: I.agencies, badge: { text: "8", kind: "count" } },
      { key: "contracting-officers", label: "Contracting Officers", href: "/contracting-officers", icon: I.cos },
    ],
  },
  {
    label: "Compliance",
    items: [
      { key: "cmmc", label: "CMMC Readiness", href: "/cmmc", icon: I.cmmc, badge: { text: "72%", kind: "count" } },
      { key: "teaming-partners", label: "Teaming Partners", href: "/teaming-partners", icon: I.teaming, badge: { text: "Soon", kind: "soon" } },
    ],
  },
  {
    label: "Reference",
    items: [
      { key: "naics", label: "NAICS Codes", href: "/naics", icon: I.naics, badge: { text: "New", kind: "new" } },
      { key: "far-dfars-updates", label: "FAR/DFARS Updates", href: "/far-dfars-updates", icon: I.farDfars },
      { key: "wage-benchmarks", label: "Wage Benchmarks", href: "/wage-benchmarks", icon: I.wage },
    ],
  },
];

// Optional live-count overrides, keyed by item key. Falls back to NAV_GROUPS badge.
export type RailCounts = Partial<Record<string, string>>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BADGE_CLASS: Record<NonNullable<RailItem["badge"]>["kind"], string> = {
  new: "sb-badge new",
  live: "sb-badge live",
  count: "sb-badge count",
  danger: "sb-badge danger",
  soon: "sb-badge soon",
};

function renderItem(it: RailItem, activeKey: string, counts: RailCounts): string {
  const active = it.key === activeKey ? " active" : "";
  let badge = "";
  if (it.badge) {
    const txt = counts[it.key] ?? it.badge.text;
    badge = `<span class="${BADGE_CLASS[it.badge.kind]}">${esc(txt)}</span>`;
  }
  return (
    `<a class="sb-icon${active}" href="${it.href}">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>` +
    `<span class="sb-label">${esc(it.label)}</span>${badge}` +
    `<span class="sb-tip">${esc(it.label)}</span></a>`
  );
}

// Builds the full <aside class="sidebar"> markup. Account actions live in the
// avatar menu (click the avatar → .sb-avatar-menu popover), replacing the old
// Account group (Profile & Settings + Sign out form move inside).
export function renderRail(activeKey: string, counts: RailCounts = {}): string {
  const groups = NAV_GROUPS.map((g) => {
    const rows = g.items.map((it) => renderItem(it, activeKey, counts)).join("\n  ");
    if (g.pinned) {
      return `<div class="sb-group-label">${esc(g.label)}</div>\n  <div class="sb-pin">\n  ${rows}\n  </div>`;
    }
    return `<div class="sb-divider"></div>\n  <div class="sb-group-label">${esc(g.label)}</div>\n  ${rows}`;
  }).join("\n  ");

  return (
    `<aside class="sidebar">\n` +
    `  <button class="sb-toggle" id="sbToggle" type="button" aria-label="Toggle sidebar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>\n` +
    `  <div class="sb-logo-row"><div class="sb-logo">F</div><span class="sb-wordmark">FAR<span class="wm-au">audit</span></span></div>\n  ` +
    groups +
    `\n  <div class="sb-bottom">\n` +
    `    <button class="sb-avatar-btn" id="sbAvatarBtn" type="button" aria-haspopup="true" aria-expanded="false">` +
    `<span class="sb-avatar">JR</span><span class="sb-avatar-name">Jose Rodriguez</span>` +
    `<svg class="sb-avatar-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></button>\n` +
    `    <div class="sb-avatar-menu" id="sbAvatarMenu" role="menu" hidden>\n` +
    `      <a class="sb-am-item" role="menuitem" href="/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.settings}</svg>Profile &amp; Settings</a>\n` +
    `      <form action="/api/auth/sign-out" method="post" style="display:contents"><button type="submit" class="sb-am-item sb-am-signout" role="menuitem"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.signout}</svg>Sign out</button></form>\n` +
    `    </div>\n` +
    `  </div>\n` +
    `</aside>`
  );
}

// CSS for the Phase-5 additions the production pages don't already have:
// the pinned Daily cluster (.sb-pin) and the avatar account menu. Injected once
// per page alongside the rail. Uses the existing rail's dark-navy palette.
export function railStyle(): string {
  return (
    `<style id="sb-phase5">` +
    `.sb-pin{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:4px;margin-bottom:2px}` +
    `.sb-bottom{position:relative;margin-top:auto}` +
    `.sb-avatar-btn{display:flex;align-items:center;gap:9px;width:100%;padding:7px;border:0;background:rgba(255,255,255,.04);border-radius:9px;cursor:pointer;text-align:left}` +
    `.sb-avatar-name{font-size:11px;font-weight:600;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden}` +
    `.sb-avatar-chev{width:12px;height:12px;margin-left:auto;color:rgba(255,255,255,.4);flex:none}` +
    `.sidebar.collapsed .sb-avatar-name,.sidebar.collapsed .sb-avatar-chev{display:none}` +
    `.sb-avatar-menu{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:#0f2138;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:5px;box-shadow:0 16px 40px -18px rgba(0,0,0,.7);z-index:40}` +
    `.sb-avatar-menu[hidden]{display:none}` +
    `.sb-am-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border:0;background:transparent;border-radius:7px;color:rgba(255,255,255,.78);font-size:11.5px;font-weight:500;cursor:pointer;text-align:left;text-decoration:none}` +
    `.sb-am-item:hover{background:rgba(255,255,255,.06)}` +
    `.sb-am-item svg{width:14px;height:14px;flex:none}` +
    `.sb-am-signout{color:#fca5a5}` +
    `</style>`
  );
}

// Small client script: click avatar → toggle the account menu; click-away closes.
export function railScript(): string {
  return (
    `<script>(function(){var b=document.getElementById('sbAvatarBtn'),m=document.getElementById('sbAvatarMenu');` +
    `if(!b||!m)return;function close(){m.hidden=true;b.setAttribute('aria-expanded','false');}` +
    `b.addEventListener('click',function(e){e.stopPropagation();var o=m.hidden;m.hidden=!o;b.setAttribute('aria-expanded',String(o));});` +
    `document.addEventListener('click',function(e){if(!m.hidden&&!m.contains(e.target)&&e.target!==b)close();});` +
    `document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});})();</script>`
  );
}

// Replace the page's stale <aside class="sidebar">…</aside> with the shared rail,
// and inject the Phase-5 CSS + script once (before </body>). activeKey highlights
// the current nav item. Safe no-op if the markers aren't found.
export function injectRail(html: string, activeKey: string, counts: RailCounts = {}): string {
  let out = html.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, () => renderRail(activeKey, counts));
  if (out.includes('id="sb-phase5"') === false) {
    out = out.includes("</body>")
      ? out.replace("</body>", `${railStyle()}${railScript()}</body>`)
      : out + railStyle() + railScript();
  }
  return out;
}
