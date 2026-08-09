import { NextResponse } from "next/server";
import { searchOpportunitiesByNaics } from "@/lib/sam";

/* IS SAM.GOV ANSWERING — one shared, bounded read, so the rail's Live pill can appear on
   every page instead of only the two that happen to query the feed.

   WHY THIS EXISTS. rail.ts used to hardcode badge {text:"Live"} on the Opportunities item,
   so every page asserted the feed was up — including during an outage, and on pages that
   never look at the feed. That was removed, correctly, and the pill was left to the two
   pages that genuinely measure. The cost was a pill that appears and disappears as you
   navigate. This is the honest way to have it everywhere: a page that cannot measure asks
   something that did.

   IT GOES THROUGH THE LIBRARY, NOT ITS OWN REQUEST. The first version of this file
   hand-rolled a query and omitted `api_key`; SAM answers 500 without one, so it reported
   "unavailable" every time and would have painted Feed down on every page — the same
   defect as the one being fixed, pointing the other way. searchOpportunitiesByNaics owns
   the key, the date format and the error taxonomy, and it is the call the working pages
   already make.

   THREE OUTCOMES, NOT TWO.
     ok            → live. A zero-result answer is still an answer.
     upstream      → unavailable. SAM was asked and did not answer.
     unconfigured  → unknown. A missing key on OUR server is not a SAM outage, and
                     reporting it as one would send the customer looking at the wrong
                     thing. The rail renders nothing for unknown.

   WHAT IT COSTS. A module-level cache with a 60s TTL and concurrent misses collapsed onto
   one call, so a warm instance makes at most one upstream request a minute however many
   pages load. Deliberately not Next's fetch cache or `export const revalidate`: in 16.x
   those are removed when Cache Components is enabled, so the cost guarantee would depend
   on a config flag rather than on this file. */

const TTL_MS = 60_000;
// One common manufacturing code. The probe's claim is "SAM answered", not "your feed has
// results", so which code it asks about does not change the meaning — but it must be a
// real one, because a nonsense code would make a healthy SAM look like a bad request.
const PROBE_NAICS = ["332710"];

type FeedState = "live" | "unavailable" | "unknown";
let cache: { state: FeedState; checkedAt: number } | null = null;
let inFlight: Promise<{ state: FeedState; checkedAt: number }> | null = null;

async function probe(): Promise<{ state: FeedState; checkedAt: number }> {
  try {
    const out = await searchOpportunitiesByNaics({ naicsCodes: PROBE_NAICS, limit: 1, daysBack: 1 });
    if (out.ok) return { state: "live", checkedAt: Date.now() };
    return { state: out.kind === "unconfigured" ? "unknown" : "unavailable", checkedAt: Date.now() };
  } catch {
    return { state: "unavailable", checkedAt: Date.now() };
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.checkedAt > TTL_MS) {
    inFlight = inFlight ?? probe().finally(() => { inFlight = null; });
    cache = await inFlight;
  }
  return NextResponse.json(
    {
      state: cache.state,
      checkedAt: new Date(cache.checkedAt).toISOString(),
      ageSeconds: Math.round((Date.now() - cache.checkedAt) / 1000)
    },
    // Short shared cache on top of the module cache: the rail asks on every page load,
    // and this keeps repeat navigations off the function entirely.
    { headers: { "cache-control": "public, max-age=30, s-maxage=30" } }
  );
}
