import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { supabase as adminClient } from "@/lib/supabase";

// Returns the 5 most-relevant active intel_briefs for the current user.
// Auth-walled. Falls back to empty array on any failure — never crashes the dashboard.
export async function GET() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // intel_briefs has RLS enabled with no SELECT policy — must use service role.
  // adminClient prefers SUPABASE_SERVICE_ROLE_KEY, falls back to anon (which gets denied
  // by RLS, returning [] cleanly). Either path keeps the dashboard rendering.
  if (!adminClient) {
    return NextResponse.json({ briefs: [] });
  }

  const { data, error } = await adminClient
    .from("intel_briefs")
    .select("id, brief_type, priority, title, body, source, source_url, created_at")
    .eq("company", "faraudit")
    .eq("status", "active")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    // Soft-fail — log for debugging, return empty so the UI shows the empty state.
    console.warn("[intel-briefs] read error:", error.message);
    return NextResponse.json({ briefs: [] });
  }

  return NextResponse.json({ briefs: data || [] });
}
