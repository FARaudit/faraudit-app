/* GET /learn — serves the static Design learn redesign HTML
   (public/learn.html).

   Mirror of /pricing/route.ts and /how-it-works/route.ts — a pre-sign
   marketing page with NO auth gate. Middleware already allows /learn in
   PUBLIC, so unauth'd visitors reach here directly.

   Why a Route Handler instead of page.tsx:
   The Design file (Design card 364) is a complete standalone document with
   its own <html> tag + inline <style>/<script> (the interactive arc stepper,
   lesson cards, and the Reference/Flashcards glossary game with localStorage).
   A page.tsx would wrap it in the root layout's <html><body>, breaking the
   design, and would require re-implementing the vanilla JS in React (divergence
   risk). Route handlers return the raw document verbatim — a faithful 1:1 port.

   See page.tsx.bak-pre-route-handler-20260709 for the previous React version.
*/

import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "learn.html");
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600"
    }
  });
}
