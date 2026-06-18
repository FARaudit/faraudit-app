// GET /watching — Phase 5 item 3 redirect.
// Design's ruling folded the standalone "Watching" page into the /home SPA's
// Opportunities tab as a "Saved" view (backed by the same watched concept).
// This route now redirects to that Saved view instead of serving the legacy
// public/watching.html shell. Auth-gated like the other app routes; the hash
// "#opportunities=saved" is read by HomeClient to open Opportunities pre-
// filtered to Saved (matches the /defense-intel redirect pattern, Phase 5 2a).
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/home%23opportunities=saved");
  redirect("/home#opportunities=saved");
}
