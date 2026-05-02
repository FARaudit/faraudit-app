import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export const maxDuration = 30;

interface NewsItem {
  source: string;
  title: string;
  link: string;
  pub_date: string | null;
  summary: string;
  tag: "policy" | "contract" | "budget" | "defense";
  relevance: string;
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

  return NextResponse.json({ items, fetched_at: new Date().toISOString() });
}
