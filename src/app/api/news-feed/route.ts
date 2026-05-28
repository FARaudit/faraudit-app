/* GET /api/news-feed — NewsAPI.org proxy for the Defense News design page.

   Distinct from /api/defense-news (RSS+Claude+Supabase, powering /home).
   This route exists to feed the static design page at /defense-news with
   richer article metadata (urlToImage) without altering live production.

   Reads NEWS_API_KEY from env. Caches at the edge for 15 min.
   Falls back to 7 curated mock articles (matching the static page's
   pre-existing copy) if the key is missing OR the upstream fails.

   Each article carries an `aiInsight` field:
   - Mock articles: hand-written contextual lines tied to NAICS 336413/332710/332721
   - Live articles: generic "monitor this development" line, since we'd need
     an LLM round-trip to generate contextual insight at fetch-time and this
     route is meant to stay cheap + cache-friendly.                            */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  source: { name: string };
  publishedAt: string;
  aiInsight: string;
}

const MOCK_ARTICLES: NewsArticle[] = [
  {
    title: "Pentagon raises small business award threshold to $50M for FY2026 set-asides",
    description:
      "The Department of Defense announced sweeping changes to its small business contracting framework this week, raising the maximum set-aside award threshold from $25M to $50M for NAICS 336413, 332710, and 332721. The shift is expected to accelerate prime contract flow to small-business manufacturers.",
    url: "https://www.defensenews.com/",
    urlToImage: null,
    source: { name: "Defense News" },
    publishedAt: "2026-05-26T09:00:00Z",
    aiInsight:
      "Threshold raise to $50M opens NAICS 336413 prime-contract flow — review your past performance for SB set-aside eligibility.",
  },
  {
    title: "F-35 sustainment IDIQ: AFLCMC issues $500M sources sought to small business primes",
    description:
      "The Air Force Life Cycle Management Center has opened a sources-sought window for the next F-35 mission systems ground support equipment IDIQ — a $500M ceiling vehicle with explicit small-business prime openness.",
    url: "https://breakingdefense.com/",
    urlToImage: null,
    source: { name: "Breaking Defense" },
    publishedAt: "2026-05-24T13:00:00Z",
    aiInsight:
      "Sources Sought window is open. RFI response by Friday could shape Section M evaluation criteria.",
  },
  {
    title: "CMMC Phase 2 implementation timeline: DoD confirms Q4 2026 full enforcement",
    description:
      "Defense Department officials confirmed that CMMC 2.0 Level 2 certification will be a hard requirement on all FCI/CUI-handling contracts starting Q4 2026, with conditional waivers limited to 90 days.",
    url: "https://www.janes.com/",
    urlToImage: null,
    source: { name: "Janes" },
    publishedAt: "2026-05-23T11:00:00Z",
    aiInsight:
      "Your CMMC L2 cert expires Aug 2026 — renew before Q4 2026 enforcement to avoid contract gaps.",
  },
  {
    title: "Army TACOM machined components IDIQ awarded to small business primes",
    description:
      "TACOM's $145M precision machined components IDIQ went to three small business primes this week — a notable shift from the legacy single-prime model dominated by General Dynamics Land Systems.",
    url: "https://www.defensenews.com/land/",
    urlToImage: null,
    source: { name: "Defense News" },
    publishedAt: "2026-05-22T15:30:00Z",
    aiInsight:
      "Set-aside shift to small-business primes signals opportunity for NAICS 332710 manufacturers — track this prime cohort.",
  },
  {
    title: "DLA Aviation spare parts shortage: ramp-up plan for FY27 includes 40% small-business goal",
    description:
      "Persistent NSN-level spare parts shortages are pushing DLA Aviation to accelerate its supplier diversification, with an internal target of 40% small business obligations on aircraft parts contracts by FY2027.",
    url: "https://breakingdefense.com/",
    urlToImage: null,
    source: { name: "Breaking Defense" },
    publishedAt: "2026-05-21T10:15:00Z",
    aiInsight:
      "40% small-business obligation goal by FY2027 — accelerate DLA CAGE-code registration if you're targeting 336413.",
  },
  {
    title: "NAVAIR depot maintenance budget rises 14% for FY2026 — boost for aircraft parts primes",
    description:
      "NAVAIR's depot-level maintenance budget jumps to $4.8B for FY2026, with explicit allocations toward T-38, F/A-18 sustainment, and H-60 powertrain analytics — all expected to spawn 336413-coded recompetes.",
    url: "https://www.janes.com/",
    urlToImage: null,
    source: { name: "Janes" },
    publishedAt: "2026-05-20T08:45:00Z",
    aiInsight:
      "T-38 / F/A-18 / H-60 sustainment line items spawn 336413 recompetes — monitor SAM.gov for pre-sol activity.",
  },
  {
    title: "Pentagon FY2026 small business goal exceeds 27% target — first time in a decade",
    description:
      "DoD exceeded its 23% small business prime contracting goal for the first time since 2016, hitting 27.2% of total obligations — driven largely by manufacturing-NAICS set-asides under the new threshold framework.",
    url: "https://www.defensenews.com/",
    urlToImage: null,
    source: { name: "Defense News" },
    publishedAt: "2026-05-19T14:20:00Z",
    aiInsight:
      "Highest SB obligation share in a decade — federal-wide tailwind for NAICS 336413/332710/332721 small-business primes.",
  },
];

const LIVE_INSIGHT =
  "Monitor this development — may affect active solicitations in your NAICS codes.";

const CACHE_HEADER = "s-maxage=900, stale-while-revalidate=600";

function fallback(reason: string) {
  return NextResponse.json(
    { articles: MOCK_ARTICLES, source: "mock", reason },
    { headers: { "cache-control": CACHE_HEADER } }
  );
}

export async function GET() {
  const key = process.env.NEWS_API_KEY;
  if (!key) return fallback("NEWS_API_KEY not set");

  try {
    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set(
      "q",
      '(CMMC OR "defense contract" OR "Pentagon award" OR NAVAIR OR AFLCMC OR "DLA Aviation" OR "military procurement" OR DFARS OR "small business set-aside" OR "defense industrial base") AND (defense OR military OR Pentagon OR DoD)'
    );
    url.searchParams.set("language", "en");
    url.searchParams.set("sortBy", "relevancy");
    url.searchParams.set("pageSize", "20");
    // Limit to last 7 days
    url.searchParams.set(
      "from",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    );
    url.searchParams.set("apiKey", key);

    const res = await fetch(url.toString(), {
      next: { revalidate: 900 },
      headers: { "user-agent": "FARaudit/1.0 (+https://faraudit.com)" },
    });

    if (!res.ok) return fallback(`NewsAPI ${res.status}`);

    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.articles)) {
      return fallback("Invalid NewsAPI payload");
    }

    interface RawArticle {
      title?: string | null;
      description?: string | null;
      url?: string | null;
      urlToImage?: string | null;
      source?: { name?: string | null } | null;
      publishedAt?: string | null;
    }

    // Keep articles whose title or description matches at least one defense keyword.
    const RELEVANT_KEYWORDS = [
      "defense", "pentagon", "military", "contract", "procurement",
      "cmmc", "dfars", "dod", "navy", "air force", "army",
      "navair", "aflcmc", "dla", "acquisition", "ndaa",
      "small business", "cybersecurity"
    ];
    // Reject obvious HTML artifacts and entertainment-source noise.
    const HTML_ARTIFACTS = ["<!--", "#include", "virtual="];

    function hasRelevantKeyword(text: string): boolean {
      const lower = text.toLowerCase();
      return RELEVANT_KEYWORDS.some((kw) => lower.includes(kw));
    }
    function isClean(text: string): boolean {
      return !HTML_ARTIFACTS.some((token) => text.includes(token));
    }

    // Track seen titles for dedup (case-insensitive, trimmed).
    const seenTitles = new Set<string>();

    const articles: NewsArticle[] = (data.articles as RawArticle[])
      .filter((a) => a && a.title && a.title !== "[Removed]")
      .filter((a) => {
        const srcName = (a.source?.name || "").toLowerCase();
        if (srcName.includes("entertainment")) return false;
        const title = a.title || "";
        // Drop SHOUTY VIDEO-CARD-STYLE titles (no lowercase letters, length > 15).
        if (title.length > 15 && !/[a-z]/.test(title)) return false;
        // Dedup by normalized title — keep first occurrence.
        const key = title.trim().toLowerCase();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        const desc = a.description || "";
        if (!isClean(desc)) return false;
        const combined = `${title} ${desc}`;
        return hasRelevantKeyword(combined);
      })
      .slice(0, 15)
      .map((a) => ({
        title: a.title || "Untitled",
        description: a.description || "",
        url: a.url || "#",
        urlToImage: a.urlToImage || null,
        source: { name: a.source?.name || "Unknown" },
        publishedAt: a.publishedAt || new Date().toISOString(),
        aiInsight: LIVE_INSIGHT,
      }));

    if (articles.length === 0) return fallback("Empty article set");

    return NextResponse.json(
      { articles, source: "live" },
      { headers: { "cache-control": CACHE_HEADER } }
    );
  } catch (err) {
    return fallback(`Fetch failed: ${String(err).slice(0, 120)}`);
  }
}
