/* GET /who-to-call — the weekly call list, behind the Supabase auth gate.
 *
 * Primes who owe a subcontracting plan · room left on contracts already awarded ·
 * Recompete Radar. All three answer one question — where is there an opening on a
 * contract that ALREADY EXISTS — and none of that money reaches SAM.gov as a
 * solicitation. They used to sit at the bottom of Defense Spending, which is a
 * twice-a-year orientation read; a weekly list loses to a long scroll.
 *
 * The page renders from the SAME payload and the SAME renderers as
 * /defense-spending: public/dsb-app.js mounts whichever panels the page carries
 * hosts for, and the fiscal year and NAICS scope come from window.BD_SCOPE, which
 * is carried in the URL and in localStorage rather than in either page's closure.
 * One renderer set, one scope, two destinations.
 */
import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";
import { injectRail } from "@/lib/nav/rail";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/who-to-call");

  const filePath = path.join(process.cwd(), "public", "who-to-call.html");
  let html = await readFile(filePath, "utf8");

  // No injectDefenseTabs here: the News|Spending strip belongs to Defense Intel,
  // and this page is its own destination rather than a third tab on that pair.
  html = injectRail(html, "who-to-call");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
