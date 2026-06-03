/* GET /dashboard — serves the static Past Audits HTML
   (public/dashboard-design.html) behind the existing Supabase auth gate.

   Mirror of /command-center/route.ts and /audit/route.ts — the design
   is a complete standalone document with its own <html data-theme=…>
   so it has to be served as a raw HTTP response, which only a Route
   Handler can do. The auth-gate semantics that lived in the previous
   page.tsx are preserved verbatim below.
   (See page.tsx.bak-pre-static-* for the React Supabase-driven version.)

   The static page is currently mock-data only. Live data injection will
   come AFTER pixel-perfect approval, same staged approach as the CC.   */

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
  if (!user) redirect("/sign-in?next=/dashboard");

  const filePath = path.join(
    process.cwd(),
    "public",
    "past-audits.html"
  );
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=30, stale-while-revalidate=10",
      // Transitional cache flush — see next.config.ts.
}
  });
}
