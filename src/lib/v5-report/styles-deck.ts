/* =============================================================================
   v5 Gate Deck (PDF) — stylesheet (REPORT_DECK_CSS)
   Ported 1:1 from the Design v5 package (_v5-PORT-READY/src/report-deck.css,
   2026-07-05). Boardroom deck, landscape 1280×720, one idea per slide. Light-
   primary content (this design revision is ink-friendly throughout — the earlier
   "dark hero cover/decision" from port-prompt §4 is not in this CSS, so there is
   no dark→light print flip to port; the print block just drops shadows/watermark
   and forces color-adjust). Electric blue #378ADD is the FRAME accent; verdict
   tone is the ONLY semantic accent.

   PRINT HOST (port adaptation): the Design mock stages slides inside the <deck-
   stage> web component and injects @page via JS because @page is a no-op in shadow
   DOM. We instead render the slides in the mock's OWN `.scrollmode` container in
   the light DOM (every slide stacked at the authored 1280×720 — a faithful all-
   slides review surface), which lets @page live directly in this stylesheet. The
   appended DECK_PRINT block paginates one slide per landscape page — the shipped
   PDF is byte-1:1 with the mock per page. No 1993-line presenter/editor runtime
   is inlined into the artifact.

   Fonts (Manrope + IBM Plex Mono) are embedded via FONTS_CSS (Phase-5 HARD GATE) —
   see the note at the top of REPORT_DECK_CSS below.
   ============================================================================= */
export const REPORT_DECK_CSS: string = `
/* Fonts are embedded (base64 woff2) via FONTS_CSS, prepended into the render
   document ahead of this stylesheet — the Google Fonts @import was removed at the
   Phase-5 HARD GATE so the deck is self-hosted (offline/print-fidelity). */

:root{
  /* verdict semantics ONLY — ink-friendly, print-safe */
  --go:#1f9160; --go-t:#e7f3ec; --go-d:#126b45;
  --caution:#c06a12; --caution-t:#f7ecdd; --caution-d:#8f4d0a;
  --stop:#b3352c; --stop-t:#f6e5e3; --stop-d:#87271f;
  --slate:#465468; --slate-t:#e9edf2; --slate-d:#2f3a49;

  /* brand blue — the FRAME accent (from the landing + logo) */
  --accent:#378ADD; --accent-deep:#185FA5; --accent-light:#B5D4F4; --accent-t:#eaf3fc;
  /* brand navy — ink for the wordmark + chrome */
  --navy:#0A1628; --navy-2:#142545;

  --ink:#111a25; --ink-2:#3a4757; --ink-3:#64717f; --ink-4:#98a3af;
  --paper:#ffffff; --paper-2:#f4f7fb; --line:#e2e8ee; --line-2:#eef2f6;

  --sans:'Manrope', ui-sans-serif, system-ui, sans-serif;
  --mono:'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;
}

*{box-sizing:border-box;}
deck-stage:not(:defined){visibility:hidden;}
body{margin:0; background:#0c1420; font-family:var(--sans);}
.mono{font-family:var(--mono); font-feature-settings:"tnum" 1;}

/* ---- slide shell --------------------------------------------------------- */
.sl{position:absolute; inset:0; padding:80px 76px 60px; background:var(--paper); color:var(--ink);
  font-family:var(--sans); overflow:hidden; display:flex; flex-direction:column;}
/* electric-blue signature rule — the brand seam across every slide */
.sl::before{content:""; position:absolute; top:0; left:0; right:0; height:4px; z-index:4;
  background:linear-gradient(90deg, var(--accent) 0%, var(--accent-deep) 46%, rgba(55,138,221,.18) 100%);}
.sl[data-tone="go"]{--tone:var(--go); --tone-t:var(--go-t); --tone-d:var(--go-d);}
.sl[data-tone="caution"]{--tone:var(--caution); --tone-t:var(--caution-t); --tone-d:var(--caution-d);}
.sl[data-tone="stop"]{--tone:var(--stop); --tone-t:var(--stop-t); --tone-d:var(--stop-d);}
.sl[data-tone="slate"]{--tone:var(--slate); --tone-t:var(--slate-t); --tone-d:var(--slate-d);}

/* faint diagonal brand watermark */
.sl-mark{position:absolute; inset:0; z-index:0; pointer-events:none; display:grid; place-items:center;}
.sl-mark span{font-family:var(--mono); font-size:52px; letter-spacing:.34em; font-weight:600;
  color:rgba(16,26,37,.028); transform:rotate(-24deg); white-space:nowrap;}

/* ---- brand wordmark lockup ----------------------------------------------- */
.wm{display:inline-flex; align-items:baseline; font-weight:800; letter-spacing:-.015em; font-size:17px; line-height:1;}
.wm .wm-a{color:var(--navy);} .wm .wm-b{color:var(--accent);}
.wm .wm-dot{width:6px; height:6px; border-radius:50%; background:var(--accent); align-self:center;
  margin-left:7px; box-shadow:0 0 0 3px rgba(55,138,221,.16);}

/* "VERIFIED" live pill — the brand trust signal, on light */
.live{display:inline-flex; align-items:center; gap:8px; font-family:var(--mono); font-size:10px; font-weight:600;
  letter-spacing:.18em; color:var(--go-d); text-transform:uppercase; padding:5px 11px; border-radius:20px;
  background:var(--go-t); border:1px solid color-mix(in srgb, var(--go) 22%, #fff);}
.live .live-d{width:7px; height:7px; border-radius:50%; background:var(--go);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--go) 20%, transparent);}
.live.nv{background:var(--slate-t); border-color:color-mix(in srgb, var(--slate) 26%, #fff); color:var(--slate-d);}
.live.nv .live-d{background:var(--slate); box-shadow:none;}

/* running chrome — brand skirts */
.sl-top{position:absolute; top:30px; left:76px; right:76px; display:flex; justify-content:space-between;
  align-items:center; z-index:3;}
.sl-top .st-l{display:flex; align-items:center; gap:14px;}
.sl-top .st-tag{font-family:var(--mono); font-size:9.5px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--ink-4); padding-left:14px; border-left:1px solid var(--line);}
.sl-top .st-r{font-size:11.5px; color:var(--ink-3); letter-spacing:.02em;}
.sl-bot{position:absolute; bottom:24px; left:76px; right:76px; display:flex; justify-content:space-between;
  align-items:center; font-size:10px; letter-spacing:.05em; z-index:3;}
.sl-bot .sb-l{font-family:var(--mono); text-transform:uppercase; letter-spacing:.1em; color:var(--ink-4);}
.sl-bot .sb-l b{color:var(--ink-3); font-weight:600;}
.sl-bot .sb-n{font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-4);}

.sl-eyehead{display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px;}
.sl-eyehead .sl-eyebrow{margin-bottom:0;}
.sl-eyebrow{display:flex; align-items:center; gap:11px; font-family:var(--mono); font-size:12px; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase; color:var(--accent-deep); margin-bottom:16px;}
.sl-eyebrow .eb-dot{width:8px; height:8px; border-radius:50%; background:var(--accent);
  box-shadow:0 0 0 3px rgba(55,138,221,.15);}
.sl-title{font-size:44px; font-weight:800; letter-spacing:-.025em; line-height:1.04; color:var(--navy); text-wrap:balance;}
.sl-body{flex:1; display:flex; flex-direction:column; justify-content:center; min-height:0; position:relative; z-index:1;}

/* =============================================================================
   S1 · COVER — defense-grade document-control masthead + verdict readout
   ============================================================================= */
.cv2{position:relative; flex:1; display:flex; flex-direction:column; padding-top:6px;}
/* classification-style banner strip */
.cv2-banner{display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding-bottom:13px; border-bottom:2.5px solid var(--navy);}
.cv2-eyebrow{display:inline-flex; align-items:center; gap:14px; font-family:var(--mono); font-size:12px;
  font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:var(--navy);}
.cv2-idx{background:var(--navy); color:#fff; padding:4px 8px; border-radius:4px; font-size:10.5px; letter-spacing:.12em;}
.cv2-class{font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--accent-deep);}
.cv2-grid{flex:1; display:grid; grid-template-columns:1.14fr .86fr; gap:54px; align-items:center; padding:30px 0 6px;}
.cv2-mast{display:flex; align-items:center; gap:12px; margin-bottom:20px;}
.cv2-title{font-size:56px; font-weight:800; letter-spacing:-.035em; line-height:.98; color:var(--navy); max-width:19ch;}
.cv2-thesis{margin-top:22px; font-size:16px; line-height:1.55; color:var(--ink-2); max-width:42ch; font-weight:500;}
.cv2-thesis b{color:var(--ink); font-weight:700;}
/* document-control spec grid — hairline-boxed, mono labels (the defense signature) */
.cv2-dc{margin-top:30px; display:grid; grid-template-columns:1fr 1fr; border:1px solid var(--navy);
  border-radius:2px; overflow:hidden;}
.cv2-dc .dc{display:flex; flex-direction:column; gap:5px; padding:12px 16px; border-top:1px solid var(--line);
  border-left:1px solid var(--line);}
.cv2-dc .dc:nth-child(-n+2){border-top:none;}
.cv2-dc .dc:nth-child(odd){border-left:none;}
.cv2-dc .dc-k{font-size:9.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--accent-deep);}
.cv2-dc .dc-v{font-size:12.5px; color:var(--navy); line-height:1.35; font-weight:500;}
/* registration / crosshair marks — engineering precision cue */
.rm{position:absolute; width:13px; height:13px; pointer-events:none;
  border-color:var(--accent-deep); border-style:solid; border-width:0;}
.rm-tl{top:-2px; left:-14px; border-left-width:1.5px; border-top-width:1.5px;}
.rm-tr{top:-2px; right:-14px; border-right-width:1.5px; border-top-width:1.5px;}
.rm-bl{bottom:-2px; left:-14px; border-left-width:1.5px; border-bottom-width:1.5px;}
.rm-br{bottom:-2px; right:-14px; border-right-width:1.5px; border-bottom-width:1.5px;}

/* verdict console panel — the sharp point, as a mono readout w/ navy header */
.cv-console{position:relative; align-self:stretch; margin:auto 0; background:#fff;
  border:1px solid var(--navy); border-radius:3px;
  box-shadow:0 34px 70px -46px rgba(10,22,40,.55);}
.cvc-head{display:flex; align-items:center; gap:10px; padding:14px 22px; background:var(--navy);
  border-radius:2px 2px 0 0;}
.cvc-head .live{background:transparent; border-color:color-mix(in srgb,var(--go) 60%,#fff); color:#7ee2b5;}
.cvc-head .live .live-d{background:#57e39f; box-shadow:0 0 0 3px rgba(87,227,159,.28);}
.cvc-head .live.nv{border-color:#4a586b; color:#aeb9c8;}
.cvc-head .live.nv .live-d{background:#8493a6; box-shadow:none;}
.cvc-run{margin-left:auto; font-size:10px; color:#8fa0b6; letter-spacing:.06em;}
.cv-console-in,.cvc-lab,.cvc-word,.cvc-chips,.cvc-rule,.cvc-facts{padding-left:24px; padding-right:24px;}
.cvc-lab{font-size:10px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-4); margin:20px 0 9px;}
.cvc-word{font-size:35px; font-weight:800; letter-spacing:-.025em; line-height:1.02; color:var(--tone,var(--ink));}
.cvc-chips{display:flex; flex-wrap:wrap; gap:8px; margin-top:15px;}
.cvc-stamp{font-family:var(--mono); font-size:10px; font-weight:600; letter-spacing:.08em; padding:4px 9px;
  border-radius:4px; color:var(--tone); background:var(--tone-t); border:1px solid color-mix(in srgb,var(--tone) 30%,#fff);}
.cvc-elig{font-family:var(--mono); font-size:10px; color:var(--ink-2); padding:4px 9px; border-radius:4px; border:1px solid var(--line);}
.cvc-elig[data-e="ok"]{color:var(--go-d);} .cvc-elig[data-e="no"]{color:var(--stop);}
.cvc-elig[data-e="nd"]{color:var(--caution-d);}
.cvc-elig.nocharge{background:var(--paper-2); color:var(--ink-3);}
.cvc-rule{height:0; border-top:1px solid var(--line); margin:20px 0 16px; padding:0;}
.cvc-facts{display:flex; flex-direction:column; gap:12px; padding-bottom:22px;}
.cvc-row{display:flex; align-items:baseline; justify-content:space-between; gap:14px;}
.cvc-k{font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-4); white-space:nowrap;}
.cvc-v{font-size:12.5px; color:var(--navy); text-align:right; white-space:nowrap; font-weight:500;}
.cvc-v.t-stop{color:var(--stop);} .cvc-v.t-caution{color:var(--caution-d);} .cvc-v.t-gate{color:var(--accent-deep);} .cvc-v.t-nd{color:var(--slate);}

/* =============================================================================
   S2 · THE DECISION (verdict hero, light + tone accent)
   ============================================================================= */
.vd-body{flex:1; display:flex; flex-direction:column; justify-content:center; gap:30px;}
.vd-plate{background:linear-gradient(180deg, var(--tone-t,var(--slate-t)), #fff 138%); border-left:5px solid var(--tone,var(--slate));
  border-radius:0 16px 16px 0; padding:28px 36px 32px;}
.vd-lead{display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:22px;}
.vd-lead .sl-eyebrow{margin-bottom:0; color:var(--tone,var(--slate));}
.vd-lead .sl-eyebrow .eb-dot{background:var(--tone,var(--slate)); box-shadow:none;}
.vd-main{min-width:0;}
.vd-vrow{display:flex; align-items:center; gap:22px;}
.vd-ico{width:70px; height:70px; border-radius:17px; display:grid; place-items:center; flex:none;
  color:var(--tone); background:color-mix(in srgb, var(--tone) 12%, #fff); border:1px solid color-mix(in srgb,var(--tone) 26%,#fff);}
.vd-ico svg{width:40px; height:40px;}
.vd-word{font-size:84px; font-weight:800; letter-spacing:-.035em; line-height:.96; color:var(--tone); white-space:nowrap;}
.vd-chips{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:26px;}
.vd-chip{font-family:var(--mono); font-size:12px; font-weight:600; letter-spacing:.04em; border:1.5px solid currentColor;
  border-radius:7px; padding:6px 13px; color:var(--tone); white-space:nowrap;}
.vd-chip.elig{border-color:var(--line); color:var(--ink); display:inline-flex; gap:9px; align-items:center;}
.vd-chip.elig .k{font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-4); font-weight:600;}
.vd-chip.elig[data-e="ok"] .v{color:var(--go-d);} .vd-chip.elig[data-e="no"] .v{color:var(--stop);}
.vd-chip.elig[data-e="nd"] .v{color:var(--caution-d);}
.vd-chip.nocharge{border:none; background:var(--paper-2); color:var(--ink-2);}
.vd-bl{margin-top:6px; max-width:66ch; padding-left:22px; border-left:3px solid var(--accent);}
.vd-bl .bl-k{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.15em; text-transform:uppercase;
  color:var(--accent-deep); margin-bottom:12px;}
.vd-bl .bl-t{font-size:23px; line-height:1.5; color:var(--ink); font-weight:500; text-wrap:pretty;}
.vd-facts{border-top:1px solid var(--line); padding-top:26px; display:flex; flex-direction:row; gap:60px; flex-wrap:wrap;}
.vd-f .vf-k{font-family:var(--mono); font-size:10.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-4);}
.vd-f{flex:0 0 auto;}
.vd-f .vf-v{font-family:var(--mono); font-size:18px; color:var(--ink); margin-top:8px; line-height:1.3; white-space:nowrap;}
.vd-f.gate .vf-v{color:var(--accent-deep);}

/* =============================================================================
   S3 · AT A GLANCE (quad scorecard)
   ============================================================================= */
.quad{flex:1; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:22px; margin-top:26px;}
.qd{position:relative; border:1px solid var(--line); border-radius:18px; padding:32px 34px 28px; background:#fff;
  display:flex; flex-direction:column; overflow:hidden; box-shadow:0 18px 44px -40px rgba(16,32,60,.4);}
.qd::before{content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--tt,var(--slate));}
.qd[data-tone="go"]{--tt:var(--go);} .qd[data-tone="caution"]{--tt:var(--caution);}
.qd[data-tone="stop"]{--tt:var(--stop);} .qd[data-tone="slate"]{--tt:var(--slate);}
.qd-v{font-size:62px; font-weight:800; letter-spacing:-.03em; line-height:.9; color:var(--tt,var(--ink));}
.qd-v.textv{font-size:38px; line-height:1.02;}
.qd[data-tone="slate"] .qd-v{color:var(--ink);}
.qd-k{font-size:21px; font-weight:700; color:var(--ink); margin-top:14px; letter-spacing:-.01em;}
.qd-sub{font-family:var(--mono); font-size:12.5px; color:var(--ink-3); margin-top:auto; padding-top:16px; letter-spacing:.02em;}

/* =============================================================================
   S4 · WHAT DRIVES THIS CALL
   ============================================================================= */
.drv-list{flex:1; display:flex; flex-direction:column; justify-content:center; gap:20px; margin-top:34px;}
.drv{display:grid; grid-template-columns:52px 1fr auto; gap:26px; align-items:start;
  border:1px solid var(--line); border-left:5px solid var(--tone,var(--caution)); border-radius:14px;
  padding:26px 32px; background:#fff; box-shadow:0 16px 40px -40px rgba(16,32,60,.4);}
.drv-n{font-family:var(--mono); font-size:26px; font-weight:600; color:var(--tone,var(--caution)); line-height:1;}
.drv-b{min-width:0;}
.drv-req{font-size:24px; font-weight:700; letter-spacing:-.015em; line-height:1.25; color:var(--ink); text-wrap:pretty;}
.drv-why{font-size:16px; color:var(--ink-3); margin-top:10px; line-height:1.5; max-width:72ch;}
.drv-cite{font-family:var(--mono); font-size:14px; color:var(--accent-deep); white-space:nowrap; padding-top:6px;}

/* =============================================================================
   S5 · HOW THIS CALL WAS REACHED — pipeline of glowing dots (proof-as-marketing)
   ============================================================================= */
.rc-intro{font-size:16px; color:var(--ink-3); margin-top:4px; max-width:98ch; line-height:1.5;}
.flow{display:flex; align-items:stretch; gap:0; margin-top:52px;}
.fn{flex:1; position:relative; display:flex; flex-direction:column; align-items:center; text-align:center; padding:0 14px;}
/* the pipeline: a gradient blue conduit threading every node */
.fn:not(:last-child)::after{content:""; position:absolute; top:23px; left:50%; width:100%; height:3px; z-index:0;
  background:linear-gradient(90deg, var(--accent-light), var(--accent-light));}
.fn.filled:not(:last-child)::after,.fn[data-done]:not(:last-child)::after{background:var(--accent);}
.fn-dot{width:48px; height:48px; border-radius:50%; background:#fff; border:2.5px solid var(--fnt,var(--accent-light));
  color:var(--fnt,var(--ink-3)); display:grid; place-items:center; font-family:var(--mono); font-size:15px; font-weight:600;
  position:relative; z-index:1; margin-bottom:18px; box-shadow:0 0 0 6px #fff, 0 6px 18px -8px rgba(16,32,60,.4);}
.fn[data-tone="go"]{--fnt:var(--go);} .fn[data-tone="caution"]{--fnt:var(--caution);}
.fn[data-tone="stop"]{--fnt:var(--stop);} .fn[data-tone="slate"]{--fnt:var(--slate);}
.fn.filled .fn-dot{background:var(--fnt); border-color:var(--fnt); color:#fff;
  box-shadow:0 0 0 6px #fff, 0 0 0 11px color-mix(in srgb,var(--fnt) 16%,transparent), 0 8px 22px -8px var(--fnt);}
.fn-k{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
  color:var(--ink-4); line-height:1.3;}
.fn-out{font-size:17px; font-weight:700; color:var(--fnt,var(--ink)); margin-top:9px; line-height:1.25; letter-spacing:-.01em;}
.fn.skip .fn-out{color:var(--ink-4); font-weight:500;}
.rc-closer{margin-top:46px; border-left:4px solid var(--tone,var(--slate)); background:var(--tone-t,var(--slate-t));
  border-radius:0 12px 12px 0; padding:22px 28px;}
.rc-closer .cl-k{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  color:var(--ink-3); margin-bottom:9px;}
.rc-closer .cl-t{font-size:20px; line-height:1.5; color:var(--ink); text-wrap:pretty; font-weight:500;}

/* =============================================================================
   S6 · GATES TO CLEAR / SHOW-STOPPERS
   ============================================================================= */
.gates{flex:1; display:flex; flex-direction:column; gap:16px; margin-top:22px; justify-content:center;}
.gt{display:grid; grid-template-columns:auto 1fr auto; gap:22px; align-items:start;
  border:1px solid var(--line); border-radius:13px; padding:22px 26px; background:#fff; break-inside:avoid;}
.gt-sev{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase;
  padding:5px 11px; border-radius:6px; white-space:nowrap; margin-top:3px;}
.gt-sev[data-sev="p0"]{background:var(--stop-t); color:var(--stop);}
.gt-sev[data-sev="p1"]{background:var(--caution-t); color:var(--caution);}
.gt-sev[data-sev="p2"]{background:var(--paper-2); color:var(--ink-2);}
.gt-b{min-width:0;}
.gt-req{font-size:20px; font-weight:700; color:var(--ink); line-height:1.3; text-wrap:pretty; letter-spacing:-.01em;}
.gt-clear{font-size:15px; color:var(--ink-2); margin-top:9px; line-height:1.45; display:flex; gap:9px;}
.gt-clear .cl-k{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase;
  color:var(--go-d); white-space:nowrap; padding-top:2px;}
.gt-cite{font-family:var(--mono); font-size:14px; color:var(--accent-deep); white-space:nowrap; padding-top:4px;}

/* =============================================================================
   S7 · HOW WE WIN — EVALUATION (§M)
   ============================================================================= */
.win-award{border-left:5px solid var(--accent); padding:4px 0 4px 22px; margin-top:8px;}
.win-award .aw-k{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-4);}
.win-award .aw-v{font-size:36px; font-weight:800; letter-spacing:-.02em; color:var(--ink); margin-top:8px; line-height:1.08;}
.win-award .aw-tail{font-size:16px; color:var(--ink-2); margin-top:10px; max-width:90ch; line-height:1.5;}
.win-factors{display:flex; flex-direction:column; gap:12px; margin-top:30px;}
.wf{display:grid; grid-template-columns:44px 1fr auto; gap:22px; align-items:baseline; padding:16px 0; border-top:1px solid var(--line-2);}
.wf:first-child{border-top:1px solid var(--ink);}
.wf.lead{--wfc:var(--accent-deep);}
.wf-r{font-family:var(--mono); font-size:20px; font-weight:600; color:var(--wfc,var(--ink-3));}
.wf-n{font-size:20px; font-weight:700; color:var(--ink); letter-spacing:-.01em;}
.wf-n .most{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase;
  color:var(--accent-deep); background:var(--accent-t); border-radius:20px; padding:3px 10px; margin-left:12px; vertical-align:middle;}
.wf-b{font-size:15px; color:var(--ink-3); margin-top:5px; line-height:1.4;}
.wf-cite{font-family:var(--mono); font-size:14px; color:var(--accent-deep); white-space:nowrap;}
.win-note{font-size:14px; color:var(--ink-3); font-style:italic; margin-top:20px;}

/* =============================================================================
   S8 · WHAT IT TAKES & WHEN (§L + dates)
   ============================================================================= */
.takes{flex:1; display:grid; grid-template-columns:1.35fr 1fr; gap:52px; margin-top:24px;}
.takes-h{font-family:var(--mono); font-size:12px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  color:var(--ink-4); margin-bottom:16px;}
.vol{display:flex; gap:18px; align-items:baseline; padding:15px 0; border-top:1px solid var(--line-2);}
.vol:first-of-type{border-top:1px solid var(--ink);}
.vol-v{font-family:var(--mono); font-size:15px; font-weight:600; color:var(--accent-deep); white-space:nowrap; min-width:52px;}
.vol-b .vb-t{font-size:17px; font-weight:700; color:var(--ink); line-height:1.3; letter-spacing:-.01em;}
.vol-b .vb-c{font-size:14px; color:var(--ink-3); margin-top:4px;}
.tl{display:flex; flex-direction:column; gap:0; position:relative; padding-left:6px;}
.tl-item{display:grid; grid-template-columns:16px 1fr; gap:16px; padding:14px 0; position:relative;}
.tl-item::before{content:""; position:absolute; left:7px; top:24px; bottom:-14px; width:2px; background:var(--line);}
.tl-item:last-child::before{display:none;}
.tl-dot{width:16px; height:16px; border-radius:50%; border:3px solid var(--accent-light); background:#fff; margin-top:3px; z-index:1;}
.tl-item.gate .tl-dot{border-color:var(--accent); background:var(--accent);}
.tl-l{font-size:16px; font-weight:700; color:var(--ink); letter-spacing:-.01em;}
.tl-v{font-family:var(--mono); font-size:15px; color:var(--ink-2); margin-top:3px;}

/* =============================================================================
   S9 · PROVENANCE — "what the engine read" trust panel
   ============================================================================= */
.pv{flex:1; display:grid; grid-template-columns:1.5fr 1fr; gap:44px; margin-top:24px;}
.pv-man{display:flex; flex-direction:column; border:1px solid var(--line); border-radius:14px; overflow:hidden;
  background:linear-gradient(180deg,#fbfdff,var(--paper-2));}
.pv-f{display:grid; grid-template-columns:120px 1fr; gap:16px; align-items:baseline; padding:12px 20px; border-top:1px solid var(--line-2);}
.pv-f:first-child{border-top:none;}
.pv-r{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase;}
.pv-r[data-r="full"]{color:var(--go-d);} .pv-r[data-r="indexed"]{color:var(--caution-d);}
.pv-r[data-r="unread"],.pv-r[data-r="none"]{color:var(--ink-4);}
.pv-n{font-family:var(--mono); font-size:14px; color:var(--ink-2); overflow-wrap:anywhere;}
.pv-side{display:flex; flex-direction:column;}
.pv-side .ps-k{font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-4);}
.pv-side .ps-v{font-size:18px; color:var(--ink); margin:7px 0 22px; line-height:1.3; font-weight:600;}
.pv-defense{font-size:14.5px; color:var(--ink-3); line-height:1.55; margin-top:4px; padding-top:18px;
  border-top:1px solid var(--line); text-wrap:pretty;}

/* entrance — calm, gated, print/reduced-motion safe */
@media (prefers-reduced-motion:no-preference){
  [data-deck-active] .sl-body>*,[data-deck-active] .cv-grid>*{animation:sl-in .5s both;}
  [data-deck-active] .sl-body>*:nth-child(2){animation-delay:.06s;}
  [data-deck-active] .sl-body>*:nth-child(3){animation-delay:.12s;}
  [data-deck-active] .flow .fn{animation:fn-in .5s both;}
  [data-deck-active] .flow .fn:nth-child(2){animation-delay:.1s;}
  [data-deck-active] .flow .fn:nth-child(3){animation-delay:.2s;}
  [data-deck-active] .flow .fn:nth-child(4){animation-delay:.3s;}
  [data-deck-active] .flow .fn:nth-child(5){animation-delay:.4s;}
}
@keyframes sl-in{from{opacity:0; transform:translateY(10px);}to{opacity:1; transform:none;}}
@keyframes fn-in{from{opacity:0; transform:translateY(8px) scale(.96);}to{opacity:1; transform:none;}}

/* ---- scroll mode (compare view): stack full slides vertically on the desk tint --- */
.scrollmode{background:#e7ebef; padding:26px 0;}
.scrollmode .sl{position:relative; inset:auto; width:1280px; height:720px; margin:0 auto 26px;
  box-shadow:0 24px 60px -30px rgba(10,22,40,.45); overflow:hidden;}

/* =============================================================================
   PRINT — light everywhere (ink-friendly); keep the blue signature seam + tone.
   ============================================================================= */
@media print{
  .sl{box-shadow:none !important;}
  .sl-mark{display:none !important;}
  *{-webkit-print-color-adjust:exact; print-color-adjust:exact;}
}

/* =============================================================================
   DECK_PRINT (port host) — @page landscape + one slide per page.
   The slides render in the light-DOM .scrollmode container, so @page is valid
   here (no shadow DOM). Each .sl becomes its own 1280×720 landscape sheet; the
   last slide drops break-after so no trailing blank page prints.
   ============================================================================= */
@page{ size:1280px 720px; margin:0; }
@media print{
  html,body{ margin:0 !important; padding:0 !important; background:none !important; height:auto !important; overflow:visible !important; }
  .scrollmode{ background:none !important; padding:0 !important; }
  .scrollmode .sl{ margin:0 !important; box-shadow:none !important; break-after:page; page-break-after:always; break-inside:avoid; }
  .scrollmode .sl:last-child{ break-after:auto; page-break-after:auto; }
}
`;
