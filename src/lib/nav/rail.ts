// ─────────────────────────────────────────────────────────────────────────────
// SHARED SIDEBAR RAIL — single source of truth.
//
// CARD 807 (Design handoff, 2026-08-05): regrouped BY WORKFLOW rather than by
// content type. Same fifteen destinations, same routes, nothing added or removed.
// Today stands alone; Workflow holds the four things done in sequence (find →
// audit → decide → pursue); Readiness / Market intel / Reference are collapsible
// sections, Readiness open by default.
//
// Each static route handler calls injectRail() to replace the page's stale
// <aside class="sidebar"> at serve time, and railStyle()/railScript() are injected
// once before </body>.
//
// ── DEVIATIONS FROM THE HANDOFF, EACH MEASURED ──────────────────────────────
// 1. The collapse button keeps id="sbToggle", NOT the handoff's id="sbCollapse".
//    All 18 pages carry an inline script OUTSIDE the replaced <aside> that binds
//    #sbToggle and persists faraudit-sb. Renaming the id would have left that
//    script bound to nothing and broken collapse on every page — the same
//    vocabulary fork the handoff's own trap 1 warns about, one level down.
// 2. rail.js's collapse IIFE is NOT ported. That exact code already ships on all
//    18 pages; porting it would bind #sbToggle twice, so every click toggled
//    twice and collapse became a no-op.
// 3. rail.js's theme IIFE is NOT ported. It is the per-page toggle that the
//    appearance control (PR #471) replaced, and it dereferences #themeSun with no
//    null guard — it throws on every page that lacks that element.
// 4. rail.js line 46 does not parse (`document.documentElement.['mini','closed']`).
//    Rewritten; the inert sync it guards is otherwise dead code.
// 5. rail.js placed tooltips only when data-sb === 'mini', a state the handoff
//    itself replaced with 'closed'. Tooltips would never have positioned.
// 6. NO hardcoded counts. The handoff markup ships 4, 19 and 72%; §6 of the same
//    document requires counts to derive live or not ship, and 72% has no source
//    named anywhere. Counts render only from the live `counts` argument, and a
//    zero renders as nothing.
// 7. NO hardcoded identity. The handoff markup ships "JR" / "Jose Rodriguez";
//    identity is hydrated from /api/profile and stays blank on failure (Rule 61).
// 8. The avatar MENU is retained. The handoff markup drops it, but §7 requires the
//    appearance control to keep working, and that is where it lives.
// 9. The RAIL v2 base stylesheet was MISSING from the handoff's rail.css — it is
//    a third <style id="workflow-rail"> block in the reference page, and without
//    it every new class has colour but no layout. Ported from the reference,
//    EXCLUDING that block's page-level sections (top bar / next decision /
//    deadline rail / queue), which restyle the archived screenshot-built pages
//    §0 says must not be implemented.
// 10. That block also replaced the wordmark with a literal "FA" monogram
//    (font-size:0 + ::after{content:"FA"}). Excluded: it contradicts §4's ruled
//    Fraunces lockup and brand.md §1, and is the retired-mark defect returning.
// ─────────────────────────────────────────────────────────────────────────────

export interface RailItem {
  key: string;          // matches the active page (e.g. "opportunities")
  label: string;
  href: string;
  icon: string;         // inner SVG paths (no <svg> wrapper)
}
export interface RailSection {
  label: string;
  defaultOpen: boolean;
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
// Today is the entry point and belongs to no group.
export const TODAY: RailItem = { key: "today", label: "Today", href: "/command-center", icon: I.today };

// The four things a user does in sequence. Order is the work, not the alphabet.
export const WORKFLOW: RailItem[] = [
  { key: "opportunities", label: "Opportunities", href: "/opportunities", icon: I.opportunities },
  // "Audit" not "Run Audit" — the noun matches its neighbours; the page's own button still reads Run Audit.
  { key: "run-audit", label: "Audit", href: "/audit", icon: I.runAudit },
  // "Decisions" names the artifact the engine produces. The ROUTE is unchanged.
  { key: "past-audits", label: "Decisions", href: "/past-audits", icon: I.pastAudits },
  { key: "pipeline", label: "Pipeline", href: "/pipeline", icon: I.pipeline },
];

export const SECTIONS: RailSection[] = [
  {
    label: "Readiness",
    defaultOpen: true,
    items: [
      { key: "cmmc", label: "CMMC readiness", href: "/cmmc", icon: I.cmmc },
      { key: "capability-statement", label: "Capability statement", href: "/capability-statement", icon: I.capability },
      { key: "teaming-partners", label: "Teaming partners", href: "/teaming-partners", icon: I.teaming },
    ],
  },
  {
    label: "Market intel",
    defaultOpen: false,
    items: [
      { key: "defense-news", label: "Defense news", href: "/defense-news", icon: I.defenseIntel },
      { key: "defense-spending", label: "Defense spending", href: "/defense-spending", icon: I.spend },
      { key: "agencies", label: "Defense agencies", href: "/agencies", icon: I.agencies },
      { key: "contracting-officers", label: "Contracting officers", href: "/contracting-officers", icon: I.cos },
    ],
  },
  {
    label: "Reference",
    defaultOpen: false,
    items: [
      { key: "naics", label: "NAICS codes", href: "/naics", icon: I.naics },
      { key: "far-dfars-updates", label: "FAR/DFARS updates", href: "/far-dfars-updates", icon: I.farDfars },
      { key: "wage-benchmarks", label: "Wage benchmarks", href: "/wage-benchmarks", icon: I.wage },
    ],
  },
];

/** Live counts, keyed by item key. Supplied by the route from the same endpoint the page reads. */
export type RailCounts = Partial<Record<string, string>>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A count renders ONLY when a live value was passed, and never when it is zero.
 *  Handoff §6: derive live or render none; a zero is not news. There is no default,
 *  so a rail with no wired count shows no number rather than a stale one. */
function renderCount(key: string, counts: RailCounts): string {
  const raw = (counts[key] ?? "").trim();
  if (!raw || raw === "0") return "";
  return `<span class="sb-ct">${esc(raw)}</span>`;
}

function row(it: RailItem, activeKey: string, counts: RailCounts, cls: "sb-step" | "sb-icon"): string {
  // .sb-step takes .on and .sb-icon takes .active — the two the stylesheet actually binds.
  const active = it.key === activeKey ? (cls === "sb-step" ? " on" : " active") : "";
  return (
    `<a class="${cls}${active}" href="${it.href}">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>` +
    `<span class="sb-label">${esc(it.label)}</span>${renderCount(it.key, counts)}` +
    `<span class="sb-tip">${esc(it.label)}</span></a>`
  );
}

export function renderRail(activeKey: string, counts: RailCounts = {}): string {
  const todayActive = activeKey === "today" ? " active" : "";
  const flow = WORKFLOW.map((it) => row(it, activeKey, counts, "sb-step")).join("\n    ");

  const sections = SECTIONS.map((sec) => {
    // A section holding the active page opens regardless of its default — otherwise
    // landing on Contracting Officers shows a collapsed rail with nothing highlighted.
    const open = sec.defaultOpen || sec.items.some((it) => it.key === activeKey);
    const rows = sec.items.map((it) => row(it, activeKey, counts, "sb-icon")).join("\n      ");
    return (
      `  <div class="sb-sec" data-open="${open}">\n` +
      `    <button class="sb-sech" type="button" aria-expanded="${open}"><span>${esc(sec.label)}</span>` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></button>\n` +
      `    <div class="sb-secb">\n      ${rows}\n    </div>\n` +
      `  </div>`
    );
  }).join("\n");

  return (
    `<aside class="sidebar">\n` +
    // The retired single-letter mark is deliberately ABSENT — the wordmark stands alone.
    `  <div class="sb-head"><span class="sb-wordmark">FAR<span class="wm-au">audit</span></span>` +
    // id="sbToggle", not "sbCollapse": 18 pages bind this id from a script that
    // survives injection. See deviation 1.
    `<button class="sb-collapse" id="sbToggle" type="button" aria-label="Toggle sidebar">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg></button></div>\n` +
    `  <a class="sb-icon sb-today${todayActive}" href="${TODAY.href}">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${TODAY.icon}</svg>` +
    `<span class="sb-label">${esc(TODAY.label)}</span><span class="sb-tip">${esc(TODAY.label)}</span></a>\n` +
    `  <div class="sb-group-label">Workflow</div>\n` +
    `  <div class="sb-flow">\n    ${flow}\n  </div>\n` +
    sections + `\n` +
    `  <div class="sb-bottom">\n` +
    // Identity is NEVER hardcoded — filled from /api/profile. Empty is honest; a
    // wrong name is not (Rule 61). The handoff markup shipped a real person's name.
    `    <button class="sb-avatar-btn" id="sbAvatarBtn" type="button" aria-haspopup="true" aria-expanded="false">` +
    `<span class="sb-avatar"></span><span class="sb-st"><span class="sb-avatar-name"></span>` +
    `<span class="sb-sub">Profile &amp; settings</span></span>` +
    `<svg class="sb-avatar-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></button>\n` +
    `    <div class="sb-avatar-menu" id="sbAvatarMenu" role="menu" hidden>\n` +
    `      <a class="sb-am-item" role="menuitem" href="/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.settings}</svg>Profile &amp; Settings</a>\n` +
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

// The card-807 rail stylesheet: RAIL v2 base layout + light-rail recolour + rail
// geometry, in that cascade order. Extracted from the handoff reference rather
// than retyped, with every CSS comment stripped — this string is served to the
// browser, so rationale in it would be public.
const RAIL_807_CSS = `.sb-head{display:flex;align-items:center;gap:8px;padding:18px 16px 12px}.sb-collapse{margin-left:auto;width:24px;height:24px;border-radius:7px;border:1px solid var(--sb-divider);background:transparent;color:var(--sb-mute);display:grid;place-items:center;cursor:pointer;flex:none;transition:color .14s,border-color .14s}.sb-collapse:hover{color:#fff;border-color:var(--sb-lit)}.sb-collapse svg{width:13px;height:13px;transition:transform .24s var(--ease)}.sb-find{display:flex;align-items:center;gap:9px;margin:0 12px 8px;padding:8px 10px;width:calc(100% - 24px);background:rgba(255,255,255,.05);border:1px solid var(--sb-divider);border-radius:9px;color:var(--sb-mute);font-size:13px;cursor:pointer;transition:background-color .14s,color .14s}.sb-find:hover{background:rgba(255,255,255,.1);color:#fff}.sb-find svg{width:15px;height:15px;flex:none}.sb-k{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:11px;flex:none}.sb-today{margin:2px 12px;border-radius:9px;padding:8px 11px}.sb-today.active{border-left-color:transparent;background:var(--sb-active)}.sb-due{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;color:#fff;background:#b42318;border-radius:6px;padding:1px 6px;flex:none}.sb-flow{position:relative;padding:2px 0 6px}.sb-step{position:relative;display:flex;align-items:center;gap:11px;padding:8px 12px;margin:0 12px;border-radius:9px;color:var(--sb-text);transition:background-color .14s}.sb-step:hover{background:var(--sb-hover);text-decoration:none}.sb-step svg{width:17px;height:17px;flex:none;opacity:.72}.sb-step:hover svg{opacity:1}.sb-step .sb-label{font-size:14px;font-weight:500;color:var(--sb-text);white-space:nowrap;letter-spacing:-.006em}.sb-step:hover .sb-label{color:#fff}.sb-ct{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:500;color:var(--sb-mute);flex:none;font-variant-numeric:tabular-nums}.sb-st{display:flex;flex-direction:column;min-width:0;gap:1px}.sb-sub{font-size:12px;color:var(--sb-mute);white-space:nowrap;line-height:1.3}.sb-avatar-name{font-size:13.5px;font-weight:600;color:#dbe6f5;white-space:nowrap;line-height:1.3}.sb-step.has .sb-label{color:#fff;font-weight:700}.sb-step.has .sb-ct{color:#cfe4ff;background:rgba(109,179,255,.18);border-radius:6px;padding:1px 6px}.sb-step.has svg{opacity:1;color:var(--sb-lit)}.sb-sec{border-top:1px solid var(--sb-divider);margin:4px 12px 0;padding-top:2px}.sb-sec .sb-secb{margin:0 -12px}.sb-sech{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;padding:11px 4px;cursor:pointer;font-family:Manrope,system-ui,sans-serif;font-size:13px;font-weight:600;letter-spacing:-.005em;text-transform:none;color:var(--sb-mute)}.sb-sech:hover{color:#fff}.sb-sech svg{width:13px;height:13px;margin-left:auto;transition:transform .22s var(--ease)}.sb-sec[data-open="false"] .sb-sech svg{transform:rotate(-90deg)}.sb-secb{overflow:hidden;max-height:420px;transition:max-height .26s var(--ease)}.sb-sec[data-open="false"] .sb-secb{max-height:0}.sb-sec .sb-icon{padding:7px 12px;margin:0 12px;gap:11px;border-radius:9px;font-size:13.5px;font-weight:600}.sb-sec .sb-icon svg{width:16px;height:16px;flex:none;margin:0 3.5px;opacity:.72}.sb-sec .sb-icon:hover svg{opacity:1}.sb-sec .sb-icon .sb-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-pct{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:var(--sb-lit);flex:none;padding-right:0}.sb-dot{margin-left:auto;width:7px;height:7px;border-radius:50%;background:var(--sb-lit);flex:none}.frame{transition:grid-template-columns .24s var(--ease)}[data-sb="mini"] .frame,[data-sb="closed"] .frame{grid-template-columns:66px minmax(0,1fr)}[data-sb="mini"] .sb-label,[data-sb="mini"] .sb-sub,[data-sb="mini"] .sb-k,[data-sb="mini"] .sb-ct,[data-sb="mini"] .sb-pct,[data-sb="mini"] .sb-sech span,[data-sb="mini"] .sb-avatar-name,[data-sb="mini"] .sb-group-label,[data-sb="mini"] .sb-avatar-chev,[data-sb="mini"] .sb-dot,[data-sb="closed"] .sb-label,[data-sb="closed"] .sb-sub,[data-sb="closed"] .sb-k,[data-sb="closed"] .sb-ct,[data-sb="closed"] .sb-pct,[data-sb="closed"] .sb-sech span,[data-sb="closed"] .sb-avatar-name,[data-sb="closed"] .sb-group-label,[data-sb="closed"] .sb-avatar-chev,[data-sb="closed"] .sb-dot{display:none}[data-sb="mini"][data-sb="mini"][data-sb="mini"] .sb-collapse svg,[data-sb="closed"] .sb-collapse svg{transform:rotate(180deg)}[data-sb="mini"] .sb-head,[data-sb="closed"] .sb-head{padding:18px 10px 12px;flex-direction:column;gap:10px}[data-sb="mini"] .sb-find,[data-sb="closed"] .sb-find{margin:0 10px 8px;width:calc(100% - 20px);justify-content:center}[data-sb="mini"] .sb-flow,[data-sb="closed"] .sb-flow{padding:2px 0}[data-sb="mini"] .sb-step,[data-sb="mini"] .sb-icon,[data-sb="mini"] .sb-sech,[data-sb="closed"] .sb-step,[data-sb="closed"] .sb-icon,[data-sb="closed"] .sb-sech{justify-content:center}[data-sb="mini"] .sb-step,[data-sb="mini"] .sb-icon,[data-sb="closed"] .sb-step,[data-sb="closed"] .sb-icon{margin:0 8px;padding:8px 0}.sidebar{background:var(--sb-bg)!important;border-right:1px solid var(--sb-divider);color:var(--sb-text)}.sb-wordmark{color:var(--sb-text)!important}.sb-wordmark .wm-au{color:var(--wm-au)!important}.sb-collapse{border-color:var(--sb-divider);color:var(--sb-mute)}.sb-collapse:hover{color:var(--sb-lit);border-color:var(--accent-line);background:var(--sb-hover)}.sb-find{background:var(--sb-hover);border-color:var(--sb-divider);color:var(--sb-mute)}.sb-find:hover{background:var(--sb-hover);color:var(--sb-text)}.sb-group-label,[data-sb="open"] .sb-group-label{color:var(--sb-mute)}.sb-step,.sb-icon,.sb-sec .sb-icon{color:var(--sb-text)!important;font-size:14.5px;font-weight:600;text-decoration:none}.sb-step:hover,.sb-icon:hover{text-decoration:none}.sb-label{color:var(--sb-text)!important;text-decoration:none}.sb-step svg,.sb-icon svg,.sb-sec .sb-icon svg{width:18px;height:18px;stroke-width:1.75;opacity:1;color:var(--sb-lit)}.sb-step:hover,.sb-icon:hover{background:var(--sb-hover);color:var(--sb-text)}.sb-step:hover .sb-label,.sb-icon:hover .sb-label{color:var(--sb-text)}.sb-step.on,.sb-icon.active{background:var(--sb-active)!important;color:var(--sb-text)!important;font-weight:700}.sb-step.on .sb-label,.sb-icon.active .sb-label{color:var(--sb-text)!important}.sb-step.on svg,.sb-icon.active svg{color:var(--sb-lit)}.sb-ct,.sb-icon .ct,.sb-pct{color:var(--sb-mute)!important}.sb-step.on .sb-ct{color:var(--sb-lit);background:var(--accent-wash)}.sb-sech,.sb-sech span{color:var(--sb-mute)}.sb-sech:hover,.sb-sech:hover span{color:var(--sb-text)}.sb-sec,.sb-avatar-btn{border-top-color:var(--sb-divider)}.sb-divider{background:var(--sb-divider)}.sb-avatar{background:var(--sb-active);color:var(--sb-lit)}.sb-avatar-name{color:var(--sb-text)}.sb-sub,.sb-avatar-chev{color:var(--sb-mute)}.sb-tip{background:var(--ink);color:var(--card)}:root{--sb-bg:#0A1628;--sb-text:#d6e3f2;--sb-mute:#93a8c4;--sb-hover:#12294d;--sb-active:#123c72;--sb-divider:#20375c;--sb-lit:#6db3ff;--wm-au:#378ADD;--ease:cubic-bezier(.22,.61,.36,1);--r:12px;--dc:#e5e7eb;--alarm:#b42318;--alarm-wash:#fef3f2;--alarm-line:#fecdca;--caution:#b54708;--good:#067647;--accent-wash:#f2f8ff;--accent-line:#c8dcf1;--accent-hover:#144e87;--on-accent:#ffffff;--lift:0 1px 2px rgba(15,23,42,.06);--lift-h:0 10px 28px -18px rgba(15,23,42,.22)}:root,[data-theme="light"],[data-theme="auto"]{--sb-bg:#ffffff;--sb-text:#0A1628;--sb-mute:#5d6b7e;--sb-hover:#f1f5f9;--sb-active:#eaf2fd;--sb-divider:#e5e7eb;--sb-lit:#185FA5;--wm-au:#185FA5}[data-theme="dark"]{--sb-bg:#0A1628;--sb-text:#d6e3f2;--sb-mute:#93a8c4;--sb-hover:#12294d;--sb-active:#123c72;--sb-divider:#20375c;--sb-lit:#6db3ff;--wm-au:#378ADD;--accent-wash:rgba(109,179,255,.14);--accent-line:rgba(109,179,255,.32)}.sb-avatar-btn,.sb-avatar-btn *{color:var(--sb-text)!important}.sb-avatar-name{color:var(--sb-text)!important}.sb-sub,.sb-avatar-role,.sb-avatar-chev{color:var(--sb-mute)!important}.sb-avatar{background:var(--sb-active)!important;color:var(--sb-lit)!important}[data-sb="open"]{--sb-width:252px!important}[data-sb="mini"],[data-sb="closed"]{--sb-width:66px!important}.frame,[data-sb="mini"] .frame,[data-sb="open"] .frame,.frame,[data-sb="closed"] .frame,[data-sb="open"] .frame{grid-template-columns:var(--sb-width) minmax(0,1fr)!important}.sidebar{box-sizing:border-box;scrollbar-gutter:stable}[data-sb="mini"] .sb-sech,[data-sb="closed"] .sb-sech{display:none!important}[data-sb="mini"] .sb-sec,[data-sb="closed"] .sb-sec{border-top:1px solid var(--sb-divider)!important;margin:9px 13px 0!important;padding-top:9px!important}[data-sb="mini"] .sb-bottom,[data-sb="closed"] .sb-bottom{border-top:1px solid var(--sb-divider)!important}[data-sb="mini"] .sb-secb,[data-sb="closed"] .sb-secb{display:block!important;max-height:none!important;overflow:visible!important;opacity:1!important;margin:0!important;padding:0!important}[data-sb="mini"] .sb-bottom,[data-sb="closed"] .sb-bottom{margin:9px 0 0!important;padding:9px 0 8px!important;width:100%!important}[data-sb="mini"] .sb-avatar-btn,[data-sb="closed"] .sb-avatar-btn{margin:0 9px!important;padding:6px 0!important;width:auto!important;justify-content:center!important;gap:0!important}[data-sb="mini"] .sb-avatar-name,[data-sb="mini"] .sb-sub,[data-sb="mini"] .sb-avatar-role,[data-sb="mini"] .sb-avatar-chev,[data-sb="closed"] .sb-avatar-name,[data-sb="closed"] .sb-sub,[data-sb="closed"] .sb-avatar-role,[data-sb="closed"] .sb-avatar-chev{display:none!important}[data-sb="mini"] .sb-pct,[data-sb="mini"] .sb-ct,[data-sb="mini"] .sb-dot,[data-sb="closed"] .sb-pct,[data-sb="closed"] .sb-ct,[data-sb="closed"] .sb-dot{display:none!important}[data-sb="mini"] .sb-step,[data-sb="mini"] .sb-icon,[data-sb="mini"] .sb-today,[data-sb="closed"] .sb-step,[data-sb="closed"] .sb-icon,[data-sb="closed"] .sb-today{width:36px!important;height:36px!important;margin:1px auto!important;padding:0!important;justify-content:center!important;border-radius:9px!important;position:relative;flex:none!important}[data-sb="mini"] .sidebar,[data-sb="closed"] .sidebar{overflow-x:hidden!important;overflow-y:auto!important}[data-sb="mini"] .sb-tip,[data-sb="closed"] .sb-tip{display:block!important;z-index:60;position:fixed!important;left:0;top:0;transform:translateY(-50%);pointer-events:none}[data-sb="open"] .sidebar .sb-icon{width:auto!important;height:auto!important;min-height:35px;padding:7px 12px!important;margin:0 12px!important;border-radius:9px!important;box-sizing:border-box}[data-sb="open"] .sidebar .sb-secb{margin:0 -12px!important;padding:0!important}[data-sb="open"] .sidebar .sb-sec .sb-icon svg{margin:0!important}[data-sb="open"] .sidebar .sb-step{margin:0 12px!important;padding:7px 12px!important;min-height:35px;border-radius:9px!important}.sb-find{display:none!important}[data-sb="open"] .sidebar .sb-today{margin:40px 12px 30px!important}[data-sb="mini"] .sidebar .sb-today,[data-sb="closed"] .sidebar .sb-today{margin:30px 9px 22px!important}`;

// §4 ruling: Fraunces 900 at 31.3px. The handoff states this is "already
// implemented — nothing to change"; measured, it is NOT: 16 of the 18 pages set
// .sb-wordmark{display:none} and the other 2 render 16px/800. The rail head shows
// a wordmark, so the ruled treatment is declared here — one source, all 18.
// 31.3px is DERIVED (Fraunces cap height matched to the 31px Manrope reference),
// not a decreed number: re-derive it if the face or the reference changes.
const WORDMARK_CSS =
  `.sb-head .sb-wordmark{display:block!important;font-family:"Fraunces","Georgia",serif;` +
  `font-size:31.3px;font-weight:900;font-style:normal;letter-spacing:-.022em;line-height:1;color:var(--sb-text)}` +
  `.sb-head .sb-wordmark .wm-au{color:var(--wm-au)}` +
  `[data-sb="closed"] .sb-head .sb-wordmark{display:none!important}`;

export function railStyle(): string {
  return (
    `<style id="sb-phase5">` +
    RAIL_807_CSS +
    WORDMARK_CSS +
    `.sb-bottom{position:relative;margin-top:auto}` +
    `.sb-avatar-btn{display:flex;align-items:center;gap:9px;width:100%;padding:7px;border:0;background:transparent;border-radius:9px;cursor:pointer;text-align:left}` +
    `.sb-st{display:flex;flex-direction:column;min-width:0;gap:1px}` +
    `.sb-avatar{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font-size:10.5px;font-weight:700;flex:none}` +
    `.sb-avatar-name{font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden}` +
    `.sb-sub{font-size:10px;white-space:nowrap;overflow:hidden}` +
    `.sb-avatar-chev{width:12px;height:12px;margin-left:auto;flex:none}` +
    `.sb-avatar-menu{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:var(--sb-bg);border:1px solid var(--sb-divider);border-radius:10px;padding:5px;box-shadow:0 16px 40px -18px rgba(0,0,0,.45);z-index:40}` +
    `.sb-avatar-menu[hidden]{display:none}` +
    `.sb-am-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border:0;background:transparent;border-radius:7px;color:var(--sb-text);font-size:11.5px;font-weight:500;cursor:pointer;text-align:left;text-decoration:none}` +
    `.sb-am-item:hover{background:var(--sb-hover)}` +
    `.sb-am-item svg{width:14px;height:14px;flex:none}` +
    `.sb-am-signout{color:var(--alarm)}` +
    // ── LIVE-PILL HONESTY GUARD ─────────────────────────────────────────────────
    // `.live-pill{display:inline-flex}` OUTRANKS the `hidden` attribute, so a page
    // hiding its pill while loading/empty/erroring still PAINTS a green LIVE badge.
    // One line here covers every rail-injected page, including pages added later.
    `.live-pill[hidden]{display:none!important}` +
    `.sb-am-sep{height:1px;background:var(--sb-divider);margin:4px 2px}` +
    `.sb-am-label{padding:2px 9px 4px;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sb-mute)}` +
    // Colour alone does not carry the checked state — weight and a filled dot too,
    // so it survives a monochrome or high-contrast view.
    `.sb-am-theme[aria-checked="true"]{background:var(--sb-active);font-weight:650}` +
    `.sb-am-theme[aria-checked="true"]::after{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;margin-left:auto;flex:none}` +
    `</style>`
  );
}

export function railScript(): string {
  return (
    `<script>(function(){var b=document.getElementById('sbAvatarBtn'),m=document.getElementById('sbAvatarMenu');` +
    `if(b&&m){var close=function(){m.hidden=true;b.setAttribute('aria-expanded','false');};` +
    `b.addEventListener('click',function(e){e.stopPropagation();var o=m.hidden;m.hidden=!o;b.setAttribute('aria-expanded',String(o));});` +
    `document.addEventListener('click',function(e){if(!m.hidden&&!m.contains(e.target)&&e.target!==b)close();});` +
    `document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});}` +
    // ── SECTIONS ────────────────────────────────────────────────────────────────
    // data-open on .sb-sec, mirrored into aria-expanded so the control states its
    // own status rather than only looking open.
    `document.addEventListener('click',function(e){if(!e.target.closest)return;` +
    `var h=e.target.closest('.sb-sech');if(!h)return;var s=h.closest('.sb-sec');if(!s)return;` +
    `var o=s.getAttribute('data-open')==='true';s.setAttribute('data-open',String(!o));` +
    `h.setAttribute('aria-expanded',String(!o));syncInert();});` +
    // ── INERT ───────────────────────────────────────────────────────────────────
    // max-height:0 hides pixels but NOT focus, so a collapsed section left its links
    // in the tab order. But data-open only means anything in the OPEN rail: collapsed,
    // every .sb-secb is promoted into the flat icon strip, so marking a "closed"
    // section inert there would remove VISIBLE rows from hit-testing entirely.
    // The mode is part of the state.
    `function syncInert(){var st=document.documentElement.getAttribute('data-sb');` +
    `var strip=st==='closed'||st==='mini';` +
    `document.querySelectorAll('.sb-sec').forEach(function(s){var b=s.querySelector('.sb-secb');if(!b)return;` +
    `if(strip||s.getAttribute('data-open')==='true'){b.removeAttribute('inert');b.removeAttribute('aria-hidden');}` +
    `else{b.setAttribute('inert','');b.setAttribute('aria-hidden','true');}});}` +
    `syncInert();` +
    // Observe the attribute rather than guessing which controls change it. Bound to
    // #sbToggle clicks alone the sync went stale on every OTHER path — measured: setting
    // data-sb directly left a section inert in the strip, and its three VISIBLE rows failed
    // hit-testing. The page's own inline script also writes this attribute on load, which a
    // deferred click handler cannot see at all.
    `if(window.MutationObserver){new MutationObserver(syncInert).observe(document.documentElement,{attributes:true,attributeFilter:['data-sb']});}` +
    `else{document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#sbToggle'))setTimeout(syncInert,0);});}` +
    // ── TOOLTIPS ────────────────────────────────────────────────────────────────
    // Placed from the row's measured rect because the rail stays a scroll container:
    // position:fixed is the only way the tip clears the clip. Gated on the COLLAPSED
    // state — the handoff's script tested for 'mini', which this rail never sets.
    `document.addEventListener('mouseover',function(e){if(!e.target.closest)return;` +
    `var a=e.target.closest('.sb-step,.sb-icon');if(!a)return;` +
    `var st=document.documentElement.getAttribute('data-sb');if(st!=='closed'&&st!=='mini')return;` +
    `var t=a.querySelector('.sb-tip');if(!t)return;var r=a.getBoundingClientRect();` +
    `t.style.left=(r.right+12)+'px';t.style.top=(r.top+r.height/2)+'px';});` +
    // ── APPEARANCE: light · dark · system ───────────────────────────────────────
    // Stored preference is light|dark|auto under the SAME key the per-page inline
    // scripts use. Those run earlier and set the raw value; this runs last and
    // RESOLVES `auto` against the OS, so System works with no CSS changes — and
    // naics/run-audit, which never match [data-theme="auto"], stay styled.
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
    `if(mq){var onSys=function(){if(pref()==='auto')apply('auto',false);};` +
    `if(mq.addEventListener)mq.addEventListener('change',onSys);else if(mq.addListener)mq.addListener(onSys);}` +
    // Identity hydration — the SIGNED-IN user from /api/profile, never hardcoded.
    `fetch('/api/profile',{credentials:'include'}).then(function(r){return r.ok?r.json():null;}).then(function(p){` +
    `if(!p)return;var name=(p.full_name||'').trim()||String(p.email||'').split('@')[0];if(!name)return;` +
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
// and inject the CSS + script once (before </body>). Safe no-op if markers absent.
export function injectRail(html: string, activeKey: string, counts: RailCounts = {}): string {
  let out = html.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, () => renderRail(activeKey, counts));
  if (out.includes('id="sb-phase5"') === false) {
    out = out.includes("</body>")
      ? out.replace("</body>", `${railStyle()}${railScript()}</body>`)
      : out + railStyle() + railScript();
  }
  return out;
}
