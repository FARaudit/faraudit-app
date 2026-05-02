import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface RegRow {
  source: string;
  clause: string | null;
  title: string;
  summary: string | null;
  effective_date: string | null;
  link: string;
  published_at: string | null;
  affects_clauses: string[];
}

const FEEDS: { source: "far" | "dfars" | "federal_register"; url: string }[] = [
  // acquisition.gov publishes FAR rule-update RSS
  { source: "far",   url: "https://www.acquisition.gov/rss-feed/farsite-update" },
  // DFARS PGI updates from DPC
  { source: "dfars", url: "https://www.acq.osd.mil/dpap/rss-dfars.xml" },
  // Federal Register defense-acquisition documents
  { source: "federal_register", url: "https://www.federalregister.gov/documents/search.rss?conditions%5Btopics%5D%5B%5D=federal-acquisition-regulation" }
];

function stripCdataAndTags(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/<[^>]+>/g, "");
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function extractClauses(text: string): string[] {
  const out = new Set<string>();
  const rx = /((?:FAR|DFARS|PGI)\s*\d+\.\d+(?:-\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    out.add(m[1].toUpperCase().replace(/\s+/g, " "));
  }
  return Array.from(out);
}

function parse(xml: string, source: RegRow["source"]): RegRow[] {
  const items: RegRow[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) || [];
  for (const b of blocks.slice(0, 25)) {
    const title = decodeEntities(stripCdataAndTags((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "")).trim();
    const link =
      ((b.match(/<link[^>]*href="([^"]+)"/) || [])[1] ||
       (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] ||
       "").trim();
    const desc = decodeEntities(stripCdataAndTags(
      (b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] ||
      (b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] ||
      ""
    )).trim();
    const pub =
      ((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] ||
       (b.match(/<published>([\s\S]*?)<\/published>/) || [])[1] ||
       (b.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1] ||
       "").trim();
    if (!title || !link) continue;

    const affects = extractClauses(title + " " + desc);
    items.push({
      source,
      clause: affects[0] || null,
      title,
      summary: desc.slice(0, 600) || null,
      effective_date: null,
      link,
      published_at: pub ? new Date(pub).toISOString() : null,
      affects_clauses: affects
    });
  }
  return items;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const filterClause = url.searchParams.get("clause");

  // Cache hit check.
  const sinceIso = new Date(Date.now() - 6 * 3600_000).toISOString();
  let cacheQ = supabase
    .from("regulatory_updates")
    .select("*")
    .gte("fetched_at", sinceIso)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (filterClause) cacheQ = cacheQ.contains("affects_clauses", [filterClause.toUpperCase()]);
  const { data: cached } = await cacheQ;

  let rows: RegRow[] = [];
  if (cached && cached.length > 5) {
    rows = cached as unknown as RegRow[];
  } else {
    const fetched = await Promise.all(
      FEEDS.map(async (f) => {
        try {
          const res = await fetch(f.url, {
            headers: { Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" },
            signal: AbortSignal.timeout(10000),
            next: { revalidate: 21600 }
          });
          if (!res.ok) return [];
          return parse(await res.text(), f.source);
        } catch { return []; }
      })
    );
    rows = fetched.flat().sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

    if (rows.length > 0) {
      await supabase
        .from("regulatory_updates")
        .upsert(
          rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
          { onConflict: "source,link" }
        )
        .then(() => null, () => null);
    }
  }

  return NextResponse.json({ updates: rows.slice(0, 60), fetched_at: new Date().toISOString() });
}
