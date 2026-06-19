// GET /audit/[id] — renders the approved audit-report design with real data.
//
// Replaces the prior React shell (page.tsx + AuditReport.tsx) with the
// approved Claude Design template (_template.html), wired by _view-model.ts
// and _render.ts. Accepts either an audits.id UUID or a human-readable
// solicitation_number slug (case-insensitive, most-recent first).

import { redirect, notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";
import { buildViewModel } from "./_view-model";
import { renderAuditReportComplete } from "./_render";
import { renderAuditTransitionalState } from "./_render-states";
import { isV2Finalizing, shouldGateExport } from "@/lib/audit-display";
import { injectRail } from "@/lib/nav/rail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FA-116 — transitional states (progress / failed) for non-complete audits.
// Renders _states-template.html (canonical design shell) with ONE state per
// response; bindings + demo-leak guard live in _render-states.ts.
async function transitionalStatePage(
  audit: Record<string, unknown>,
  state: "progress" | "failed",
  user: { email?: string | null; user_metadata?: Record<string, unknown> }
): Promise<Response> {
  const templatePath = path.join(process.cwd(), "src", "app", "audit", "[id]", "_states-template.html");
  const template = await readFile(templatePath, "utf8");
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const requestedBy = String(meta.full_name || meta.name || user.email || "").trim() || null;
  // FA-RAIL — swap this page's pre-Phase-5 hardcoded sidebar for the shared
  // NAV_GROUPS rail (Design route-audit: /audit/[id] both states were the
  // straggler missed in PR #50). Same one-liner the ~22 other routes use;
  // active item = Past Audits (per Design's checklist acceptance).
  const html = injectRail(
    renderAuditTransitionalState(template, audit, { state, requestedBy }),
    "past-audits"
  );
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

// Curated demo audit for the "View a sample audit report" link on /audit.
// This row was sam-ingested (user_id=null), so RLS blocks it on a normal
// authed read. We allow a service-role fallback ONLY for this exact ID — a
// fuzzed UUID can't escape the user-scoped path.
const HERO_AUDIT_ID = "7e389f1a-0fc4-4ba2-8299-c86d23adb62a";

// ── Progressive render: the "finalizing" window ──────────────────────────────
// The executor marks an audit complete as soon as the core (V1) report is ready,
// then runs the V2 agentic layer for ~2-3 min and merges it into
// compliance_json.v2_shadow (flipping analysis_phase → "done"). During that
// window the report is shown immediately with a banner + auto-refresh so the
// deep-analysis sections stream in, instead of gating the whole report on V2.
// isV2Finalizing + V2_FINALIZING_MAX_MS now live in @/lib/audit-display so the
// page route, the PDF proxy, and the export-disable logic share one definition
// (FA-E2E re-verify Fix D).

// Injects a non-reloading progressive-render poller + a slim board-room
// "finalizing" banner. Web-only: the PDF route never calls this, so exported
// PDFs stay clean. Styles are inline so the banner is independent of the report
// template's CSS.
//
// RC6 FIX A (2026-06-18) — the previous implementation injected
// `<meta http-equiv="refresh" content="12">`, a FULL-PAGE hard reload every 12s
// for the entire V2 finalizing window (up to ~13 min) — jarring flicker that
// reset scroll + page state on every tick. Replaced with a JS poll: every ~10s
// it fetches the lightweight status endpoint and reloads EXACTLY ONCE the
// instant the deep layer lands (has_v2_shadow) or terminally errors (v2_error),
// then stops. Zero flicker during the wait; the progressive-render payoff (page
// fills in when V2 merges) is preserved; scroll/state are kept until the single
// reload. A poll cap (~40 ≈ 7 min) prevents an infinite poller if V2 stalls.
function injectFinalizingState(html: string, auditId: string): string {
  const banner =
    `<div role="status" aria-live="polite" style="position:sticky;top:0;z-index:9999;` +
    `display:flex;align-items:center;gap:10px;justify-content:center;` +
    `padding:9px 16px;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;` +
    `color:#0b3a66;background:linear-gradient(180deg,#eaf3fc,#dcebfa);` +
    `border-bottom:1px solid #b9d4f0;letter-spacing:.01em;">` +
    `<span style="display:inline-block;width:13px;height:13px;border:2px solid #7fb0e3;` +
    `border-top-color:#0b3a66;border-radius:50%;animation:faSpin .8s linear infinite;"></span>` +
    `<span>Finalizing the deep analysis — agency, work statement, and capture play are being ` +
    `generated. This page updates automatically.</span>` +
    `<style>@keyframes faSpin{to{transform:rotate(360deg)}}</style></div>`;
  // Non-reloading poll. JSON.stringify on the id keeps it injection-safe (it's a
  // UUID/slug from the DB, but treat it as untrusted). reloadedOnce guards the
  // single location.reload(); the interval clears on terminal state or the cap.
  const script =
    `<script>(function(){` +
    `var id=${JSON.stringify(auditId)};var n=0;var max=40;var done=false;` +
    `function tick(){if(done)return;n++;` +
    `fetch('/api/audit/'+encodeURIComponent(id)+'/status',{cache:'no-store'})` +
    `.then(function(r){return r.ok?r.json():null;})` +
    `.then(function(j){if(done||!j)return;` +
    `if(j.has_v2_shadow===true||j.v2_error===true){done=true;clearInterval(t);location.reload();}})` +
    `.catch(function(){});` +
    `if(n>=max){done=true;clearInterval(t);}}` +
    `var t=setInterval(tick,10000);})();</script>`;
  let out = html;
  out = /<body[^>]*>/i.test(out)
    ? out.replace(/(<body[^>]*>)/i, `$1${banner}`)
    : `${banner}${out}`;
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : `${out}${script}`;
  return out;
}

// FA-E2E Fix D + FIX 5 (2026-06-18): disable the Export action while the report
// is not exportable, so the user can't pull a half/degraded PDF. Transforms the
// existing Export anchor in place — strip href, mark aria-disabled, swap the
// sub-label, inject a not-allowed style. The sub-label is TWO-STATE (Design
// honesty rule): "Finalizing analysis…" only while genuinely still processing;
// "Export disabled" on a true error/degraded run (don't imply it's still
// working when it isn't). Web-only (the PDF route never calls this), so exported
// PDFs are unaffected.
function disableExport(html: string, subLabel: string): string {
  let out = html;
  out = out.replace(
    /(<a\b[^>]*\bdata-field=["']pdf_export_url["'][^>]*>)/i,
    (tag) => {
      let t = tag;
      t = t.replace(/\shref=("[^"]*"|'[^']*')/i, "");
      if (!/aria-disabled=/i.test(t)) t = t.replace(/>$/, ' aria-disabled="true">');
      return t;
    }
  );
  // Swap the Export control's sub-label (.a-s), leaving the .a-t title intact.
  out = out.replace(
    /(<a\b[^>]*\bdata-field=["']pdf_export_url["'][\s\S]*?<span class="a-s">)([\s\S]*?)(<\/span>)/i,
    (_m, pre, _label, close) => `${pre}${subLabel}${close}`
  );
  const style =
    `<style>[data-field="pdf_export_url"][aria-disabled="true"]` +
    `{pointer-events:none;opacity:.55;cursor:not-allowed}</style>`;
  out = out.includes("</head>") ? out.replace("</head>", `${style}</head>`) : `${style}${out}`;
  return out;
}

// FIX 5 + Design spec (2026-06-18): the in-report DEGRADED banner. When the V2
// deep-analysis layer errored / timed out / stalled (export gated but NOT a live
// finalizing run), surface a quiet amber heads-up at the top of the report
// content so the greyed Export is self-explanatory. Design decision: ports the
// existing .eval-gap §M honesty-callout treatment 1:1 — same --amber-50/200/600
// tokens + the existing dark rule — placed inside the report frame at the top of
// .rpt-main (under the masthead, content-width), NOT a sticky bar. Persistent
// while degraded; no auto-refresh (nothing left to stream). Self-contained
// inject (no _template.html edit); references the report's own tokens so light
// + dark both resolve correctly.
function injectDegradedBanner(html: string): string {
  const style =
    `<style>` +
    `.fa-degraded-banner{display:flex;gap:11px;align-items:flex-start;margin:0 0 18px;` +
    `padding:12px 15px;border-radius:10px;background:var(--amber-50);` +
    `border:1px solid var(--amber-200);font-size:13px;line-height:1.5;color:var(--ink-2)}` +
    `.fa-degraded-banner svg{width:16px;height:16px;color:var(--amber-600);flex:none;margin-top:1px}` +
    `.fa-degraded-banner b{display:block;color:var(--ink);font-weight:800;margin-bottom:2px}` +
    `.fa-degraded-banner a{color:var(--amber-700);font-weight:600;text-decoration:none}` +
    `.fa-degraded-banner a:hover{text-decoration:underline}` +
    `[data-theme="dark"] .fa-degraded-banner{background:rgba(214,162,60,.12);border-color:transparent}` +
    `[data-theme="dark"] .fa-degraded-banner svg{color:#fcd34d}` +
    `</style>`;
  const banner =
    `<div class="fa-degraded-banner" role="status">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M10.3 4 2 18.2A1.6 1.6 0 0 0 3.4 20.6h17.2A1.6 1.6 0 0 0 22 18.2L13.7 4a1.6 1.6 0 0 0-2.7 0z"/>` +
    `<path d="M12 9.5v4M12 17h.01"/></svg>` +
    `<span><b>Deep analysis unavailable for this run</b>The core report below is complete ` +
    `and accurate. Export is disabled until a full analysis succeeds — ` +
    `<a href="/audit">re-run</a> to try again.</span></div>`;
  let out = html;
  out = out.includes("</head>") ? out.replace("</head>", `${style}</head>`) : `${style}${out}`;
  // Top of the report content column, under the masthead (Design placement).
  // If the anchor is absent, skip rather than misplace the banner.
  if (out.includes('<div class="rpt-main">')) {
    out = out.replace('<div class="rpt-main">', `<div class="rpt-main">${banner}`);
  }
  return out;
}

// RC6 FIX B (2026-06-18): Export PDF spinner / "Generating PDF…" feedback.
// The export control is a plain <a href="/api/audit/[id]/pdf"> with NO JS — the
// CEO clicks it and gets nothing until the browser starts the (multi-second)
// download, so it feels dead. This injects a self-contained click handler
// (web-only, like the other inject helpers) on the export anchor
// [data-field="pdf_export_url"]. On click (only when NOT aria-disabled — so it
// no-ops while the FIX 5 export gate has disabled the control):
//   1. preventDefault, swap the .a-s sub-label to "Generating PDF…", insert a
//      spinner reusing the faSpin keyframe, and apply a not-allowed disabled
//      visual + re-entrancy guard;
//   2. fetch(href) → blob → object URL → trigger a real <a download> (filename
//      from Content-Disposition if present, else a sensible default);
//   3. restore the original label/state on success OR error.
// Self-contained: no _template.html edit. Only injected on the COMPLETE report,
// where the anchor is a live href (never while export is gated).
//
// VISUAL NOTE (flag for Design review): the spinner is a minimal reuse of the
// existing faSpin keyframe + the finalizing banner's spinner geometry (13px,
// currentColor-ish blue ring) inserted before the sub-label; the disabled state
// is opacity .6 + cursor:not-allowed (matches the FIX 5 gated style). No new
// colors/layout introduced — Design should refine placement/size/copy.
function injectExportSpinner(html: string): string {
  const style =
    `<style>@keyframes faSpin{to{transform:rotate(360deg)}}` +
    `.fa-pdf-spin{display:inline-block;width:13px;height:13px;vertical-align:-2px;margin-right:6px;` +
    `border:2px solid currentColor;border-top-color:transparent;border-radius:50%;` +
    `animation:faSpin .8s linear infinite;opacity:.85}` +
    `[data-field="pdf_export_url"].fa-pdf-busy{pointer-events:none;opacity:.6;cursor:not-allowed}` +
    `</style>`;
  const script =
    `<script>(function(){` +
    `var a=document.querySelector('[data-field="pdf_export_url"]');` +
    `if(!a)return;` +
    `a.addEventListener('click',function(e){` +
    // Respect the FIX 5 export gate: a gated control is aria-disabled (and has
    // no href) — do nothing and let the existing pointer-events:none stand.
    `if(a.getAttribute('aria-disabled')==='true')return;` +
    `if(a.classList.contains('fa-pdf-busy'))return;` +
    `var href=a.getAttribute('href');if(!href)return;` +
    `e.preventDefault();` +
    `var sub=a.querySelector('.a-s');` +
    `var prevLabel=sub?sub.textContent:null;` +
    `function restore(){a.classList.remove('fa-pdf-busy');a.removeAttribute('aria-busy');` +
    `var sp=a.querySelector('.fa-pdf-spin');if(sp)sp.remove();` +
    `if(sub&&prevLabel!==null)sub.textContent=prevLabel;}` +
    `a.classList.add('fa-pdf-busy');a.setAttribute('aria-busy','true');` +
    `if(sub){sub.textContent='Generating PDF…';` +
    `var sp=document.createElement('span');sp.className='fa-pdf-spin';sp.setAttribute('aria-hidden','true');` +
    `sub.parentNode.insertBefore(sp,sub);}` +
    `fetch(href,{cache:'no-store'}).then(function(r){` +
    `if(!r.ok)throw new Error('pdf '+r.status);` +
    `var cd=r.headers.get('content-disposition')||'';` +
    `var m=/filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i.exec(cd);` +
    `var name=m?decodeURIComponent(m[1]):'faraudit-report.pdf';` +
    `return r.blob().then(function(b){return{b:b,name:name};});` +
    `}).then(function(o){` +
    `var url=URL.createObjectURL(o.b);` +
    `var dl=document.createElement('a');dl.href=url;dl.download=o.name;` +
    `document.body.appendChild(dl);dl.click();dl.remove();` +
    `setTimeout(function(){URL.revokeObjectURL(url);},4000);` +
    `restore();` +
    `}).catch(function(){restore();});` +
    `});})();</script>`;
  let out = html;
  out = out.includes("</head>") ? out.replace("</head>", `${style}</head>`) : `${style}${out}`;
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : `${out}${script}`;
  return out;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return new Response("id required", { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/audit/${encodeURIComponent(id)}`);

  // UUID path: direct lookup. Slug path: case-insensitive
  // solicitation_number match, most recent first (some sol numbers are
  // audited multiple times).
  let audit: Record<string, unknown> | null = null;
  if (UUID_RE.test(id)) {
    const { data } = await supabase.from("audits").select("*").eq("id", id).single();
    audit = data as Record<string, unknown> | null;
  } else {
    const { data } = await supabase
      .from("audits")
      .select("*")
      .ilike("solicitation_number", id)
      .order("created_at", { ascending: false })
      .limit(1);
    audit = data && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
  }

  // Gated service-role fallback for the curated demo audit only. Lets every
  // signed-in user see the sample report regardless of who originally ran it
  // (the row is sam-ingested with user_id=null and RLS-blocked otherwise).
  if (!audit && id.toLowerCase() === HERO_AUDIT_ID) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data } = await adminClient.from("audits").select("*").eq("id", HERO_AUDIT_ID).single();
      audit = data as Record<string, unknown> | null;
    }
  }

  if (!audit) notFound();

  // FA-116 — async-audit wait states. A 202-enqueued audit's row exists
  // immediately with status='processing'; render the canonical in-progress
  // state (real status polling, reload on terminal status) until the worker
  // lands a terminal status, and the canonical failed state for
  // status='failed'. Complete rows fall through to the full template
  // rendering below, byte-for-byte unchanged.
  const auditStatus = String(audit.status ?? "");
  if (auditStatus === "processing") {
    return transitionalStatePage(audit, "progress", user);
  }
  if (auditStatus === "failed") {
    return transitionalStatePage(audit, "failed", user);
  }

  // Is the current user watching this notice? Drives the data-track CTA's
  // initial .is-tracking state. Failure is non-fatal (just renders untracked).
  let isWatching = false;
  const noticeId = String(audit.notice_id ?? "");
  if (noticeId) {
    const { data: watchRow } = await supabase
      .from("watched_notices")
      .select("id")
      .eq("user_id", user.id)
      .eq("notice_id", noticeId)
      .maybeSingle();
    isWatching = !!watchRow;
  }

  // FA-108: capability_statement presence — soft-locks the Fit Score when
  // the user has no statement on file. Default true (unlocked) — only flipped
  // to false on explicit "no row" result so transient query errors leave the
  // score visible rather than locking everyone out.
  let hasCapabilityStatement = true;
  const { data: capRow, error: capErr } = await supabase
    .from("capability_statements")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!capErr) hasCapabilityStatement = !!capRow;

  const vm = buildViewModel(audit, { isWatching, hasCapabilityStatement });

  const templatePath = path.join(process.cwd(), "src", "app", "audit", "[id]", "_template.html");
  const template = await readFile(templatePath, "utf8");
  let html = renderAuditReportComplete(template, vm, audit as Record<string, unknown>);
  // FA-RAIL — swap the pre-Phase-5 hardcoded sidebar for the shared NAV_GROUPS
  // rail (the /audit/[id] straggler from the PR #50 propagation). Active item =
  // Past Audits (per Design). The PDF route deliberately does NOT do this — the
  // sidebar is hidden in print, so exported PDFs stay clean.
  html = injectRail(html, "past-audits");

  // Progressive render. The audit is marked complete the moment the core (V1)
  // report is ready (~3 min); the V2 agentic layer (agency / work-statement /
  // Capture Play) finishes ~2-3 min later and merges into
  // compliance_json.v2_shadow. While it's still running we show the core report
  // immediately with a "finalizing" banner and auto-refresh, so the deep-analysis
  // sections fill in live rather than the user staring at a spinner — a streaming
  // render. Keyed off analysis_phase==="finalizing" + v2_shadow absent. A 6-min
  // backstop on completed_at stops the refresh loop if V2 ever stalls/fails, so
  // the report is never stuck refreshing.
  // FIX 5 — two SEPARATE questions. (1) Export stays gated in EVERY incomplete
  // state (finalizing, errored, or stalled) so a half/degraded PDF can never
  // leave. (2) Live vs degraded get different treatments: a genuinely-live run
  // gets the spinner + auto-refresh; an errored/stalled run gets the static
  // amber degraded banner (no refresh that would loop forever). The Export
  // sub-label is two-state to match (Design honesty rule).
  const gateExport = shouldGateExport(audit);
  const liveFinalizing = isV2Finalizing(audit);
  if (gateExport) {
    html = disableExport(html, liveFinalizing ? "Finalizing analysis…" : "Export disabled");
  }
  if (liveFinalizing) {
    // FIX A — pass the resolved audit UUID so the non-reloading poller hits the
    // status endpoint directly (no slug round-trip needed).
    html = injectFinalizingState(html, String(audit.id ?? id));
  } else if (gateExport) {
    html = injectDegradedBanner(html);
  }
  // RC6 FIX B — Export PDF spinner. Only on a genuinely COMPLETE report, where
  // the export anchor is a live href. When export is gated, the anchor is
  // aria-disabled (and the handler no-ops anyway), so it's safe to scope this to
  // the non-gated path and avoid attaching to a dead control.
  if (!gateExport) {
    html = injectExportSpinner(html);
  }

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
