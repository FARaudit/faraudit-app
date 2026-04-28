// Server component — renders Navigation only when a user is authed.
// Reads sidebar_pinned from user_preferences (fa_user_preferences fallback).

import { createServerClient } from "@/lib/supabase-server";
import Navigation from "@/components/Navigation";

export default async function AuthShell() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) return null;

  let pinned = true;
  try {
    const { data } = await sb
      .from("user_preferences")
      .select("sidebar_pinned")
      .eq("user_id", user.id)
      .maybeSingle();
    if (typeof data?.sidebar_pinned === "boolean") pinned = data.sidebar_pinned;
  } catch {
    // table may not exist yet — default pinned true
  }

  return <Navigation initialPinned={pinned} />;
}
