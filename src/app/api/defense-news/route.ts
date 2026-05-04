import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export const maxDuration = 60;

const CLAUDE_MODEL = "claude-opus-4-7";
// Hard cap on per-request Claude calls. Most users see top 12 articles before
// scrolling; bounding parallel Claude calls keeps p95 latency < 5s on first
// load. Items beyond the cap fall back to the deterministic relevance string.
const INSIGHT_BATCH_LIMIT = 12;
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
}

const FEEDS: { source: string; url: string; tag: NewsItem["tag"] }[] = [
  { source: "Defense News",     url: "https://www.defensenews.com/arc/outboundfeeds/rss/", tag: "defense" },
  { source: "DoD News",         url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=20", tag: "defense" },
  { source: "Federal Register", url: "https://www.federalregister.gov/documents/search.rss?conditions%5Bagencies%5D%5B%5D=defense-department", tag: "policy" },
  { source: "FedScoop",         url: "https://fedscoop.com/feed/", tag: "policy" }
];

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

    items.push({
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

  const results = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" },
          signal: AbortSignal.timeout(10000),
          next: { revalidate: 1800 } // 30-min CDN cache
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseItems(xml, f.source, f.tag);
      } catch {
        return [];
      }
    })
  );

  const items = results
    .flat()
    .sort((a, b) => new Date(b.pub_date || 0).getTime() - new Date(a.pub_date || 0).getTime());

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

  return NextResponse.json({ items: enriched, fetched_at: new Date().toISOString() });
}
