/* =============================================================================
   v5 Report — stylesheet (REPORT_V5_CSS)
   Ported VERBATIM from the Design v5 package (_v5-PORT-READY/src/report-v5.css, 2026-07-05).
   Theming rule: the page holds the FARaudit theme; only --tone changes as an ACCENT
   (go #1f9160 / caution #c06a12 / stop #b3352c / slate #465468) — never re-themed by state.
   FONTS (Phase-5 HARD GATE — DONE): Space Grotesk + IBM Plex Mono are embedded
   (base64 woff2) via FONTS_CSS, prepended into the render document ahead of this
   stylesheet; the Google Fonts @import was removed so the web view is self-hosted
   (no external CDN — privacy/reliability for gov customers).
   ============================================================================= */
export const REPORT_V5_CSS = `/* =============================================================================
   v5 Report — "The Gate Brief"  ·  single direction, light, boardroom-projector
   Fonts embedded (base64 woff2) via FONTS_CSS ahead of this stylesheet — Phase-5.
   ============================================================================= */

:root{
  --go:#1f8a5b; --go-tint:#e8f3ec;
  --caution:#b5620c; --caution-tint:#f6ecdf;
  --stop:#a02f29; --stop-tint:#f6e6e4;
  --slate:#3a4655; --slate-tint:#e9edf2;
  --accent:#2a6fdb; --accent-deep:#1f56ad;

  --ink:#141b24; --ink-2:#3d4a59; --ink-3:#6b7887;
  --line:#e2e7ee; --line-2:#eef2f6;
  --sheet:#ffffff; --desk:#eaedf2;
  --sidebar:#0d1622; --sidebar-2:#16202e; --sidebar-ink:#aebccd;

  --font: 'Space Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;
  --r: 14px;
  --shadow: 0 1px 2px rgba(16,26,40,.05), 0 8px 26px rgba(16,26,40,.07);
}

*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--desk); color:var(--ink); font-family:var(--font);
  -webkit-font-smoothing:antialiased; font-size:15px; line-height:1.5;}
.mono{font-family:var(--mono); font-feature-settings:"tnum" 1;}

/* ---- app shell ----------------------------------------------------------- */
.app{display:grid; grid-template-columns:236px 1fr; min-height:100vh;}
.sidebar{background:var(--sidebar); color:var(--sidebar-ink); padding:20px 16px;
  display:flex; flex-direction:column; gap:22px; position:sticky; top:0; height:100vh; overflow:auto;}
.sb-brand{display:flex; align-items:center; gap:9px; color:#fff; font-weight:700; letter-spacing:-.01em; font-size:16px;}
.sb-brand .dot{width:22px;height:22px;border-radius:6px;background:linear-gradient(150deg,var(--accent),#5b93ea);display:grid;place-items:center;color:#fff;font-size:12px;}
.sb-grp{display:flex; flex-direction:column; gap:2px;}
.sb-gh{font-size:11px; text-transform:uppercase; letter-spacing:.13em; color:#5d6f84; padding:4px 10px; font-weight:600;}
.sb-i{display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:9px; color:var(--sidebar-ink); text-decoration:none; font-size:13.5px; cursor:pointer;}
.sb-i:hover{background:var(--sidebar-2); color:#fff;}
.sb-i.on{background:var(--sidebar-2); color:#fff;}
.sb-i .ic{width:16px;height:16px;opacity:.8;flex:none;}
.sb-i .ic svg{width:100%;height:100%;}
.sb-spring{flex:1}

/* ---- topbar -------------------------------------------------------------- */
.main{min-width:0; display:flex; flex-direction:column;}
.topbar{position:sticky; top:0; z-index:30; background:rgba(255,255,255,.85);
  backdrop-filter:saturate(1.4) blur(10px); border-bottom:1px solid var(--line);
  display:flex; align-items:center; gap:14px; padding:11px 24px;}
.tb-crumb{display:flex; align-items:center; gap:8px; color:var(--ink-3); font-size:13px; min-width:0;}
.tb-crumb .sep{opacity:.5}
.tb-crumb .cur{color:var(--ink); font-weight:600;}
.tb-live{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--go);
  border:1px solid var(--go-tint);background:var(--go-tint);padding:3px 8px;border-radius:20px;font-weight:600;}
.tb-live::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--go);}
.tb-spring{flex:1}
.tb-actions{display:flex; align-items:center; gap:10px;}
.btn{display:inline-flex; align-items:center; gap:8px; padding:9px 15px; border-radius:10px;
  font-family:var(--font); font-size:13.5px; font-weight:600; cursor:pointer; border:1px solid transparent; text-decoration:none;}
.btn svg{width:16px;height:16px;}
.btn-primary{background:var(--accent); color:#fff; box-shadow:0 1px 2px rgba(31,86,173,.4), 0 6px 16px rgba(42,111,219,.28);}
.btn-primary:hover{background:var(--accent-deep);}
.btn-ghost{background:#fff; color:var(--ink); border-color:var(--line);}
.btn-ghost:hover{border-color:#cdd6e0; background:#fbfcfe;}
.btn[disabled]{opacity:.55; cursor:not-allowed; box-shadow:none; background:#eef1f5; color:var(--ink-3); border-color:var(--line);}

/* ---- stage: rail + article ---------------------------------------------- */
.stage{display:grid; grid-template-columns:1fr 224px; gap:40px; max-width:1640px;
  width:100%; margin:0 auto; padding:34px 40px 90px;}
.report{min-width:0;}
.cmd,.sec,.disc,.ev-lead,.rc{scroll-margin-top:80px;}
.rail{position:sticky; top:88px; align-self:start; display:flex; flex-direction:column; gap:2px;}
.rail-h{font-size:11px; text-transform:uppercase; letter-spacing:.13em; color:var(--ink-3); font-weight:600; padding:4px 12px 8px;}
.rail a{display:flex; align-items:center; gap:9px; padding:7px 12px; border-radius:8px; color:var(--ink-2);
  text-decoration:none; font-size:13px; border-left:2px solid transparent;}
.rail a:hover{background:#fff; color:var(--ink);}
.rail a.on{color:var(--ink); font-weight:600; background:#fff; border-left-color:var(--accent); box-shadow:var(--shadow);}
.rail a .rdot{width:6px;height:6px;border-radius:50%;background:var(--line);flex:none;}
.rail a.on .rdot{background:var(--accent);}

/* ---- REP banner ---------------------------------------------------------- */
.rep-banner{background:repeating-linear-gradient(135deg,#fbe9c8 0 14px,#f7e1b6 14px 28px);
  border:1px solid #e6c983; color:#7a5410; border-radius:10px; padding:9px 14px; font-size:12.5px;
  margin-bottom:22px; font-weight:500;}

/* =============================================================================
   COMMAND HEADER — the first screen
   ============================================================================= */
.cmd{background:var(--sheet); border:1px solid var(--line); border-radius:20px;
  padding:26px 28px 28px; box-shadow:var(--shadow); position:relative; overflow:hidden;}
.cmd::before{content:""; position:absolute; inset:0 0 auto 0; height:4px;
  background:var(--tone-c, var(--slate));}
.cmd[data-tone="go"]{--tone-c:var(--go); --tone-tint:var(--go-tint);}
.cmd[data-tone="caution"]{--tone-c:var(--caution); --tone-tint:var(--caution-tint);}
.cmd[data-tone="stop"]{--tone-c:var(--stop); --tone-tint:var(--stop-tint);}
.cmd[data-tone="slate"]{--tone-c:var(--slate); --tone-tint:var(--slate-tint);}

.cmd-eyebrow{display:flex; align-items:center; gap:11px; margin-bottom:12px;}
.cmd-badge{background:var(--ink); color:#fff; font-size:11px; font-weight:600; letter-spacing:.08em;
  padding:4px 9px; border-radius:6px;}
.cmd-sol{font-size:12.5px; color:var(--ink); letter-spacing:.02em; font-weight:500;
  background:#eef2f7; border:1px solid var(--line); border-radius:6px; padding:3px 9px;}
.cmd-title{font-size:clamp(24px,2.5vw,32px); line-height:1.12; letter-spacing:-.02em; font-weight:600; margin:0 0 14px;}
.cmd-meta{display:grid; grid-template-columns:1fr auto; gap:26px; align-items:start;
  margin-bottom:22px; padding:18px 20px; background:#f7f9fc; border:1px solid var(--line); border-radius:14px;}
.cmd-facts{display:grid; grid-template-rows:auto auto; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr);
  column-gap:38px; row-gap:16px; min-width:0;}
.cmd-fact{display:flex; flex-direction:column; min-width:0;}
.cmd-fact:nth-child(even){border-top:1px solid var(--line); padding-top:16px;}
.cmd-fact b{color:var(--accent-deep); font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:.11em; line-height:1; margin-bottom:6px;
  width:fit-content; align-self:flex-start; border-bottom:1px solid rgba(31,86,173,.45); padding-bottom:4px;}
.cf-v{font-size:13.5px; color:var(--ink); font-weight:500; line-height:1.4; letter-spacing:-.005em;}
.cmd-naics{align-self:start; border:1px solid #d5e2f4; background:linear-gradient(180deg,#f4f8fe,#eaf1fb);
  border-radius:12px; padding:12px 16px 13px; min-width:172px;}
.cmd-naics-k{font-size:9.5px; text-transform:uppercase; letter-spacing:.12em; color:var(--accent-deep); font-weight:700;}
.cmd-naics-v{font-size:22px; font-weight:600; color:var(--ink); letter-spacing:.01em; line-height:1.05; margin-top:4px;}
.cmd-naics-sub{font-size:11px; color:var(--ink-2); margin-top:6px; line-height:1.45; max-width:24ch;}

.cmd-verdict{margin-bottom:22px;}
.cmd-decision{display:grid; grid-template-columns:1fr 340px; gap:30px; align-items:start;}
.cmd-detail{min-width:0;}
.cmd-vrow{display:flex; align-items:center; gap:14px; margin-bottom:12px;}
.cmd-vchips{display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:0;}
.cmd-ico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none;
  color:var(--tone-c); background:var(--tone-tint);}
.cmd-ico svg{width:23px;height:23px;}
.cmd-word{font-size:clamp(26px,2.8vw,38px); line-height:1.08; font-weight:700; letter-spacing:-.02em; color:var(--tone-c); white-space:nowrap;}
.cmd[data-noverdict="1"] .cmd-word{color:var(--slate); background:repeating-linear-gradient(135deg,transparent 0 8px,rgba(58,70,85,.06) 8px 9px);}
.cmd-stamp{font-size:11px; font-weight:600; letter-spacing:.14em; color:var(--tone-c);
  border:1.5px solid currentColor; border-radius:6px; padding:3px 8px; align-self:center;}
.cmd-elig{display:inline-flex; align-items:stretch; border-radius:8px; font-size:12px;
  border:1px solid var(--line); background:#fff; white-space:nowrap; overflow:hidden;}
.cmd-elig .ce-k{display:flex; align-items:center; color:var(--ink-3); font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; font-weight:600;
  padding:5px 9px; background:#f6f8fa; border-right:1px solid var(--line);}
.cmd-elig .ce-v{display:flex; align-items:center; font-weight:600; padding:5px 10px;}
.cmd-elig.ok .ce-v{color:var(--go);} .cmd-elig.no .ce-v{color:var(--stop);} .cmd-elig.nd .ce-v{color:var(--caution);}
.cmd-nocharge{font-size:11px; font-weight:600; letter-spacing:.04em; color:var(--slate); white-space:nowrap;
  background:var(--slate-tint); border-radius:20px; padding:5px 11px; align-self:center;}
.cmd-declead{display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:0 0 12px;}
.cmd-eyebrow-t{font-size:12px; text-transform:uppercase; letter-spacing:.11em; color:var(--tone-c); font-weight:600; margin:0;}
.cmd-clock{display:inline-flex; align-items:center; gap:9px; padding:6px 12px 6px 10px;
  background:#f4f7fa; border:1px solid var(--line-2); border-radius:8px;}
.cmd-clock-ic{width:15px; height:15px; color:var(--ink-3); flex-shrink:0;}
.cmd-clock-ic svg{width:100%; height:100%; display:block;}
.cmd-clock-k{font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-3); font-weight:600;}
.cmd-clock-v{font-size:12.5px; color:var(--ink); font-weight:500; letter-spacing:-.01em; white-space:nowrap;}
/* Deadline reset/reconcile caveat under the clock (flag AUDIT_V5_DEADLINE_CAVEAT). od.sub already leads with "⚠". */
.cmd-clock-caveat{margin-top:7px; font-size:11.5px; line-height:1.45; color:var(--ink-2); max-width:56ch; padding-left:11px; border-left:2px solid var(--tone-c); text-wrap:pretty;}

.cmd-bl{border-left:3px solid var(--tone-c); padding:2px 0 2px 16px; margin-bottom:20px;}
.cmd-bl-k{display:block; font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:var(--ink-3); font-weight:600; margin-bottom:5px;}
.cmd-bl-t{margin:0; font-size:16px; line-height:1.55; color:var(--ink); text-wrap:pretty; max-width:74ch;}
/* Self-clearable caveat list — top-N ranked, remainder grouped (card #612-(3c)). Replaces
   the ~50-item semicolon wall the rationale used to dump into the bottom line. */
.cmd-bl-caveats{list-style:none; margin:11px 0 0; padding:0; display:grid; gap:6px;}
.cmd-bl-caveats li{position:relative; padding-left:17px; font-size:13.5px; line-height:1.5; color:var(--ink-2, #3a4553); text-wrap:pretty; max-width:74ch;}
.cmd-bl-caveats li::before{content:"›"; position:absolute; left:3px; top:-1px; color:var(--tone-c); font-weight:700;}
.cmd-bl-more{margin:9px 0 0; font-size:12px; color:var(--ink-3); font-weight:600;}
.cmd-bl-more a{color:inherit; text-decoration:none; border-bottom:1px solid var(--line, #d7dee6);}

.cmd-drivers{}
.cmd-drv-h{font-size:11px; text-transform:uppercase; letter-spacing:.11em; color:var(--ink-3); font-weight:600; margin-bottom:9px;}
.cmd-drv{display:grid; grid-template-columns:auto 1fr auto; gap:12px 14px; align-items:baseline; text-decoration:none;
  padding:10px 13px; border-radius:9px; border:1px solid var(--line-2); background:#fbfcfe; margin-bottom:7px; color:var(--ink);}
.cmd-drv:hover{border-color:#c6d5ea; background:#fff;}
.cmd-drv::after{content:"\\2192"; color:var(--ink-3); font-size:14px; align-self:center; transition:transform .15s ease, color .15s ease;}
.cmd-drv:hover::after{color:var(--accent); transform:translateX(3px);}
.cmd-drv:hover .cmd-drv-req{text-decoration:underline; text-underline-offset:2px; text-decoration-color:rgba(42,111,219,.45);}
.cmd-drv-cite{font-size:11.5px; color:var(--accent); white-space:nowrap;}
.cmd-drv-req{font-size:13px; line-height:1.4; color:var(--ink-2); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;}

/* bento tiles */
.cmd-tiles{display:grid; grid-template-columns:1fr 1fr; grid-auto-rows:1fr; gap:12px;}
.cmd-tile{border:1px solid var(--line); border-radius:13px; padding:15px 15px 13px; background:#fff; position:relative; overflow:hidden;
  display:flex; flex-direction:column; min-height:118px;}
.cmd-tile::before{content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--tt,var(--slate));}
.cmd-tile[data-tone="go"]{--tt:var(--go);} .cmd-tile[data-tone="caution"]{--tt:var(--caution);}
.cmd-tile[data-tone="stop"]{--tt:var(--stop);} .cmd-tile[data-tone="slate"]{--tt:var(--slate);}
.ct-v{font-size:26px; font-weight:700; letter-spacing:-.02em; color:var(--tt); line-height:1.05;}
.cmd-tile.is-textv .ct-v{font-size:18px; line-height:1.15; white-space:nowrap;}
.cmd-tile[data-tone="slate"] .ct-v{color:var(--ink);}
.ct-k{font-size:13px; font-weight:600; margin-top:4px;}
.ct-sub{font-size:11.5px; color:var(--ink-3); margin-top:auto; padding-top:10px;}

/* =============================================================================
   SECTIONS
   ============================================================================= */
.sec{background:var(--sheet); border:1px solid var(--line); border-radius:16px;
  padding:22px 26px 24px; box-shadow:var(--shadow); margin-top:20px;}
.sec-head{display:flex; align-items:baseline; gap:12px; margin-bottom:16px; flex-wrap:wrap;}
.sec-n{font-size:12px; color:var(--ink-3);}
.sec-head h2{font-size:18px; font-weight:600; letter-spacing:-.01em; margin:0;}
.sec-note{font-size:12.5px; color:var(--ink-3); margin-left:auto;}
.sec-lead{font-size:14px; color:var(--ink-2); margin:0 0 16px; max-width:74ch; text-wrap:pretty;}
.sec-foot{font-size:12px; color:var(--ink-3); margin:12px 0 0; font-style:italic;}
.sec-absence{font-size:14px; color:var(--ink-2); margin:0; padding:14px 16px; background:#f6f8fa; border-radius:10px;}

/* =============================================================================
   HOW THIS CALL WAS REACHED — the reasoning chain (always-visible, export-safe)
   A routing walk down ordered pass/fail gates that lands on a pole. Not a tally.
   ============================================================================= */
.rc{background:var(--sheet); border:1px solid var(--line); border-radius:18px;
  padding:24px 28px 26px; box-shadow:var(--shadow); margin-top:20px;}
.rc-top{margin-bottom:20px;}
.rc-h{font-size:18px; font-weight:600; letter-spacing:-.01em; margin:0;}
.rc-intro{font-size:13px; color:var(--ink-3); margin:8px 0 0; max-width:74ch; line-height:1.6; text-wrap:pretty;}
.rc-steps{display:flex; flex-direction:column;}
.rc-step{display:grid; grid-template-columns:44px 1fr; gap:16px; padding:0 0 20px;}
.rc-step:last-child{padding-bottom:0;}
/* left rail: node + connector line */
.rc-rail{position:relative; display:flex; justify-content:center;}
.rc-rail::before{content:""; position:absolute; top:30px; bottom:-20px; width:2px; background:var(--line);}
.rc-step:last-child .rc-rail::before{display:none;}
.rc-node{width:30px; height:30px; border-radius:9px; display:grid; place-items:center; flex:none; z-index:1;
  font-size:12px; font-weight:600; background:#fff; border:2px solid var(--line); color:var(--ink-3);}
.rc-step[data-tone="go"] .rc-node{border-color:var(--go); color:var(--go); background:var(--go-tint);}
.rc-step[data-tone="caution"] .rc-node{border-color:var(--caution); color:var(--caution); background:var(--caution-tint);}
.rc-step[data-tone="stop"] .rc-node{border-color:var(--stop); color:var(--stop); background:var(--stop-tint);}
.rc-skip .rc-node{border-style:dashed; background:#fff; color:var(--ink-3); border-color:var(--line);}
/* body */
.rc-body{min-width:0; padding-top:2px;}
.rc-head{margin-bottom:7px;}
.rc-label{display:block; font-size:10px; text-transform:uppercase; letter-spacing:.11em; color:var(--ink-3); font-weight:700; line-height:1.35; margin-bottom:3px;}
.rc-out{display:inline-flex; align-items:center; gap:9px; font-size:16px; font-weight:700; letter-spacing:-.01em; line-height:1.2; color:var(--ink);}
.rc-step[data-tone="go"] .rc-out{color:var(--go);}
.rc-step[data-tone="caution"] .rc-out{color:var(--caution);}
.rc-step[data-tone="stop"] .rc-out{color:var(--stop);}
.rc-skip .rc-out{color:var(--ink-3); font-weight:500; font-style:italic;}
.rc-detail{font-size:13.5px; color:var(--ink-2); margin:0; line-height:1.55; max-width:78ch; text-wrap:pretty;}
.rc-skip .rc-detail{color:var(--ink-3);}
/* driver-finding rows inside a step */
.rc-finds{display:flex; flex-direction:column; gap:6px; margin-top:11px;}
.rc-find{display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:baseline; text-decoration:none;
  padding:9px 12px; border-radius:9px; border:1px solid var(--line-2); background:#fbfcfe; color:var(--ink);}
.rc-find:hover{border-color:#d3dce6; background:#fff;}
.rc-find-cite{font-size:11.5px; color:var(--accent-deep); white-space:nowrap;}
.rc-find-req{font-size:13px; line-height:1.4; color:var(--ink-2);}
/* bare cite chips (blocking-condition / conflict steps) */
.rc-cites{display:flex; flex-wrap:wrap; gap:7px; margin-top:10px;}
.rc-cite{font-size:11.5px; color:var(--accent-deep); text-decoration:none; background:#eef3fb;
  border:1px solid #dce7f6; border-radius:6px; padding:3px 9px;}
.rc-cite:hover{background:#e2ecfa;}
/* the verdict step — the landing */
.rc-verdict{padding-bottom:0;}
.rc-verdict .rc-node{color:#fff;}
.rc-verdict[data-tone="go"] .rc-node{background:var(--go); border-color:var(--go);}
.rc-verdict[data-tone="caution"] .rc-node{background:var(--caution); border-color:var(--caution);}
.rc-verdict[data-tone="stop"] .rc-node{background:var(--stop); border-color:var(--stop);}
.rc-verdict[data-tone="slate"] .rc-node{background:var(--slate); border-color:var(--slate);}
.rc-verdict .rc-body{background:var(--tone-tint,#f4f7fa); border:1px solid var(--line); border-radius:12px;
  padding:14px 18px; margin-top:-4px;}
.rc-verdict[data-tone="go"]{--tone-tint:var(--go-tint);}
.rc-verdict[data-tone="caution"]{--tone-tint:var(--caution-tint);}
.rc-verdict[data-tone="stop"]{--tone-tint:var(--stop-tint);}
.rc-verdict[data-tone="slate"]{--tone-tint:var(--slate-tint);}
.rc-verdict .rc-out{font-size:16px; font-weight:700; letter-spacing:-.01em;}
.rc-stamp{font-size:9.5px; font-weight:600; letter-spacing:.13em; padding:3px 7px; border-radius:5px;
  border:1.5px solid currentColor;}

/* =============================================================================
   EVIDENCE — on-demand accordion
   ============================================================================= */
.ev-lead{display:flex; align-items:flex-end; justify-content:space-between; gap:24px;
  flex-wrap:wrap; margin-top:34px; padding:0 6px;}
.ev-text{min-width:0;}
.ev-h{font-size:18px; font-weight:600; letter-spacing:-.01em; margin:0;}
.ev-p{font-size:13.5px; color:var(--ink-3); margin:7px 0 0; max-width:64ch; line-height:1.55; text-wrap:pretty;}
.ev-toggle{background:#fff; border:1px solid var(--line); border-radius:9px; padding:9px 15px;
  font-family:var(--font); font-size:12.5px; font-weight:600; color:var(--ink-2); cursor:pointer; white-space:nowrap;}
.ev-toggle:hover{border-color:#cdd6e0; background:#fbfcfe;}

.disc{background:var(--sheet); border:1px solid var(--line); border-radius:16px;
  box-shadow:var(--shadow); margin-top:14px; overflow:hidden; position:relative;}
.disc::before{content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:transparent;}
.disc[data-tone="stop"]::before{background:var(--stop);}
.disc[data-tone="caution"]::before{background:var(--caution);}
.disc-top{width:100%; display:grid; grid-template-columns:auto auto 1fr auto; gap:16px; align-items:center;
  padding:17px 26px; background:none; border:none; cursor:pointer; text-align:left; font-family:var(--font);}
.disc-top--flat{cursor:default;}
.disc-top:hover:not(.disc-top--flat){background:#fbfcfe;}
.disc-n{font-size:12px; color:var(--ink-3);}
.disc-title{font-size:16px; font-weight:600; letter-spacing:-.01em; color:var(--ink); white-space:nowrap;}
.disc-sum{font-size:13px; color:var(--ink-2); justify-self:end; text-align:right; display:inline-flex; align-items:center; white-space:nowrap;}
.disc-sum.muted{color:var(--ink-3);}
.disc-sum b{font-weight:600; color:var(--ink);}
.disc-sum .sum-sep{margin:0 9px; color:var(--ink-4, #b6bfc9); font-weight:400;}
.ds-dot{width:8px; height:8px; border-radius:50%; margin-right:9px; flex:none; background:var(--slate);}
.ds-dot[data-tone="go"]{background:var(--go);} .ds-dot[data-tone="caution"]{background:var(--caution);} .ds-dot[data-tone="stop"]{background:var(--stop);}
.disc-chev{width:20px; height:20px; color:var(--ink-3); transition:transform .22s ease; justify-self:end;}
.disc-chev svg{width:100%; height:100%;}
.disc[data-open="1"] .disc-chev{transform:rotate(180deg);}
.disc[data-open="1"] .disc-top{border-bottom:1px solid var(--line-2);}
.disc-body{display:none; padding:20px 26px 24px;}
.disc[data-open="1"] .disc-body{display:block;}
.disc-note{font-size:12.5px; color:var(--ink-3); margin:0 0 16px;}

/* findings */
.fg{margin-top:14px;}
.fg:first-of-type{margin-top:0;}
/* group members indent under their header (parent→child hierarchy) with a faint guide */
.fg-items{margin-left:4px; padding-left:18px; border-left:2px solid var(--line-2);}
.fg-h{display:flex; align-items:center; gap:9px; font-size:12px; font-weight:700; text-transform:uppercase;
  letter-spacing:.08em; color:var(--ink-2); padding-bottom:9px; margin-bottom:8px; border-bottom:1px solid var(--line-2);}
.fg-h::before{content:""; width:9px;height:9px;border-radius:3px; background:var(--slate); flex:none;}
.fg-h[data-sev="p0"]::before{background:var(--stop);}
.fg-h[data-sev="p1"]::before{background:var(--caution);}
.fg-h[data-sev="p2"]::before{background:var(--ink-3);}
.fg-h[data-sev="ok"]::before{background:var(--go);}
.fg-h[data-sev="review"]::before{background:var(--caution);}
.fg-c{font-size:11px; font-weight:700; letter-spacing:0; color:var(--ink-2); background:var(--line-2);
  border-radius:20px; min-width:19px; text-align:center; padding:1px 7px; line-height:1.5;}
.fg-h[data-sev="p0"] .fg-c{background:var(--stop-tint); color:var(--stop);}
.fg-h[data-sev="p1"] .fg-c{background:var(--caution-tint); color:var(--caution);}
.fg-h[data-sev="ok"] .fg-c{background:var(--go-tint); color:var(--go);}
.fg-h[data-sev="review"] .fg-c{background:var(--slate-tint); color:var(--slate);}
.fg-none{font-size:13px; color:var(--ink-3); margin:0 0 8px; padding:13px 15px; border:1px dashed var(--line); border-radius:11px; background:none;}

.fd{border:1px solid var(--line); border-radius:11px; margin-bottom:8px; overflow:hidden; background:#fff;}
.fd[data-open="1"]{border-color:#d4dde7; box-shadow:var(--shadow);}
.fd-top{width:100%; display:grid; grid-template-columns:auto 1fr auto auto; gap:13px; align-items:start;
  padding:13px 15px; background:none; border:none; cursor:pointer; text-align:left; font-family:var(--font);}
.fd-sev,.fd-cite,.fd-chev{margin-top:1px;}
.fd-sev{font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:3px 8px; border-radius:6px; white-space:nowrap;}
.fd-sev[data-sev="p0"]{background:var(--stop-tint); color:var(--stop);}
.fd-sev[data-sev="p1"]{background:var(--caution-tint); color:var(--caution);}
.fd-sev[data-sev="p2"]{background:#eef1f5; color:var(--ink-2);}
/* no-verdict pole — calm "blocking condition · needs review": graphite chip (not red, mixed-case) + warm-amber rail (Design v5 gate) */
.fd-sev[data-sev="review"]{background:var(--slate-tint); color:var(--slate); text-transform:none; letter-spacing:.01em; font-weight:600;}
.fd[data-sev="review"]{border-left:3px solid var(--caution);}
.fd-req{font-size:14px; color:var(--ink); line-height:1.4;}
.fd-mid{min-width:0; display:flex; flex-direction:column; gap:6px;}
.fd-drives{align-self:flex-start; display:inline-flex; align-items:center; gap:5px;
  font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
  color:var(--accent); background:#e9f1fc; padding:2px 8px 2px 6px; border-radius:5px; white-space:nowrap;}
.fd-drives svg{width:11px; height:11px; flex:none;}
.fd:not([data-open="1"]) .fd-req{display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;}
.fd-cite{font-size:12px; color:var(--ink-3); white-space:nowrap;}
.fd-chev{width:18px;height:18px;color:var(--ink-3); transition:transform .2s;}
.fd-chev svg{width:100%;height:100%;}
.fd[data-open="1"] .fd-chev{transform:rotate(180deg);}
.fd-body{display:none; padding:0 15px 15px 15px;}
.fd[data-open="1"] .fd-body{display:block;}
.fd-ex{margin:0 0 12px; padding:12px 15px; background:#f6f8fa; border-left:3px solid var(--ink-3);
  border-radius:0 8px 8px 0; font-size:13.5px; line-height:1.55; color:var(--ink-2);}
.fd-ex cite{display:block; margin-top:8px; font-size:11.5px; color:var(--ink-3); font-style:normal; font-family:var(--mono);}
.fd-temporal{display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--ink-2); margin-bottom:12px; flex-wrap:wrap;}
.fd-t-k{font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:.09em; color:var(--ink-3);}
.fd-t-m{white-space:nowrap; color:var(--ink-2); background:#f4f7fa; border:1px solid var(--line-2); border-radius:6px; padding:2px 9px;}
.fd-t-m b{color:var(--ink); font-weight:700;}
.fd-t-status{white-space:nowrap; font-size:12px; font-weight:600; padding:2px 10px; border-radius:20px; background:var(--go-tint); color:var(--go);}
.fd-temporal.bad .fd-t-status{background:var(--stop-tint); color:var(--stop);}
.fd-cure{display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:baseline; font-size:13.5px;
  color:var(--ink-2); background:var(--go-tint); border-left:3px solid var(--go); border-radius:0 8px 8px 0; padding:11px 14px;}
.fd-cure-k{font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--go); white-space:nowrap;}

/* satisfied facts = individual white cards, aligned with gate/advisory cards (green dot marks "passed") */
.sat-list{background:none; border:none; padding:0;}
.sat{display:grid; grid-template-columns:auto 1fr auto; gap:11px; align-items:center; padding:13px 15px;
  border:1px solid var(--line); border-radius:11px; margin-bottom:8px; background:#fff; font-size:13.5px;}
.sat:last-child{margin-bottom:0;}
.sat-dot{width:7px;height:7px;border-radius:50%;background:var(--go); flex:none;}
.sat-cite{font-size:11.5px; color:var(--ink-3); white-space:nowrap;}

/* tables */
.grid{width:100%; border-collapse:collapse; font-size:13px;}
.grid th{text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-3);
  font-weight:600; padding:8px 12px; border-bottom:1.5px solid var(--line);}
.grid td{padding:11px 12px; border-bottom:1px solid var(--line-2); vertical-align:top; color:var(--ink-2);}
.grid tr:last-child td{border-bottom:none;}
.t-cond{display:block; font-size:11.5px; color:var(--ink-3); margin-top:3px;}

/* §L — submission volume ladder */
.lx-gov{margin:-2px 0 18px; font-size:12px; color:var(--ink-2); letter-spacing:.01em;}
.lx-gov-k{text-transform:uppercase; letter-spacing:.1em; font-weight:600; color:var(--ink-3); font-size:10.5px; margin-right:3px;}
.lx-gov-v{color:var(--ink-2);}
.lx-list{display:flex; flex-direction:column;}
.lx-row{display:grid; grid-template-columns:auto 1fr auto; gap:18px; align-items:baseline;
  padding:14px 0; border-bottom:1px solid var(--line-2);}
.lx-row:last-child{border-bottom:none;}
.lx-vol{align-self:start; box-sizing:border-box; width:74px; text-align:center;
  font-size:11.5px; font-weight:600; color:var(--ink);
  background:#f2f5f9; border-radius:6px; padding:4px 0; white-space:nowrap; letter-spacing:.01em;}
.lx-b{min-width:0;}
.lx-req{font-size:14px; color:var(--ink-2); line-height:1.45; text-wrap:pretty;}
.lx-req b{color:var(--ink); font-weight:600;}
.lx-cond{font-size:12px; color:var(--ink-3); margin-top:5px; letter-spacing:.01em;}
.lx-cite{align-self:start; font-size:12px; color:var(--ink-3); white-space:nowrap;}

/* CLIN table polish */
.grid-clin .cx-clin{font-weight:600; color:var(--ink); white-space:nowrap; width:1%;}
.grid-clin .cx-title{color:var(--ink); font-weight:500;}
.cx-type{display:inline-block; font-size:11px; font-weight:600; color:var(--ink-2);
  background:#f2f5f9; border-radius:5px; padding:2px 7px; letter-spacing:.02em;}
.grid-clin .cx-qty{white-space:nowrap; color:var(--ink-2);}
.grid-clin .cx-period{color:var(--ink-3); white-space:nowrap;}

/* §M — evaluation (the strategic section) */
.mx-award{position:relative; background:linear-gradient(180deg,#f4f8fe,#eaf1fb);
  border:1px solid #d5e2f4; border-radius:12px; padding:16px 20px 17px; margin-bottom:22px; overflow:hidden;}
.mx-award::before{content:""; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--accent);}
.mx-award-k{font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:var(--accent-deep);}
.mx-award-method{font-size:clamp(20px,1.9vw,25px); font-weight:600; letter-spacing:-.015em; color:var(--ink); margin-top:4px; line-height:1.12;}
.mx-award-tail{font-size:13.5px; color:var(--ink-2); margin:8px 0 0; max-width:76ch; line-height:1.5; text-wrap:pretty;}
.mx-award-dash{color:var(--ink-3); margin-right:6px;}
.mx-h{font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.09em; color:var(--ink-3); margin-bottom:11px;}
.mx-ladder{display:flex; flex-direction:column; gap:9px;}
.mx-f{display:grid; grid-template-columns:auto 1fr auto; gap:15px; align-items:start;
  padding:13px 16px; border:1px solid var(--line); border-radius:11px; background:#fff;}
.mx-f.lead{border-color:#c6d9f4; box-shadow:inset 3px 0 0 var(--accent); background:#fbfdff;}
.mx-rank{width:27px; height:27px; border-radius:8px; background:var(--slate-tint); color:var(--slate);
  display:grid; place-items:center; font-size:13px; font-weight:600; flex:none;}
.mx-f.lead .mx-rank{background:var(--accent); color:#fff;}
.mx-f-name{font-size:14.5px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:10px; flex-wrap:wrap; line-height:1.3;}
.mx-most{font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--accent-deep);
  background:#e6effb; border-radius:5px; padding:2px 7px; white-space:nowrap;}
.mx-f-basis{font-size:12.5px; color:var(--ink-2); margin-top:4px; line-height:1.5;}
.mx-cite{font-size:11.5px; color:var(--ink-3); white-space:nowrap; padding-top:6px;}

/* key dates */
.kd-track{display:grid; grid-template-columns:repeat(var(--kd-n,4),1fr); gap:2px; position:relative;}
.kd-track::before{content:''; position:absolute; top:21px; left:calc(50% / var(--kd-n,4)); right:calc(50% / var(--kd-n,4)); height:1.5px; background:var(--line); z-index:0;}
.kd{position:relative; z-index:1; padding:16px 10px 8px; text-align:center;}
.kd-tick{width:11px;height:11px;border-radius:50%;background:#fff;border:2.5px solid var(--line); margin:0 auto 11px; box-shadow:0 0 0 4px var(--paper,#fff);}
.kd.gate .kd-tick{border-color:var(--caution); background:var(--caution);}
.kd-l{font-size:12px; color:var(--ink-3); margin-bottom:5px;}
.kd-v{font-size:13.5px; font-weight:500; color:var(--ink); line-height:1.4;}
.kd-t{display:block; font-size:12px; font-weight:500; color:var(--ink-3); margin-top:2px; letter-spacing:.01em;}
.kd.gate .kd-v{color:var(--caution);}
.kd.gate .kd-t{color:var(--caution); opacity:.72;}

/* provenance */
.pv-grid{display:grid; grid-template-columns:210px 1fr; gap:30px;}
.pv-m{display:block; padding:10px 0; border-bottom:1px solid var(--line-2); font-size:13px;}
.pv-k{display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-3); margin-bottom:4px;}
.pv-v{display:block; text-align:left; font-weight:500; color:var(--ink-1); line-height:1.35;}
.pv-sub{display:block; text-align:left; color:var(--ink-3); font-size:12px; margin-top:2px; line-height:1.35;}
.pv-man{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:9px;}
.pv-f{display:flex; align-items:flex-start; gap:11px; font-size:12.5px;}
.pv-r{flex:none; font-size:10.5px; font-weight:600; padding:3px 8px; border-radius:6px; white-space:nowrap; min-width:82px; text-align:center;}
.pv-full{background:var(--go-tint); color:var(--go);}
.pv-indexed{background:var(--caution-tint); color:var(--caution);}
.pv-unread{background:#eef1f5; color:var(--ink-3);}
.pv-n{color:var(--ink-2); flex:1; min-width:0; overflow-wrap:anywhere; line-height:1.5;}

/* ---- state switcher (dev, review only) ----------------------------------- */
.sw{position:fixed; right:16px; bottom:16px; z-index:60; background:#0d1622; color:#cdd8e6;
  border-radius:12px; padding:10px; box-shadow:0 12px 40px rgba(0,0,0,.4); font-size:12px; width:220px;}
.sw-h{font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:#6c7d92; margin-bottom:8px; padding:0 4px;}
.sw button{display:flex; align-items:center; gap:8px; width:100%; text-align:left; background:none; border:none;
  color:#cdd8e6; padding:6px 8px; border-radius:7px; cursor:pointer; font-family:var(--font); font-size:12px;}
.sw button:hover{background:#16202e;}
.sw button.on{background:#1d2a3b; color:#fff;}
.sw button .sd{width:7px;height:7px;border-radius:50%;flex:none;}
.sw button.rep::after{content:"REP"; margin-left:auto; font-size:8.5px; letter-spacing:.1em; color:#6c7d92;}

/* ---- entrance motion (orientation only, gated) --------------------------- */
@media (prefers-reduced-motion: no-preference){
  .anim .cmd, .anim .sec, .anim .disc, .anim .ev-lead, .anim .rc{animation:rise .5s cubic-bezier(.2,.7,.2,1) both;}
  .anim .disc:nth-of-type(2){animation-delay:.04s}
  .anim .disc:nth-of-type(3){animation-delay:.08s}
  .anim .disc:nth-of-type(4){animation-delay:.12s}
  .anim .cmd-tile{animation:rise .5s cubic-bezier(.2,.7,.2,1) both;}
  .anim .cmd-tile:nth-child(2){animation-delay:.06s}
  .anim .cmd-tile:nth-child(3){animation-delay:.12s}
  .anim .cmd-tile:nth-child(4){animation-delay:.18s}
  .anim .cov-fill{animation:none;}
}
/* reasoning chain — static connector line (no motion) */
@keyframes rise{from{opacity:0; transform:translateY(12px);} to{opacity:1; transform:none;}}
@keyframes rcBody{from{opacity:0; transform:translateY(9px);} to{opacity:1; transform:none;}}
@keyframes rcNode{from{opacity:0; transform:scale(.4);} to{opacity:1; transform:none;}}

/* ---- responsive ---------------------------------------------------------- */
@media (max-width:1120px){
  .stage{grid-template-columns:1fr; gap:0;}
  .rail{display:none;}
  .cmd-decision{grid-template-columns:1fr;}
  .cmd-tiles{grid-template-columns:1fr 1fr;}
}
@media (max-width:760px){
  .app{grid-template-columns:1fr;}
  .sidebar{display:none;}
  .cmd-meta{grid-template-columns:1fr;}
}

/* =============================================================================
   ASK THE CO  —  clarification-request (RFI) drafter, grounded in open points
   ============================================================================= */
.co-scrim{position:fixed; inset:0; z-index:100; display:none; background:rgba(13,22,34,.5);
  backdrop-filter:saturate(1.2) blur(3px); padding:5vh 20px; overflow:auto;}
.co-scrim.open{display:grid; place-items:start center;}
.co-modal{background:var(--sheet); width:100%; max-width:660px; border-radius:18px;
  box-shadow:0 20px 60px rgba(13,22,34,.34); display:flex; flex-direction:column; overflow:hidden;
  font-family:var(--font);}
.co-head{display:grid; grid-template-columns:1fr auto; align-items:start; gap:16px; padding:22px 24px 16px;
  border-bottom:1px solid var(--line);}
.co-h{font-size:19px; font-weight:600; letter-spacing:-.01em; margin:0;}
.co-sub{font-size:12.5px; color:var(--ink-3); margin:6px 0 0; line-height:1.5; max-width:52ch;}
.co-x{width:32px; height:32px; border-radius:8px; border:1px solid var(--line); background:#fff; cursor:pointer;
  color:var(--ink-3); display:grid; place-items:center; flex:none;}
.co-x:hover{background:#f6f8fa; color:var(--ink);}
.co-x svg{width:16px; height:16px;}

.co-deadline{display:flex; align-items:center; gap:9px; margin:16px 24px 0; padding:8px 12px;
  background:var(--caution-tint); border:1px solid #e7cfa8; border-radius:9px; font-size:12.5px; color:#7a5410;}
.co-deadline.none{background:#f4f7fa; border-color:var(--line-2); color:var(--ink-3);}
.co-deadline b{font-weight:600;}
.co-deadline svg{width:15px; height:15px; flex:none;}

.co-meta{margin:16px 24px 0; border:1px solid var(--line); border-radius:11px; overflow:hidden;}
.co-row{display:grid; grid-template-columns:78px 1fr; gap:12px; padding:10px 14px; font-size:13px;}
.co-row + .co-row{border-top:1px solid var(--line-2);}
.co-k{color:var(--ink-3); font-size:11px; text-transform:uppercase; letter-spacing:.07em; font-weight:600; padding-top:2px;}
.co-v{color:var(--ink); min-width:0;}
.co-v .co-bind{color:var(--ink-3); font-style:italic;}

.co-body{padding:18px 24px 4px; overflow:auto;}
.co-intro{font-size:13.5px; color:var(--ink-2); line-height:1.6; margin:0 0 14px;}
.co-pts{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:11px;}
.co-pt{display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:start;}
.co-num{width:22px; height:22px; border-radius:6px; background:#eef2f7; border:1px solid var(--line);
  color:var(--accent-deep); font-size:12px; font-weight:700; display:grid; place-items:center; flex:none;
  font-family:var(--mono);}
.co-qt{font-size:13.5px; color:var(--ink); line-height:1.55;}
.co-ref{display:inline-block; margin-top:5px; font-family:var(--mono); font-size:10.5px; color:var(--ink-2);
  background:#f2f5f9; border:1px solid var(--line-2); border-radius:5px; padding:2px 7px;}
.co-empty{font-size:13px; color:var(--ink-3); padding:14px 15px; border:1px dashed var(--line); border-radius:11px; line-height:1.55;}

.co-note{margin:16px 24px 0; font-size:11.5px; color:var(--ink-3); line-height:1.55; display:flex; gap:8px;}
.co-note svg{width:14px; height:14px; flex:none; margin-top:1px; color:var(--ink-3);}

.co-foot{display:flex; align-items:center; gap:10px; padding:16px 24px 20px; margin-top:14px;}
.co-foot .co-spring{flex:1;}
.co-copied{font-size:12px; color:var(--go); font-weight:600; opacity:0; transition:opacity .2s;}
.co-copied.on{opacity:1;}

/* =============================================================================
   PRINT / PDF EXPORT  —  the artifact IS this report, WYSIWYG
   Letter portrait, controlled margins, every accordion expanded so the PDF
   carries the full evidence, atoms kept off the page fold, closing ID line.
   ============================================================================= */
@page{ size:Letter; margin:15mm 14mm 17mm; }

.print-foot{ display:none; }

@media print{
  html,body{ background:#fff !important; }
  *{ -webkit-print-color-adjust:exact; print-color-adjust:exact; animation:none !important; }

  /* strip app chrome + interactive-only affordances */
  .sidebar,.topbar,.rail,.sw,.disc-chev,.ev-toggle,.fd-chev,.tb-actions{ display:none !important; }

  /* collapse the shell to a single full-width column */
  .app,.main{ display:block !important; }
  .stage{ display:block !important; max-width:none !important; width:auto !important;
    margin:0 !important; padding:0 !important; gap:0 !important; }
  .report{ min-width:0 !important; }

  /* cards: flatten shadows, keep hairline borders */
  .cmd,.disc,.rc,.sec{ box-shadow:none !important; border-color:#d7dde5 !important; }
  .cmd{ border-radius:12px; }

  /* the decision reads full-width, then the bento below it */
  .cmd-decision{ grid-template-columns:1fr !important; gap:18px !important; }

  /* everything expanded — the PDF carries the full evidence chain */
  .disc-body,.fd-body{ display:block !important; }
  .disc-top{ cursor:default !important; border-bottom:1px solid var(--line-2) !important; }

  /* reasoning-chain: force the solid end-state (never mid-entrance) */
  .rc-step .rc-body,.rc-step .rc-node{ opacity:1 !important; transform:none !important; }
  .rc-rail::before{ transform:scaleY(1) !important; }

  /* ---- pagination ------------------------------------------------------- */
  /* keep atomic units whole across the page fold */
  .cmd-meta,.cmd-verdict,.cmd-tiles,.cmd-tile,.cmd-bl,.rc-step,.fd,.fg,
  .lx-row,.kd,.pv-f,.mx-f,.mx-award,.disc,.grid-clin tr,.grid-clin{ break-inside:avoid; }
  /* headings stay with what follows them */
  h2,h3,.rc-h,.ev-h,.disc-title,.fg-h,.mx-h{ break-after:avoid; }
  /* the evidence dossier opens on a fresh page */
  .ev-lead{ break-before:page; margin-top:0 !important; }
  /* keep the rep watermark on export — a watermarked page can't look shippable */
  .rep-banner{ break-inside:avoid; }

  /* closing identification line (screen-hidden) */
  .print-foot{ display:flex !important; justify-content:space-between; gap:16px; flex-wrap:wrap;
    margin-top:26px; padding-top:12px; border-top:1px solid var(--line);
    font-size:10.5px; color:var(--ink-3); }
  .print-foot .pf-mark{ font-weight:700; color:var(--ink-2); letter-spacing:.02em; }
}
`;

// AUDIT_V5_SEAL — "Decision Seal" masthead delta (web). Appended AFTER REPORT_V5_CSS
// only when the flag is ON; later-rule-wins overrides the base .cmd-clock* rules and
// adds the two-tier absolute-deadline body. OFF → not injected → byte-identical.
export const REPORT_V5_SEAL_CSS = `
.cmd-clock{align-items:flex-start; padding:7px 13px 7px 11px;}
.cmd-clock-ic{margin-top:2px;}
.cmd-clock-body{display:flex; flex-direction:column; gap:1px; min-width:0;}
.cmd-clock-k{font-size:10.5px; letter-spacing:.07em;}
.cmd-clock-v{font-size:13.5px; font-weight:600; line-height:1.3;}
.cmd-clock-time{font-size:11.5px; color:var(--ink-2); font-weight:500; white-space:nowrap; letter-spacing:.01em; line-height:1.3;}

/* ── Decision Seal (web) — pressed-ink stamp + record band + seal command column.
   --t/--td per-tone ink pair (base REPORT_V5_CSS defines --tone-c only). ── */
.cmd[data-tone="go"]{--t:#3a7d54; --td:#245239;}
.cmd[data-tone="caution"]{--t:#b0731a; --td:#7c4d08;}
.cmd[data-tone="stop"]{--t:#a13a2c; --td:#6f261c;}
.cmd[data-tone="slate"]{--t:#414e5e; --td:#28313d;}
.cmd-band{display:grid; grid-template-columns:1.5fr 1fr 1.1fr .8fr; background:#f2f5f9;
  border:1px solid var(--line-2, #dbe0e8); border-radius:14px; overflow:hidden; margin:4px 0 24px;}
.cmd-band .cb-cell{padding:16px 20px; border-right:1px solid #cbd3de; text-align:center;}
.cmd-band .cb-cell:last-child{border-right:0;}
.cmd-band .cb-k{font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--accent-deep, #1f5fa8); margin-bottom:9px; font-weight:600;}
.cmd-band .cb-v{font-size:15px; font-weight:600; color:var(--ink-1, #1a2431); line-height:1.35;}
.cmd-band .cb-v.mono{white-space:nowrap; font-weight:500;}
.cmd-band .cb-sec{display:block; font-size:12px; font-weight:400; color:var(--ink-3, #6b7887); margin-top:4px; line-height:1.3;}
.cmd-stage{display:grid; grid-template-columns:250px 1fr; gap:34px; align-items:start; margin:2px 0 6px;}
.cmd-rail{display:flex; flex-direction:column; gap:16px; align-items:center;}
.cmd-rail .gseal{width:100%;}
.cmd-rail-status{display:flex; width:100%;}
.cmd-rail-status .gchip-tight{width:100%; justify-content:flex-start; gap:14px;}
.gseal{border:2.5px solid var(--t); border-radius:14px; color:var(--t); padding:6px;
  background:color-mix(in srgb, var(--t) 4%, transparent); mix-blend-mode:multiply;
  box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--t) 30%, transparent);}
.gseal-in{border:1.5px solid var(--t); border-radius:9px; padding:15px 14px 12px; text-align:center;}
.gseal-in>*{text-shadow:.4px .3px 0 color-mix(in srgb, var(--t) 18%, transparent);}
.gseal-ico{width:33px; height:33px; margin:0 auto 7px; color:var(--t); display:inline-flex;}
.gseal-ico svg{width:100%; height:100%; display:block;}
.gseal-word{font-size:18px; font-weight:800; line-height:1.05; letter-spacing:.01em; color:var(--td); text-transform:uppercase;}
.gseal-word.lg{font-size:21px;}
.gseal-word.xl{font-size:37px; letter-spacing:.03em;}
.gseal-dispo{font-size:11px; font-weight:600; letter-spacing:.16em; color:var(--td); margin-top:9px;
  border-top:1.5px dashed color-mix(in srgb, var(--t) 48%, transparent); padding-top:9px;}
.gseal-wm{margin-top:9px; font-size:9px; letter-spacing:.22em; color:var(--t); opacity:.5; white-space:nowrap;}
.gv2-cmd{min-width:0;}
.gv2-kick{font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:var(--td); font-weight:600; margin-bottom:8px;}
.gv2-word{font-size:44px; font-weight:800; letter-spacing:-.028em; color:var(--td); line-height:.98;
  text-transform:uppercase; margin:0 0 13px; text-wrap:balance;}
.gv2-cmd .cmd-bl{border-left:3px solid var(--t); padding-left:17px; margin-top:2px;}
.gv2-cmd .cmd-bl .cmd-bl-k{display:block; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-3, #6b7887); font-weight:600; margin-bottom:11px;}
.gv2-cmd .cmd-bl .cmd-bl-t{margin:0; font-size:16px; line-height:1.5; color:var(--ink-1, #1a2431); text-wrap:pretty; max-width:none;}
.cmd-tiles{margin-top:24px;}
.gchip-tight{display:inline-flex; align-items:center; gap:10px; border:1px solid #e2e7ee; border-radius:8px;
  padding:8px 14px; background:#fbfcfe;}
.gchip-tight b{font-size:10.5px; letter-spacing:.12em; font-weight:600; color:var(--td);}
.gchip-tight i{width:1px; height:14px; background:#e2e7ee;}
.gchip-tight .ek{font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; color:#6b7887;}
.gchip-tight em{font-style:normal; font-size:13px; font-weight:700;}
.gchip-tight em[data-e="ok"]{color:#245239;}
.gchip-tight em[data-e="no"]{color:#6f261c;}
.gchip-tight em[data-e="nd"]{color:#7c4d08;}
.gchip-tight em[data-e="na"]{color:#6b7887;}
/* driver rows — bigger/crisper (Card #599) */
.cmd-drv-h{font-size:11.5px;}
.cmd-drv{gap:12px 18px; padding:14px 18px; border:1px solid #dbe1ea; margin-bottom:9px;}
.cmd-drv-cite{font-size:12.5px; color:var(--accent); font-weight:500;}
.cmd-drv-req{font-size:14.5px; line-height:1.45;}
@media (max-width:720px){
  .cmd-band{grid-template-columns:1fr 1fr;}
  .cmd-stage{grid-template-columns:1fr; gap:18px;}
  .cmd-rail{align-items:flex-start;}
  .cmd-rail .gseal{max-width:250px;}
}
`;
