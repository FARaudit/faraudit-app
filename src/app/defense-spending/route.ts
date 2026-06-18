/* GET /defense-spending — serves the static Defense Spending HTML
   (public/defense-spending-design.html) behind the Supabase auth gate.

   Mirror of /opportunities/route.ts and the other static-HTML routes.
   Template-only with mock data for design review.                       */

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
  if (!user) redirect("/sign-in?next=/defense-spending");

  const filePath = path.join(
    process.cwd(),
    "public",
    "defense-spending.html"
  );
  let html = await readFile(filePath, "utf8");

  html = injectRail(html, "defense-intel");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
}
  });
}
