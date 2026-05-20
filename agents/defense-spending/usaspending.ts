// USAspending API v2 client — POST endpoints, JSON body, no auth required.
// Base: https://api.usaspending.gov/api/v2/
//
// All calls share the same time-period + award-type filters (FY def: federal
// fiscal year = Oct 1 (prior calendar year) through Sep 30). award_type_codes
// "A,B,C,D" = DEFINITIVE / PURCHASE ORDER / DELIVERY ORDER / BPA CALL — the
// four core prime-contract types USAspending categorizes for defense spend.

const API_BASE = "https://api.usaspending.gov/api/v2";

export interface Filters {
  naics: string;
  fyStart: string;
  fyEnd: string;
}

interface CategoryResult { name?: string; code?: string; amount: number }

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn(`[usaspending] ${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[usaspending] ${path} threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function baseFilters(f: Filters) {
  return {
    naics_codes: [f.naics],
    time_period: [{ start_date: f.fyStart, end_date: f.fyEnd }],
    award_type_codes: ["A", "B", "C", "D"]
  };
}

const SB_SET_ASIDE_CODES = ["SBA", "SBP", "8A", "8AN", "WOSB", "EDWOSB", "SDVOSBC", "SDVOSBS", "HZC", "HZS"];

export async function fetchTotalObligations(f: Filters): Promise<number | null> {
  const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/naics/", {
    filters: baseFilters(f),
    limit: 1
  });
  return d?.results?.[0]?.amount ?? null;
}

export async function fetchSmallBusinessObligations(f: Filters): Promise<number | null> {
  const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/naics/", {
    filters: { ...baseFilters(f), set_aside_type_codes: SB_SET_ASIDE_CODES },
    limit: 1
  });
  return d?.results?.[0]?.amount ?? null;
}

export async function fetchTopRecipients(f: Filters): Promise<Array<{ name: string; amount: number }>> {
  const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/recipient/", {
    filters: baseFilters(f),
    limit: 10
  });
  return (d?.results || []).map((r) => ({ name: r.name || r.code || "Unknown", amount: r.amount }));
}

export async function fetchAgencyBreakdown(f: Filters): Promise<Array<{ name: string; amount: number }>> {
  const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/awarding_agency/", {
    filters: baseFilters(f),
    limit: 10
  });
  return (d?.results || []).map((r) => ({ name: r.name || "Unknown", amount: r.amount }));
}

export async function fetchStateBreakdown(f: Filters): Promise<Array<{ state: string; amount: number }>> {
  const d = await post<{ results: Array<{ shape_code?: string; display_name?: string; aggregated_amount?: number }> }>(
    "/search/spending_by_geography/",
    {
      filters: baseFilters(f),
      scope: "place_of_performance",
      geo_layer: "state"
    }
  );
  return (d?.results || [])
    .map((r) => ({ state: r.shape_code || r.display_name || "?", amount: r.aggregated_amount ?? 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

export async function fetchContractTypeBreakdown(f: Filters): Promise<Array<{ name: string; amount: number }>> {
  const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/contract_pricing_type_codes/", {
    filters: baseFilters(f),
    limit: 20
  });
  return (d?.results || []).map((r) => ({ name: r.name || r.code || "Unknown", amount: r.amount }));
}

export interface RecompeteRow {
  award_id: string;
  recipient: string;
  amount: number;
  agency: string;
  end_date: string;
}

export async function fetchRecompetes(f: Filters, daysAhead: number): Promise<RecompeteRow[]> {
  const today = new Date();
  const future = new Date(today.getTime() + daysAhead * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // Recompete radar uses a different filter shape — period_of_performance_current_end_date
  // is the upcoming-expiration window. award_type_codes constrain to prime contracts.
  const d = await post<{ results: Array<Record<string, unknown>> }>("/search/spending_by_award/", {
    filters: {
      naics_codes: [f.naics],
      award_type_codes: ["A", "B", "C", "D"],
      period_of_performance_current_end_date: [{ start_date: fmt(today), end_date: fmt(future) }]
    },
    fields: ["Award ID", "Recipient Name", "Award Amount", "awarding_agency_name", "period_of_performance_current_end_date"],
    limit: 10,
    sort: "Award Amount",
    order: "desc"
  });
  return (d?.results || []).map((r) => ({
    award_id: String(r["Award ID"] ?? ""),
    recipient: String(r["Recipient Name"] ?? ""),
    amount: Number(r["Award Amount"] ?? 0),
    agency: String(r["awarding_agency_name"] ?? ""),
    end_date: String(r["period_of_performance_current_end_date"] ?? "")
  }));
}
