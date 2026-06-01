/* GET /opportunities — serves the static Opportunities HTML
   (public/opportunities-design.html) behind the Supabase auth gate.

   Mirror of /command-center/route.ts and the other static-HTML routes.
   This is a TEMPLATE-only route with mock data for design review;
   the live upstream-intel view still renders at /upstream-intel via
   the existing React page (untouched).                                 */

import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/opportunities");

  const filePath = path.join(
    process.cwd(),
    "public",
    "opportunities-design.html"
  );
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=30, stale-while-revalidate=10"
}
  });
}
