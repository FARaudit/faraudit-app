// POST   /api/audit/[id]/watch  — start tracking the notice this audit refers to.
// DELETE /api/audit/[id]/watch  — stop tracking.
// GET    /api/audit/[id]/watch  — current watch state for this user+notice.
//
// Wired from the audit-report [data-track] CTA (".mhv-cta.is-tracking" toggle
// in _template.html). The DB key is (user_id, notice_id) — surviving audit
// re-runs, deletes, and replacements (status='audited' rows back-fill
// audit_id when the sam-ingest cron auto-audits, but the watch row's identity
// is the notice, not the audit).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HERO_AUDIT_ID = "7e389f1a-0fc4-4ba2-8299-c86d23adb62a";

async function loadAudit(id: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const, status: 401 };

  let audit: Record<string, unknown> | null = null;
  {
    const { data } = await supabase.from("audits").select("*").eq("id", id).single();
    audit = data as Record<string, unknown> | null;
  }
  if (!audit && id.toLowerCase() === HERO_AUDIT_ID) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data } = await adminClient.from("audits").select("*").eq("id", HERO_AUDIT_ID).single();
      audit = data as Record<string, unknown> | null;
    }
  }
  if (!audit) return { error: "audit not found" as const, status: 404 };
  return { supabase, user, audit };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required (UUID)" }, { status: 400 });
  }

  const loaded = await loadAudit(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { supabase, user, audit } = loaded;

  const noticeId = String(audit.notice_id ?? "");
  if (!noticeId) {
    return NextResponse.json({ error: "audit has no notice_id" }, { status: 422 });
  }

  const compJson = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const noticeType = (compJson.notice_type as string | null) ?? null;

  const row = {
    user_id: user.id,
    audit_id: audit.id as string,
    notice_id: noticeId,
    solicitation_number: (audit.solicitation_number as string | null) ?? null,
    title: (audit.title as string | null) ?? null,
    agency: (audit.agency as string | null) ?? null,
    notice_type: noticeType,
    response_deadline: (audit.response_deadline as string | null) ?? null,
    status: "watching",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("watched_notices")
    .upsert(row, { onConflict: "user_id,notice_id" })
    .select("id, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: `watch save failed: ${error.message}` }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    watching: true,
    watchId: data?.id ?? null,
    status: data?.status ?? "watching"
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required (UUID)" }, { status: 400 });
  }

  const loaded = await loadAudit(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { supabase, user, audit } = loaded;

  const noticeId = String(audit.notice_id ?? "");
  if (!noticeId) {
    return NextResponse.json({ error: "audit has no notice_id" }, { status: 422 });
  }

  const { error } = await supabase
    .from("watched_notices")
    .delete()
    .eq("user_id", user.id)
    .eq("notice_id", noticeId);

  if (error) {
    return NextResponse.json({ error: `unwatch failed: ${error.message}` }, { status: 503 });
  }

  return NextResponse.json({ ok: true, watching: false });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required (UUID)" }, { status: 400 });
  }

  const loaded = await loadAudit(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { supabase, user, audit } = loaded;

  const noticeId = String(audit.notice_id ?? "");
  if (!noticeId) return NextResponse.json({ watching: false });

  const { data } = await supabase
    .from("watched_notices")
    .select("id, status, posted_at, audited_at")
    .eq("user_id", user.id)
    .eq("notice_id", noticeId)
    .maybeSingle();

  return NextResponse.json({
    watching: !!data,
    status: data?.status ?? null,
    postedAt: data?.posted_at ?? null,
    auditedAt: data?.audited_at ?? null
  });
}
