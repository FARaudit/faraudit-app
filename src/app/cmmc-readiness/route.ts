/* GET /cmmc-readiness — serves public/cmmc-readiness.html behind Supabase auth.
   Canonical HANDOFF route name. /cmmc remains as an alias. */

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
  if (!user) redirect("/sign-in?next=/cmmc-readiness");

  const filePath = path.join(process.cwd(), "public", "cmmc-readiness.html");
  let html = await readFile(filePath, "utf8");

  html = injectRail(html, "cmmc");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
