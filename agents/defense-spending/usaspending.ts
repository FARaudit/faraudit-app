// USAspending API v2 client — POST endpoints, JSON body, no auth required.
// Base: https://api.usaspending.gov/api/v2/
//
// All calls share the same time-period + award-type filters (FY def: federal
// fiscal year = Oct 1 (prior calendar year) through Sep 30). award_type_codes
// "A,B,C,D" are the four core prime-contract types USAspending categorizes for
// defense spend, and the mapping is:
//
//   A = BPA CALL   B = PURCHASE ORDER   C = DELIVERY ORDER   D = DEFINITIVE CONTRACT
//
// Verified against the live API 2026-08-12 by querying each code alone and
// reading back "Contract Award Type". This comment previously listed the four
// labels in the reverse order, which matters the moment anyone filters on a
// single code: "definitive contracts only" reads as A and returns BPA calls.

const API_BASE = "https://api.usaspending.gov/api/v2";

export interface Filters {
  naics: string;
  fyStart: string;
  fyEnd: string;
}

interface CategoryResult { name?: string; code?: string; amount: number }

/* FAILURE AND EMPTY ARE THE SAME VALUE HERE, AND THAT COST US 14 ROWS.
   post() returns null on a network error, on an HTTP error, and on a genuinely
   empty answer. Every caller maps null to 0 or []. So when USAspending blocked
   us, the worker built rows full of zeroes and UPSERTED THEM OVER GOOD DATA:
   2026-08-12T04:03Z, 326 blocked requests, 14 of 33 rows overwritten with nulls
   including 336412 FY2026 ($4.99B -> NULL) and all three 336611 rows. The run
   exited 0 and the deployment read SUCCESS.

   The fix is not to make post() throw — a genuinely empty facet is legitimate
   and must stay cheap. It is to COUNT transport failures so the caller can tell
   "this market is empty" from "we were not allowed to ask", and refuse to write
   in the second case. */
let transportFailures = 0;
/** Reset before a unit of work; read after. Non-zero means at least one request
 *  never got an answer, so any zero in that unit is unproven. */
export function resetTransportFailures(): void { transportFailures = 0; }
export function transportFailureCount(): number { return transportFailures; }

/* USAspending's WAF blocks bursts, and it blocks the IP rather than the request
   — once tripped, everything after it fails too, which is why the damage ran in
   NAICS order and hit the last six codes. Requests are serialised with a gap so
   the nightly stays under it. 33 row-builds x ~25 requests at 120ms is roughly
   100 seconds of pacing, against a 24-second run that got us blocked. */
const REQUEST_GAP_MS = Number(process.env.USASPENDING_GAP_MS || 120);
let queue: Promise<unknown> = Promise.resolve();
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => new Promise((r) => setTimeout(r, REQUEST_GAP_MS)),
    () => new Promise((r) => setTimeout(r, REQUEST_GAP_MS))
  );
  return next;
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  return paced(async () => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text();
        transportFailures++;
        console.warn(`[usaspending] ${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      transportFailures++;
      console.warn(`[usaspending] ${path} threw: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  });
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

/* PRICING AND SET-ASIDE ARE FILTERS, NOT CATEGORIES.
   `/spending_by_category/<x>/` exists only for the categories USAspending
   publishes (naics, recipient, awarding_agency, psc, …). It has no pricing or
   set-aside member: this file asked for
   `/spending_by_category/contract_pricing_type_codes/` and got HTTP 404 HTML on
   every single call since the day it shipped. `post()` logs a non-OK response
   and returns null, the caller mapped null to `[]`, and `[]` is a completely
   plausible answer for a breakdown — so nothing ever looked wrong. Measured
   2026-08-12: contract_type_breakdown was `[]` in 33 of 33 production rows,
   beside agency_breakdown holding 9-10 and state_breakdown holding 10.

   Both ARE expressible as filters, so the distribution is built by asking the
   NAICS total question once per bucket. Cost: one request per bucket per
   (naics, FY).

   RECONCILIATION IS THE POINT, and it is why these two are shaped differently.
   An unrecognised filter code is not rejected either — it simply matches
   nothing and returns $0 — so a mistyped or missing code silently removes money
   from the chart. The only defence is to check the buckets against the
   independently-fetched total, which is why both functions return `total` and
   `unaccounted` alongside the buckets. */

const PRICING_FAMILIES: Array<{ name: string; codes: string[] }> = [
  // FAR Part 16 families. Codes verified against live data 2026-08-12; the four
  // families summed to the unfiltered NAICS total exactly ($0.00 delta).
  { name: "Fixed price", codes: ["A", "B", "J", "K", "L", "M"] },
  { name: "Cost reimbursement", codes: ["R", "S", "T", "U", "V"] },
  { name: "Time & materials / labor hour", codes: ["Y", "Z"] },
  { name: "Other or combination", codes: ["1", "2", "3"] }
];

const SET_ASIDE_FAMILIES: Array<{ name: string; codes: string[] }> = [
  { name: "Small business set-aside", codes: ["SBA", "SBP"] },
  { name: "8(a)", codes: ["8A", "8AN"] },
  { name: "SDVOSB", codes: ["SDVOSBC", "SDVOSBS"] },
  { name: "WOSB / EDWOSB", codes: ["WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"] },
  { name: "HUBZone", codes: ["HZC", "HZS"] },
  // "NO SET ASIDE USED" is an explicit recorded value and is NOT the same thing
  // as the field being blank — see `unaccounted` on the return type.
  { name: "No set-aside used", codes: ["NONE"] }
];

export interface FacetMix {
  buckets: Array<{ name: string; amount: number }>;
  /** The same NAICS total the buckets are filtered subsets of, fetched without
   *  any facet filter. Present so a reader can verify rather than trust. */
  total: number | null;
  /** total - the sum of the buckets. Carried, never folded into a bucket. */
  unaccounted: number | null;
}

async function facetMix(
  f: Filters,
  key: "contract_pricing_type_codes" | "set_aside_type_codes",
  families: Array<{ name: string; codes: string[] }>
): Promise<FacetMix> {
  const [total, ...amounts] = await Promise.all([
    fetchTotalObligations(f),
    ...families.map(async (fam) => {
      const d = await post<{ results: CategoryResult[] }>("/search/spending_by_category/naics/", {
        filters: { ...baseFilters(f), [key]: fam.codes },
        limit: 1
      });
      // No results row means no money matched, which is a real $0 — distinct
      // from a failed request, which post() has already logged and which also
      // lands here as 0. The `unaccounted` field is what surfaces the second
      // case: a dropped request shows up as money the buckets cannot explain.
      return d?.results?.[0]?.amount ?? 0;
    })
  ]);
  // Negative buckets are REAL — a net deobligation. Measured on 332710 FY2026:
  // partial small-business set-aside (SBP) came to -$228,000. Not clamped here;
  // a renderer that cannot draw a negative bar has to say so itself.
  const buckets = families.map((fam, i) => ({ name: fam.name, amount: amounts[i] }));
  const summed = buckets.reduce((a, b) => a + b.amount, 0);
  return { buckets, total, unaccounted: total == null ? null : total - summed };
}

export function fetchPricingMix(f: Filters): Promise<FacetMix> {
  return facetMix(f, "contract_pricing_type_codes", PRICING_FAMILIES);
}

/* Set-aside does NOT reconcile, and that is a finding rather than a bug.
   Measured on 332710 FY2026: every named family plus NONE summed to $22.18M
   against a $30.00M total, leaving $7.81M — 26% — in awards carrying no
   set-aside value at all. That is normal for delivery orders and BPA calls,
   where the set-aside is recorded on the parent IDV and not repeated on the
   order. It is emphatically NOT "no set-aside used": NONE is separately $13.3M,
   so folding the blanks into it would have overstated open-market spend by 59%.
   The residual stays in `unaccounted` for the renderer to label honestly. */
export function fetchSetAsideMix(f: Filters): Promise<FacetMix> {
  return facetMix(f, "set_aside_type_codes", SET_ASIDE_FAMILIES);
}

/** Retained name — the stored column is `contract_type_breakdown` and this is
 *  what fills it. Now returns the pricing families that endpoint never did. */
export async function fetchContractTypeBreakdown(f: Filters): Promise<Array<{ name: string; amount: number }>> {
  const mix = await fetchPricingMix(f);
  return mix.buckets.filter((b) => b.amount !== 0).sort((a, b) => b.amount - a.amount);
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

export interface RecompeteOpts {
  /** Contract types to consider. Verified against the live API 2026-08-12 —
   *  A=BPA CALL, B=PURCHASE ORDER, C=DELIVERY ORDER, D=DEFINITIVE CONTRACT. */
  awardTypes?: string[];
  /** How far back on action_date to look for "still active" evidence. */
  lookbackDays?: number;
}

export async function fetchRecompetes(
  f: Filters,
  minDays: number,
  maxDays: number,
  opts: RecompeteOpts = {}
): Promise<RecompeteRow[]> {
  const awardTypes = opts.awardTypes ?? ["A", "B", "C", "D"];
  // THE LOOKBACK AND THE WINDOW ARE COUPLED, and getting that wrong returns an
  // empty list rather than an error. The lookback bounds the candidate set to
  // contracts with recent obligation activity; the window then selects from it.
  // Push the window far enough out and a short lookback simply cannot reach it:
  // measured 2026-08-12, definitive contracts at 365-548 days returned 0 rows
  // on 336411, 336412 AND 332710 under the 90-day lookback, and 23 / 18 / 1
  // under 365. An empty radar reads as "nothing coming", so the failure is
  // silent and it is worse than a crash. Callers asking for a distant window
  // must widen this to match.
  const lookbackDays = opts.lookbackDays ?? 90;
  const today = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const actionStart = new Date(today.getTime() - lookbackDays * 86400_000);
  const minMs = today.getTime() + minDays * 86400_000;
  const maxMs = today.getTime() + maxDays * 86400_000;
  const out: RecompeteRow[] = [];

  for (let page = 1; page <= RECOMPETE_MAX_PAGES; page++) {
    const d = await post<{ results: Array<Record<string, unknown>>; page_metadata?: { hasNext?: boolean } }>(
      "/search/spending_by_award/",
      {
        filters: {
          naics_codes: [f.naics],
          award_type_codes: awardTypes,
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

/* THE RECOMPETE WINDOW — definitive contracts, 12 to 18 months out.
   The existing 90/180-day columns are not this, and never were. Two things were
   wrong with them and only one is about timing.

   WHAT IT LOOKED AT. Measured 2026-08-12 across five NAICS codes, 48 rows in the
   180-day window: 26 delivery orders (54%), 14 purchase orders (29%), 1 BPA call
   and 7 definitive contracts (15%). A delivery order ending is the parent IDIQ
   placing its next order — no competition, nothing to bid on. On 336412 it was 8
   of 8 non-recompetable, showing GE and StandardAero orders expiring on schedule
   as though they were opportunity. Restricting to "D" is what makes the row mean
   something a bidder can act on.

   WHEN IT LOOKED. A recompete is solicited 12-18 months before the incumbent
   expires, so a 90/180-day window lands after the solicitation has dropped and
   often after award. It was pointed at the wrong end of the timeline — and at
   the opposite end from the upstream-signal claim the product is sold on.

   ⚠ The 365-day lookback is not a spare knob. Under the inherited 90-day default
   this window returns ZERO rows on every code tested. See fetchRecompetes.

   ⛔ STILL NOT COMPLETE, and the gap is IDVs. A recompeted IDIQ is the largest
   opportunity in this market and it does not appear here: IDV award types are
   IDV_A…IDV_E, outside the A-D contract set, and their expiry behaves
   differently (an IDV's ceiling can be reached before its end date). That is a
   separate query and a separate ruling, not something to fold in silently. */
export function fetchUpcomingRecompetes(f: Filters): Promise<RecompeteRow[]> {
  return fetchRecompetes(f, 365, 548, { awardTypes: ["D"], lookbackDays: 365 });
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

/* NO `set_aside` AND NO `pricing` FIELD HERE, AND THEY CANNOT BE ADDED BACK.
   Both were requested from `spending_by_award` as "Set Aside Type" and
   "Contract Award Type", and both were dead on arrival:

   1. `spending_by_award` does not return set-aside or pricing type at all. Its
      documented contract field list has neither. The trap is that the endpoint
      does NOT reject an unknown field name — it returns the row with that key
      set to null. Verified 2026-08-12 by asking it for an INVENTED field,
      "Pricing Type", which came back null exactly like "Set Aside Type" did. So
      "the value is null" was never evidence about the data; it was evidence the
      name was not recognised. Every award would have carried "".
   2. `pricing` read "Contract Award Type" — the same key `award_type` reads. It
      would have held DEFINITIVE CONTRACT / PURCHASE ORDER / DELIVERY ORDER /
      BPA CALL, which is the award CATEGORY. A pricing type is FIRM FIXED PRICE
      or COST PLUS FIXED FEE. The field would have been a duplicate under a name
      that made it a taxonomy error.

   Both facts ARE recoverable, just not per award: they exist as FILTERS, so the
   distribution is fetched by faceting in fetchPricingMix / fetchSetAsideMix
   above. That is where they live now. */
export interface AwardRecord {
  award_id: string;
  recipient: string;
  amount: number;
  agency: string;
  sub_agency: string;
  award_type: string;
  start_date: string;
  end_date: string;
}

export interface AwardSample {
  /** Largest-first, capped at AWARD_SAMPLE_MAX.
   *
   *  ⛔ `amount` IS THE AWARD'S LIFETIME VALUE, NOT FISCAL-YEAR OBLIGATIONS, and
   *  the two sit one field apart in the same stored row. Measured 2026-08-12:
   *  the largest FY2026 award on 336412 is RTX N0001920C0011 at $7.50B, against
   *  `total_obligations` of $4.99B for that entire NAICS and year — one award
   *  "worth" 150% of the market containing it. It is a 2019 award still drawing
   *  obligations, and its value spans every year it runs.
   *
   *  So these amounts MUST NOT be summed, shown as a share of total_obligations,
   *  or ranked beside it. They answer "how big is a single deal in this market"
   *  — the question the recipient totals aggregate away — and nothing else. */
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
        // Documented contract fields ONLY. An undocumented name is not rejected —
        // it comes back null — so asking for one buys a column of "" and the
        // false impression that the data is empty. See the AwardRecord note.
        fields: [
          "Award ID", "Recipient Name", "Award Amount", "Awarding Agency",
          "Awarding Sub Agency", "Contract Award Type", "Start Date", "End Date"
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
        // "Contract Award Type" is the documented contract field and the only one
        // that answers; "" means the record did not say, never a guessed default.
        award_type: String(r["Contract Award Type"] ?? ""),
        start_date: String(r["Start Date"] ?? ""),
        end_date: String(r["End Date"] ?? "")
      });
    }
    if (!d?.page_metadata?.hasNext) break;
    if (out.length >= AWARD_SAMPLE_MAX) { truncated = true; break; }
  }
  return { awards: out, sampled: out.length, cap: AWARD_SAMPLE_MAX, truncated };
}
