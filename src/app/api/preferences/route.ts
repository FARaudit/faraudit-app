import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 10;

const ALLOWED = new Set(["sidebar_pinned", "display_name", "timezone", "alerts_enabled"]);

export async function GET() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await sb
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data ?? null });
}

export async function PATCH(req: NextRequest) {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = checkRateLimit(`prefs:${user.id}`, { max: 30, windowMs: 60_000 });
  if (!rate.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) update[k] = v;
  }
  if (Object.keys(update).length <= 2) {
    return NextResponse.json({ error: "no allowed fields" }, { status: 400 });
  }
  const { data, error } = await sb
    .from("user_preferences")
    .upsert(update, { onConflict: "user_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data });
}
