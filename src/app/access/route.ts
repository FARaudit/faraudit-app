/* GET /access — serves the static access-request HTML
   (public/access.html).

   Mirror of /pricing/route.ts and /how-it-works/route.ts — a pre-sign
   marketing page with NO auth gate. Middleware already allows /access
   in PUBLIC, so unauth'd visitors reach here directly.

   Without this handler /access 404s (only /access.html resolved), while
   every "Request access" CTA and nav link across the six pre-sign pages
   targets /access — so the primary conversion path was dead.

   Why a Route Handler instead of page.tsx:
   The access file is a complete standalone document with its own <html>
   tag — a page.tsx would wrap it in the root layout's <html><body>,
   breaking the design. Route handlers return raw HTTP responses, no
   layout wrapping.
*/

import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "access.html");
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600"
    }
  });
}
