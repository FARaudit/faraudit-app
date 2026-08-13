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
import { awardSizeDistribution, primeSubcontractTargets, seasonality, ceilingHeadroom } from "./award-analytics";
import { naicsTitle } from "../naics-titles";
import { parseAwardSample } from "./award-analytics";
import type { UnitManifest } from "./money";
import type { AwardSample, RawAwardSample, SizeDistribution, PrimeTargets, Seasonality, CeilingHeadroom } from "./award-analytics";

export interface NamedAmount { name: string; amount: number }
export interface StateAmount { state: string; amount: number }
export interface RecompeteRow {
  agency: string | null;
  amount: number | null;
  award_id: string | null;
  end_date: string | null;
  recipient: string | null;
  /** The buying office that signed. NULL on rows written before the worker
   *  started capturing it, and null is a real state the page states rather than
   *  fills in. It is the join key to the contracting-officer directory. */
  office?: string | null;
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
  // Buying offices INSIDE a department. NULL = never pulled. Migration 035.
  sub_agency_breakdown: NamedAmount[] | null;
  state_breakdown: StateAmount[] | null;
  recompetes_expiring_180d: RecompeteRow[] | null;
  // Definitive contracts ending 365-548 days out — the window a recompete is
  // actually solicited in. NULL means the worker has never pulled it, which is
  // NOT the same as a market with no recompetes; see RECOMPETES_MEASURED.
  recompetes_upcoming: RecompeteRow[] | null;
  // The 500 largest awards for this (code, year). Everything the recipient
  // TOTALS aggregate away — a single deal's size, its buying office, when it
  // started. NULL means never pulled.
  // RAW shape — plain numbers, exactly as the JSONB column holds them. It becomes
  // typed money only through parseAwardSample(); typing this field as the parsed
  // shape would let the `as unknown as IntelRow[]` cast below smuggle unwrapped
  // numbers past every unit check in the file.
  award_sample: RawAwardSample | null;
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
  // `sb: null` = the feed supplied no small-business list for this code, which
  // is NOT the same as 'not a small business'.
  incumbents: Array<{ name: string; val: number; naics: string; sb: boolean | null }>;
  /** The same view, scoped to one NAICS. Keyed by code. */
  byCode: Record<string, {
    total: number; sb: number; sb_pct: number | null;
    states: FyView["states"];
    agencies: FyView["agencies"];
    incumbents: FyView["incumbents"];
  }>;
}

export interface SpendingPayload {
  state: "ok";
  as_of: string | null;
  window_note: string;
  coverage: { requested: string[]; tracked: string[]; untracked: string[]; top_n: number };
  FYS: string[];
  BY_FY: Record<string, FyView>;
  /* `open` runs parallel to `labels`: true where that fiscal year is still
     running, so its figure is obligations TO DATE rather than a full year. The
     panel drawing this series reports every code roughly halving between the
     last two labels, and under an unlabelled open year that reads as a collapse
     which has not happened. No new measurement — the builder already derives
     this for the KPI sub-line; the flag carries it to the panel that must
     state it, instead of leaving the panel to infer it from a sentence. */
  /** `titles` is the NAICS description per tracked code. A code is an identifier
   *  and tells a reader nothing about what is being bought; the title does. Null
   *  for a code the table does not name — never a guessed description. */
  MARKET_TREND: { labels: string[]; series: Record<string, number[]>; open: boolean[]; titles: Record<string, string | null> };
  RECOMPETES: Array<RecompeteRow & { naics: string; expired: boolean }>;
  /* FALSE means no row has ever carried recompetes_upcoming, so RECOMPETES is
     empty because nothing was MEASURED — not because the market is quiet. The
     panel's empty state says "nothing in your codes expires in this window",
     which is a claim about the market and would be a lie under a NULL column.
     Migration 034 drew this line in the schema; it has to survive to the page. */
  RECOMPETES_MEASURED: boolean;
  /* WHICH CODES ARE PINNED AT OUR OWN COLLECTION LIMIT. The worker stops
     collecting a code's recompetes at RECOMPETE_STORE_LIMIT rows, so a code
     sitting exactly on that number is reporting a CEILING, not a market. On this
     account two of three codes are pinned, and the worker's own measurement
     found roughly twice as many available in the same window.

     A page that foots those rows as a total states our loop bound as a finding.
     It is surfaced here rather than fixed by raising the limit, because raising
     it costs USAspending requests and this worker has already been IP-blocked
     once by a burst of them — and because a page that knows what it does not
     know can say so today, at no cost.

     ⛔ THE TRUE TOTAL IS NOT KNOWABLE HERE. Only the stored rows exist, so a
     surface may say "at least this many, and the list is capped" — it may NEVER
     print "10 of 23". Replacing our cap with a second invented number is the
     defect, not the cure. */
  RECOMPETES_AT_CAP: string[];
  RECOMPETE_STORE_LIMIT: number;
  /* Award-level views, per fiscal year: the size of a real deal, the primes
     carrying a subcontracting-plan obligation, and when the money moves. All
     three are DERIVED from the stored award_sample — no extra USAspending
     request, which matters because a burst of them is what got this worker
     IP-blocked on 2026-08-12. `null` for a year nothing was sampled in. */
  /* WHO ACTUALLY BUYS — one level below agency_breakdown. "Department of
     Defense" is a department containing the Navy, the Army, the Air Force and
     the Defense Logistics Agency, each with its own contracting offices and
     recompete cycle. `measured` is false when no row has ever carried the
     column, so a never-pulled market cannot render as one with no buyers. */
  BUYING_OFFICES: Record<string, {
    offices: Array<{ name: string; amount: number }>;
    measured: boolean;
    byCode: Record<string, Array<{ name: string; amount: number }>>;
  }>;
  AWARD_ANALYTICS: Record<string, {
    size: SizeDistribution | null;
    primes: PrimeTargets | null;
    season: Seasonality | null;
    /** Ceiling headroom — contract capacity that is never re-solicited. */
    ceilings: CeilingHeadroom | null;
    byCode: Record<string, {
      size: SizeDistribution | null;
      primes: PrimeTargets | null;
      season: Seasonality | null;
      ceilings: CeilingHeadroom | null;
    }>;
  }>;
  /** "Is there money here for a company my size?" — the share of each code that
   *  reaches small business, across every measured year. Computed from the two
   *  figures the table already stores per (code, year); no new source. */
  SB_SHARE: Array<{
    naics: string;
    points: Array<{ fy: string; pct: number | null; sb: number; total: number; open: boolean }>;
  }>;
  /** "How many people am I bidding against?" — what the largest recipients hold
   *  of each code's WHOLE total. The numerator is the top five the feed lists;
   *  the denominator is the code's real total, so the share is exact.
   *  `firms_below_unknown` is always true: the feed lists ten per code, so the
   *  NUMBER of firms under them is not knowable here and is never stated. */
  SB_WINNERS: Array<{
    naics: string; fy: string; sb_total: number; code_total: number;
    sb_pct: number | null; listed: number;
    winners: Array<{ name: string; val: number; pct_of_sb: number | null }>;
  }>;
  CONCENTRATION: Array<{
    naics: string;
    fy: string;
    top5_val: number;
    total: number;
    top5_pct: number | null;
    listed: number;
    firms_below_unknown: true;
    leaders: Array<{ name: string; val: number; pct: number | null }>;
  }>;
  // Panels the stored table cannot support. Each names the measurement that is
  // missing, so the page says what is not connected instead of rendering blank.
  unsupported: Array<{ panel: string; needs: string }>;
  /* ⛔ WHICH UNIT EACH MONEY BRANCH IS IN. This payload carries BOTH — derived
     totals in MILLIONS, award-level figures in RAW DOLLARS — and until this
     existed nothing said so. A raw dollar figure formatted by a helper that
     assumes millions printed $90.76B beside a $30.06B headline.

     The server is unit-safe by type (see ./money): mixing them is a compile
     error. The BROWSER is plain JavaScript and gets none of that, so the only
     thing that can stop the next mis-format is the payload declaring itself.
     Every money-bearing top-level branch appears here — `_units-manifest`
     enforces it, and a new branch fails that gate rather than shipping silent. */
  units: UnitManifest;
}

export type SpendingResult =
  | SpendingPayload
  | { state: "no-profile-codes" }
  | { state: "no-rows"; requested: string[] };

const TOP_N = 10;

/* ⛔ THIS NUMBER LIVES IN TWO PLACES AND THEY ARE TWO RULES UNTIL A GATE SAYS
   OTHERWISE. The value is enforced by the WORKER — `agents/defense-spending/
   usaspending.ts` returns as soon as `out.length >= 10` — and this module cannot
   import from `agents/`, so it is restated here to let a reader tell a full list
   from a truncated one. `test/public/_recompete-cap-surfaced.test.ts` greps the
   worker for the same number and fails if the two drift. */
export const RECOMPETE_STORE_LIMIT = 10;

/* ⛔ THE UNIT OF EVERY MONEY BRANCH ON THE WIRE. Derived totals are converted to
   millions by toM(); award-level branches are passed through in the raw dollars
   USAspending stores. Both are correct; carrying both undeclared is what was
   not. Add a money branch to SpendingPayload and `_units-manifest` fails until
   its unit is named here. */
export const PAYLOAD_UNITS: UnitManifest = {
  BY_FY: "millions",
  MARKET_TREND: "millions",
  SB_SHARE: "millions",
  SB_WINNERS: "millions",
  CONCENTRATION: "millions",
  AWARD_ANALYTICS: "dollars",
  BUYING_OFFICES: "dollars",
  RECOMPETES: "dollars"
};

const fyLabel = (fy: number) => `FY${fy}`;
const toM = (dollars: number) => dollars / 1_000_000;

/** Panels whose measurement this table does not carry. Named rather than left
 *  blank: "no source" and "no obligations" are different facts. */
/** One legal entity, one key. USAspending does not normalise recipient names, so
 *  the same company arrives as "HUNTINGTON INGALLS INCORPORATED" and "HUNTINGTON
 *  INGALLS INC". Only the corporate-form suffixes are stripped — nothing that
 *  could merge two genuinely different firms. */
export function recipientKey(name: string): string {
  return String(name || "")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/&/g, " AND ")
    .replace(/\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LLC|L L C|LP|LLP|LTD|PLC|OY|AB|GMBH|SA|NV|BV)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* No panel on this tab now claims a source it does not have. The two macro
 * panels were deleted on CEO ruling (they needed sources not scoped to the
 * customer's codes), and the two that blamed the obligations feed for lacking
 * award-level data are gone too — Opportunity Matrix because Concentration
 * answers its question more simply, Pricing Intelligence because it was replaced
 * by the set-aside winners the feed already carried.
 *
 * Kept as an EMPTY array rather than removed from the payload: the honest-fail
 * mechanism is the best thing on this tab and the next unbuilt panel should
 * declare itself here rather than render blank. */
const UNSUPPORTED: SpendingPayload["unsupported"] = [];

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
        "agency_breakdown,sub_agency_breakdown,state_breakdown,recompetes_expiring_180d,recompetes_upcoming,award_sample,yoy_delta_pct,refreshed_at"
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

  // `code` scopes every aggregate to ONE NAICS. The three codes on this account
  // behave like three different markets — 332710 runs 30% small business with the
  // top five holding 35%, 336412 runs 0.4% with the top five holding 91% — so an
  // aggregate across them describes none of them. Every helper below takes the
  // filter so the scoped view is derived the same way the total is, rather than
  // being a second implementation that can disagree with it.
  const rowsFor = (fy: number, code?: string) =>
    rows.filter((r) => r.fiscal_year === fy && (!code || r.naics_code === code));
  const totalFor = (fy: number, code?: string) => rowsFor(fy, code).reduce((a, r) => a + (r.total_obligations || 0), 0);
  const sbFor = (fy: number, code?: string) => rowsFor(fy, code).reduce((a, r) => a + (r.sb_obligations || 0), 0);

  // Per-FY totals in $M — the spark under every KPI, and the only series the
  // trend panel draws. Three closed-or-open fiscal years, no projected fourth.
  const totalsM = years.map((fy) => toM(totalFor(fy)));
  const sbPctSeries = years.map((fy) => {
    const t = totalFor(fy);
    return t > 0 ? (sbFor(fy) / t) * 100 : 0;
  });

  // ── states ──
  const statesFor = (fy: number, code?: string) => {
    const acc = new Map<string, number>();
    for (const r of rowsFor(fy, code)) {
      for (const s of r.state_breakdown || []) {
        if (!s?.state) continue;
        acc.set(s.state, (acc.get(s.state) || 0) + (s.amount || 0));
      }
    }
    return acc;
  };

  // ── agencies: one row per agency, with its per-NAICS split for the treemap ──
  const agenciesFor = (fy: number, code?: string) => {
    const acc = new Map<string, { name: string; val: number; naics: Record<string, number> }>();
    for (const r of rowsFor(fy, code)) {
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

  // The federal year runs 1 Oct - 30 Sep, so the year containing the refresh
  // date is still accumulating. Everything that compares one year with another
  // has to know which one that is.
  const asOfDate = new Date(asOf || Date.now());
  const currentFy = asOfDate.getUTCMonth() >= 9 ? asOfDate.getUTCFullYear() + 1 : asOfDate.getUTCFullYear();

  /** Recipients for one (year, code-or-all), merged so one legal entity is one
   *  row. Shared by the aggregate view and every per-code view, so a code's
   *  incumbent list can never be built a different way from the total's. */
  function incumbentsFor(fy: number, code?: string): FyView["incumbents"] {
    const merged = new Map<string, { name: string; val: number; naics: string; sb: boolean | null }>();
    for (const r of rowsFor(fy, code)) {
      const sbList = r.sb_recipients || [];
      const sbKnown = sbList.length > 0;
      const sbNames = new Set(sbList.map((x) => recipientKey(x.name || "")));
      for (const t of r.top_recipients || []) {
        if (!t?.name) continue;
        const key = `${recipientKey(t.name)}|${r.naics_code}`;
        const hit = merged.get(key);
        const isSb = sbKnown ? sbNames.has(recipientKey(t.name)) : null;
        if (hit) {
          hit.val += toM(t.amount || 0);
          if (t.name.length > hit.name.length) hit.name = t.name;
          if (isSb === true) hit.sb = true;
          else if (hit.sb === null) hit.sb = isSb;
        } else {
          merged.set(key, { name: t.name, val: toM(t.amount || 0), naics: r.naics_code, sb: isSb });
        }
      }
    }
    return Array.from(merged.values()).sort((a, b) => b.val - a.val);
  }

  /** The small businesses actually winning in each code — the feed's own
   *  set-aside recipient list, which was already stored and only ever used to
   *  flag rows in the incumbent table. On this account it holds ten per code.
   *
   *  This is the reader's real peer set: the incumbent list is who he subs to,
   *  this is who he competes with, and the two answer different questions. */
  const SB_WINNERS = years.length
    ? tracked.map((code) => {
        const fy = years[years.length - 1];
        const r = rows.find((x) => x.naics_code === code && x.fiscal_year === fy);
        const merged = new Map<string, { name: string; val: number }>();
        for (const x of r?.sb_recipients || []) {
          if (!x?.name) continue;
          const k = recipientKey(x.name);
          const hit = merged.get(k);
          if (hit) { hit.val += x.amount || 0; if (x.name.length > hit.name.length) hit.name = x.name; }
          else merged.set(k, { name: x.name, val: x.amount || 0 });
        }
        const ranked = Array.from(merged.values()).sort((a, b) => b.val - a.val);
        const codeTotal = r?.total_obligations || 0;
        const sbTotal = r?.sb_obligations || 0;
        return {
          naics: code,
          fy: fyLabel(fy),
          sb_total: toM(sbTotal),
          code_total: toM(codeTotal),
          sb_pct: codeTotal > 0 ? (sbTotal / codeTotal) * 100 : null,
          listed: ranked.length,
          winners: ranked.map((x) => ({
            name: x.name,
            val: toM(x.val),
            // Share of the SMALL-BUSINESS pot, not of the code. A firm holding
            // 40% of the set-aside dollars in a $29M code is a different fact
            // from 40% of $29M, and conflating them overstates them by 3x.
            pct_of_sb: sbTotal > 0 ? (x.val / sbTotal) * 100 : null
          }))
        };
      })
    : [];

  const BY_FY: Record<string, FyView> = {};
  years.forEach((fy, idx) => {
    const label = fyLabel(fy);
    const openFy = fy >= currentFy;
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

    const incumbents = incumbentsFor(fy);
    const shownIncumbents = incumbents.slice(0, 20);
    const sbCounted = shownIncumbents.filter((i) => i.sb !== null).length;
    const sbYes = shownIncumbents.filter((i) => i.sb === true).length;

    const recompeteCount = rowsFor(fy).reduce((a, r) => a + (r.recompetes_expiring_180d || []).length, 0);

    BY_FY[label] = {
      kpis: [
        {
          label: "Obligated · your NAICS",
          val: (toM(total) / 1000).toFixed(2),
          unit: "B",
          sub: openFy
            ? `${tracked.length} tracked code${tracked.length === 1 ? "" : "s"} · ${label} to date`
            : `${tracked.length} tracked code${tracked.length === 1 ? "" : "s"} · ${label}`,
          // NO YEAR-OVER-YEAR ON AN OPEN YEAR. The stored total for the current
          // fiscal year is obligations TO DATE, and Q4 is the heaviest quarter
          // in the federal year — so dividing a part-year by a whole one printed
          // −43.1% beside $28.07B and read as a collapsing market. The feed
          // carries annual totals only, so a like-for-like part-year comparison
          // cannot be computed here; stating nothing is the honest option, and
          // the closed years still carry theirs.
          delta: openFy || yoy == null ? null : `${yoy >= 0 ? "+" : "−"}${Math.abs(yoy).toFixed(1)}%`,
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
        
      ],
      states,
      agencies,
      incumbents: shownIncumbents,
      // One entry per tracked code, built through the SAME helpers as the
      // aggregate above so a scoped view can never be derived differently from
      // the total it sits inside.
      byCode: Object.fromEntries(tracked.map((code) => {
        const cTotal = totalFor(fy, code);
        const cSb = sbFor(fy, code);
        const cStates: FyView["states"] = {};
        for (const [abbr, amount] of statesFor(fy, code)) {
          const meta = STATE_FIPS[abbr];
          if (!meta) continue;
          cStates[meta[0]] = { abbr, name: meta[1], val: toM(amount), yoy: null };
        }
        return [code, {
          total: toM(cTotal),
          sb: toM(cSb),
          sb_pct: cTotal > 0 ? (cSb / cTotal) * 100 : null,
          states: cStates,
          agencies: Array.from(agenciesFor(fy, code).values())
            .sort((a, b) => b.val - a.val)
            .map((a) => ({
              key: agencyKeyOf(a.name),
              short: AGENCY_SHORT[a.name] || a.name,
              name: a.name,
              val: toM(a.val),
              naics: Object.fromEntries(Object.entries(a.naics).map(([c, v]) => [c, toM(v)]))
            })),
          incumbents: incumbentsFor(fy, code).slice(0, 20)
        }];
      }))
    };
  });

  // ── recompetes: one flat list, DEDUPED, each marked against today ──
  //
  // The worker stores the answer on EVERY fiscal-year row — the question has no
  // fiscal year in it, so all three rows hold the same awards. Flattening them
  // gave the page each award three times: measured 39 entries, 13 distinct. An
  // award_id is unique, so it is the key.
  //
  // SOURCE CHANGED (card 828): recompetes_upcoming, not recompetes_expiring_180d.
  // The old column is "contracts expiring within 180 days", which is not a
  // recompete — measured across five codes, 85% of it was delivery and purchase
  // orders, and an order ending is the parent IDIQ placing its next one. The new
  // column is definitive contracts 365-548 days out. The old column is still
  // written and still stored; it simply no longer feeds this panel.
  const today = new Date().toISOString().slice(0, 10);
  // NULL and [] are different answers and the page must not conflate them. A
  // single row carrying a non-null array is enough to prove the worker has run.
  const RECOMPETES_MEASURED = rows.some((r) => Array.isArray(r.recompetes_upcoming));
  const byAward = new Map<string, RecompeteRow & { naics: string; expired: boolean }>();
  for (const r of rows) {
    for (const x of r.recompetes_upcoming || []) {
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

  /* Counted on the STORED array per code, before the cross-code dedupe above —
     the cap is applied per code by the worker, so that is the unit it has to be
     tested at. A code sitting exactly on the limit is at the ceiling; one below
     it was answered in full. */
  const RECOMPETES_AT_CAP = Array.from(
    new Set(
      rows
        .filter((r) => (r.recompetes_upcoming?.length ?? 0) >= RECOMPETE_STORE_LIMIT)
        .map((r) => r.naics_code)
    )
  ).sort();

  /* ── AWARD-LEVEL VIEWS (items 3, 4, 5 of the tab's path) ──────────────────
     Derived from the stored sample, so this costs ZERO USAspending requests.
     That is a deliberate constraint, not a convenience: a burst of ~800 calls
     in 24 seconds got this worker's IP blocked by USAspending's WAF on
     2026-08-12 and nulled 14 of 33 rows. Panels that can be computed from what
     is already stored are computed from what is already stored.

     Aggregating across codes CONCATENATES the samples rather than summing any
     derived figure — a median of medians is not a median. `truncated` ORs, so
     one capped code makes the aggregate honest about being a sample.
     Small-business names come from this code's own sb_recipients, which is why
     the prime filter is per-code before it is aggregated. */
  /* Buying offices, per fiscal year. Amounts SUM across codes because each is a
     dollar total for the same office over disjoint NAICS — unlike a median,
     which cannot be averaged. Sorted largest-first and capped, with the tail
     collapsed by the renderer rather than dropped here: a bar chart whose top
     and bottom differ by 118,000x is unreadable, but silently discarding the
     tail would misstate the market. */
  const BUYING_OFFICES: SpendingPayload["BUYING_OFFICES"] = {};
  for (const year of years) {
    const fy = fyLabel(year);
    const fyRows = rowsFor(year);
    const measured = fyRows.some((r) => Array.isArray(r.sub_agency_breakdown));
    const agg = new Map<string, number>();
    const byCode: Record<string, Array<{ name: string; amount: number }>> = {};
    for (const r of fyRows) {
      const list = r.sub_agency_breakdown || [];
      byCode[r.naics_code] = list.map((o) => ({ name: o.name, amount: o.amount }));
      for (const o of list) agg.set(o.name, (agg.get(o.name) || 0) + (o.amount || 0));
    }
    BUYING_OFFICES[fy] = {
      offices: [...agg.entries()].map(([name, amount]) => ({ name, amount }))
        .filter((o) => o.amount !== 0)
        .sort((a, b) => b.amount - a.amount),
      measured,
      byCode
    };
  }

  const AWARD_ANALYTICS: SpendingPayload["AWARD_ANALYTICS"] = {};
  for (const year of years) {
    const fy = fyLabel(year);
    const fyRows = rowsFor(year);
    const merged: AwardSample = { awards: [], sampled: 0, cap: null, truncated: false };
    const sbAll: string[] = [];
    const byCode: SpendingPayload["AWARD_ANALYTICS"][string]["byCode"] = {};
    for (const r of fyRows) {
      // THE PARSE BOUNDARY — raw JSONB in, typed money out, once per row. Every
      // read below is unit-checked, and nothing downstream can see a bare number
      // it might add into a millions total.
      const smp = parseAwardSample(r.award_sample);
      const sbNames = (r.sb_recipients || []).map((x) => x.name);
      sbAll.push(...sbNames);
      byCode[r.naics_code] = {
        size: awardSizeDistribution(smp),
        primes: primeSubcontractTargets(smp, sbNames),
        season: seasonality(smp),
        ceilings: ceilingHeadroom(smp)
      };
      if (smp?.ceilings && Array.isArray(smp.ceilings.rows)) {
        merged.ceilings = merged.ceilings || { rows: [], sampled: 0, cap: 0, unreadable: 0 };
        merged.ceilings.rows!.push(...smp.ceilings.rows);
        merged.ceilings.sampled = (merged.ceilings.sampled || 0) + (smp.ceilings.sampled || 0);
        merged.ceilings.unreadable = (merged.ceilings.unreadable || 0) + (smp.ceilings.unreadable || 0);
        /* THE CAP IS PER CODE, SO MERGING CODES MERGES CAPS. Carrying one code's
           cap across an aggregate of three printed "24 of at most 8" on the live
           panel — a number contradicting itself in the same sentence. */
        merged.ceilings.cap = (merged.ceilings.cap || 0) + (smp.ceilings.cap || 0);
      }
      if (smp && Array.isArray(smp.awards)) {
        merged.awards!.push(...smp.awards);
        merged.sampled = (merged.sampled || 0) + (smp.sampled || smp.awards.length);
        merged.cap = smp.cap ?? merged.cap;
        if (smp.truncated) merged.truncated = true;
      }
    }
    const any = (merged.awards || []).length > 0;
    AWARD_ANALYTICS[fy] = {
      size: any ? awardSizeDistribution(merged) : null,
      primes: any ? primeSubcontractTargets(merged, sbAll) : null,
      season: any ? seasonality(merged) : null,
      ceilings: ceilingHeadroom(merged),
      byCode
    };
  }

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
    ),
    // Same test the KPI sub-line uses, carried per label rather than buried in
    // a sentence, so the panel can mark the bar instead of guessing.
    open: years.map((fy) => fy >= currentFy),
    titles: Object.fromEntries(tracked.map((code) => [code, naicsTitle(code)]))
  };

  // ── SB share by code, every measured year ────────────────────────────────
  // The one number that answers "should I be here at all". Both figures are
  // already stored per (code, year); this only puts them side by side and keeps
  // the direction visible. `pct` is null when the code obligated nothing that
  // year — a 0% share of nothing is not a market that closed.
  const SB_SHARE = tracked.map((code) => ({
    naics: code,
    points: years.map((fy) => {
      const r = rows.find((x) => x.naics_code === code && x.fiscal_year === fy);
      const total = r?.total_obligations || 0;
      const sb = r?.sb_obligations || 0;
      return {
        fy: fyLabel(fy),
        pct: total > 0 ? (sb / total) * 100 : null,
        sb: toM(sb),
        total: toM(total),
        open: fy >= currentFy
      };
    })
  }));

  // ── Concentration ────────────────────────────────────────────────────────
  // What the largest recipients hold of the code's WHOLE total. This is exact:
  // the numerator is the feed's top five and the denominator is the code's own
  // stored total, not a sum of the rows we happen to hold.
  //
  // What it deliberately does NOT state is how many firms compete. The feed
  // lists ten recipients per code, so everything below tenth is invisible —
  // counting the visible ones would report our own cap as a market size, which
  // is the defect this tab already had on another panel.
  const CONCENTRATION = tracked.map((code) => {
    const fy = years[years.length - 1];
    const r = rows.find((x) => x.naics_code === code && x.fiscal_year === fy);
    const total = r?.total_obligations || 0;
    const merged = new Map<string, { name: string; val: number }>();
    for (const t of r?.top_recipients || []) {
      if (!t?.name) continue;
      const k = recipientKey(t.name);
      const hit = merged.get(k);
      if (hit) {
        hit.val += t.amount || 0;
        if (t.name.length > hit.name.length) hit.name = t.name;
      } else merged.set(k, { name: t.name, val: t.amount || 0 });
    }
    const ranked = Array.from(merged.values()).sort((a, b) => b.val - a.val);
    const top5 = ranked.slice(0, 5);
    const top5Val = top5.reduce((a, x) => a + x.val, 0);
    return {
      naics: code,
      fy: fyLabel(fy),
      top5_val: toM(top5Val),
      total: toM(total),
      top5_pct: total > 0 ? (top5Val / total) * 100 : null,
      listed: ranked.length,
      firms_below_unknown: true as const,
      leaders: top5.map((x) => ({
        name: x.name,
        val: toM(x.val),
        pct: total > 0 ? (x.val / total) * 100 : null
      }))
    };
  });

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
    RECOMPETES_AT_CAP,
    RECOMPETE_STORE_LIMIT,
    RECOMPETES_MEASURED,
    AWARD_ANALYTICS,
    BUYING_OFFICES,
    SB_SHARE,
    CONCENTRATION,
    SB_WINNERS,
    unsupported: UNSUPPORTED,
    units: PAYLOAD_UNITS
  };
}
