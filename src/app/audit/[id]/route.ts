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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FA-116 — minimal wait/error page for non-complete audits. error_message can
// carry upstream (SAM/Anthropic) text, so everything interpolated is escaped.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function holdingPage(opts: { title: string; heading: string; body: string; refreshSeconds?: number }): Response {
  const refreshTag = opts.refreshSeconds ? `<meta http-equiv="refresh" content="${opts.refreshSeconds}">` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${refreshTag}
<title>${escapeHtml(opts.title)}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0B0E13; color:#E8E6E1; font-family:Georgia,'Times New Roman',serif; }
  .card { max-width:560px; padding:48px 40px; text-align:center; }
  .rule { width:48px; height:1px; background:#C9A84C; margin:0 auto 24px; }
  h1 { font-size:22px; font-weight:600; letter-spacing:.02em; margin:0 0 16px; color:#C9A84C; }
  p { font-size:14px; line-height:1.7; margin:0 0 24px; color:rgba(232,230,225,.75); }
  a { color:#C9A84C; font-size:12px; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; border-bottom:1px solid rgba(201,168,76,.4); padding-bottom:2px; }
</style>
</head>
<body>
  <div class="card">
    <div class="rule"></div>
    <h1>${escapeHtml(opts.heading)}</h1>
    <p>${opts.body}</p>
    <a href="/home">Back to dashboard</a>
  </div>
</body>
</html>`;
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
  // immediately with status='processing'; render a minimal auto-refreshing
  // holding page until the worker lands a terminal status, and a clear error
  // page for status='failed'. Complete rows fall through to the full
  // template rendering below, byte-for-byte unchanged.
  const auditStatus = String(audit.status ?? "");
  const auditLabel = String(audit.solicitation_number || audit.title || audit.notice_id || "this solicitation");
  if (auditStatus === "processing") {
    return holdingPage({
      title: "Audit in progress — FARaudit",
      heading: "Audit in progress",
      body: `FARaudit is running the three-call intelligence pipeline on ${escapeHtml(auditLabel)}. This page refreshes automatically — the full report will appear here when it completes.`,
      refreshSeconds: 5
    });
  }
  if (auditStatus === "failed") {
    const reason = String(audit.error_message || "unknown error");
    return holdingPage({
      title: "Audit failed — FARaudit",
      heading: "Audit failed",
      body: `This audit of ${escapeHtml(auditLabel)} did not complete: ${escapeHtml(reason)}. Try re-running it from the dashboard — if SAM.gov's attachment couldn't be retrieved, uploading the solicitation PDF directly usually succeeds.`
    });
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
  const html = renderAuditReportComplete(template, vm, audit as Record<string, unknown>);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
