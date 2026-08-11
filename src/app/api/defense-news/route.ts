import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase-server";
import { extractFeedImage, extractOgImage, type ImageCarrier } from "@/lib/news-images";
import { resolveFeedScope } from "@/lib/bd-os/live-opportunities";
import { scoreArticle, scopeKey, deskDescription } from "@/lib/defense-news-naics";
import { naicsTitle } from "@/lib/naics-titles";
import { judgeChunk, type Judgement } from "@/lib/defense-news-judge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export const maxDuration = 60;

// How many stories are judged against the reader's desk per request. Judging is
// BATCHED — one call carries a chunk of stories — so this is a token bound, not
// a call count. It was a per-article cap of 12 when each story cost its own
// round trip.
const JUDGE_LIMIT = 60;
const JUDGE_CHUNK = 20;
// Article fetches for og:image, for the feeds that carry no image element.
// Bounded to what is read before scrolling: a fetch costs a round trip and buys
// a photograph, so it is spent where the photograph is looked at.
const OG_LOOKUP_LIMIT = 16;
// Per feed. Defense News publishes 25 items and DoD News 20; reading 6 threw
// away the newest two thirds of the biggest feed and let a slow feed's week-old
// items fill the page. Measured 2026-08-11: at 6/feed the freshest story on the
// page was 16h old against a median of 88h.
const ITEMS_PER_FEED = 10;
// A story the reader can act on. Below this it is defense news they should know
// but that does not touch their business — it still renders, it just does not
// claim to be about their codes.
const DESK_RELEVANT = 55;

interface NewsItem {
  source: string;
  title: string;
  link: string;
  pub_date: string | null;
  summary: string;
  tag: "policy" | "contract" | "budget" | "defense";
  relevance: string;
  ai_insight?: string | null;
  // ── Desk fit ──
  // How much this story bears on the reader's OWN codes, 0-100, and the one code
  // it bears on. Null relevance means nothing judged it — not that it was judged
  // irrelevant. The page must render those two differently.
  desk_relevance: number | null;
  desk_code: string | null;
  desk_code_title: string | null;
  // Set only when the deterministic scorer found the code's own regulation terms
  // in the text. It is rare and it is certain, so it is what the badge cites.
  desk_terms: string[];
  // The publisher's own photograph for this story, carried from the feed or
  // from the article's Open Graph tag. Null means the publisher shipped none —
  // the card then renders without an image region rather than with a box.
  image: string | null;
  image_source: ImageCarrier | null;
}

// Measured 2026-08-11 — every URL here answered 200 with items on that date, and
// the one that did not is the reason this list was revisited: Federal Register's
// `documents/search.rss` had been answering 302 to an empty body since before
// this route shipped, so a quarter of the page's declared coverage was a source
// name in the sidebar with nothing behind it. `api/v1/documents.rss` is the live
// path and carries same-day DoD rulemaking.
//
// The additions are weighted to ACQUISITION rather than to geopolitics. A story
// about a carrier deployment is defense news; a FAR overhaul notice is something
// a subcontractor has to do something about this week.
const FEEDS: { source: string; url: string; tag: NewsItem["tag"] }[] = [
  { source: "Defense News",       url: "https://www.defensenews.com/arc/outboundfeeds/rss/", tag: "defense" },
  { source: "DoD News",           url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=20", tag: "defense" },
  { source: "Federal Register",   url: "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=defense-department", tag: "policy" },
  { source: "FedScoop",           url: "https://fedscoop.com/feed/", tag: "policy" },
  { source: "Acquisition.gov",    url: "https://www.acquisition.gov/rss.xml", tag: "policy" },
  { source: "Federal News Network", url: "https://federalnewsnetwork.com/category/acquisition-policy/feed/", tag: "policy" },
  { source: "Breaking Defense",   url: "https://breakingdefense.com/feed/", tag: "defense" },
  { source: "DefenseScoop",       url: "https://defensescoop.com/feed/", tag: "defense" }
];

/** The article's own Open Graph image, for the feeds that ship no carrier. One
 *  fetch per article, bounded by the caller and cached for a day. A failure is
 *  null — never a substitute picture. */
async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        // Some publishers serve a stripped page to unrecognised agents. This is
        // the same page a reader gets; we read one meta tag out of its head.
        "User-Agent": "Mozilla/5.0 (compatible; FARauditBot/1.0; +https://faraudit.com)",
        Accept: "text/html"
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 }
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000); // <head> is well inside this
    return extractOgImage(html);
  } catch {
    return null;
  }
}

// Tiny RSS/Atom item extractor. Looks for <item>…</item> and <entry>…</entry>.
function parseItems(xml: string, source: string, tag: NewsItem["tag"]): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) || [];
  for (const block of blocks.slice(0, ITEMS_PER_FEED)) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "";
    const link =
      (block.match(/<link[^>]*href="([^"]+)"/) || [])[1] ||
      (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] ||
      "";
    const pub =
      (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] ||
      (block.match(/<published>([\s\S]*?)<\/published>/) || [])[1] ||
      (block.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1] ||
      "";
    const description =
      (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] ||
      (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] ||
      "";
    const cleanTitle = decodeEntities(stripCdataAndTags(title)).trim();
    if (!cleanTitle) continue;
    const cleanSummary = decodeEntities(stripCdataAndTags(description)).slice(0, 500).trim();

    const img = extractFeedImage(block);
    items.push({
      image: img ? img.url : null,
      image_source: img ? img.carrier : null,
      source,
      title: cleanTitle,
      link: cleanCdata(link).trim(),
      pub_date: pub ? new Date(pub).toISOString() : null,
      summary: cleanSummary,
      tag,
      relevance: deriveRelevance(cleanTitle, cleanSummary, tag),
      desk_relevance: null,
      desk_code: null,
      desk_code_title: null,
      desk_terms: []
    });
  }
  return items;
}

function stripCdataAndTags(s: string): string {
  return cleanCdata(s).replace(/<[^>]+>/g, "");
}
function cleanCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function deriveRelevance(title: string, summary: string, tag: NewsItem["tag"]): string {
  const t = (title + " " + summary).toLowerCase();
  if (t.includes("dfars") || t.includes("cmmc")) return "DFARS/CMMC trap detection updates apply.";
  if (t.includes("far ") || t.includes("federal acquisition regulation")) return "FAR rule shift — affects every audit going forward.";
  if (t.includes("ndaa")) return "NDAA — sets next-year acquisition policy ceiling.";
  if (t.includes("budget") || t.includes("appropriation")) return "Budget signal — pipeline of upcoming solicitations.";
  if (t.includes("small business") || t.includes("set-aside")) return "Set-aside policy — direct impact on bid eligibility.";
  if (t.includes("award") || t.includes("contract")) return "Award signal — competitive landscape shift.";
  if (tag === "policy") return "Policy update — review for compliance impact.";
  return "Defense-contracting signal worth monitoring.";
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Per-feed outcome, so the page can tell "every source is down" from "no news
  // today" — both of which arrive as an empty array once the catches swallow them.
  const results = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" },
          signal: AbortSignal.timeout(10000),
          next: { revalidate: 1800 } // 30-min CDN cache
        });
        if (!res.ok) {
          console.error("[defense-news] feed non-OK", { source: f.source, url: f.url, status: res.status });
          return { source: f.source, ok: false, rows: [] as NewsItem[], reason: `HTTP ${res.status}` };
        }
        const xml = await res.text();
        return { source: f.source, ok: true, rows: parseItems(xml, f.source, f.tag) };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[defense-news] feed threw", { source: f.source, url: f.url, reason });
        return { source: f.source, ok: false, rows: [] as NewsItem[], reason };
      }
    })
  );

  const sources = results.map((r) => ({ name: r.source, ok: r.ok, count: r.rows.length, reason: r.reason }));

  // Rule 61: every source failing is an outage, not an empty result.
  if (sources.every((s) => !s.ok)) {
    return NextResponse.json(
      {
        error: `None of the ${sources.length} news sources responded.`,
        items: [],
        sources,
        degraded: true,
        fetched_at: new Date().toISOString()
      },
      { status: 503 }
    );
  }

  const items = results
    .flatMap((r) => r.rows)
    .sort((a, b) => new Date(b.pub_date || 0).getTime() - new Date(a.pub_date || 0).getTime());

  // ━━ og:image for the items whose feed carried no picture ━━
  // Bounded to the run of items a reader actually sees before scrolling, and
  // only for items still without one — an article fetch costs a round trip and
  // buys a photograph, so it is spent where the photograph is looked at.
  const needsOg = items.slice(0, OG_LOOKUP_LIMIT).filter((i) => !i.image && i.link);
  if (needsOg.length > 0) {
    const resolved = await Promise.all(needsOg.map((i) => fetchOgImage(i.link)));
    needsOg.forEach((it, idx) => {
      const url = resolved[idx];
      if (url) {
        it.image = url;
        it.image_source = "og:image";
      }
    });
  }

  // ━━ Whose desk this is ━━
  // Resolved BEFORE the insights, because the insights are now written against
  // these codes and are cached under them.
  const scope = await resolveFeedScope(supabase);
  const codes = scope.codes;
  const allowedCodes = new Set(codes);
  const desk = deskDescription(codes);
  const scope_key = scopeKey(codes);

  // ━━ Deterministic layer ━━
  // The code's own words out of 13 CFR 121.201, matched whole-word in the story.
  // It fires rarely — measured 0 of 34 live stories on 2026-08-11 for an aircraft
  // engine / machine shop / engineering desk — because federal reporting writes
  // about programs and platforms, not about NAICS title nouns. That is precisely
  // why it is not the ranking: it is the certain, explainable half, and it is what
  // the badge cites when it does fire.
  for (const it of items) {
    const det = scoreArticle(it.title, it.summary, codes);
    if (det.matches.length > 0) {
      const top = det.matches[0];
      it.desk_code = top.code;
      it.desk_code_title = top.title;
      it.desk_terms = top.terms;
    }
  }

  // ━━ Judged layer (cached per article PER DESK) ━━
  const linkKeys = items.map((i) => i.link).filter(Boolean);
  const insightMap = new Map<string, Judgement>();
  if (linkKeys.length > 0) {
    const { data: cached, error: cacheErr } = await supabase
      .from("defense_news_insights")
      .select("url_key, ai_insight, relevance, matched_code")
      .eq("scope_key", scope_key)
      .in("url_key", linkKeys);
    if (cacheErr) {
      // Migration 031 not applied yet reads as a missing column here. Log it and
      // regenerate rather than serving another desk's insights.
      console.error("[defense-news] insight cache read failed", { error: cacheErr.message, scope_key });
    }
    for (const row of (cached ?? []) as Array<{ url_key: string; ai_insight: string; relevance: number | null; matched_code: string | null }>) {
      if (!row.url_key || !row.ai_insight) continue;
      insightMap.set(row.url_key, {
        relevance: typeof row.relevance === "number" ? row.relevance : 0,
        // A cached code the customer no longer holds is dropped on read, not just
        // on write — codes change on the capability statement after the row is
        // written, and the card must never print a code that is not theirs today.
        code: row.matched_code && allowedCodes.has(row.matched_code) ? row.matched_code : null,
        why: row.ai_insight
      });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let judged = 0;
  if (apiKey) {
    const missing: NewsItem[] = [];
    for (let idx = 0; idx < items.length && missing.length < JUDGE_LIMIT; idx++) {
      const it = items[idx];
      if (it.link && !insightMap.has(it.link)) missing.push(it);
    }
    if (missing.length > 0) {
      const client = new Anthropic({ apiKey });
      const chunks: NewsItem[][] = [];
      for (let i = 0; i < missing.length; i += JUDGE_CHUNK) chunks.push(missing.slice(i, i + JUDGE_CHUNK));
      const results = await Promise.all(chunks.map((c) => judgeChunk(client, desk, allowedCodes, c)));

      const rows: Array<{ url_key: string; scope_key: string; title: string; ai_insight: string; relevance: number; matched_code: string | null; ai_insight_generated_at: string }> = [];
      const now = new Date().toISOString();
      const byLink = new Map(missing.map((m) => [m.link, m] as const));
      for (const r of results) {
        for (const [link, j] of r) {
          insightMap.set(link, j);
          judged++;
          rows.push({
            url_key: link,
            scope_key,
            title: byLink.get(link)?.title ?? "",
            ai_insight: j.why,
            relevance: j.relevance,
            matched_code: j.code,
            ai_insight_generated_at: now
          });
        }
      }
      if (rows.length > 0) {
        // Best-effort. A failure here costs a re-judge next request, not a wrong
        // answer — so it is logged and the response still carries the judgements.
        await supabase
          .from("defense_news_insights")
          .upsert(rows, { onConflict: "url_key,scope_key" })
          .then(() => null, (err) => {
            console.error("[defense-news] insight upsert failed", { count: rows.length, error: err?.message || String(err) });
          });
      }
    }
  }

  const enriched = items.map((it) => {
    const j = it.link ? insightMap.get(it.link) ?? null : null;
    return {
      ...it,
      ai_insight: j ? j.why : null,
      // Null, not 0, when nothing judged this story: "not scored" and "scored
      // irrelevant" are different states and the page renders them differently.
      desk_relevance: j ? j.relevance : null,
      // ── Precedence ──
      // A judgement that READ the story outranks a word that merely appeared in
      // it, INCLUDING when the judgement is "no code applies". The word layer is
      // the fallback for stories nothing judged.
      //
      // Not theoretical: 336412's own title contributes the term "parts", and
      // "FAR Overhaul Updates for Parts 9, 12, 22 and 52" contains it — that
      // rulemaking notice would otherwise carry an Aircraft Engine and Engine
      // Parts Manufacturing badge. Lifting the term floor past "parts" would fix
      // that one headline and leave the class untouched; federal prose reuses
      // industry nouns as structure throughout.
      desk_code: j ? j.code : it.desk_code,
      desk_code_title: j ? (j.code ? naicsTitle(j.code) : null) : it.desk_code_title,
      desk_terms: j ? [] : it.desk_terms
    };
  });

  // Image coverage per source, so "the pictures stopped" is a number that moved
  // rather than something a reader has to notice. A source at 0 with items > 0
  // means its carrier changed shape.
  const imageCoverage = FEEDS.map((f) => {
    const rows = enriched.filter((i) => i.source === f.source);
    return {
      name: f.source,
      items: rows.length,
      with_image: rows.filter((i) => i.image).length
    };
  });

  return NextResponse.json({
    items: enriched,
    sources,
    naics: scope.codes,
    // Lets the page tell "no codes on file — go add them" apart from "codes on
    // file, nothing matched today". Both arrive as zero desk-relevant stories and
    // only one of them is the customer's to fix.
    naics_source: scope.source,
    desk: {
      // Whether anything actually judged this page against the codes. Without it,
      // a page with no ANTHROPIC_API_KEY looks identical to one where the reader's
      // codes genuinely match nothing.
      judged: apiKey ? enriched.filter((i) => i.desk_relevance !== null).length : 0,
      judged_this_request: judged,
      relevant: enriched.filter((i) => (i.desk_relevance ?? 0) >= DESK_RELEVANT).length,
      threshold: DESK_RELEVANT,
      available: Boolean(apiKey)
    },
    image_coverage: imageCoverage,
    degraded: sources.some((s) => !s.ok),
    fetched_at: new Date().toISOString()
  });
}
