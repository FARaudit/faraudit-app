// Award-level analytics — derived from the STORED award_sample, no new requests.
//
// Three panels the recipient totals cannot answer, all computed from the same
// 500-largest sample the worker already writes: how big a deal is in this market,
// which primes carry a subcontracting-plan obligation, and when the money moves.
//
// ⛔ EVERY NUMBER HERE IS A STATEMENT ABOUT A SAMPLE OF THE LARGEST AWARDS, and
// the sample knows it — `sampled`, `cap` and `truncated` ride in the payload. A
// reader that presents these as the whole market is wrong, so every function
// returns `truncated` alongside its result and the renderers must print it.
//
// ⛔ `amount` IS LIFETIME AWARD VALUE, NOT FISCAL-YEAR OBLIGATIONS. The largest
// FY2026 award on 336412 is $7.50B against a $4.99B total for the entire code
// and year. Nothing here sums amounts against total_obligations or expresses one
// as a share of the other.
//
// THAT WARNING USED TO BE THE ONLY GUARD, and the file violated it thirty lines
// down. Every money value in here is now a `Dollars`, which is an OBJECT — so
// adding one to a `Millions` is `error TS2365`, not a plausible number. See
// `./money`. The exported result interfaces stay plain `number`, because they
// are the WIRE: the browser gets JSON, and wrapping them would change its shape.

import {
  dollars, sumD, addD, maxD, gtD, gteD, pctOfD, wire, wireOrNull,
  ascD, cmpD, lerpD, type Dollars
} from "./money";

/** What the `award_sample` JSONB column actually holds: plain numbers. */
export interface RawAwardRecord {
  award_id: string;
  recipient: string;
  amount: number;
  agency: string;
  sub_agency: string;
  award_type: string;
  start_date: string;
  end_date: string;
}

export interface AwardRecord extends Omit<RawAwardRecord, "amount"> {
  amount: Dollars;
}

export interface RawCeilingRow {
  award_id: string;
  contracts?: number;
  recipient: string;
  ceiling: number;
  obligated: number;
  headroom: number;
  subawarded: number | null;
  subaward_count: number | null;
}

export interface CeilingRow extends Omit<RawCeilingRow, "ceiling" | "obligated" | "headroom" | "subawarded"> {
  /** How many of this firm's awards the row folds together. 1 unless grouped. */
  contracts?: number;
  ceiling: Dollars;
  obligated: Dollars;
  headroom: Dollars;
  subawarded: Dollars | null;
}

interface CeilingBox<R> {
  rows?: R[] | null; sampled?: number | null; cap?: number | null; unreadable?: number | null;
}

/** The shape the database returns. Never used for arithmetic. */
export interface RawAwardSample {
  awards?: RawAwardRecord[] | null;
  ceilings?: CeilingBox<RawCeilingRow> | null;
  sampled?: number | null;
  cap?: number | null;
  truncated?: boolean | null;
}

export interface AwardSample {
  awards?: AwardRecord[] | null;
  ceilings?: CeilingBox<CeilingRow> | null;
  sampled?: number | null;
  cap?: number | null;
  truncated?: boolean | null;
}

/** THE PARSE BOUNDARY — the one place raw JSON becomes typed money. Everything
 *  downstream is unit-checked; nothing upstream is, so nothing upstream does
 *  arithmetic. A non-finite amount lands as $0 rather than NaN (see ./money). */
export function parseAwardSample(raw: RawAwardSample | null | undefined): AwardSample | null {
  if (!raw) return null;
  const awards = Array.isArray(raw.awards)
    ? raw.awards.map((a) => ({ ...a, amount: dollars(Number(a.amount)) }))
    : raw.awards ?? null;
  const c = raw.ceilings;
  const ceilings: CeilingBox<CeilingRow> | null = c
    ? {
        ...c,
        rows: Array.isArray(c.rows)
          ? c.rows.map((r) => ({
              ...r,
              ceiling: dollars(Number(r.ceiling)),
              obligated: dollars(Number(r.obligated)),
              headroom: dollars(Number(r.headroom)),
              subawarded: r.subawarded == null ? null : dollars(Number(r.subawarded))
            }))
          : c.rows ?? null
      }
    : c ?? null;
  return { ...raw, awards, ceilings };
}

const ZERO = dollars(0);
const nums = (aw: AwardRecord[]) =>
  aw.map((a) => a.amount).filter((d) => gtD(d, ZERO)).sort(ascD);

/** Linear-interpolated percentile on a sorted ascending array. */
function pct(sorted: Dollars[], p: number): Dollars | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : lerpD(sorted[lo], sorted[hi], i - lo);
}

/* ── 3 · AWARD-SIZE DISTRIBUTION ────────────────────────────────────────────
   ⛔ THE MEAN IS NOT REPORTED, and that is the whole point of the panel.
   Defense NAICS are bimodal: 336611 FY2026 runs a $150,310 Coast Guard
   electronics job in the same code as a $1.90B NASSCO shipbuilding contract, a
   12,600x spread. An average over that describes no award that exists and reads
   as a target the customer could aim at. The middle 50% — p25 to p75 — is a
   range real awards actually occupy. */
export interface SizeDistribution {
  count: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  /** How many awards fall inside p25..p75. Stated so the band is checkable. */
  inBand: number;
  truncated: boolean;
}

export function awardSizeDistribution(sample: AwardSample | null | undefined): SizeDistribution | null {
  const aw = sample?.awards;
  if (!Array.isArray(aw) || aw.length === 0) return null;
  const s = nums(aw);
  if (!s.length) return null;
  const p25 = pct(s, 0.25), p75 = pct(s, 0.75);
  // wire(): the result interface is plain `number` because it is serialised to
  // the browser. This is the boundary, and it is the only one in this function.
  return {
    count: s.length,
    min: wire(s[0]),
    p25: wireOrNull(p25),
    median: wireOrNull(pct(s, 0.5)),
    p75: wireOrNull(p75),
    max: wire(s[s.length - 1]),
    inBand: p25 == null || p75 == null ? 0 : s.filter((n) => gteD(n, p25) && gteD(p75, n)).length,
    truncated: sample?.truncated === true
  };
}

/* ── 4 · PRIME SUBCONTRACTING-PLAN TARGETS ──────────────────────────────────
   FAR 19.702: a contract over the subcontracting-plan threshold awarded to a
   large business requires an acceptable subcontracting plan with small-business
   goals. Those primes are LEGALLY MOTIVATED to find small subcontractors, which
   makes them the highest-conversion call list on the tab — and nobody sells it.

   ⛔ SMALL-BUSINESS PRIMES CARRY NO SUCH OBLIGATION and must be excluded, or the
   list tells the customer to call firms who have no reason to answer. We cannot
   determine size from an award record, so the ONLY exclusion applied is the one
   we can evidence: recipients on this code's own small-business recipient list.
   That is a partial filter and it says so — `unverifiedSize` counts the primes
   we could not check. It is not a claim that every remaining firm is large. */
export const SUBCONTRACT_PLAN_THRESHOLD = 750_000;
const THRESHOLD = dollars(SUBCONTRACT_PLAN_THRESHOLD);

/** Wire shape — plain numbers, raw dollars. */
export interface PrimeTarget {
  recipient: string;
  /** Combined LIFETIME value of that prime's qualifying awards in the sample. */
  value: number;
  contracts: number;
  agencies: string[];
  largest: number;
}

/** The same row while it is still being computed, with its units intact. */
interface PrimeAcc {
  recipient: string;
  value: Dollars;
  contracts: number;
  agencies: string[];
  largest: Dollars;
}

export interface PrimeTargets {
  primes: PrimeTarget[];
  threshold: number;
  /** Qualifying awards excluded because the recipient is a known small business. */
  excludedSmallBusiness: number;
  /** Primes kept whose size we could not verify either way. */
  unverifiedSize: number;
  truncated: boolean;
}

export function primeSubcontractTargets(
  sample: AwardSample | null | undefined,
  smallBusinessNames: string[] = []
): PrimeTargets | null {
  const aw = sample?.awards;
  if (!Array.isArray(aw) || aw.length === 0) return null;
  const sb = new Set(smallBusinessNames.map((n) => normaliseRecipient(n)));
  const m = new Map<string, PrimeAcc & { agencySet: Set<string> }>();
  let excluded = 0;
  for (const a of aw) {
    const amount = a.amount;
    if (!gteD(amount, THRESHOLD)) continue;
    const key = normaliseRecipient(a.recipient);
    if (!key) continue;
    if (sb.has(key)) { excluded++; continue; }
    const cur = m.get(key) || {
      recipient: a.recipient, value: ZERO, contracts: 0, agencies: [], largest: ZERO,
      agencySet: new Set<string>()
    };
    cur.value = addD(cur.value, amount);
    cur.contracts += 1;
    cur.largest = maxD(cur.largest, amount);
    if (a.sub_agency) cur.agencySet.add(a.sub_agency);
    m.set(key, cur);
  }
  const primes: PrimeTarget[] = [...m.values()]
    .sort((a, b) => cmpD(a.value, b.value) || b.contracts - a.contracts)
    .map(({ agencySet, value, largest, ...p }) => ({
      ...p, agencies: [...agencySet].sort(), value: wire(value), largest: wire(largest)
    }));
  return {
    primes,
    threshold: SUBCONTRACT_PLAN_THRESHOLD,
    excludedSmallBusiness: excluded,
    unverifiedSize: primes.length,
    truncated: sample?.truncated === true
  };
}

/* USAspending does NOT normalise recipient names — HUNTINGTON INGALLS
   INCORPORATED and HUNTINGTON INGALLS INC are two rows for one company, and
   counting them separately once put $7.36B (26% of a tab) under two names. Case,
   punctuation and the common suffixes are folded so one firm is one firm. */
export function normaliseRecipient(name: string): string {
  return String(name || "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LIMITED|LTD|LLC|LLP|LP|PLC)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── 5 · SEASONALITY ────────────────────────────────────────────────────────
   A hiring and material-purchase decision, not a chart. Federal buying clusters
   at fiscal year end because unobligated funds expire on 30 September.

   ⛔ COUNTED BY AWARD START MONTH, and biased: the sample is the LARGEST awards,
   so this is when big money moves, not when all money moves. `truncated` says so.
   Months with no awards are present with zero — an absent month would read as a
   gap in the data rather than a quiet month. */
export interface SeasonalityMonth {
  /** Federal fiscal month, 1 = October. */
  fiscalMonth: number;
  month: number;
  label: string;
  count: number;
  value: number;
}

export interface Seasonality {
  months: SeasonalityMonth[];
  /** Share of sampled value starting in the fiscal fourth quarter (Jul-Sep). */
  q4Share: number | null;
  peak: SeasonalityMonth | null;
  truncated: boolean;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function seasonality(sample: AwardSample | null | undefined): Seasonality | null {
  const aw = sample?.awards;
  if (!Array.isArray(aw) || aw.length === 0) return null;
  const months: SeasonalityMonth[] = Array.from({ length: 12 }, (_, i) => {
    // Fiscal month 1 = October (calendar 10). i is fiscal order.
    const cal = ((i + 9) % 12) + 1;
    return { fiscalMonth: i + 1, month: cal, label: MONTH_LABELS[cal - 1], count: 0, value: 0 };
  });
  const value: Dollars[] = months.map(() => ZERO);
  let dated = 0, total = ZERO, q4 = ZERO;
  for (const a of aw) {
    const d = String(a.start_date || "");
    const cal = Number(d.slice(5, 7));
    if (!(cal >= 1 && cal <= 12)) continue;   // undated rows contribute nothing
    const fm = ((cal - 10 + 12) % 12) + 1;
    months[fm - 1].count += 1;
    value[fm - 1] = addD(value[fm - 1], a.amount);
    dated++; total = addD(total, a.amount);
    if (cal >= 7 && cal <= 9) q4 = addD(q4, a.amount);   // fiscal Q4 = Jul/Aug/Sep
  }
  if (!dated) return null;
  months.forEach((m, i) => { m.value = wire(value[i]); });
  let peakIdx = -1;
  value.forEach((v, i) => { if (peakIdx < 0 || gtD(v, value[peakIdx])) peakIdx = i; });
  const peak = peakIdx >= 0 && gtD(value[peakIdx], ZERO) ? months[peakIdx] : null;
  return {
    months,
    q4Share: pctOfD(q4, total),
    peak,
    truncated: sample?.truncated === true
  };
}


/* ── 6 · CEILING vs OBLIGATED ───────────────────────────────────────────────
   The money already inside a contract that will never be re-solicited. A prime
   holding $40.78B of ceiling against $34.92B obligated can spend $5.86B more
   without any new competition — and a subcontractor already on that vehicle
   reaches it, while one waiting for a solicitation never sees it. Measured
   2026-08-12 across eight sampled 336611 awards: $31.96B of combined headroom.

   ⛔ A CAPPED SAMPLE OF THE LARGEST AWARDS, and it must say so. `unreadable`
   counts awards whose detail could not be fetched — carried so a short list
   reads as "we could not ask" rather than "these have no headroom". Zero
   headroom is a real and very different claim from unknown headroom.

   ⛔ NO MARGIN, NO COST, NO LABOUR RATES. USAspending does not carry them and
   never will. Headroom is contract capacity, NOT profit available to anyone. */
/** Wire shape of a ceiling row — plain numbers, raw dollars. */
export interface CeilingRowWire extends Omit<CeilingRow, "ceiling" | "obligated" | "headroom" | "subawarded"> {
  ceiling: number;
  obligated: number;
  headroom: number;
  subawarded: number | null;
}

export interface CeilingHeadroom {
  rows: CeilingRowWire[];
  totalCeiling: number;
  totalObligated: number;
  totalHeadroom: number;
  /** Awards in the sample that have already subcontracted, with the evidence. */
  subcontracting: number;
  /** Awards behind the rows. */
  sampled: number;
  /** Distinct firms after folding name spellings — what `rows` actually holds. */
  firms: number;
  cap: number | null;
  unreadable: number;
}

export function ceilingHeadroom(sample: AwardSample | null | undefined): CeilingHeadroom | null {
  const c = sample?.ceilings;
  const rows = Array.isArray(c?.rows) ? c!.rows! : [];
  if (!rows.length) return null;
  const sum = (f: (r: CeilingRow) => Dollars) => sumD(rows.map(f));

  /* GROUPED BY FIRM, and it has to be — the panel answers "who has room left",
     which is a question about a company, not about a contract. Rendered award by
     award it listed HUNTINGTON INGALLS INCORPORATED and HUNTINGTON INGALLS INC as
     two separate rows: the same $7.36B name split this file already has a
     normaliser for, reintroduced because that normaliser was applied to the prime
     list and not here. It also put Electric Boat on screen twice, which is
     truthful award-by-award and reads as duplication in a firm list. */
  const byFirm = new Map<string, CeilingRow & { contracts: number }>();
  for (const r of rows) {
    const key = normaliseRecipient(r.recipient);
    const cur = byFirm.get(key);
    if (!cur) {
      byFirm.set(key, { ...r, contracts: 1 });
      continue;
    }
    cur.ceiling = addD(cur.ceiling, r.ceiling);
    cur.obligated = addD(cur.obligated, r.obligated);
    cur.headroom = addD(cur.headroom, r.headroom);
    cur.contracts += 1;
    cur.subawarded = addD(cur.subawarded || ZERO, r.subawarded || ZERO);
    cur.subaward_count = (cur.subaward_count || 0) + (r.subaward_count || 0);
    // Keep the longer spelling: "INCORPORATED" over "INC" reads as the company.
    if (r.recipient.length > cur.recipient.length) cur.recipient = r.recipient;
  }

  return {
    // Largest headroom first — that is the reading the panel exists to give.
    rows: [...byFirm.values()]
      .sort((a, b) => cmpD(a.headroom, b.headroom))
      .map((r) => ({
        ...r,
        ceiling: wire(r.ceiling), obligated: wire(r.obligated),
        headroom: wire(r.headroom), subawarded: wireOrNull(r.subawarded)
      })),
    totalCeiling: wire(sum((r) => r.ceiling)),
    totalObligated: wire(sum((r) => r.obligated)),
    totalHeadroom: wire(sum((r) => r.headroom)),
    subcontracting: rows.filter((r) => (r.subaward_count || 0) > 0).length,
    /** AWARDS sampled, not firms — the cap is an award cap, so the two numbers
     *  have to be counted in the same unit or the caption contradicts itself. */
    sampled: rows.length,
    firms: byFirm.size,
    cap: c?.cap ?? null,
    unreadable: c?.unreadable ?? 0
  };
}
