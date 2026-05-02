import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface ProtestRow {
  docket: string;
  decision_date: string | null;
  agency: string | null;
  protester: string | null;
  solicitation: string | null;
  ground: string | null;
  outcome: "sustained" | "denied" | "dismissed" | "withdrawn" | null;
  decision_url: string | null;
}

// GAO publishes bid-protest decisions as RSS at /rss-feed/decisions/.
// We don't get rich structured fields — we parse what's in title + description.
const GAO_RSS = "https://www.gao.gov/rss-feed/decisions/";

function stripCdataAndTags(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/<[^>]+>/g, "");
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function classifyOutcome(text: string): ProtestRow["outcome"] {
  const t = text.toLowerCase();
  if (t.includes("sustained")) return "sustained";
  if (t.includes("dismiss")) return "dismissed";
  if (t.includes("withdraw")) return "withdrawn";
  if (t.includes("denied") || t.includes("deny")) return "denied";
  return null;
}

function parseDocket(s: string): string | null {
  const m = s.match(/\b(B-[\w.\-]+(?:\.\d+)?)/i);
  return m ? m[1].toUpperCase() : null;
}

function parseGAO(xml: string): ProtestRow[] {
  const items: ProtestRow[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const b of blocks.slice(0, 50)) {
    const title = decodeEntities(stripCdataAndTags((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "")).trim();
    const description = decodeEntities(stripCdataAndTags((b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "")).trim();
    const link = ((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
    const pub = ((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    if (!title) continue;
    const outcome = classifyOutcome(title + " " + description);
    const docket = parseDocket(title) || parseDocket(description) || link;
    if (!docket) continue;

    // Title format observed: "Protester Name -- Docket Number, Outcome (Date)"
    const dashIdx = title.indexOf(" -- ");
    const protester = dashIdx > 0 ? title.slice(0, dashIdx).trim() : null;

    // Agency rarely in RSS; description sometimes has "matter of:" plus parties.
    const agencyMatch = description.match(/agency:\s*([^.]+?)(?:\.|;|$)/i);
    const agency = agencyMatch ? agencyMatch[1].trim() : null;

    items.push({
      docket,
      decision_date: pub ? new Date(pub).toISOString().slice(0, 10) : null,
      agency,
      protester,
      solicitation: null,
      ground: description.slice(0, 200) || null,
      outcome,
      decision_url: link || null
    });
  }
  return items;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const agencyFilter = url.searchParams.get("agency");

  // Try cache first.
  const sinceIso = new Date(Date.now() - 6 * 3600_000).toISOString();
  let cacheQ = supabase
    .from("protest_decisions")
    .select("docket, decision_date, agency, protester, solicitation, ground, outcome, decision_url, fetched_at")
    .gte("fetched_at", sinceIso)
    .order("decision_date", { ascending: false, nullsFirst: false })
    .limit(100);
  if (agencyFilter) cacheQ = cacheQ.ilike("agency", `%${agencyFilter}%`);
  const { data: cached } = await cacheQ;

  let rows: ProtestRow[] = [];
  if (cached && cached.length > 5) {
    rows = cached as ProtestRow[];
  } else {
    try {
      const res = await fetch(GAO_RSS, {
        headers: { Accept: "application/rss+xml,application/xml,text/xml" },
        signal: AbortSignal.timeout(15000),
        next: { revalidate: 21600 } // 6h CDN cache
      });
      if (res.ok) {
        const xml = await res.text();
        rows = parseGAO(xml);
        // Persist (best-effort).
        if (rows.length > 0) {
          await supabase
            .from("protest_decisions")
            .upsert(
              rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
              { onConflict: "docket" }
            )
            .then(() => null, () => null);
        }
      }
    } catch {
      // GAO fetch failed — fall through with empty rows.
    }
  }

  // Per-agency aggregates for dashboard.
  const byAgency: Record<string, { total: number; sustained: number; recent_grounds: string[] }> = {};
  for (const r of rows) {
    const a = (r.agency || "Unknown").trim();
    if (!byAgency[a]) byAgency[a] = { total: 0, sustained: 0, recent_grounds: [] };
    byAgency[a].total += 1;
    if (r.outcome === "sustained") byAgency[a].sustained += 1;
    if (r.ground && byAgency[a].recent_grounds.length < 3) byAgency[a].recent_grounds.push(r.ground);
  }
  const agencies = Object.entries(byAgency)
    .map(([agency, v]) => ({
      agency,
      total: v.total,
      sustained: v.sustained,
      sustained_rate: v.total > 0 ? Math.round((v.sustained / v.total) * 100) : 0,
      recent_grounds: v.recent_grounds
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  return NextResponse.json({ decisions: rows.slice(0, 50), agencies, fetched_at: new Date().toISOString() });
}
