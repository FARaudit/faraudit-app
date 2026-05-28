/* GET /pipeline — serves the static Pipeline HTML
   (public/pipeline-design.html) behind the existing Supabase auth gate.

   Mirror of /command-center/route.ts and /dashboard/route.ts — the design
   is a complete standalone document with its own <html data-theme=…>
   so it has to be served as a raw HTTP response, which only a Route
   Handler can do.

   The static page is currently mock-data only. Live data injection will
   come AFTER pixel-perfect approval, same staged approach as CC.   */

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
  if (!user) redirect("/sign-in?next=/pipeline");

  const filePath = path.join(
    process.cwd(),
    "public",
    "pipeline-design.html"
  );
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Transitional cache flush — see next.config.ts.
      "clear-site-data": '"cache"'
    }
  });
}
