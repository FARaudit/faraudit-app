// POST   /api/watch  — start watching a notice by notice_id (no audit required).
// DELETE /api/watch  — stop watching by notice_id.
// GET    /api/watch?noticeIds=a,b,c — bulk lookup of current user's watch
//                     state across many notice ids (used by the Opportunities
//                     surface to render Track/Tracking on each row).
//
// Companion to /api/audit/[id]/watch. The audit-keyed endpoint is convenient
// when you're inside an audit; this one is keyed off the SAM notice_id and
// can be called from any surface that knows the notice — Opportunities rows,
// search results, the Defense News feed, etc.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PostBody {
  noticeId?: string;
  solicitationNumber?: string | null;
  title?: string | null;
  agency?: string | null;
  noticeType?: string | null;
  responseDeadline?: string | null;
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: Request) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: PostBody = {};
  try { body = (await req.json()) as PostBody; } catch { return badRequest("invalid JSON body"); }
  const noticeId = String(body.noticeId ?? "").trim();
  if (!noticeId) return badRequest("noticeId required");

  const row = {
    user_id: user.id,
    audit_id: null,
    notice_id: noticeId,
    solicitation_number: body.solicitationNumber ?? null,
    title: body.title ?? null,
    agency: body.agency ?? null,
    notice_type: body.noticeType ?? null,
    response_deadline: body.responseDeadline ?? null,
    status: "watching",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from("watched_notices")
    .upsert(row, { onConflict: "user_id,notice_id" })
    .select("id, status")
    .single();
  if (error) {
    return NextResponse.json({ error: `watch save failed: ${error.message}` }, { status: 503 });
  }
  return NextResponse.json({ ok: true, watching: true, watchId: data?.id ?? null, status: data?.status ?? "watching" });
}

export async function DELETE(req: Request) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  let noticeId = url.searchParams.get("noticeId") || "";
  if (!noticeId) {
    try {
      const body = (await req.json()) as { noticeId?: string };
      noticeId = String(body.noticeId ?? "").trim();
    } catch { /* body optional */ }
  }
  noticeId = String(noticeId).trim();
  if (!noticeId) return badRequest("noticeId required");

  const { error } = await sb
    .from("watched_notices")
    .delete()
    .eq("user_id", user.id)
    .eq("notice_id", noticeId);
  if (error) return NextResponse.json({ error: `unwatch failed: ${error.message}` }, { status: 503 });
  return NextResponse.json({ ok: true, watching: false });
}

export async function GET(req: Request) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("noticeIds") || "";
  const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 250);
  if (ids.length === 0) return NextResponse.json({ watching: {} });

  const { data, error } = await sb
    .from("watched_notices")
    .select("notice_id, status")
    .eq("user_id", user.id)
    .in("notice_id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });

  const watching: Record<string, string> = {};
  for (const row of data ?? []) watching[row.notice_id as string] = row.status as string;
  return NextResponse.json({ watching });
}
