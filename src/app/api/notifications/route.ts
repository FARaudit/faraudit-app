// GET /api/notifications — current user's recent notifications + unread count.
//
// Drives the topbar bell .nbadge (count) + future dropdown content. RLS on
// public.notifications keeps the user owner-scoped; service-role producers
// (watcher-tick, future agents) write through the service policy.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(req: Request) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") || DEFAULT_LIMIT)), MAX_LIMIT);
  const unreadOnly = url.searchParams.get("unread") === "1";

  let q = sb
    .from("notifications")
    .select("id, kind, title, body, link, meta, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is("read_at", null);

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });

  // Count unread (separate cheap query so the list limit doesn't undercount).
  const { count } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    unreadCount: count ?? 0,
    notifications: rows ?? []
  });
}
