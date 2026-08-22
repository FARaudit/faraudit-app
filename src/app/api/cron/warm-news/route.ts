import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { GET as readNews } from "../../defense-news/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/* WARM THE NEWS DESKS BEFORE THE WORKDAY.
 *
 * THE PROBLEM THIS SOLVES IS LATENCY, NOT STALENESS. Defense news caches its judged insights
 * per article per desk, so a repeat read is free and only genuinely new stories cost anything.
 * But nothing paid for the FIRST read of the day, so whoever signed in first waited out 11 RSS
 * feeds, the image fetches and the model chunks — and a page that takes minutes to arrive reads
 * as old news, which is the opposite of what it is.
 *
 * ⛔ WHY NOT REFRESH ON SIGN-IN. `auto_signout_minutes` is a live preference, so one working day
 * can hold many sign-ins. Hanging the only endpoint that spends off that trigger makes the bill a
 * function of how often someone steps away from their desk. A cron fires a known number of times.
 *
 * WHAT IT COSTS, AND WHY IT IS NOT NEW MONEY. The judge is ~$0.023 per 20-story chunk; a cold
 * desk is 3-4 chunks, so ~$0.07-0.09 per warm. That is the SAME work a customer's first read
 * would have done — it is moved off their click, not added. It does not multiply per customer
 * either: the insight cache is keyed by the NAICS SET, so every customer sharing a profile
 * shares one warm.
 *
 * ⛔ THE DESK LIST IS READ, NEVER TYPED. Warming a hardcoded code set would silently stop
 * covering a customer the day someone edits their capability statement, and the failure would
 * look like slowness rather than a bug.
 */

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "no service-role key" }, { status: 503 });
  }

  const { data, error } = await admin.from("capability_statements").select("naics_codes");
  if (error) {
    // A failed read is not "no desks" — say so rather than reporting a clean zero-warm run.
    return NextResponse.json({ error: `could not read desks: ${error.message}` }, { status: 502 });
  }

  /* One warm per DISTINCT code set. Two customers on the same profile share a cache entry, so
     warming per customer would pay for the same judgement twice. */
  const seen = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ naics_codes: unknown }>) {
    const codes = (Array.isArray(row.naics_codes) ? row.naics_codes : [])
      .map((c) => String(c).trim())
      .filter((c) => /^\d{6}$/.test(c))
      .sort();
    if (!codes.length) continue;
    seen.set(codes.join(","), codes);
  }

  const origin = new URL(req.url).origin;
  const results: Array<{ desk: string; ok: boolean; status: number; spend: number | null; items: number | null; error?: string }> = [];
  let totalSpend = 0;

  /* SEQUENTIAL, DELIBERATELY. Warming desks in parallel would fan out 11 RSS fetches and a
     model chunk each, all at once, against the same upstreams — the way to get rate-limited by
     the feeds we depend on, at the exact moment nobody is watching. */
  for (const [key, codes] of seen) {
    try {
      const res = await readNews(
        new Request(`${origin}/api/defense-news?codes=${encodeURIComponent(codes.join(","))}`, {
          headers: { authorization: `Bearer ${secret}` }
        })
      );
      const body = (await res.json()) as { spend?: number; items?: unknown[] };
      const spend = typeof body.spend === "number" ? body.spend : null;
      if (spend) totalSpend += spend;
      results.push({
        desk: key,
        ok: res.status === 200,
        status: res.status,
        spend,
        items: Array.isArray(body.items) ? body.items.length : null
      });
    } catch (e) {
      results.push({
        desk: key, ok: false, status: 0, spend: null, items: null,
        error: e instanceof Error ? e.message : "warm threw"
      });
    }
  }

  /* The number is DERIVED from what the reads reported, never estimated here — the same rule
     the route follows for its own spend line. A warm that cost nothing says 0, which is the
     honest answer on a day with no new stories, not a sign it failed. */
  console.warn(`[warm-news] desks=${seen.size} warmed=${results.filter((r) => r.ok).length} usd=${totalSpend.toFixed(4)}`);

  return NextResponse.json({
    desks: seen.size,
    warmed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    usd: Number(totalSpend.toFixed(4)),
    results
  });
}
