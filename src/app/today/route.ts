/* GET /today — serves public/today.html behind Supabase auth.
   Canonical HANDOFF route name for the Command Center "Today" desk.
   /command-center remains as an alias serving the same file so the
   in-document sidebar nav (which still links to /command-center) keeps
   working without editing the verbatim-ported HTML. */

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
  if (!user) redirect("/sign-in?next=/today");

  const filePath = path.join(process.cwd(), "public", "today.html");
  let html = await readFile(filePath, "utf8");

  html = injectRail(html, "today");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
