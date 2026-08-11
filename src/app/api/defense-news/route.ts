import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase-server";
import { extractFeedImage, extractOgImage, type ImageCarrier } from "@/lib/news-images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export const maxDuration = 60;

const CLAUDE_MODEL = "claude-sonnet-4-6";
// Hard cap on per-request Claude calls. Most users see top 12 articles before
// scrolling; bounding parallel Claude calls keeps p95 latency < 5s on first
// load. Items beyond the cap fall back to the deterministic relevance string.
const INSIGHT_BATCH_LIMIT = 12;
// Article fetches for og:image, for the feeds that carry no image element.
// Same reasoning as the insight cap: bounded to what is read before scrolling.
const OG_LOOKUP_LIMIT = 16;
const INSIGHT_PROMPT_PREFIX = `You are advising a small-to-mid-market federal defense subcontractor (machine shops, aerospace parts manufacturers, professional services, $5M-$50M annual revenue, AS9100/ITAR/CMMC-aware). Read this news headline + summary and produce ONE LINE (max 25 words) of actionable insight for THIS contractor: what should they watch, what threat or opportunity does this create, what action might they take. No fluff, no 'consider' or 'might want to' — direct and concrete.`;

interface NewsItem {
  source: string;
  title: string;
  link: string;
  pub_date: string | null;
  summary: string;
  tag: "policy" | "contract" | "budget" | "defense";
  relevance: string;
  ai_insight?: string | null;
  // The publisher's own photograph for this story, carried from the feed or
  // from the article's Open Graph tag. Null means the publisher shipped none —
  // the card then renders without an image region rather than with a box.
  image: string | null;
  image_source: ImageCarrier | null;
}

const FEEDS: { source: string; url: string; tag: NewsItem["tag"] }[] = [
  { source: "Defense News",     url: "https://www.defensenews.com/arc/outboundfeeds/rss/", tag: "defense" },
  { source: "DoD News",         url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=20", tag: "defense" },
  { source: "Federal Register", url: "https://www.federalregister.gov/documents/search.rss?conditions%5Bagencies%5D%5B%5D=defense-department", tag: "policy" },
  { source: "FedScoop",         url: "https://fedscoop.com/feed/", tag: "policy" }
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
  for (const block of blocks.slice(0, 6)) {
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
      relevance: deriveRelevance(cleanTitle, cleanSummary, tag)
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

async function generateInsight(client: Anthropic, title: string, summary: string): Promise<string | null> {
  try {
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `${INSIGHT_PROMPT_PREFIX}\n\nHeadline: ${title}\nSummary: ${summary}\n\nOutput only the one-line insight, no preamble.`
      }]
    });
    const text = msg.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("")
      .trim();
    if (!text) return null;
    // Sometimes the model adds a leading "Insight:" or quotes — strip them.
    return text.replace(/^["']|["']$/g, "").replace(/^Insight:\s*/i, "").trim();
  } catch (err) {
    console.error("[defense-news] insight generation failed", {
      title: title.slice(0, 80),
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
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

  // ━━ Layer in Claude insights (cached by article URL) ━━
  const linkKeys = items.map((i) => i.link).filter(Boolean);
  const insightMap = new Map<string, string>();
  if (linkKeys.length > 0) {
    const { data: cached } = await supabase
      .from("defense_news_insights")
      .select("url_key, ai_insight")
      .in("url_key", linkKeys);
    if (cached) {
      for (const row of cached as Array<{ url_key: string; ai_insight: string }>) {
        if (row.url_key && row.ai_insight) insightMap.set(row.url_key, row.ai_insight);
      }
    }
  }

  // Generate missing insights for the top-N items only. Beyond the cap, items
  // ship with ai_insight=null and the UI falls back to the deterministic relevance.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const missing: NewsItem[] = [];
    for (let idx = 0; idx < items.length && missing.length < INSIGHT_BATCH_LIMIT; idx++) {
      const it = items[idx];
      if (it.link && !insightMap.has(it.link)) missing.push(it);
    }
    if (missing.length > 0) {
      const client = new Anthropic({ apiKey });
      const generated = await Promise.all(
        missing.map(async (it) => {
          const insight = await generateInsight(client, it.title, it.summary);
          return insight ? { url_key: it.link, title: it.title, ai_insight: insight } : null;
        })
      );
      const ok = generated.filter((g): g is { url_key: string; title: string; ai_insight: string } => g !== null);
      for (const g of ok) insightMap.set(g.url_key, g.ai_insight);
      if (ok.length > 0) {
        // Best-effort upsert. Fails silently if migration 010 not applied or RLS blocks.
        await supabase
          .from("defense_news_insights")
          .upsert(
            ok.map((g) => ({ ...g, ai_insight_generated_at: new Date().toISOString() })),
            { onConflict: "url_key" }
          )
          .then(() => null, (err) => {
            console.error("[defense-news] insight upsert failed", { count: ok.length, error: err?.message || String(err) });
          });
      }
    }
  }

  const enriched = items.map((it) => ({
    ...it,
    ai_insight: it.link ? insightMap.get(it.link) ?? null : null
  }));

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
    image_coverage: imageCoverage,
    degraded: sources.some((s) => !s.ok),
    fetched_at: new Date().toISOString()
  });
}
