import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 10;

// `alerts_email_enabled` / `alerts_in_app_enabled` are accepted here ONLY because watcher-tick
// now reads them before it sends. A preference the API stores and nothing consults is the #514
// defect wearing a different hat — the switch is the last thing built, never the first.
const ALLOWED = new Set(["sidebar_pinned", "display_name", "timezone", "alerts_enabled", "theme", "weekly_digest_watched", "alerts_email_enabled", "alerts_in_app_enabled", "auto_signout_minutes", "rail_sections_collapsed"]);
const VALID_THEMES = new Set(["dark", "auto"]);
// Idle auto sign-out. null (or 0) is OFF and is the default; anything else must be one
// of the durations the settings control actually offers, so a hand-crafted PATCH cannot
// store a value no UI can show and no customer can undo from the page.
const VALID_SIGNOUT_MINUTES = new Set([15, 30, 60, 120, 240]);

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
    if (!ALLOWED.has(k)) continue;
    if (k === "theme" && (typeof v !== "string" || !VALID_THEMES.has(v))) continue;
    if (k === "auto_signout_minutes") {
      if (v === null || v === 0) { update[k] = null; continue; }
      if (typeof v !== "number" || !VALID_SIGNOUT_MINUTES.has(v)) continue;
    }
    update[k] = v;
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
