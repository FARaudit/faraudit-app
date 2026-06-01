/* GET /pricing — serves the static Claude Design pricing HTML
   (public/pricing.html).

   Mirror of /command-center/route.ts but WITHOUT auth gate — this is
   a pre-sign marketing page. Middleware already allows /pricing in
   PUBLIC, so unauth'd visitors reach here directly.

   Why a Route Handler instead of page.tsx:
   The Claude Design file is a complete standalone document with its
   own <html data-theme=…> tag — a page.tsx would wrap it in the root
   layout's <html><body>, breaking the design. Route handlers return
   raw HTTP responses, no layout wrapping.

   See page.tsx.bak-pre-route-handler-* for the previous React version.
*/

import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "pricing.html");
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600"
    }
  });
}
