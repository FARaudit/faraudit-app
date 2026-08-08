// SAM.gov dashboard feed — the fetch + shape logic, lifted OUT of the route so its failure contract is
// testable without faking Supabase auth. Mirrors how /api/sam already delegates to src/lib/sam.ts.
//
// WHY IT MOVED: the contract that matters here is what happens when SAM is unreachable, and that code sat
// behind an auth gate whose module binding is non-configurable — so the only way to test it was to not test
// it. A failure path that cannot be exercised is how the original defect survived: all three failure exits
// returned HTTP 200 with an empty list, and the dashboard renders an empty list as the sentence
// "No new solicitations in target NAICS codes today." An unreachable upstream was reported to a signed-in
// customer as a positive fact about the federal market (Rule 61 — and the invited action is to not bid).

// Target NAICS codes — TX/OK aerospace + machining corridor focus.
const NAICS_CODES = "336413,332710,332721";
// sam.gov/api/prod, NOT api.sam.gov (the latter 404s). Same fix in agents/sam-ingest/sam-client.ts and src/lib/sam.ts.
const SAM_SEARCH_URL = "https://sam.gov/api/prod/opportunities/v2/search";
const LOOKBACK_DAYS = 7;
const RESULT_LIMIT = 10;

interface SAMOpp {
  noticeId?: string;
  title?: string;
  fullParentPathName?: string;
  responseDeadLine?: string;
  typeOfSetAside?: string;
  uiLink?: string;
  postedDate?: string;
  naicsCode?: string;
}

export interface CleanedOpp {
  noticeId: string;
  title: string;
  agency: string | null;
  responseDeadline: string | null;
  typeOfSetAside: string | null;
  uiLink: string | null;
  postedDate: string | null;
  naicsCode: string | null;
}

/** Discriminated on purpose: a caller cannot read rows without first deciding whether this was live data.
 *  `ok:true` with an EMPTY list is the one case where "nothing posted today" is a true sentence. */
export type SamFeedOutcome =
  | { ok: true; solicitations: CleanedOpp[] }
  | { ok: false; kind: "unconfigured" | "error"; error: string };

// SAM.gov v2 expects MM/dd/yyyy for the postedFrom/postedTo params.
function fmtSamDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}/${d.getFullYear()}`;
}

export async function fetchSamFeed(now: Date = new Date()): Promise<SamFeedOutcome> {
  const SAM_KEY = process.env.SAM_API_KEY;
  if (!SAM_KEY) return { ok: false, kind: "unconfigured", error: "SAM_API_KEY not set" };

  const lookback = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
  const params = new URLSearchParams({
    api_key: SAM_KEY,
    postedFrom: fmtSamDate(lookback),
    postedTo: fmtSamDate(now),
    ncode: NAICS_CODES,
    limit: String(RESULT_LIMIT),
  });

  try {
    const res = await fetch(`${SAM_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // Log the body for diagnosis; return STATUS ONLY — the upstream body and the request URL can both
      // carry the api_key, and this string reaches a response (Rules 32/60).
      console.warn("[sam-feed] HTTP", res.status, await res.text().catch(() => ""));
      return { ok: false, kind: "error", error: `SAM.gov returned HTTP ${res.status}` };
    }

    const data = await res.json();
    const opps: SAMOpp[] = data.opportunitiesData || [];
    return {
      ok: true,
      solicitations: opps.map((o) => ({
        noticeId: o.noticeId || "",
        title: o.title || "Untitled",
        agency: o.fullParentPathName || null,
        responseDeadline: o.responseDeadLine || null,
        typeOfSetAside: o.typeOfSetAside || null,
        uiLink: o.uiLink || null,
        postedDate: o.postedDate || null,
        naicsCode: o.naicsCode || null,
      })),
    };
  } catch (err) {
    // Same reasoning as above — the thrown message routinely embeds the full request URL, key included.
    console.warn("[sam-feed] fetch error:", err instanceof Error ? err.message : err);
    return { ok: false, kind: "error", error: "SAM.gov request failed" };
  }
}
