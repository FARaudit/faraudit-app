import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface Body {
  notes?: string;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const notes = typeof body.notes === "string" ? body.notes : "";
  if (notes.length > 50_000) {
    return NextResponse.json({ error: "notes too long (50k limit)" }, { status: 413 });
  }

  // Try to write notes + notes_updated_at. If columns don't exist (migration not
  // applied yet), the update errors — return a graceful 503 so the client can
  // surface a friendly message instead of throwing.
  const { error } = await supabase
    .from("audits")
    .update({ notes, notes_updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: `notes save failed: ${error.message} — run migration 002_audits_lockin.sql` },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
