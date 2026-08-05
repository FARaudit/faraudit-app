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
  // Defense Spending — NOT a new icon: this is the exact path the production
  // Command Center already uses for the `spend` desk (public/cc-app.js DESK.spend),
  // reused so the broken-out rail item carries the icon customers already associate
  // with Defense Spending. No design change.
  spend: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4"/><path d="M13 16V9"/><path d="M18 16v-2"/>',
  agencies: '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  cos: '<circle cx="9" cy="9" r="3"/><path d="M3 20c1-3 3-5 6-5s5 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M21 17c-.5-2-2-3.5-4-3.5"/>',
  cmmc: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  teaming: '<circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><path d="M2 20c0-3 2.5-5 5-5s5 2 5 5"/><path d="M12 20c0-3 2.5-5 5-5s5 2 5 5"/>',
  naics: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  farDfars: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h8M9 12h8M9 16h5"/><circle cx="18" cy="17" r="2.5" fill="#378ADD" stroke="none"/>',
  wage: '<path d="M3 20h18"/><rect x="5" y="11" width="3" height="9"/><rect x="10.5" y="6" width="3" height="14"/><rect x="16" y="14" width="3" height="6"/>',
  settings: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  signout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  themeLight: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  themeDark: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  themeSystem: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
};

// The five weighted groups — importance order within each (spec §A).
// GAO Protests + Acquisition Stages intentionally OFF the rail (routes preserved,
// surfaced contextually). Watching folded into Opportunities → Saved (item 3).
// Defense News + Defense Spending were folded into Defense Intel (Phase 5 item 2)
// and are BROKEN BACK OUT as of 2026-07-29 (CEO: "I want defense intel out, no
// changes to design"). Both routes always existed with live data (news + spending)
// but were unreachable from the rail — only the combined entry was listed, and
// /defense-intel is a pure redirect to /defense-news with no content of its own.
// This is a nav change ONLY: no page markup, styling, or the in-page News|Spending
// tab strip is touched, and /defense-intel stays as a working redirect so any
// existing link keeps resolving.
export const NAV_GROUPS: RailGroup[] = [
  {
    label: "Daily",
    pinned: true,
    items: [
      { key: "today", label: "Today", href: "/command-center", icon: I.today },
      { key: "run-audit", label: "Run Audit", href: "/audit", icon: I.runAudit, badge: { text: "New", kind: "new" } },
      // No hardcoded count — the badge text is bound client-side from the
      // customer's real audits (dashboard-live.js writeSidebarBadge). An empty
      // count badge is hidden by that same script until a real number exists.
      { key: "past-audits", label: "Past Audits", href: "/past-audits", icon: I.pastAudits, badge: { text: "", kind: "count" } },
      { key: "pipeline", label: "Pipeline", href: "/pipeline", icon: I.pipeline },
    ],
  },
  {
    label: "Find & Track",
    items: [
      // No hardcoded "Live". The rail is injected into ~10 routes, most of
      // which never check SAM feed health — a literal here asserted the feed
      // was up on every one of them, including during an outage. Empty text
      // renders NO pill (see renderItem); the two pages that actually measure
      // feed state (opportunities-live.js, command-center-live.js) create the
      // pill client-side via public/rail-live-badge.js. Guarded by
      // test/public/_rail-live-badge.test.ts.
      { key: "opportunities", label: "Opportunities", href: "/opportunities", icon: I.opportunities, badge: { text: "", kind: "live" } },
      { key: "capability-statement", label: "Capability Statement", href: "/capability-statement", icon: I.capability },
    ],
  },
  {
    label: "Market Intel",
    items: [
      { key: "defense-news", label: "Defense News", href: "/defense-news", icon: I.defenseIntel },
      { key: "defense-spending", label: "Defense Spending", href: "/defense-spending", icon: I.spend },
      { key: "agencies", label: "Defense Agencies", href: "/agencies", icon: I.agencies },
      { key: "contracting-officers", label: "Contracting Officers", href: "/contracting-officers", icon: I.cos },
    ],
  },
  {
    label: "Compliance",
    items: [
      { key: "cmmc", label: "CMMC Readiness", href: "/cmmc", icon: I.cmmc },
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
    // An empty text means "no number yet" — render no pill at all rather than
    // an empty one; the owning page binds a live count client-side.
    if (txt) badge = `<span class="${BADGE_CLASS[it.badge.kind]}">${esc(txt)}</span>`;
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
    // The retired single-letter mark is deliberately ABSENT here — the wordmark stands alone.
    // It survived the purge because the rail is injected at SERVE time: a sweep of the design
    // files and public/*.html never reached this string, and it kept rendering on all 18
    // surfaces. One source, one line, 18 pages. Do not reintroduce a mark beside the wordmark.
    `  <div class="sb-logo-row"><span class="sb-wordmark">FAR<span class="wm-au">audit</span></span></div>\n  ` +
    groups +
    `\n  <div class="sb-bottom">\n` +
    // Identity is NEVER hardcoded — the rail script fills these from
    // /api/profile (the signed-in user). Empty until real data exists.
    `    <button class="sb-avatar-btn" id="sbAvatarBtn" type="button" aria-haspopup="true" aria-expanded="false">` +
    `<span class="sb-avatar"></span><span class="sb-avatar-name"></span>` +
    `<svg class="sb-avatar-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></button>\n` +
    `    <div class="sb-avatar-menu" id="sbAvatarMenu" role="menu" hidden>\n` +
    `      <a class="sb-am-item" role="menuitem" href="/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.settings}</svg>Profile &amp; Settings</a>\n` +
    // APPEARANCE — one definition for all 18 rail-injected pages. The per-page inline
    // toggle is 17 hand-copied scripts, which is how Defense News ended up able to switch
    // theme but unable to remember it. This control is the single source; `aria-checked`
    // is set at runtime from the stored preference, never hardcoded.
    `      <div class="sb-am-sep" role="separator"></div>\n` +
    `      <div class="sb-am-label">Appearance</div>\n` +
    `      <div class="sb-am-themes" role="group" aria-label="Appearance">\n` +
    (
      [
        { v: "light", label: "Light", icon: I.themeLight },
        { v: "dark", label: "Dark", icon: I.themeDark },
        { v: "auto", label: "System", icon: I.themeSystem },
      ] as const
    )
      .map(
        (t) =>
          `        <button type="button" class="sb-am-item sb-am-theme" data-theme-choice="${t.v}" role="menuitemradio" aria-checked="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t.icon}</svg>${t.label}</button>\n`,
      )
      .join("") +
    `      </div>\n` +
    `      <div class="sb-am-sep" role="separator"></div>\n` +
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
    `.sb-am-sep{height:1px;background:rgba(255,255,255,.10);margin:4px 2px}` +
    `.sb-am-label{padding:2px 9px 4px;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.42)}` +
    // The checked option reads as chosen without colour doing the work alone —
    // colour + weight + a filled dot, so it survives a monochrome or high-contrast view.
    `.sb-am-theme[aria-checked="true"]{background:rgba(255,255,255,.09);color:#fff;font-weight:650}` +
    `.sb-am-theme[aria-checked="true"]::after{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;margin-left:auto;flex:none}` +
    `</style>`
  );
}

// Small client script: click avatar → toggle the account menu; click-away closes.
export function railScript(): string {
  return (
    `<script>(function(){var b=document.getElementById('sbAvatarBtn'),m=document.getElementById('sbAvatarMenu');` +
    `if(b&&m){var close=function(){m.hidden=true;b.setAttribute('aria-expanded','false');};` +
    `b.addEventListener('click',function(e){e.stopPropagation();var o=m.hidden;m.hidden=!o;b.setAttribute('aria-expanded',String(o));});` +
    `document.addEventListener('click',function(e){if(!m.hidden&&!m.contains(e.target)&&e.target!==b)close();});` +
    `document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});}` +
    // ── APPEARANCE: light · dark · system ────────────────────────────────────────────
    // Stored preference is light|dark|auto under the SAME key the 17 per-page inline
    // scripts already use, so the two never fight. Those scripts run earlier in the
    // document and set data-theme to the raw stored value; this runs last and RESOLVES
    // `auto` against the OS. The pages define [data-theme="auto"] as light, so resolving
    // to a concrete light|dark here means System works with ZERO CSS changes to any page.
    // No stored preference ⇒ nothing is written and the page keeps its own default
    // (light). Turning System on for existing users is a product decision, not a
    // side effect of shipping the control.
    `var K='faraudit-theme',root=document.documentElement;` +
    `var mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;` +
    `var pref=function(){try{return localStorage.getItem(K)||''}catch(e){return ''}};` +
    `var resolve=function(v){return v==='auto'?((mq&&mq.matches)?'dark':'light'):v};` +
    `var mark=function(v){document.querySelectorAll('.sb-am-theme').forEach(function(b){` +
    `b.setAttribute('aria-checked',String(b.getAttribute('data-theme-choice')===v));});};` +
    `var apply=function(v,persist){var r=resolve(v);if(r)root.setAttribute('data-theme',r);` +
    `if(persist){try{localStorage.setItem(K,v)}catch(e){}}mark(v);};` +
    `var cur=pref();if(cur)apply(cur,false);else mark(root.getAttribute('data-theme')||'light');` +
    `document.querySelectorAll('.sb-am-theme').forEach(function(b){b.addEventListener('click',function(e){` +
    `e.stopPropagation();apply(b.getAttribute('data-theme-choice'),true);});});` +
    // Follow the OS live, but ONLY while the preference is System — an explicit
    // light/dark choice must not be overridden when the OS flips.
    `if(mq){var onSys=function(){if(pref()==='auto')apply('auto',false);};` +
    `if(mq.addEventListener)mq.addEventListener('change',onSys);else if(mq.addListener)mq.addListener(onSys);}` +
    // Identity hydration — the SIGNED-IN user from /api/profile, never a
    // hardcoded name. On failure identity stays blank: empty is honest,
    // a wrong name is not (Rule 61).
    `fetch('/api/profile',{credentials:'include'}).then(function(r){return r.ok?r.json():null;}).then(function(p){` +
    `if(!p)return;var name=(p.full_name||'').trim()||String(p.email||'').split('@')[0];if(!name)return;` +
    // suffixes (Jr/Sr/II/III/IV) are not surnames — initials skip them
    `var parts=name.split(/\\s+/).filter(function(w){return !/^(jr|sr|ii|iii|iv|v)\\.?$/i.test(w);});` +
    `var ini=((parts[0]||'')[0]||'')+((parts.length>1?parts[parts.length-1][0]:(parts[0]||'')[1])||'');ini=ini.toUpperCase();` +
    `document.querySelectorAll('.sb-avatar').forEach(function(e){e.textContent=ini;});` +
    `document.querySelectorAll('.sb-avatar-name').forEach(function(e){e.textContent=name;});` +
    `document.querySelectorAll('.user-chip .nm').forEach(function(e){e.textContent=name;});` +
    `document.querySelectorAll('.user-chip .av').forEach(function(e){e.textContent=ini;});` +
    `}).catch(function(){});})();</script>`
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
