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

// MOCK_ARTICLES DELETED 2026-07-27 — ARC #747.
//
// This route carried seven hand-written "articles" and served them whenever NEWS_API_KEY was unset or the
// upstream fetch threw. They were not placeholders: they had headlines, bodies, publication dates, and were
// ATTRIBUTED TO REAL OUTLETS (Defense News, Breaking Defense, Janes) with links to those outlets' homepages.
// Two carried invented regulatory claims — a small-business set-aside threshold "raised from $25M to $50M"
// and a CMMC Level 2 hard-enforcement date "confirmed" by DoD officials. A reader had no way to tell them
// from reporting.
//
// Verified before removal: production currently returns LIVE articles, so this was NOT firing in prod — it
// is a fail-open, not an active leak. That distinction matters and the review that surfaced it overstated
// the liveness. But a fallback that fabricates attributed journalism the moment a key lapses is the same
// class as every other defect in this arc: a surface answering when it knows nothing.
//
// The failure path now returns an EMPTY list plus the reason. /defense-news already initialises its article
// list to empty and fills only on success, so an empty feed renders as an absence rather than an error.


const LIVE_INSIGHT =
  "Monitor this development — may affect active solicitations in your NAICS codes.";

const CACHE_HEADER = "s-maxage=900, stale-while-revalidate=600";

function fallback(reason: string) {
  // Fail CLOSED: no articles, and say why. Never invent journalism.
  return NextResponse.json(
    { articles: [] as NewsArticle[], source: "unavailable", reason },
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
