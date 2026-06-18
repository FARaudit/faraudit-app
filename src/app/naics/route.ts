/* GET /naics — serves the static NAICS code reference (public/naics.html)
   behind the Supabase auth gate. Mirror of /audit/route.ts. Design batch
   Phase 2 (NAICS search-to-card). */
import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";
import { injectRail } from "@/lib/nav/rail";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/naics");

  let html = await readFile(path.join(process.cwd(), "public", "naics.html"), "utf8");

  html = injectRail(html, "naics");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
