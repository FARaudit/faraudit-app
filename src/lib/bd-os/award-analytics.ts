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
  awards?: AwardRecord[] | null;
  sampled?: number | null;
  cap?: number | null;
  truncated?: boolean | null;
}

const nums = (aw: AwardRecord[]) =>
  aw.map((a) => Number(a.amount) || 0).filter((n) => n > 0).sort((a, b) => a - b);

/** Linear-interpolated percentile on a sorted ascending array. */
function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
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
  return {
    count: s.length,
    min: s[0],
    p25,
    median: pct(s, 0.5),
    p75,
    max: s[s.length - 1],
    inBand: p25 == null || p75 == null ? 0 : s.filter((n) => n >= p25 && n <= p75).length,
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

export interface PrimeTarget {
  recipient: string;
  /** Combined LIFETIME value of that prime's qualifying awards in the sample. */
  value: number;
  contracts: number;
  agencies: string[];
  largest: number;
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
  const m = new Map<string, PrimeTarget & { agencySet: Set<string> }>();
  let excluded = 0;
  for (const a of aw) {
    const amount = Number(a.amount) || 0;
    if (amount < SUBCONTRACT_PLAN_THRESHOLD) continue;
    const key = normaliseRecipient(a.recipient);
    if (!key) continue;
    if (sb.has(key)) { excluded++; continue; }
    const cur = m.get(key) || {
      recipient: a.recipient, value: 0, contracts: 0, agencies: [], largest: 0,
      agencySet: new Set<string>()
    };
    cur.value += amount;
    cur.contracts += 1;
    cur.largest = Math.max(cur.largest, amount);
    if (a.sub_agency) cur.agencySet.add(a.sub_agency);
    m.set(key, cur);
  }
  const primes = [...m.values()]
    .map(({ agencySet, ...p }) => ({ ...p, agencies: [...agencySet].sort() }))
    .sort((a, b) => b.value - a.value || b.contracts - a.contracts);
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
  let dated = 0, total = 0, q4 = 0;
  for (const a of aw) {
    const d = String(a.start_date || "");
    const cal = Number(d.slice(5, 7));
    if (!(cal >= 1 && cal <= 12)) continue;   // undated rows contribute nothing
    const fm = ((cal - 10 + 12) % 12) + 1;
    const slot = months[fm - 1];
    const amount = Number(a.amount) || 0;
    slot.count += 1; slot.value += amount;
    dated++; total += amount;
    if (cal >= 7 && cal <= 9) q4 += amount;   // fiscal Q4 = Jul/Aug/Sep
  }
  if (!dated) return null;
  const peak = months.reduce<SeasonalityMonth | null>(
    (best, m) => (!best || m.value > best.value ? m : best), null);
  return {
    months,
    q4Share: total > 0 ? (q4 / total) * 100 : null,
    peak: peak && peak.value > 0 ? peak : null,
    truncated: sample?.truncated === true
  };
}
