// GET /watching — legacy redirect.
// The Opportunities tab (and its "Saved" view, which this route used to deep-
// link) was retired with the pending_audits-backed SAM feed (2026-07-29).
// Watcher emails still link here, so keep the route alive and land on /home.
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/home");
  redirect("/home");
}
