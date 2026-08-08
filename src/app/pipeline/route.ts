/* GET /pipeline — serves public/pipeline.html behind the existing Supabase
   auth gate, with the nav rail injected by injectRail().

   Mirror of /command-center/route.ts and /dashboard/route.ts — the page is a
   complete standalone document with its own <html data-theme=…> so it has to
   be served as a raw HTTP response, which only a Route Handler can do.

   This route composes only: auth → read file → inject rail → respond. It
   holds no pipeline data of its own. The page's data wiring lives in the
   page: public/pipeline-live.js fetches /api/pipeline client-side.   */

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
  if (!user) redirect("/sign-in?next=/pipeline");

  const filePath = path.join(
    process.cwd(),
    "public",
    "pipeline.html"
  );
  let html = await readFile(filePath, "utf8");

  html = injectRail(html, "pipeline");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Transitional cache flush — see next.config.ts.
}
  });
}
