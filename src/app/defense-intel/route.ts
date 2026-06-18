// GET /defense-intel — Phase 5 item 2 canonical entry for the consolidated
// Defense Intel destination. Redirects to the News default; the News/Spending
// tab strip (injected on both pages) handles switching, and the rail marks
// "Defense Intel" active on both. Auth-gated like the other app routes.
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/defense-intel");
  redirect("/defense-news");
}
