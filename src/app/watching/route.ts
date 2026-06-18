/* GET /watching — serves public/watching.html behind Supabase auth.
   Page-side JS fetches /api/watched-notices to populate KPIs + cards. */

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
  if (!user) redirect("/sign-in?next=/watching");

  const filePath = path.join(process.cwd(), "public", "watching.html");
  let html = await readFile(filePath, "utf8");

  html = injectRail(html, "opportunities");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
