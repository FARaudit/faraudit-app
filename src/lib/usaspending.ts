// USAspending.gov API v2 client — public, no key required.
// Docs: https://api.usaspending.gov/docs/endpoints

const BASE = "https://api.usaspending.gov/api/v2";

export interface IncumbentRecord {
  recipient_name: string | null;
  recipient_uei: string | null;
  award_amount: number | null;
  period_of_performance_start: string | null;
  period_of_performance_end: string | null;
  award_id: string | null;
  agency: string | null;
}

interface AwardResultRow {
  Recipient?: { recipient_name?: string | null; recipient_unique_id?: string | null; uei?: string | null };
  recipient_name?: string | null;
  "Award Amount"?: number | null;
  total_obligation?: number | null;
  "Period of Performance Start Date"?: string | null;
  "Period of Performance Current End Date"?: string | null;
  period_of_performance_start_date?: string | null;
  period_of_performance_current_end_date?: string | null;
  "Award ID"?: string | null;
  generated_internal_id?: string | null;
  "Awarding Agency"?: string | null;
  awarding_agency_name?: string | null;
}

// Look up the most recent prime contract award matching a NAICS code +
// agency hint. Returns the most recent (by period_of_performance_end DESC)
// contract that overlaps the present, treating it as the likely incumbent.
export async function findIncumbentByNaicsAgency(opts: {
  naicsCode: string;
  agencyKeyword?: string | null;
  limit?: number;
}): Promise<IncumbentRecord | null> {
  if (!opts.naicsCode) return null;

  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);

  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"], // BPA call, purchase order, IDIQ, definitive contract
    naics_codes: [opts.naicsCode],
    time_period: [{ start_date: yearAgo, end_date: today }]
  };
  if (opts.agencyKeyword) {
    filters.agencies = [{ type: "awarding", tier: "toptier", name: opts.agencyKeyword }];
  }

  const body = {
    filters,
    fields: [
      "Award ID", "Recipient Name", "Award Amount",
      "Period of Performance Start Date", "Period of Performance Current End Date",
      "Awarding Agency"
    ],
    page: 1,
    limit: opts.limit || 5,
    sort: "Period of Performance Current End Date",
    order: "desc",
    subawards: false
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}/search/spending_by_award/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: { results?: AwardResultRow[] } = {};
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const rows = data.results || [];
  if (rows.length === 0) return null;
  const top = rows[0];

  return {
    recipient_name:
      top.Recipient?.recipient_name ||
      top.recipient_name ||
      null,
    recipient_uei:
      top.Recipient?.uei ||
      top.Recipient?.recipient_unique_id ||
      null,
    award_amount:
      typeof top["Award Amount"] === "number"
        ? top["Award Amount"]
        : (typeof top.total_obligation === "number" ? top.total_obligation : null),
    period_of_performance_start:
      top["Period of Performance Start Date"] ||
      top.period_of_performance_start_date ||
      null,
    period_of_performance_end:
      top["Period of Performance Current End Date"] ||
      top.period_of_performance_current_end_date ||
      null,
    award_id: top["Award ID"] || top.generated_internal_id || null,
    agency: top["Awarding Agency"] || top.awarding_agency_name || null
  };
}

// Aggregate spending by agency × NAICS for a given fiscal year.
// Returns rows sorted by obligated amount desc.
export interface BudgetRow {
  agency: string;
  naics_code: string | null;
  fiscal_year: number;
  obligated_amount: number;
}

export async function fetchAgencySpendByNaics(opts: {
  fiscalYear: number;
  naicsCodes?: string[];
  limit?: number;
}): Promise<BudgetRow[]> {
  // USAspending returns aggregated category data via the spending_by_category endpoint.
  // We use that to get top awarding agencies for the requested NAICS scope.
  const fyStart = `${opts.fiscalYear - 1}-10-01`; // FY starts Oct 1 prior calendar year
  const fyEnd = `${opts.fiscalYear}-09-30`;

  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: fyStart, end_date: fyEnd }]
  };
  if (opts.naicsCodes && opts.naicsCodes.length > 0) {
    filters.naics_codes = opts.naicsCodes;
  }

  const body = {
    category: "awarding_agency",
    filters,
    limit: opts.limit || 25,
    page: 1,
    subawards: false
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}/search/spending_by_category/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: { results?: Array<{ name?: string; amount?: number }> } = {};
  try { data = await res.json(); } catch { return []; }
  const rows = data.results || [];

  return rows.map((r) => ({
    agency: r.name || "—",
    naics_code: opts.naicsCodes?.[0] ?? null,
    fiscal_year: opts.fiscalYear,
    obligated_amount: typeof r.amount === "number" ? r.amount : 0
  }));
}
