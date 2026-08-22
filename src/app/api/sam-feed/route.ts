import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveFeedScope } from "@/lib/bd-os/live-opportunities";

// SCOPE COMES FROM THE CUSTOMER, NOT FROM THIS FILE (2026-08-22). This line used to read
//   const NAICS_CODES = "336413,332710,332721";  // "TX/OK aerospace + machining corridor focus"
// — three codes hard-typed into a route every authenticated user hits. Whoever signed in saw an aerospace
// feed, and two of those three codes are not even on our own profile. `resolveFeedScope` is the one place
// that answers "which codes is this account scoped to": profile first, NAICS_CODES env only as an operator
// override, honest-empty when there is nothing — never a borrowed default.
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

interface CleanedOpp {
  noticeId: string;
  title: string;
  agency: string | null;
  responseDeadline: string | null;
  typeOfSetAside: string | null;
  uiLink: string | null;
  postedDate: string | null;
  naicsCode: string | null;
}

// SAM.gov v2 expects MM/dd/yyyy for the postedFrom/postedTo params.
function fmtSamDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}/${d.getFullYear()}`;
}

export async function GET() {
  // Auth gate — only authenticated users hit SAM.gov from this endpoint.
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Honest-empty rather than someone else's feed: no declared codes ⇒ say so, do not substitute.
  const scope = await resolveFeedScope(sb);
  if (scope.codes.length === 0) {
    return NextResponse.json({ solicitations: [], note: scope.source === "unreadable"
      ? "Your profile could not be read, so this feed was not scoped. Nothing is shown rather than someone else's market."
      : "No NAICS codes on your profile — add one in Settings to scope this feed." });
  }

  const SAM_KEY = process.env.SAM_API_KEY;
  if (!SAM_KEY) {
    // Graceful fallback — UI shows empty state with a note, no crash.
    return NextResponse.json({ solicitations: [], note: "SAM_API_KEY not set" });
  }

  const today = new Date();
  const lookback = new Date(today.getTime() - LOOKBACK_DAYS * 86400000);

  const params = new URLSearchParams({
    api_key: SAM_KEY,
    postedFrom: fmtSamDate(lookback),
    postedTo: fmtSamDate(today),
    ncode: scope.codes.join(","),
    limit: String(RESULT_LIMIT)
  });

  try {
    const res = await fetch(`${SAM_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" }
    });

    if (!res.ok) {
      console.warn("[sam-feed] HTTP", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ solicitations: [] });
    }

    const data = await res.json();
    const opps: SAMOpp[] = data.opportunitiesData || [];

    const cleaned: CleanedOpp[] = opps.map((o) => ({
      noticeId: o.noticeId || "",
      title: o.title || "Untitled",
      agency: o.fullParentPathName || null,
      responseDeadline: o.responseDeadLine || null,
      typeOfSetAside: o.typeOfSetAside || null,
      uiLink: o.uiLink || null,
      postedDate: o.postedDate || null,
      naicsCode: o.naicsCode || null
    }));

    return NextResponse.json({ solicitations: cleaned });
  } catch (err) {
    console.warn("[sam-feed] fetch error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ solicitations: [] });
  }
}
