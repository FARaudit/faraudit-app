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
  const url = `${CALC_V3}?search=${encodeURIComponent(`labor_category:${cat}`)}&page=1&page_size=${opts?.pageSize ?? 100}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const d = (await res.json()) as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } };
    const hits = d?.hits?.hits ?? [];
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
  } catch {
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
