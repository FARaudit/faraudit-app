/* GET /capability-statement — serves the static Capability Statement HTML
   (public/capability-statement-design.html) behind the Supabase auth gate.

   Mirror of /command-center/route.ts, /dashboard/route.ts, /pipeline/route.ts.
   Mock-data only; live data injection comes after pixel-perfect approval.   */

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
  if (!user) redirect("/sign-in?next=/capability-statement");

  const filePath = path.join(
    process.cwd(),
    "public",
    "capability-statement-design.html"
  );
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "clear-site-data": '"cache"'
    }
  });
}
