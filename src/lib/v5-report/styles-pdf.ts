/* =============================================================================
   v5 Executive Brief (PDF) — stylesheet (REPORT_PDF_CSS)
   Ported 1:1 from the Design v5 package (_v5-PORT-READY/src/report-pdf.css,
   2026-07-05). Portrait Letter, prints native; page geometry owned by <doc-page>
   (no @page rules here). Blue #378ADD is the FRAME accent; verdict tone is the
   ONLY semantic accent, reserved for the verdict.

   PORT ADAPTATION (single, deliberate): the faint diagonal "REVIEW" watermark
   ::before is scoped to `.gb-cover.is-rep` (was unconditional on `.gb-cover`).
   The renderer adds `is-rep` only on the mock `rep` fixture, so a PRODUCTION
   Executive Brief never carries the watermark — the spec's "watermarked; nothing
   ships" applies to the design mock, not the shipped artifact.

   Fonts (Manrope + IBM Plex Mono) are embedded via FONTS_CSS (Phase-5 HARD GATE) —
   see the note at the top of REPORT_PDF_CSS below.
   ============================================================================= */
export const REPORT_PDF_CSS: string = `
/* Fonts are embedded (base64 woff2) via FONTS_CSS, prepended into the render
   document ahead of this stylesheet — the Google Fonts @import was removed at the
   Phase-5 HARD GATE so the brief is self-hosted (offline/print-fidelity). */

:root{
  --go:#1a7d53; --go-t:#e9f2ec; --go-d:#12603e;
  --caution:#a9590c; --caution-t:#f5ebdd; --caution-d:#824407;
  --stop:#992c26; --stop-t:#f4e5e3; --stop-d:#742019;
  --slate:#374253; --slate-t:#e8ecf1; --slate-d:#28313f;

  /* brand blue — the FRAME accent */
  --accent:#378ADD; --accent-deep:#185FA5; --accent-light:#B5D4F4; --accent-t:#eaf3fc;
  --navy:#0A1628;

  --ink:#111a25; --ink-2:#3a4757; --ink-3:#66727f; --ink-4:#95a0ac;
  --rule:#d3dae2; --rule-2:#e7ecf1;
  --paper:#ffffff; --wash:#f5f8fb;

  --sans:'Manrope', ui-sans-serif, system-ui, sans-serif;
  --mono:'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;
}

doc-page:not(:defined){visibility:hidden;}

*{box-sizing:border-box;}
doc-page{
  font-family:var(--sans); color:var(--ink); font-size:10.4pt; line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
.mono{font-family:var(--mono); font-feature-settings:"tnum" 1;}
b,strong{font-weight:700;}

/* ---- brand wordmark lockup ----------------------------------------------- */
.wm{display:inline-flex; align-items:baseline; font-weight:800; letter-spacing:-.015em; font-size:15pt; line-height:1;}
.wm .wm-a{color:var(--navy);} .wm .wm-b{color:var(--accent);}
.wm .wm-dot{width:6px; height:6px; border-radius:50%; background:var(--accent); align-self:center;
  margin-left:6px; box-shadow:0 0 0 3px rgba(55,138,221,.16);}

/* "VERIFIED" live pill */
.live{display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:7.4pt; font-weight:600;
  letter-spacing:.16em; color:var(--go-d); text-transform:uppercase; padding:3px 9px; border-radius:20px;
  background:var(--go-t); border:.75px solid color-mix(in srgb, var(--go) 24%, #fff);}
.live .live-d{width:6px; height:6px; border-radius:50%; background:var(--go);}
.live.nv{background:var(--slate-t); border-color:color-mix(in srgb, var(--slate) 26%, #fff); color:var(--slate-d);}
.live.nv .live-d{background:var(--slate);}

/* ---- running header / footer (brand skirts) ----------------------------- */
.gb-head{display:flex; align-items:center; justify-content:space-between; gap:16px;
  font-size:8pt; color:var(--ink-3); padding-bottom:6px; border-bottom:.75px solid var(--rule);}
.gb-head .gh-mark{display:inline-flex; align-items:baseline; gap:0; font-weight:800; font-size:10.5pt; letter-spacing:-.01em; white-space:nowrap;}
.gb-head .gh-mark .wm-a{color:var(--navy);} .gb-head .gh-mark .wm-b{color:var(--accent);}
.gb-head .gh-mark .wm-dot{width:5px; height:5px; border-radius:50%; background:var(--accent); align-self:center; margin:0 7px 0 5px;}
.gb-head .gh-mark .gh-tagline{font-family:var(--mono); font-size:7pt; font-weight:500; letter-spacing:.14em;
  text-transform:uppercase; color:var(--ink-4); align-self:center; white-space:nowrap;}
.gb-head .gh-r{display:flex; align-items:center; gap:10px; text-transform:uppercase; letter-spacing:.04em; font-size:7.6pt; white-space:nowrap;}
.gb-head .gh-sol{font-family:var(--mono); text-transform:none; letter-spacing:0; color:var(--ink-3); white-space:nowrap;}
.gb-head .gh-tag{font-family:var(--mono); font-weight:600; padding:1.5px 6px; border-radius:3px; text-transform:none; letter-spacing:0; white-space:nowrap;}

.gb-foot{display:flex; align-items:center; justify-content:space-between; gap:16px;
  font-family:var(--mono); font-size:7.2pt; letter-spacing:.08em; color:var(--ink-4);
  padding-top:6px; border-top:.75px solid var(--rule); text-transform:uppercase;}
.gb-foot .gf-sol{text-transform:none; letter-spacing:0; color:var(--ink-3);}
.gb-foot .gf-brand{text-transform:none; letter-spacing:.02em; color:var(--ink-3); font-weight:600;}

.gh-tag[data-tone="go"]{background:var(--go-t); color:var(--go-d);}
.gh-tag[data-tone="caution"]{background:var(--caution-t); color:var(--caution-d);}
.gh-tag[data-tone="stop"]{background:var(--stop-t); color:var(--stop-d);}
.gh-tag[data-tone="slate"]{background:var(--slate-t); color:var(--slate-d);}

/* =============================================================================
   COVER — brand moment on white; the whole decision on the first page
   ============================================================================= */
.gb-cover{position:relative; min-height:8.9in; display:flex; flex-direction:column; break-after:page;}
/* faint diagonal brand watermark — REVIEW-ONLY (scoped to .is-rep so production is clean) */
.gb-cover.is-rep::before{content:"REVIEW"; position:absolute; top:40%; left:50%;
  transform:translate(-50%,-50%) rotate(-24deg); font-family:var(--mono); font-weight:600; font-size:78pt;
  letter-spacing:.24em; color:rgba(16,26,37,.028); pointer-events:none; z-index:0; white-space:nowrap;}
.gb-cover>*{position:relative; z-index:1;}

/* brand row + electric-blue signature rule */
.gb-brand{display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding-bottom:13px; border-bottom:2px solid var(--accent);}
.gb-brand .bk{font-family:var(--mono); font-size:7.8pt; font-weight:500; letter-spacing:.18em;
  text-transform:uppercase; color:var(--ink-4);}

/* classification-style banner + heavy navy rule (the defense-document signature) */
.gb-cv-banner{display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:6px;
  padding-bottom:10px; border-bottom:2.5px solid var(--navy);}
.gb-cv-banner .cv-eyebrow{display:inline-flex; align-items:center; gap:11px; font-family:var(--mono);
  font-size:8pt; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--navy);}
.gb-cv-banner .cv-idx{background:var(--navy); color:#fff; padding:2.5px 6px; border-radius:3px; font-size:7.4pt; letter-spacing:.1em;}
.gb-cv-banner .cv-class{font-family:var(--mono); font-size:7.4pt; letter-spacing:.14em; text-transform:uppercase; color:var(--accent-deep);}

.gb-cv-sol{margin-top:18px;}
.gb-cv-sol .cs-mast{display:flex; align-items:center; gap:9px;}
.gb-cv-sol .cs-badge{background:var(--navy); color:#fff; font-family:var(--mono); font-size:7.4pt; font-weight:600;
  letter-spacing:.09em; text-transform:uppercase; padding:3px 8px; border-radius:4px;}
.gb-cv-sol .cs-num{font-size:10.5pt; color:var(--ink-2); letter-spacing:.02em;}
.gb-cv-sol .cs-title{font-size:26pt; font-weight:800; line-height:1.06; letter-spacing:-.03em;
  color:var(--navy); margin-top:9px; text-wrap:balance;}

/* verdict plate — light tone tint, blue-free (tone is the semantic signal) */
.gb-verdict{margin-top:24px; border:1px solid var(--rule); border-top:3px solid var(--tone,var(--slate));
  background:linear-gradient(180deg,var(--tone-t,var(--slate-t)) 0%, #fff 130%);
  border-radius:0 0 8px 8px; padding:16px 20px 20px; display:flex; flex-direction:column; gap:13px;}
.gb-verdict[data-tone="go"]{--tone:var(--go); --tone-t:var(--go-t);}
.gb-verdict[data-tone="caution"]{--tone:var(--caution); --tone-t:var(--caution-t);}
.gb-verdict[data-tone="stop"]{--tone:var(--stop); --tone-t:var(--stop-t);}
.gb-verdict[data-tone="slate"]{--tone:var(--slate); --tone-t:var(--slate-t);}
.gv-lead{display:flex; align-items:center; justify-content:space-between; gap:12px;}
.gv-eb{display:inline-flex; align-items:center; gap:10px; font-family:var(--mono); font-size:8pt; font-weight:600;
  letter-spacing:.14em; text-transform:uppercase; color:var(--tone);}
.gv-eb .gv-dot{width:8px; height:8px; border-radius:50%; background:var(--tone);}
.gv-word{font-size:34pt; font-weight:800; line-height:1; letter-spacing:-.03em; color:var(--tone);}
.gb-verdict[data-noverdict="1"] .gv-word{color:var(--slate);}
.gv-chips{display:flex; align-items:center; gap:9px; flex-wrap:wrap;}
.gv-chip{font-family:var(--mono); font-size:8pt; font-weight:600; letter-spacing:.03em;
  border:1.25px solid currentColor; border-radius:5px; padding:3px 9px; white-space:nowrap;}
.gv-chip.stamp{color:var(--tone);}
.gv-chip.elig{border-color:var(--rule); color:var(--ink-2); display:inline-flex; gap:7px; align-items:center;}
.gv-chip.elig .k{color:var(--ink-4); font-weight:600; text-transform:uppercase; font-size:7pt; letter-spacing:.06em;}
.gv-chip.elig[data-e="ok"] .v{color:var(--go-d);} .gv-chip.elig[data-e="no"] .v{color:var(--stop);}
.gv-chip.elig[data-e="nd"] .v{color:var(--caution-d);}
.gv-chip.nocharge{border:none; background:var(--wash); color:var(--ink-2); border-radius:20px;}

/* bottom line — blue signature accent */
.gb-bl{margin-top:22px; padding-left:16px; border-left:3px solid var(--accent);}
.gb-bl .bl-k{font-family:var(--mono); font-size:7.6pt; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--accent-deep); margin-bottom:8px;}
.gb-bl .bl-t{font-size:13pt; line-height:1.5; color:var(--ink); text-wrap:pretty; max-width:64ch; font-weight:500;}

/* identity grid */
.gb-idgrid{margin-top:24px; display:grid; grid-template-columns:1fr 1fr; gap:0 34px; border-top:.75px solid var(--rule);}
.gb-id{display:flex; flex-direction:column; gap:3px; padding:11px 0; border-bottom:.75px solid var(--rule-2);}
.gb-id .id-k{font-family:var(--mono); font-size:7.2pt; font-weight:600; letter-spacing:.1em;
  text-transform:uppercase; color:var(--ink-4);}
.gb-id .id-v{font-size:10.2pt; color:var(--ink); line-height:1.35;}
.gb-id .id-v.mono{font-size:9.6pt;}
.gb-id .id-sub{font-size:8.4pt; color:var(--ink-3); line-height:1.35;}
/* document-control grid — hairline-boxed w/ navy frame + blue mono labels */
.gb-dcgrid{margin-top:22px; grid-template-columns:1fr 1fr; gap:0; border:1px solid var(--navy);
  border-radius:2px; overflow:hidden; border-top:1px solid var(--navy);}
.gb-dcgrid .gb-id{padding:11px 15px; gap:5px; border-bottom:none; border-top:.75px solid var(--rule); border-left:.75px solid var(--rule);}
.gb-dcgrid .gb-id:nth-child(-n+2){border-top:none;}
.gb-dcgrid .gb-id:nth-child(odd){border-left:none;}
.gb-dcgrid .id-k{color:var(--accent-deep);}
.gb-dcgrid .id-v{color:var(--navy); font-weight:500;}

/* key dates strip */
.gb-cv-dates{margin-top:20px; display:flex; gap:0; border:.75px solid var(--rule); border-radius:7px; overflow:hidden;}
.gb-cd{flex:1; padding:11px 14px; border-left:.75px solid var(--rule-2);}
.gb-cd:first-child{border-left:none;}
.gb-cd .cd-k{font-family:var(--mono); font-size:7pt; font-weight:600; letter-spacing:.08em;
  text-transform:uppercase; color:var(--ink-4);}
.gb-cd .cd-v{font-family:var(--mono); font-size:9.6pt; color:var(--ink); margin-top:4px;}
.gb-cd.gate .cd-v{color:var(--accent-deep);}

.gb-cv-foot{margin-top:auto; padding-top:16px; border-top:.75px solid var(--rule);
  display:flex; justify-content:space-between; align-items:flex-end; gap:16px; font-size:8pt; color:var(--ink-3);}
.gb-cv-foot .cf-k{font-family:var(--mono); font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-4); font-size:7pt;}
.gb-cv-foot .cf-rep{max-width:38ch; text-align:right; line-height:1.45; color:var(--caution-d);}

/* =============================================================================
   SECTIONS — typeset body
   ============================================================================= */
.gb-sec{margin-top:26px;}
.gb-sec:first-of-type{margin-top:6px;}
.gb-sec-h{display:flex; align-items:baseline; gap:12px; padding-bottom:9px; margin-bottom:16px;
  border-bottom:2px solid var(--ink); break-after:avoid;}
.gb-sec-n{font-family:var(--mono); font-size:10pt; font-weight:600; color:var(--accent-deep);}
.gb-sec-t{font-size:15pt; font-weight:800; letter-spacing:-.02em; color:var(--ink);}
.gb-sub{font-size:11pt; font-weight:700; color:var(--ink); margin:20px 0 10px; letter-spacing:-.01em; break-after:avoid;}
.gb-sub .gs-cite{font-family:var(--mono); font-size:8.5pt; font-weight:500; color:var(--ink-3); margin-left:8px;}
.gb-lead{font-size:10pt; color:var(--ink-2); margin:0 0 14px; max-width:72ch; line-height:1.55;}

/* exec at-a-glance quad */
.gb-exec{display:grid; grid-template-columns:1fr 1fr; border:.75px solid var(--rule); border-radius:7px;
  overflow:hidden; margin-top:4px;}
.gb-ex{padding:14px 16px; border-top:.75px solid var(--rule-2); border-left:.75px solid var(--rule-2); break-inside:avoid;}
.gb-ex:nth-child(-n+2){border-top:none;}
.gb-ex:nth-child(odd){border-left:none;}
.gb-ex .ex-v{font-size:19pt; font-weight:800; line-height:1; letter-spacing:-.03em; color:var(--tt,var(--ink));}
.gb-ex[data-tone="go"]{--tt:var(--go);} .gb-ex[data-tone="caution"]{--tt:var(--caution);}
.gb-ex[data-tone="stop"]{--tt:var(--stop);} .gb-ex[data-tone="slate"]{--tt:var(--ink);}
.gb-ex .ex-v.textv{font-size:12.5pt; line-height:1.1;}
.gb-ex .ex-k{font-size:9.5pt; font-weight:700; color:var(--ink); margin-top:5px;}
.gb-ex .ex-sub{font-family:var(--mono); font-size:8pt; color:var(--ink-3); margin-top:4px; letter-spacing:.01em;}

/* =============================================================================
   REASONING CHAIN — vertical pipeline of nodes (proof-as-marketing)
   ============================================================================= */
.gb-rc{margin-top:6px;}
.gb-rc-step{position:relative; padding:11px 0 13px 42px; break-inside:avoid;}
.gb-rc-step::before{content:""; position:absolute; left:13px; top:0; bottom:0; width:2px; background:var(--accent-light);}
.gb-rc-step:first-child::before{top:15px;}
.gb-rc-step:last-child::before{display:none;}
.gb-rc-n{position:absolute; left:0; top:9px; width:28px; height:28px; border-radius:50%; background:#fff;
  border:2px solid var(--tt,var(--accent-light)); color:var(--tt,var(--ink-3)); display:grid; place-items:center;
  font-family:var(--mono); font-size:8.4pt; font-weight:600; z-index:1;}
.gb-rc-step[data-tone="go"]{--tt:var(--go);} .gb-rc-step[data-tone="caution"]{--tt:var(--caution);}
.gb-rc-step[data-tone="stop"]{--tt:var(--stop);} .gb-rc-step[data-tone="slate"]{--tt:var(--slate);}
.gb-rc-b{min-width:0;}
.gb-rc-k{font-family:var(--mono); font-size:7.6pt; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-4);}
.gb-rc-out{font-size:11.5pt; font-weight:700; color:var(--tt,var(--ink)); margin:2px 0 4px; letter-spacing:-.01em;}
.gb-rc-d{font-size:9.8pt; color:var(--ink-2); line-height:1.5; max-width:74ch;}
.gb-rc-cite{font-family:var(--mono); font-size:8.2pt; color:var(--accent-deep); margin-top:5px; display:inline-block; white-space:nowrap;}
.gb-rc-find{display:grid; grid-template-columns:1fr auto; gap:4px 16px; align-items:baseline; margin-top:9px;}
.gb-rc-find .rf-req{font-size:10pt; font-weight:600; color:var(--ink); line-height:1.4;}
.gb-rc-step.verdict{background:var(--tt-t,var(--slate-t)); border-radius:0 6px 6px 0; padding:14px 16px 14px 42px; margin-top:6px;}
.gb-rc-step.verdict::before{display:none;}
.gb-rc-step.verdict .gb-rc-n{background:var(--tt,var(--slate)); border-color:var(--tt,var(--slate)); color:#fff; top:13px;}
.gb-rc-step.verdict[data-tone="go"]{--tt-t:var(--go-t);} .gb-rc-step.verdict[data-tone="caution"]{--tt-t:var(--caution-t);}
.gb-rc-step.verdict[data-tone="stop"]{--tt-t:var(--stop-t);} .gb-rc-step.verdict[data-tone="slate"]{--tt-t:var(--slate-t);}

/* =============================================================================
   FINDINGS
   ============================================================================= */
.gb-fg{margin-top:16px;}
.gb-fg-h{display:flex; align-items:center; gap:9px; font-size:9pt; font-weight:700; letter-spacing:.03em;
  text-transform:uppercase; color:var(--ink-2); padding-bottom:7px; border-bottom:1px solid var(--rule); margin-bottom:2px; break-after:avoid;}
.gb-fg-h .fh-sq{width:9px; height:9px; border-radius:2px; background:var(--slate);}
.gb-fg-h[data-sev="p0"] .fh-sq{background:var(--stop);} .gb-fg-h[data-sev="p1"] .fh-sq{background:var(--caution);}
.gb-fg-h[data-sev="p2"] .fh-sq{background:var(--ink-3);} .gb-fg-h[data-sev="ok"] .fh-sq{background:var(--go);}
.gb-fg-h[data-sev="review"] .fh-sq{background:var(--caution);}
.gb-fg-h .fh-c{font-family:var(--mono); font-size:8pt; color:var(--ink-3); margin-left:auto; letter-spacing:0;}
.gb-none{font-size:9.6pt; color:var(--ink-3); padding:10px 0;}

.gb-fd{padding:14px 0; border-bottom:.75px solid var(--rule-2); break-inside:avoid;}
.gb-fd-top{display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:7px;}
.gb-fd-sev{font-family:var(--mono); font-size:7.4pt; font-weight:600; letter-spacing:.03em; text-transform:uppercase;
  padding:2.5px 8px; border-radius:4px; white-space:nowrap;}
.gb-fd-sev[data-sev="p0"]{background:var(--stop-t); color:var(--stop);}
.gb-fd-sev[data-sev="p1"]{background:var(--caution-t); color:var(--caution);}
.gb-fd-sev[data-sev="p2"]{background:var(--wash); color:var(--ink-2);}
/* no-verdict pole — calm graphite chip (mixed-case) + warm-amber rail (Design v5 gate) */
.gb-fd-sev[data-sev="review"]{background:var(--slate-t); color:var(--slate-d); text-transform:none; letter-spacing:.01em;}
.gb-fd[data-sev="review"]{border-left:2.5px solid var(--caution); padding-left:11px;}
.gb-fd-req{font-size:10.6pt; color:var(--ink); font-weight:700; line-height:1.4; margin:0; letter-spacing:-.01em;}
.gb-fd-cite{font-family:var(--mono); font-size:8.4pt; color:var(--accent-deep); white-space:nowrap;}
.gb-fd-ex{font-size:9.6pt; color:var(--ink-2); line-height:1.5; margin:9px 0 0 0; padding-left:13px;
  border-left:2px solid var(--accent-light); font-style:normal;}
.gb-fd-clear{display:flex; gap:9px; margin-top:9px; font-size:9.4pt; color:var(--ink-2); line-height:1.45;}
.gb-fd-clear .cl-k{font-family:var(--mono); font-size:7.4pt; font-weight:600; letter-spacing:.05em;
  text-transform:uppercase; color:var(--go-d); white-space:nowrap; padding-top:2px;}

/* =============================================================================
   TABLES (L / M / CLIN / dates)
   ============================================================================= */
.gb-table{width:100%; border-collapse:collapse; margin-top:4px; font-size:9.8pt;}
.gb-table th{font-family:var(--mono); font-size:7.6pt; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
  color:var(--ink-4); text-align:left; padding:8px 12px 8px 0; border-bottom:1.5px solid var(--ink);}
.gb-table td{padding:10px 12px 10px 0; border-bottom:.75px solid var(--rule-2); vertical-align:top; line-height:1.4;
  color:var(--ink); break-inside:avoid;}
.gb-table tr:last-child td{border-bottom:none;}
.gb-table .c-mono{font-family:var(--mono); font-size:8.8pt; color:var(--ink-2); white-space:nowrap;}
.gb-table .c-vol{font-family:var(--mono); font-size:8.8pt; font-weight:600; color:var(--accent-deep); white-space:nowrap;}
.gb-table .c-strong{font-weight:700;}
.gb-table .c-sub{font-size:8.6pt; color:var(--ink-3);}
.gb-mnote{font-size:9pt; color:var(--ink-3); font-style:italic; margin-top:10px;}

/* basis of award — blue signature accent */
.gb-award{border-left:3px solid var(--accent); padding:2px 0 2px 15px; margin:4px 0 16px;}
.gb-award .aw-k{font-family:var(--mono); font-size:7.6pt; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-4);}
.gb-award .aw-v{font-size:15pt; font-weight:800; color:var(--ink); margin-top:4px; line-height:1.15; letter-spacing:-.015em;}
.gb-award .aw-tail{font-size:9.8pt; color:var(--ink-2); margin-top:6px; line-height:1.5; max-width:72ch;}

/* =============================================================================
   PROVENANCE — "what the engine read" trust panel
   ============================================================================= */
.gb-man{list-style:none; margin:6px 0 0; padding:0; border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
.gb-man li{display:grid; grid-template-columns:118px 1fr; gap:14px; align-items:baseline;
  padding:9px 14px; border-top:.75px solid var(--rule-2); break-inside:avoid;}
.gb-man li:first-child{border-top:none;}
.gb-man .m-r{font-family:var(--mono); font-size:7.6pt; font-weight:600; letter-spacing:.03em; text-transform:uppercase;}
.gb-man .m-r[data-r="full"]{color:var(--go-d);} .gb-man .m-r[data-r="indexed"]{color:var(--caution-d);}
.gb-man .m-r[data-r="unread"],.gb-man .m-r[data-r="none"]{color:var(--ink-4);}
.gb-man .m-n{font-family:var(--mono); font-size:8.8pt; color:var(--ink-2); overflow-wrap:anywhere;}
.gb-defense{font-size:9.4pt; color:var(--ink-3); margin-top:14px; line-height:1.55; max-width:76ch; padding-top:12px;
  border-top:.75px solid var(--rule-2);}

/* review banner on the cover */
.gb-rep{margin-top:16px; background:var(--accent-t); border:1px solid color-mix(in srgb, var(--accent) 30%, #fff);
  color:var(--accent-deep); border-radius:6px; padding:8px 13px; font-family:var(--mono);
  font-size:8pt; font-weight:500; letter-spacing:.02em;}

/* screen niceties — the desk behind the sheet */
@media screen{ body{background:#e7ebef;} }
`;
