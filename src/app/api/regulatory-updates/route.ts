import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { federalRegisterUrl, parseFederalRegister, extractAmendedClauses, type RegRow } from "@/lib/federal-register";

// Six at a time over a 30s route: 40 documents at ~300ms each finishes inside a few seconds,
// and no single slow document can hold the whole batch.
const FULLTEXT_CONCURRENCY = 6;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// One live source. The two RSS hosts this route used are dead with no replacement —
// see src/lib/federal-register.ts for what was measured on each.
const FEEDS: { source: "federal_register"; url: string }[] = [
  { source: "federal_register", url: federalRegisterUrl() }
];

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
  // Per-feed outcome. A feed that 504s and a feed with nothing new both contribute
  // [] to the flat list, so without this the caller cannot tell an outage from a
  // quiet week — and the page kept its seeded content on the strength of that
  // ambiguity. Measured 2026-08-03: acquisition.gov 504, DPC DFARS 404, Federal
  // Register 200-with-zero-items. All three, silently, for an unknown period.
  let sources: Array<{ name: string; ok: boolean; count: number; reason?: string }> = [];

  if (cached && cached.length > 5) {
    rows = cached as unknown as RegRow[];
    sources = FEEDS.map((f) => ({ name: f.source, ok: true, count: 0, reason: "served from cache" }));
  } else {
    const fetched = await Promise.all(
      FEEDS.map(async (f) => {
        try {
          const res = await fetch(f.url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
            next: { revalidate: 21600 }
          });
          if (!res.ok) {
            console.error("[regulatory-updates] feed non-OK", { source: f.source, url: f.url, status: res.status });
            return { source: f.source, ok: false, rows: [] as RegRow[], reason: `HTTP ${res.status}` };
          }

          // A 200 is not evidence of data. The old Federal Register URL answered 200
          // with an HTML "Request Access" page, and the XML parser found no <item> in
          // HTML and reported zero — indistinguishable from a quiet week. Check the
          // content type before trusting the body.
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("json")) {
            console.error("[regulatory-updates] feed non-JSON", { source: f.source, url: f.url, contentType });
            return {
              source: f.source, ok: false, rows: [] as RegRow[],
              reason: `HTTP 200 but content-type was "${contentType || "absent"}", not JSON`
            };
          }

          const rows = parseFederalRegister(await res.text());

          // 48 CFR is never empty over any real window — 5557 documents are on file and
          // the query is unbounded in time. Zero rows means the query stopped matching
          // (a renamed condition, a changed slug), not that no rule was published. This
          // is the calc-rates trap; see src/lib/calc-rates.ts. Fail LOUD, not empty.
          if (rows.length === 0) {
            console.error("[regulatory-updates] feed parsed to zero documents", { source: f.source, url: f.url });
            return {
              source: f.source, ok: false, rows,
              reason: "responded 200 with zero documents — query no longer matches"
            };
          }
          return { source: f.source, ok: true, rows };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error("[regulatory-updates] feed threw", { source: f.source, url: f.url, reason });
          return { source: f.source, ok: false, rows: [] as RegRow[], reason };
        }
      })
    );
    sources = fetched.map((f) => ({ name: f.source, ok: f.ok, count: f.rows.length, reason: f.reason }));
    rows = fetched.flatMap((f) => f.rows)
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

    // WHICH CLAUSES EACH RULE CHANGES — read from the rule, not from its abstract.
    // Measured 2026-08-10: the abstract names a clause number on 1 of 40 documents, so the
    // page shipped an empty clause on every row and a filter that could never match. The
    // amendatory instructions live in the full text, which is a second fetch per document.
    //
    // Bounded, and it FAILS SOFT: a document whose text cannot be read keeps its row with no
    // clauses rather than dropping out of the feed. Enrichment is a detail on a rule, not the
    // rule itself, and this runs inside a 30s route.
    const enrichable = rows.filter((r) => r.raw_text_url);
    for (let i = 0; i < enrichable.length; i += FULLTEXT_CONCURRENCY) {
      await Promise.all(enrichable.slice(i, i + FULLTEXT_CONCURRENCY).map(async (r) => {
        try {
          const res = await fetch(r.raw_text_url as string, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const amended = extractAmendedClauses(await res.text());
          if (amended.length) { r.affects_clauses = amended; r.clause = amended[0]; }
        } catch { /* keep the row, drop the enrichment */ }
      }));
    }

    if (rows.length > 0) {
      await supabase
        .from("regulatory_updates")
        .upsert(
          // raw_text_url is transient — it is how the clauses were read, not a column.
          rows.map(({ raw_text_url: _drop, ...r }) => ({ ...r, fetched_at: new Date().toISOString() })),
          { onConflict: "source,link" }
        )
        .then(() => null, () => null);
    }
  }

  // Rule 61: a failed dependency yields a visible failure state. Every source down
  // with nothing to show is an outage, and answering 200 {updates: []} makes it
  // indistinguishable from a week with no rule changes.
  const liveSources = sources.filter((s) => s.reason !== "served from cache");
  const allDown = liveSources.length > 0 && liveSources.every((s) => !s.ok);
  if (allDown && rows.length === 0) {
    return NextResponse.json(
      {
        error: `None of the ${liveSources.length} regulatory sources responded.`,
        updates: [],
        sources,
        degraded: true,
        fetched_at: new Date().toISOString()
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    updates: rows.slice(0, 60),
    sources,
    degraded: sources.some((s) => !s.ok),
    fetched_at: new Date().toISOString()
  });
}
