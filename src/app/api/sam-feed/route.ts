import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveCustomerNaics } from "@/lib/customer-naics";

// NAICS codes are per-customer (capability_statements.naics_codes), seeded from
// the customer's SAM registration on first use — no hardcoded corridor default.
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

  const SAM_KEY = process.env.SAM_API_KEY;
  if (!SAM_KEY) {
    // Graceful fallback — UI shows empty state with a note, no crash.
    return NextResponse.json({ solicitations: [], note: "SAM_API_KEY not set" });
  }

  // Per-customer NAICS — saved list, else seed from their SAM registration,
  // else empty (no preset). Empty → tell the UI to prompt for configuration.
  const { naics, needsConfig } = await resolveCustomerNaics(sb, user.id);
  if (naics.length === 0) {
    return NextResponse.json({ solicitations: [], needsNaicsConfig: needsConfig });
  }

  const today = new Date();
  const lookback = new Date(today.getTime() - LOOKBACK_DAYS * 86400000);

  const params = new URLSearchParams({
    api_key: SAM_KEY,
    postedFrom: fmtSamDate(lookback),
    postedTo: fmtSamDate(today),
    // naicsCode is the param the proven sam-ingest client + src/lib/sam.ts use
    // (the prior `ncode` here did not match and risked an unfiltered feed).
    naicsCode: naics.join(","),
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
