import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ notice_id: string }> }
) {
  const { notice_id } = await ctx.params;
  if (!notice_id) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { in_pipeline?: boolean; watched?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  if (typeof body.in_pipeline === "boolean") updates.in_pipeline = body.in_pipeline;
  if (typeof body.watched === "boolean")     updates.watched     = body.watched;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no valid fields (in_pipeline | watched)" }, { status: 400 });
  }

  // FA-116: pipeline/watch flags belong to cron-ingested opportunity rows —
  // never touch user-enqueued audit rows sharing the same notice_id.
  const { error } = await supabase
    .from("pending_audits")
    .update(updates)
    .eq("notice_id", notice_id)
    .neq("source", "user");

  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ ok: true });
}
