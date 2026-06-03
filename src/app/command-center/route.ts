/* GET /command-center — serves the static Claude Design Command Center
   HTML (public/command-center-design.html) behind the existing Supabase
   auth gate.

   Why a Route Handler instead of page.tsx:
   Next.js App Router's page.tsx must return ReactNode and gets wrapped
   in the root layout's <html><body>. The Claude Design file is a
   complete standalone document with its own <html data-theme=…> etc.,
   so it has to be served as a raw HTTP response — which only a Route
   Handler can do. The auth-gate semantics that lived in page.tsx are
   preserved verbatim below. (See page.tsx.bak-pre-static-* for the
   previous render-CommandCenterClient version.)                       */

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
  if (!user) redirect("/sign-in?next=/command-center");

  const filePath = path.join(
    process.cwd(),
    "public",
    "today.html"
  );
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=30, stale-while-revalidate=10"
}
  });
}
