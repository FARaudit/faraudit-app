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

// FA-96b — top 10 recipients on SB set-aside awards only. Same shape as
// fetchTopRecipients but with the set_aside_type_codes filter applied so the
// result excludes the Lockheed/Boeing-tier large primes. This is the ICP
// intelligence — the actual small businesses who win in this NAICS.
export async function fetchSBRecipients(f: Filters): Promise<Array<{ name: string; amount: number }>> {
  const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/recipient/", {
    filters: { ...baseFilters(f), set_aside_type_codes: SB_SET_ASIDE_CODES },
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

// FA-96b · Recompete radar via /spending_by_award/. Notes from probing the
// live API (HTTP 400 traces):
//   1. The endpoint's filters do NOT support filtering by end-of-performance
//      date. Valid time_period.date_type values are only action_date /
//      last_modified_date / date_signed / new_awards_only — no end_date.
//      So "contracts ending in the next N days" cannot be expressed as a
//      server-side filter; must filter client-side.
//   2. The sort field for end-of-performance is "End Date" (not "Period of
//      Performance Current End Date" — that label exists only as a response
//      field). Sort fields must also appear in the `fields` array.
//   3. Sorting End Date asc returns oldest end dates first, so the first
//      page (100 rows) is almost entirely expired contracts. Must paginate
//      past the expired-tail before reaching upcoming end dates.
//
// Window contract: caller passes [minDays, maxDays] and gets up to 10 rows
// whose End Date falls in (today + minDays, today + maxDays]. The 90d and
// 180d radar columns are wired as DISJOINT windows — (0,90] and (90,180] —
// so the two lists never overlap regardless of NAICS density. (Overlapping
// windows + a 10-row cap silently produced identical lists whenever ≥10
// contracts ended within the first window — bad UX.)
const RECOMPETE_PAGE_SIZE = 100;
const RECOMPETE_MAX_PAGES = 6;

export async function fetchRecompetes(f: Filters, minDays: number, maxDays: number): Promise<RecompeteRow[]> {
  const today = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  // 90-day lookback on action_date keeps the candidate set to contracts that
  // had any obligation/mod activity recently — a proxy for "still active."
  const actionStart = new Date(today.getTime() - 90 * 86400_000);
  const minMs = today.getTime() + minDays * 86400_000;
  const maxMs = today.getTime() + maxDays * 86400_000;
  const out: RecompeteRow[] = [];

  for (let page = 1; page <= RECOMPETE_MAX_PAGES; page++) {
    const d = await post<{ results: Array<Record<string, unknown>>; page_metadata?: { hasNext?: boolean } }>(
      "/search/spending_by_award/",
      {
        filters: {
          naics_codes: [f.naics],
          award_type_codes: ["A", "B", "C", "D"],
          time_period: [{ start_date: fmtDate(actionStart), end_date: fmtDate(today), date_type: "action_date" }]
        },
        fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Sub Agency", "End Date"],
        limit: RECOMPETE_PAGE_SIZE,
        page,
        sort: "End Date",
        order: "asc"
      }
    );
    const results = d?.results || [];
    let pastCutoff = false;
    for (const r of results) {
      const endStr = String(r["End Date"] ?? "");
      if (!endStr) continue;
      const endMs = Date.parse(endStr);
      if (!Number.isFinite(endMs)) continue;
      if (endMs < minMs) continue;
      if (endMs > maxMs) { pastCutoff = true; break; }
      out.push({
        award_id: String(r["Award ID"] ?? ""),
        recipient: String(r["Recipient Name"] ?? ""),
        amount: Number(r["Award Amount"] ?? 0),
        agency: String(r["Awarding Sub Agency"] ?? ""),
        end_date: endStr
      });
      if (out.length >= 10) return out;
    }
    if (pastCutoff) break;
    if (!d?.page_metadata?.hasNext) break;
  }
  return out;
}

/* ── AWARD-LEVEL RECORDS ─────────────────────────────────────────────────────
   Everything the stored recipient TOTALS cannot answer: what a single award is
   worth, who set it aside, what pricing type it carries, which office bought it,
   and how long it runs. The totals endpoints aggregate all of that away.

   The panels this unblocks — award-size distribution, pricing, prime
   subcontracting-plan targets, seasonality, and the DoD-by-buying-office split —
   all need the same records, so they are pulled ONCE per (code, year) and stored
   together rather than by five separate questions.

   `spending_by_award` is already the endpoint this file uses for recompetes; the
   only thing new here is asking it for the fields nobody asked for.

   A SAMPLE, and the caller must treat it as one. USAspending pages this endpoint
   and a busy code can run to tens of thousands of awards; pulling all of them
   nightly is not worth the request budget. We take the largest AWARD_SAMPLE_MAX
   by value, which is the right bias for every panel above except seasonality —
   and seasonality over the largest awards is still a truer signal than none. The
   count and the cap are both stored so no reader can mistake the sample for the
   whole. */
const AWARD_SAMPLE_MAX = 500;
const AWARD_PAGE = 100;

export interface AwardRecord {
  award_id: string;
  recipient: string;
  amount: number;
  agency: string;
  sub_agency: string;
  award_type: string;
  set_aside: string;
  pricing: string;
  start_date: string;
  end_date: string;
}

export interface AwardSample {
  /** Largest-first, capped at AWARD_SAMPLE_MAX. */
  awards: AwardRecord[];
  /** How many were taken, and the cap they were taken under. A reader that shows
   *  a distribution has to be able to say it is a sample of the largest. */
  sampled: number;
  cap: number;
  truncated: boolean;
}

export async function fetchAwardSample(f: Filters): Promise<AwardSample> {
  const out: AwardRecord[] = [];
  let truncated = false;
  for (let page = 1; out.length < AWARD_SAMPLE_MAX; page++) {
    const d = await post<{ results: Array<Record<string, unknown>>; page_metadata?: { hasNext?: boolean } }>(
      "/search/spending_by_award/",
      {
        filters: {
          naics_codes: [f.naics],
          award_type_codes: ["A", "B", "C", "D"],
          time_period: [{ start_date: f.fyStart, end_date: f.fyEnd, date_type: "action_date" }]
        },
        fields: [
          "Award ID", "Recipient Name", "Award Amount", "Awarding Agency",
          "Awarding Sub Agency", "Award Type", "Contract Award Type",
          "Set Aside Type", "Start Date", "End Date"
        ],
        limit: AWARD_PAGE,
        page,
        sort: "Award Amount",
        order: "desc"
      }
    );
    const results = d?.results || [];
    if (results.length === 0) break;
    for (const r of results) {
      if (out.length >= AWARD_SAMPLE_MAX) { truncated = true; break; }
      out.push({
        award_id: String(r["Award ID"] ?? ""),
        recipient: String(r["Recipient Name"] ?? ""),
        amount: Number(r["Award Amount"] ?? 0),
        agency: String(r["Awarding Agency"] ?? ""),
        sub_agency: String(r["Awarding Sub Agency"] ?? ""),
        // Two different fields carry the type depending on the award; neither is
        // reliably present, so whichever answered is kept and "" means the record
        // did not say — never a guessed default.
        award_type: String(r["Contract Award Type"] ?? r["Award Type"] ?? ""),
        set_aside: String(r["Set Aside Type"] ?? ""),
        pricing: String(r["Contract Award Type"] ?? ""),
        start_date: String(r["Start Date"] ?? ""),
        end_date: String(r["End Date"] ?? "")
      });
    }
    if (!d?.page_metadata?.hasNext) break;
    if (out.length >= AWARD_SAMPLE_MAX) { truncated = true; break; }
  }
  return { awards: out, sampled: out.length, cap: AWARD_SAMPLE_MAX, truncated };
}
