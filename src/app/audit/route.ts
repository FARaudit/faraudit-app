/* GET /audit — serves the static Claude Design Run Audit HTML
   (public/run-audit-v2.html) behind the existing Supabase auth gate.

   Mirror of /command-center/route.ts (see that file for the rationale on
   why this is a Route Handler instead of page.tsx — App Router can't
   return a standalone HTML document from a page.tsx because it always
   wraps in the root layout's <html><body>).

   The auth-gate semantics that lived in page.tsx are preserved verbatim.
   (See page.tsx.bak-pre-static-* for the previous React-form version.)

   /audit/[id] remains a React page (audit-report view) — untouched.   */

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
  if (!user) redirect("/sign-in?next=/audit");

  const filePath = path.join(
    process.cwd(),
    "public",
    "run-audit-v2.html"
  );
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // CEO 2026-05-25 transitional cache flush — see next.config.ts for
      // the full explanation. Belt-and-suspenders here in case any browser
      // somehow does reach this handler before the cached 308 fires.
      "clear-site-data": '"cache"'
    }
  });
}
