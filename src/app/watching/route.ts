// GET /watching — Phase 5 item 3 redirect.
// Design's ruling folded the standalone "Watching" page into the /home SPA's
// Opportunities tab. It pointed at a "Saved" view until 2026-08-03, when Saved ☆
// was retired: the feed went live-source on 2026-07-29 and live rows carry no
// pending_audits backing, so nothing visible could ever be saved and the view
// could only render empty. This now lands on the plain Opportunities feed, where
// Pipeline is the single "I'm tracking this" affordance. Auth-gated like the other
// app routes (matches the /defense-intel redirect pattern, Phase 5 2a).
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/home%23opportunities");
  redirect("/home#opportunities");
}
