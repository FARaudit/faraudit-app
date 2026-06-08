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

  const vm = buildViewModel(audit, { isWatching });

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
