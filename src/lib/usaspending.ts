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

// DoD-scoped total obligated + top-N prime recipients for a single NAICS code in
// a given fiscal year. Two parallel calls to the spending_by_category endpoint
// with the same DoD-scoped filter:
//   1. category=naics + limit=1  → single-row aggregate, results[0].amount = total
//   2. category=recipient + limit=N → top-N prime contractors with amount per row
// Earlier version used category=awarding_agency for the total — that returns 0
// because filtering on agencies AND grouping by awarding_agency creates a
// circular self-exclusion in USAspending's aggregation.
// award_type_codes covers contract-vehicle types (A/B/C/D = stand-alone) and
// IDV variants (IDV_A through IDV_E = contract vehicles).
export interface RecipientShare {
  name: string;
  amount: number;
}
export async function fetchDoDTotalAndRecipientsByNaics(opts: {
  fiscalYear: number;
  naicsCode: string;
  recipientLimit?: number;
}): Promise<{ totalObligated: number; topRecipients: RecipientShare[] } | null> {
  if (!opts.naicsCode) return null;
  const fyStart = `${opts.fiscalYear - 1}-10-01`;
  const fyEnd = `${opts.fiscalYear}-09-30`;
  const dodFilter = {
    award_type_codes: [
      "A", "B", "C", "D",
      "IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C",
      "IDV_C", "IDV_D", "IDV_E"
    ],
    naics_codes: [opts.naicsCode],
    time_period: [{ start_date: fyStart, end_date: fyEnd }],
    agencies: [{ type: "awarding", tier: "toptier", name: "Department of Defense" }]
  };

  async function callCategory(category: "naics" | "recipient", limit: number): Promise<Array<{ name?: string; amount?: number; code?: string }>> {
    try {
      // USAspending v2 requires the category in the URL path. Posting to
      // /search/spending_by_category/ (without category) returns 404. The body
      // also carries category for clarity but the path is what routes.
      const res = await fetch(`${BASE}/search/spending_by_category/${category}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ category, filters: dodFilter, limit, page: 1, subawards: false }),
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "(unreadable)");
        console.error("[usaspending] non-OK", {
          category,
          status: res.status,
          naics: opts.naicsCode,
          fy: opts.fiscalYear,
          body: errBody.slice(0, 500)
        });
        return [];
      }
      const data: { results?: Array<{ name?: string; amount?: number; code?: string }> } = await res.json();
      const results = data.results || [];
      if (results.length === 0) {
        console.error("[usaspending] empty results", {
          category,
          naics: opts.naicsCode,
          fy: opts.fiscalYear,
          raw: JSON.stringify(data).slice(0, 500)
        });
      } else {
        console.error("[usaspending] ok", {
          category,
          naics: opts.naicsCode,
          fy: opts.fiscalYear,
          count: results.length,
          first: results[0]
        });
      }
      return results;
    } catch (err) {
      console.error("[usaspending] fetch threw", {
        category,
        naics: opts.naicsCode,
        fy: opts.fiscalYear,
        error: err instanceof Error ? err.message : String(err)
      });
      return [];
    }
  }

  const [naicsRows, recipientRows] = await Promise.all([
    callCategory("naics", 1),
    callCategory("recipient", opts.recipientLimit || 10)
  ]);

  // category=naics with naics_codes filter returns one aggregate row whose
  // amount is the total obligation across the filter. Use that single number
  // rather than summing; summing across multiple rows would double-count
  // sibling NAICS that we did not request.
  const totalObligated = typeof naicsRows[0]?.amount === "number" ? naicsRows[0].amount : 0;
  const topRecipients: RecipientShare[] = recipientRows
    .filter((r) => r.name && typeof r.amount === "number")
    .map((r) => ({ name: r.name as string, amount: r.amount as number }));

  return { totalObligated, topRecipients };
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
    // USAspending v2 routes by category in the URL path. The shared
    // /search/spending_by_category/ root returns 404.
    res = await fetch(`${BASE}/search/spending_by_category/awarding_agency/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
  } catch (err) {
    console.error("[usaspending agency] fetch threw", { naics: opts.naicsCodes, fy: opts.fiscalYear, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error("[usaspending agency] non-OK", { status: res.status, naics: opts.naicsCodes, fy: opts.fiscalYear, body: errBody.slice(0, 500) });
    return [];
  }

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
