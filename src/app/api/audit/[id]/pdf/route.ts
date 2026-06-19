// GET /api/audit/[id]/pdf — exports the audit-report page as a PDF.
//
// Now a proxy: the Vercel lambda renders the SAME HTML the web page serves
// (buildViewModel + renderAuditReport), then POSTs that HTML to the Railway
// pdf-service which does headless-Chromium → PDF and streams bytes back.
// We stream those bytes to the browser with the user-facing filename headers.
//
// Why split: Vercel's bundler-plus-file-tracer can't reliably ship
// @sparticuz/chromium's brotli-compressed binary onto the lambda. Both the
// serverExternalPackages opt-out + --webpack build flag failed at runtime
// (commit 9985988 / 67b56e7 era). Railway's persistent container filesystem
// keeps the binary intact, and the proxy is a 200-line round-trip.
//
// Env required:
//   RAILWAY_PDF_URL    — base URL of the pdf-service (e.g. https://pdf-…railway.app)
//   RAILWAY_PDF_SECRET — Bearer secret shared with the service

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";
import { buildViewModel } from "../../../../audit/[id]/_view-model";
import { renderAuditReportComplete } from "../../../../audit/[id]/_render";
import { displaySolicitationId, shouldGateExport } from "@/lib/audit-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Round-trip = Vercel render (~200ms) + Railway chromium PDF (~5-25s warm)
// + stream-back. 60s keeps the Vercel side aligned with the Railway hard cap.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirror the page route's hero fallback: the curated demo audit is
// user_id=null and RLS-blocked on normal authed reads. Allow service-role
// access for this exact ID only — fuzzed UUIDs stay user-scoped.
const HERO_AUDIT_ID = "7e389f1a-0fc4-4ba2-8299-c86d23adb62a";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const pdfUrl = process.env.RAILWAY_PDF_URL;
  const pdfSecret = process.env.RAILWAY_PDF_SECRET;
  if (!pdfUrl || !pdfSecret) {
    return NextResponse.json(
      { error: "PDF service not configured — RAILWAY_PDF_URL and RAILWAY_PDF_SECRET required" },
      { status: 503 }
    );
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Load the audit row. UUID path → direct lookup; otherwise treat the id as
  // a solicitation_number slug (case-insensitive, most-recent first), matching
  // the page route's accepted forms.
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

  // Hero fallback (mirrors /audit/[id]).
  if (!audit && id.toLowerCase() === HERO_AUDIT_ID) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data } = await adminClient.from("audits").select("*").eq("id", HERO_AUDIT_ID).single();
      audit = data as Record<string, unknown> | null;
    }
  }
  if (!audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  // FA-E2E re-verify Fix D + FIX 5 (2026-06-18): refuse to export unless the
  // report is genuinely COMPLETE — a half-complete PDF (no agency / work
  // statement / capture play) must never be pulled, whether the V2 layer is
  // still finalizing, errored/timed-out, or silently stalled. The web route
  // disables the Export action for the same states; this 409 is the server-side
  // guard for a direct hit.
  if (shouldGateExport(audit)) {
    return NextResponse.json({ error: "report not complete" }, { status: 409 });
  }

  // FA-108: capability_statement presence — same signal the page route uses
  // so the PDF Fit Score lock-state matches the on-screen render. Default true
  // (unlocked); flipped to false only on explicit "no row" result.
  let hasCapabilityStatement = true;
  const { data: capRow, error: capErr } = await supabase
    .from("capability_statements")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!capErr) hasCapabilityStatement = !!capRow;

  // Build the same view model + render the same HTML the web route serves.
  const vm = buildViewModel(audit, { hasCapabilityStatement });
  const templatePath = path.join(
    process.cwd(),
    "src",
    "app",
    "audit",
    "[id]",
    "_template.html"
  );
  const template = await readFile(templatePath, "utf8");
  const html = renderAuditReportComplete(template, vm, audit as Record<string, unknown>);

  // Trailing-blank-page guard (Jun 11 renders, USAF pg 12): .frame carries
  // min-height:100vh which survives into print — Chromium pads the document
  // to viewport height and can emit an empty final page. Patched here, not in
  // _template.html, so the template stays 1:1 with the canonical design file.
  const pdfHtml = html.replace(
    "</head>",
    '<style>@media print{.frame{min-height:0!important}.rpt-main>:last-child{margin-bottom:0!important}}</style></head>'
  );

  // POST to Railway pdf-service. The service Bearer-checks RAILWAY_PDF_SECRET
  // and returns PDF bytes with Content-Type: application/pdf.
  const endpoint = pdfUrl.replace(/\/+$/, "") + "/pdf";
  let pdfRes: Response;
  try {
    pdfRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pdfSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        auditId: audit.id,
        html: pdfHtml,
        // Paged-PDF spec (Jun 7 2026) — Chromium can't read the masthead
        // sol# from the DOM for displayHeaderFooter, so the service needs
        // it explicitly to interpolate into headerTemplate.
        solicitationNumber:
          (audit.solicitation_number as string | null) ??
          (audit.notice_id as string | null) ??
          ""
      })
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `pdf-service unreachable: ${msg.slice(0, 200)}` }, { status: 502 });
  }
  if (!pdfRes.ok) {
    const detail = await pdfRes.text().catch(() => "");
    return NextResponse.json(
      { error: `pdf-service ${pdfRes.status}`, detail: detail.slice(0, 400) },
      { status: 502 }
    );
  }

  const pdfBytes = await pdfRes.arrayBuffer();

  // FA-138: filename carries an audit-id suffix so same-day re-audits of the
  // same solicitation can't collide in the browser's Downloads folder.
  const displayId =
    displaySolicitationId({
      solicitation_number: audit.solicitation_number as string | null | undefined,
      notice_id: audit.notice_id as string | null | undefined,
      title: audit.title as string | null | undefined
    }).replace(/[^A-Za-z0-9_-]+/g, "_") || "audit";
  const generatedAt = new Date().toISOString().slice(0, 10);
  const filename = `FARaudit-${displayId}-${generatedAt}-${String(audit.id).slice(0, 8)}.pdf`;

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
