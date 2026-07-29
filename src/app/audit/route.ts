/* GET /audit — serves the static Claude Design Run Audit HTML
   (public/run-audit.html) behind the existing Supabase auth gate.

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
import { injectRail } from "@/lib/nav/rail";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    // Preserve the query string in `next`. The Opportunities "Run Audit" button
    // deep-links to /audit?noticeId=<ref>; a bare next=/audit dropped it, so a
    // signed-out user landed on an empty form after signing in.
    const search = new URL(req.url).search;
    redirect(`/sign-in?next=${encodeURIComponent(`/audit${search}`)}`);
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "run-audit.html"
  );
  let html = await readFile(filePath, "utf8");

  html = injectRail(html, "run-audit");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",

    }
  });
}
