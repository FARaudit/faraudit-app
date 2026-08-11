// ━━ Defense Spending · the shape the page renders ━━
//
// Every figure here is read out of `defense_spending_intel`, which the
// agents/defense-spending worker builds from USAspending's award-search API.
// Nothing is modelled, projected, averaged or inferred. The panels this table
// cannot support are NOT filled with something plausible — they are named in
// `unsupported` and the page states which measurement is missing, because a
// panel that quietly renders empty and a panel that has no source look the same
// on screen and are not the same fact.
//
// Two limits are properties of the stored data, and both are carried to the
// client rather than smoothed over:
//   · Only the TOP TEN states, agencies and recipients are stored per
//     (NAICS, fiscal year). A state absent from the map is not a state with
//     zero obligations — it is a state outside its code's top ten.
//   · The rows carry a `refreshed_at`. The two closed fiscal years are final;
//     the open one is obligations-to-date AS OF that timestamp. The page states
//     the date rather than implying the number is today's.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface NamedAmount { name: string; amount: number }
export interface StateAmount { state: string; amount: number }
export interface RecompeteRow {
  agency: string | null;
  amount: number | null;
  award_id: string | null;
  end_date: string | null;
  recipient: string | null;
}

interface IntelRow {
  naics_code: string;
  fiscal_year: number;
  total_obligations: number | null;
  sb_obligations: number | null;
  sb_pct: number | null;
  top_recipients: NamedAmount[] | null;
  sb_recipients: NamedAmount[] | null;
  agency_breakdown: NamedAmount[] | null;
  state_breakdown: StateAmount[] | null;
  recompetes_expiring_180d: RecompeteRow[] | null;
  yoy_delta_pct: number | null;
  refreshed_at: string | null;
}

// USPS abbreviation → FIPS id + name. The choropleth keys on FIPS because that
// is what the us-atlas topology uses; this is a fixed public mapping, not data.
const STATE_FIPS: Record<string, [string, string]> = {
  AL: ["01", "Alabama"], AK: ["02", "Alaska"], AZ: ["04", "Arizona"], AR: ["05", "Arkansas"],
  CA: ["06", "California"], CO: ["08", "Colorado"], CT: ["09", "Connecticut"], DE: ["10", "Delaware"],
  DC: ["11", "District of Columbia"], FL: ["12", "Florida"], GA: ["13", "Georgia"], HI: ["15", "Hawaii"],
  ID: ["16", "Idaho"], IL: ["17", "Illinois"], IN: ["18", "Indiana"], IA: ["19", "Iowa"],
  KS: ["20", "Kansas"], KY: ["21", "Kentucky"], LA: ["22", "Louisiana"], ME: ["23", "Maine"],
  MD: ["24", "Maryland"], MA: ["25", "Massachusetts"], MI: ["26", "Michigan"], MN: ["27", "Minnesota"],
  MS: ["28", "Mississippi"], MO: ["29", "Missouri"], MT: ["30", "Montana"], NE: ["31", "Nebraska"],
  NV: ["32", "Nevada"], NH: ["33", "New Hampshire"], NJ: ["34", "New Jersey"], NM: ["35", "New Mexico"],
  NY: ["36", "New York"], NC: ["37", "North Carolina"], ND: ["38", "North Dakota"], OH: ["39", "Ohio"],
  OK: ["40", "Oklahoma"], OR: ["41", "Oregon"], PA: ["42", "Pennsylvania"], RI: ["44", "Rhode Island"],
  SC: ["45", "South Carolina"], SD: ["46", "South Dakota"], TN: ["47", "Tennessee"], TX: ["48", "Texas"],
  UT: ["49", "Utah"], VT: ["50", "Vermont"], VA: ["51", "Virginia"], WA: ["53", "Washington"],
  WV: ["54", "West Virginia"], WI: ["55", "Wisconsin"], WY: ["56", "Wyoming"]
};

// Short labels for the agencies USAspending actually returns on these codes.
// A name with no entry keeps its full name — an invented acronym would be a
// fact about the agency that we made up to save horizontal space.
const AGENCY_SHORT: Record<string, string> = {
  "Department of Defense": "DoD",
  "Department of Homeland Security": "DHS",
  "Department of Veterans Affairs": "VA",
  "Department of Transportation": "DOT",
  "Department of Commerce": "Commerce",
  "Department of the Interior": "Interior",
  "Department of Justice": "DOJ",
  "Department of Energy": "DOE",
  "Department of State": "State",
  "Department of Agriculture": "USDA",
  "Department of Health and Human Services": "HHS",
  "General Services Administration": "GSA",
  "National Aeronautics and Space Administration": "NASA",
  "Social Security Administration": "SSA"
};

export function agencyKeyOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface KpiCard {
  label: string;
  val: string;
  unit: string;
  sub: string;
  delta: string | null;
  tone: "accent" | "green" | "amber";
  spark: number[];
}

export interface FyView {
  kpis: KpiCard[];
  states: Record<string, { abbr: string; name: string; val: number; yoy: number | null }>;
  agencies: Array<{ key: string; short: string; name: string; val: number; naics: Record<string, number> }>;
  incumbents: Array<{ name: string; val: number; naics: string; sb: boolean }>;
}

export interface SpendingPayload {
  state: "ok";
  as_of: string | null;
  window_note: string;
  coverage: { requested: string[]; tracked: string[]; untracked: string[]; top_n: number };
  FYS: string[];
  BY_FY: Record<string, FyView>;
  MARKET_TREND: { labels: string[]; series: Record<string, number[]> };
  RECOMPETES: Array<RecompeteRow & { naics: string; expired: boolean }>;
  // Panels the stored table cannot support. Each names the measurement that is
  // missing, so the page says what is not connected instead of rendering blank.
  unsupported: Array<{ panel: string; needs: string }>;
}

export type SpendingResult =
  | SpendingPayload
  | { state: "no-profile-codes" }
  | { state: "no-rows"; requested: string[] };

const TOP_N = 10;

const fyLabel = (fy: number) => `FY${fy}`;
const toM = (dollars: number) => dollars / 1_000_000;

/** Panels whose measurement this table does not carry. Named rather than left
 *  blank: "no source" and "no obligations" are different facts. */
const UNSUPPORTED: SpendingPayload["unsupported"] = [
  {
    panel: "opportunity-matrix",
    needs: "the number of firms competing per segment and the dollars per award — neither is in the obligations feed"
  },
  {
    panel: "budget-trajectory",
    needs: "the enacted DoD topline by year and its continuing-resolution status — a budget source, not an obligations one"
  },
  {
    panel: "pricing",
    needs: "award-level contract values, to distribute them — the feed stores recipient totals, not individual awards"
  },
  {
    panel: "ndaa",
    needs: "the NDAA provision text for the current authorization — no legislative source is connected"
  }
];

export async function fetchDefenseSpending(
  client: SupabaseClient,
  naicsCodes: string[]
): Promise<SpendingResult> {
  const requested = naicsCodes.map((c) => String(c).trim()).filter(Boolean);
  if (requested.length === 0) return { state: "no-profile-codes" };

  const { data, error } = await client
    .from("defense_spending_intel")
    .select(
      "naics_code,fiscal_year,total_obligations,sb_obligations,sb_pct,top_recipients,sb_recipients," +
        "agency_breakdown,state_breakdown,recompetes_expiring_180d,yoy_delta_pct,refreshed_at"
    )
    .in("naics_code", requested);
  if (error) throw new Error(`defense_spending_intel read failed: ${error.message}`);

  const rows = (data || []) as unknown as IntelRow[];
  if (rows.length === 0) return { state: "no-rows", requested };

  const tracked = Array.from(new Set(rows.map((r) => r.naics_code))).sort();
  const untracked = requested.filter((c) => !tracked.includes(c)).sort();
  const years = Array.from(new Set(rows.map((r) => r.fiscal_year))).sort((a, b) => a - b);
  const FYS = years.map(fyLabel);
  const asOf = rows
    .map((r) => r.refreshed_at)
    .filter((t): t is string => !!t)
    .sort()
    .pop() ?? null;

  const rowsFor = (fy: number) => rows.filter((r) => r.fiscal_year === fy);
  const totalFor = (fy: number) => rowsFor(fy).reduce((a, r) => a + (r.total_obligations || 0), 0);
  const sbFor = (fy: number) => rowsFor(fy).reduce((a, r) => a + (r.sb_obligations || 0), 0);

  // Per-FY totals in $M — the spark under every KPI, and the only series the
  // trend panel draws. Three closed-or-open fiscal years, no projected fourth.
  const totalsM = years.map((fy) => toM(totalFor(fy)));
  const sbPctSeries = years.map((fy) => {
    const t = totalFor(fy);
    return t > 0 ? (sbFor(fy) / t) * 100 : 0;
  });

  // ── states ──
  const statesFor = (fy: number) => {
    const acc = new Map<string, number>();
    for (const r of rowsFor(fy)) {
      for (const s of r.state_breakdown || []) {
        if (!s?.state) continue;
        acc.set(s.state, (acc.get(s.state) || 0) + (s.amount || 0));
      }
    }
    return acc;
  };

  // ── agencies: one row per agency, with its per-NAICS split for the treemap ──
  const agenciesFor = (fy: number) => {
    const acc = new Map<string, { name: string; val: number; naics: Record<string, number> }>();
    for (const r of rowsFor(fy)) {
      for (const a of r.agency_breakdown || []) {
        if (!a?.name) continue;
        const cur = acc.get(a.name) || { name: a.name, val: 0, naics: {} };
        cur.val += a.amount || 0;
        cur.naics[r.naics_code] = (cur.naics[r.naics_code] || 0) + (a.amount || 0);
        acc.set(a.name, cur);
      }
    }
    return acc;
  };

  const BY_FY: Record<string, FyView> = {};
  years.forEach((fy, idx) => {
    const label = fyLabel(fy);
    const total = totalFor(fy);
    const prev = idx > 0 ? totalFor(years[idx - 1]) : null;
    const yoy = prev && prev > 0 ? ((total - prev) / prev) * 100 : null;
    const sbPct = total > 0 ? (sbFor(fy) / total) * 100 : 0;

    const cur = statesFor(fy);
    const prevStates = idx > 0 ? statesFor(years[idx - 1]) : null;
    const states: FyView["states"] = {};
    for (const [abbr, amount] of cur) {
      const meta = STATE_FIPS[abbr];
      if (!meta) continue; // territories and APO codes have no place on a US map
      const before = prevStates?.get(abbr);
      states[meta[0]] = {
        abbr,
        name: meta[1],
        val: toM(amount),
        // A state absent from the prior year's top ten has no comparable base,
        // so its change is unknown — null, never 0%.
        yoy: before && before > 0 ? ((amount - before) / before) * 100 : null
      };
    }

    const agencies = Array.from(agenciesFor(fy).values())
      .sort((a, b) => b.val - a.val)
      .map((a) => ({
        key: agencyKeyOf(a.name),
        short: AGENCY_SHORT[a.name] || a.name,
        name: a.name,
        val: toM(a.val),
        naics: Object.fromEntries(Object.entries(a.naics).map(([c, v]) => [c, toM(v)]))
      }));

    // Recipients, with the small-business flag taken from the feed's own SB
    // recipient list for the same code — not guessed from the company name.
    const incumbents: FyView["incumbents"] = [];
    for (const r of rowsFor(fy)) {
      const sbNames = new Set((r.sb_recipients || []).map((s) => (s.name || "").toUpperCase()));
      for (const t of r.top_recipients || []) {
        if (!t?.name) continue;
        incumbents.push({
          name: t.name,
          val: toM(t.amount || 0),
          naics: r.naics_code,
          sb: sbNames.has(t.name.toUpperCase())
        });
      }
    }
    incumbents.sort((a, b) => b.val - a.val);
    // ONE list, counted once. The KPI beside this panel used to count DISTINCT
    // NAMES while the panel rendered ROWS, and USAspending lists the same
    // recipient more than once when it holds separate award records — so the
    // card read 9 above a table of 10. A number stated beside a panel has to be
    // the panel's own number.
    const shownIncumbents = incumbents.slice(0, 20);

    const recompeteCount = rowsFor(fy).reduce((a, r) => a + (r.recompetes_expiring_180d || []).length, 0);

    BY_FY[label] = {
      kpis: [
        {
          label: "Obligated · your NAICS",
          val: (toM(total) / 1000).toFixed(2),
          unit: "B",
          sub: `${tracked.length} tracked code${tracked.length === 1 ? "" : "s"} · ${label}`,
          delta: yoy == null ? null : `${yoy >= 0 ? "+" : "−"}${Math.abs(yoy).toFixed(1)}%`,
          tone: "accent",
          spark: totalsM
        },
        {
          label: "To small business",
          val: sbPct.toFixed(1),
          unit: "%",
          sub: `$${(toM(sbFor(fy)) / 1000).toFixed(2)}B of $${(toM(total) / 1000).toFixed(2)}B`,
          delta: null,
          tone: sbPct >= 20 ? "green" : "amber",
          spark: sbPctSeries
        },
        {
          label: "Top recipients listed",
          val: String(shownIncumbents.length),
          unit: "",
          sub: `${shownIncumbents.filter((i) => i.sb).length} of them small business`,
          delta: null,
          tone: "accent",
          spark: []
        },
        {
          label: "Awards ending ≤180d",
          val: String(recompeteCount),
          unit: "",
          sub: "recompete candidates in the feed",
          delta: null,
          tone: recompeteCount > 0 ? "amber" : "accent",
          spark: []
        }
      ],
      states,
      agencies,
      incumbents: shownIncumbents
    };
  });

  // ── recompetes: one flat list, DEDUPED, each marked against today ──
  //
  // The worker asks USAspending for awards ending in the next 180 days and
  // stores the answer on EVERY fiscal-year row — the question has no fiscal
  // year in it, so all three rows hold the same awards. Flattening them gave
  // the page each award three times: measured 39 entries, 13 distinct. An
  // award_id is unique, so it is the key.
  const today = new Date().toISOString().slice(0, 10);
  const byAward = new Map<string, RecompeteRow & { naics: string; expired: boolean }>();
  for (const r of rows) {
    for (const x of r.recompetes_expiring_180d || []) {
      const key = x.award_id || `${x.recipient}|${x.end_date}|${x.amount}`;
      if (byAward.has(key)) continue;
      byAward.set(key, {
        ...x,
        naics: r.naics_code,
        // The window was cut 180 days from refreshed_at, so part of it is now in
        // the past. Saying which is the difference between a live radar and a
        // list that quietly aged.
        expired: !!x.end_date && x.end_date < today
      });
    }
  }
  const RECOMPETES = Array.from(byAward.values())
    .sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));

  const MARKET_TREND = {
    labels: FYS,
    series: Object.fromEntries(
      tracked.map((code) => [
        code,
        years.map((fy) => {
          const r = rows.find((x) => x.naics_code === code && x.fiscal_year === fy);
          return r ? toM(r.total_obligations || 0) : 0;
        })
      ])
    )
  };

  return {
    state: "ok",
    as_of: asOf,
    window_note:
      "Fiscal years run 1 October to 30 September. The two closed years are final; the open year is obligations to date.",
    coverage: { requested, tracked, untracked, top_n: TOP_N },
    FYS,
    BY_FY,
    MARKET_TREND,
    RECOMPETES,
    unsupported: UNSUPPORTED
  };
}
