// GSA CALC+ v3 ("IGCE / Pricing Central") labor-rate client — Stage-5/7 facts.
//
// The live source for the wage-benchmarks tab + the audit's pricing analysis:
// real Contract-Awarded Labor Category (CALC) ceiling rates from GSA schedules.
// Free, NO API key required. Replaces the dead SAM wages endpoint (404) and the
// hardcoded static rate table.
//
// Endpoint (v2 /api/rates is being retired → use v3 /api/ceilingrates):
//   https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/
//     ?search=labor_category:<CATEGORY>&page=1&page_size=<N>
// Query MUST use the `labor_category:` field prefix — bare free-text 500s.
// Response: { hits: { total, hits: [{ _source: { labor_category, current_price,
//   vendor_name, min_years_experience, education_level } } ] } }

const CALC_V3 = "https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/";

export interface CalcRate {
  labor_category: string;
  current_price: number | null;
  vendor_name: string | null;
  min_years_experience: number | null;
  education_level: string | null;
}

export interface CalcRateStats {
  category: string;
  count: number;
  min: number | null;
  median: number | null;
  max: number | null;
  sample: CalcRate[];
  source: "GSA CALC+ (live)";
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const n = parseFloat(v.replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : null; }
  return null;
}

/** Fetch live CALC+ rates for a labor category. Returns [] on any failure
 *  (graceful — callers keep their fallback). No API key needed. */
export async function fetchCalcRates(laborCategory: string, opts?: { pageSize?: number }): Promise<CalcRate[]> {
  const cat = (laborCategory || "").trim();
  if (!cat) return [];
  // `keyword` is the filtering parameter. MEASURED against the live endpoint 2026-08-03:
  //   search=labor_category:engineer  -> HTTP 200, hits.total.value = 0      (silent, forever)
  //   search=engineer                 -> HTTP 500
  //   q / query / term / text / labor_category  -> HTTP 200 but IGNORED: identical unfiltered rows
  //     for every term ("Asset Tagging Service" came back as the top hit for "electrical engineer")
  //   keyword=welder -> 103 results, all welders · keyword=nurse -> 107, all nurses
  //
  // The parser below was always correct — `hits.hits[]._source` is the real shape. Only the query
  // parameter was wrong, so every call returned [] on a 200 with no error and the caller quietly
  // kept its static fallback. NOTE the near-miss: swapping to `q` makes this return plenty of rows
  // that are not the category asked for, which is worse than empty. Non-emptiness is NOT the test;
  // RELEVANCE is, which is what the gate asserts.
  const url = `${CALC_V3}?keyword=${encodeURIComponent(cat)}&page=1&page_size=${opts?.pageSize ?? 100}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    // Every exit from here was a silent []. That is why the wrong query parameter
    // above survived: the caller could not tell "CALC has no rates for this
    // category" from "CALC did not answer", and used its static fallback either
    // way. The return shape is unchanged; only the silence is.
    if (!res.ok) {
      console.error("[calc-rates] non-OK", { category: cat, status: res.status });
      return [];
    }
    const d = (await res.json()) as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } };
    const hits = d?.hits?.hits ?? [];
    if (hits.length === 0) console.warn("[calc-rates] zero hits", { category: cat });
    return hits
      .map((h) => {
        const s = h._source ?? {};
        return {
          labor_category: String(s.labor_category ?? ""),
          current_price: toNum(s.current_price),
          vendor_name: (s.vendor_name as string) ?? null,
          min_years_experience: toNum(s.min_years_experience),
          education_level: (s.education_level as string) ?? null,
        } as CalcRate;
      })
      .filter((r) => r.labor_category.length > 0);
  } catch (err) {
    console.error("[calc-rates] fetch threw", { category: cat, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** Live min/median/max hourly for a labor category from CALC+. Returns null
 *  when CALC has no data for the category (caller decides the fallback). */
export async function calcRateStats(laborCategory: string): Promise<CalcRateStats | null> {
  const rows = await fetchCalcRates(laborCategory, { pageSize: 200 });
  const prices = rows.map((r) => r.current_price).filter((n): n is number => typeof n === "number" && n > 0).sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const median = prices[Math.floor(prices.length / 2)];
  return {
    category: laborCategory,
    count: prices.length,
    min: prices[0],
    median,
    max: prices[prices.length - 1],
    sample: rows.filter((r) => r.current_price != null).slice(0, 5),
    source: "GSA CALC+ (live)",
  };
}

// ── BULK, CACHED, AND ON A DEADLINE ────────────────────────────────────────────────────
//
// Awarded rates are the headline number on Wage Benchmarks, so every visible row needs one,
// not just the selected one. Measured 2026-08-10: 55 categories at concurrency 8 takes 5.8s
// and 55 outbound requests. Doing that per page load is not a page load.
//
// So it is cached in process. CALC+ indexes ceiling rates off GSA schedules, which move on
// contract award and option exercise, not by the minute — six hours is well inside the
// staleness this data actually has, and the alternative is a new table and a migration for a
// value we do not own.
//
// A DEADLINE, NOT A HANG. Whatever has resolved when the budget expires is returned, and the
// rest report as unresolved rather than as "no awarded rate". A category CALC+ has never heard
// of and a category we ran out of time to ask about are different facts, and a page that
// collapses them tells a customer their role has no market when we simply did not ask.
const RATE_CACHE = new Map<string, { stats: CalcRateStats | null; at: number }>();
const RATE_TTL_MS = 6 * 3600_000;
const BULK_CONCURRENCY = 8;

export type BulkRate = CalcRateStats | null;

/** Awarded rates for many categories. Returns a Map holding an entry ONLY for categories that
 *  were actually resolved — a missing key means "not asked", which is not "not indexed". */
export async function calcRateStatsBulk(
  categories: string[],
  opts?: { deadlineMs?: number; now?: number }
): Promise<Map<string, BulkRate>> {
  const now = opts?.now ?? Date.now();
  const deadline = now + (opts?.deadlineMs ?? 7000);
  const out = new Map<string, BulkRate>();
  const pending: string[] = [];

  for (const c of categories) {
    const hit = RATE_CACHE.get(c);
    if (hit && now - hit.at < RATE_TTL_MS) out.set(c, hit.stats);
    else pending.push(c);
  }

  for (let i = 0; i < pending.length; i += BULK_CONCURRENCY) {
    if (Date.now() >= deadline) break;
    await Promise.all(pending.slice(i, i + BULK_CONCURRENCY).map(async (c) => {
      try {
        const stats = await calcRateStats(c);
        RATE_CACHE.set(c, { stats, at: Date.now() });
        out.set(c, stats);
      } catch {
        // Not cached: a transient failure must not pin "unknown" for six hours.
      }
    }));
  }
  return out;
}

/** Test seam — the cache is process-global and would otherwise leak between cases. */
export function __resetRateCache(): void { RATE_CACHE.clear(); }
