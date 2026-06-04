// GET /api/audit/[id]/pdf — exports the audit-report page as a PDF.
//
// 1:1 with the web report by design: this route renders the exact same HTML
// /audit/[id]/route.ts serves (buildViewModel + renderAuditReport), then
// prints it to PDF via headless Chromium. The @media print stylesheet in
// _template.html hides chrome (sidebar / topbar / rail / drawer / demo
// toggle), expands risk bodies, drops shadows, and forces white backgrounds.
// One source of truth — no parallel PDF layout to maintain.
//
// Retires the prior @react-pdf/renderer 4-section generator
// (Classification / Overview / Compliance list / Risks) which omitted the
// verdict, headline-risk band, recommendation, and KO email.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { buildViewModel } from "../../../../audit/[id]/_view-model";
import { renderAuditReport } from "../../../../audit/[id]/_render";
import { displaySolicitationId } from "@/lib/audit-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Chromium cold-start + the print-to-PDF pipeline together comfortably fit
// in 30s on warm functions; 60s gives us headroom on cold starts.
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

  // Build the same view model + render the same HTML the web route serves.
  const vm = buildViewModel(audit);
  const templatePath = path.join(
    process.cwd(),
    "src",
    "app",
    "audit",
    "[id]",
    "_template.html"
  );
  const template = await readFile(templatePath, "utf8");
  const html = renderAuditReport(template, vm);

  // Headless Chromium → PDF. printBackground:true preserves the verdict
  // gradient + the moment-band amber; preferCSSPageSize lets the template's
  // @page rule (13mm margin) win.
  // @sparticuz/chromium ships the Linux x86_64/arm64 binary Vercel needs.
  // On macOS/Windows dev machines `executablePath()` returns an unsupported
  // path — set CHROME_EXECUTABLE locally (e.g. /Applications/Google Chrome
  // .app/Contents/MacOS/Google Chrome) to test the route in dev.
  const localChromeOverride = process.env.CHROME_EXECUTABLE;
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: localChromeOverride || (await chromium.executablePath()),
    headless: true
  });

  let pdf: Uint8Array;
  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    // "load" suffices for setContent — the template is self-contained
    // (inline CSS + inline SVG, only Google Fonts as remote). Network-idle
    // semantics aren't supported by setContent in the new puppeteer-core.
    await page.setContent(html, { waitUntil: "load" });
    pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: "Letter",
      // Margins overridden by the template's @page { margin: 13mm } when
      // preferCSSPageSize honors it, but spell them out as a fallback so
      // any browser/runtime that ignores @page still produces sane edges.
      margin: { top: "13mm", right: "13mm", bottom: "13mm", left: "13mm" }
    });
  } finally {
    await browser.close();
  }

  // Filename keeps the prior pattern: FARaudit-<sol#>-<YYYY-MM-DD>.pdf
  const displayId =
    displaySolicitationId({
      solicitation_number: audit.solicitation_number as string | null | undefined,
      notice_id: audit.notice_id as string | null | undefined,
      title: audit.title as string | null | undefined
    }).replace(/[^A-Za-z0-9_-]+/g, "_") || "audit";
  const generatedAt = new Date().toISOString().slice(0, 10);
  const filename = `FARaudit-${displayId}-${generatedAt}.pdf`;

  // Hand back a fresh ArrayBuffer so the Response body type stays clean
  // across Node.js Buffer + Uint8Array<ArrayBufferLike> generic shifts in
  // newer TS lib (same pattern the prior route used).
  const ab = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(ab).set(pdf);

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
