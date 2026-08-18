// MONEY UNITS — opaque wrappers, because a comment is not a guard.
//
// WHAT WENT WRONG. This tab's payload carries money in TWO units and nothing declared which:
// `BY_FY.*` totals are MILLIONS, `AWARD_ANALYTICS.*` amounts are RAW DOLLARS. A $90.76B figure was
// printed beside a $30.06B headline because a lifetime award value in dollars was formatted by a
// helper that assumes millions. The caption was fixed; the ambiguity was not.
//
// A WARNING SAT AT THE TOP OF award-analytics.ts SAYING EXACTLY THIS, and the file violated it thirty
// lines down. That is the whole argument for these types: the invariant has to be something the
// compiler can check, not something a reader has to remember.
//
// WHY OPAQUE AND NOT A BRAND. A brand is `number & { tag }`. It blocks assignment and it blocks
// passing the wrong one to a function — but `a + b` still compiles, because both operands are still
// `number` and TypeScript checks `+` on the underlying primitive. Since the defect WAS an addition
// across units, a brand would not have caught it. These are objects, so `dollars + millions` is
// "Operator '+' cannot be applied" — a hard error, which is what was asked for. The cost is that
// arithmetic must go through the helpers below, and that cost is the point.
//
// THE WIRE STAYS NUMBERS. Nothing here changes the JSON shape. `wire()` is the single, deliberate
// exit from the type system, and the payload carries a `units` manifest so the browser — which is
// plain JavaScript and gets no help from any of this — is told rather than left to guess.

declare const UNIT: unique symbol;

/** A quantity of money that knows its unit. Not a number: that is the point. */
export interface Money<U extends string> {
  readonly [UNIT]: U;
  /** The magnitude. Reach for this only inside this module or at `wire()`. */
  readonly n: number;
}

/** Raw dollars, as USAspending stores them and as `award_sample` carries them. */
export type Dollars = Money<"dollars">;
/** Millions of dollars — what `BY_FY` and every derived total put on the wire. */
export type Millions = Money<"millions">;

/** The unit names that may appear in a payload manifest. */
export type UnitName = "dollars" | "millions";

// ── constructors ─────────────────────────────────────────────────────────────
// A non-finite input is 0, not NaN. NaN propagates silently through every sum
// and lands on the page as an empty string or "$NaN"; a zero is visibly wrong.
const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

export const dollars = (n: number): Dollars => ({ n: finite(n) } as unknown as Dollars);
export const millions = (n: number): Millions => ({ n: finite(n) } as unknown as Millions);

/** The ONLY conversion. There is deliberately no `toDollars`: nothing in this
 *  codebase needs to go back, and offering it would invite a round trip that
 *  loses nothing numerically but everything in intent. */
export const toMillions = (d: Dollars): Millions => millions(d.n / 1_000_000);

// ── arithmetic, same-unit only ───────────────────────────────────────────────
// Each is monomorphic on purpose. A single generic `add<U>(a: Money<U>, b: Money<U>)`
// would let TypeScript widen U to `"dollars" | "millions"` and accept the mix —
// the exact call these types exist to reject.
export const addD = (a: Dollars, b: Dollars): Dollars => dollars(a.n + b.n);
export const addM = (a: Millions, b: Millions): Millions => millions(a.n + b.n);
export const sumD = (xs: readonly Dollars[]): Dollars => xs.reduce(addD, dollars(0));
export const sumM = (xs: readonly Millions[]): Millions => xs.reduce(addM, millions(0));
export const maxD = (a: Dollars, b: Dollars): Dollars => (a.n >= b.n ? a : b);

/** Share of one amount in another, as a percentage. Null when the denominator
 *  is zero or negative — a share of nothing is unknown, never 0%. */
export const pctOfD = (part: Dollars, whole: Dollars): number | null =>
  whole.n > 0 ? (part.n / whole.n) * 100 : null;
export const pctOfM = (part: Millions, whole: Millions): number | null =>
  whole.n > 0 ? (part.n / whole.n) * 100 : null;

export const gtD = (a: Dollars, b: Dollars): boolean => a.n > b.n;
export const gteD = (a: Dollars, b: Dollars): boolean => a.n >= b.n;
/** Descending — largest first, which is what every panel on this tab wants. */
export const cmpD = (a: Dollars, b: Dollars): number => b.n - a.n;
export const cmpM = (a: Millions, b: Millions): number => b.n - a.n;
/** Ascending. Named rather than written as `-cmpD(a, b)`, which reads as a bug. */
export const ascD = (a: Dollars, b: Dollars): number => a.n - b.n;

/** Linear interpolation BETWEEN TWO AMOUNTS IN THE SAME UNIT — percentiles.
 *  `t` is a fraction, not money, so it stays a plain number. */
export const lerpD = (a: Dollars, b: Dollars, t: number): Dollars =>
  dollars(a.n + (b.n - a.n) * t);
/** Multiply by a plain factor. A count or a fraction is not money and must not
 *  be wrapped — `scaleD(total, 0.5)` is half the money, `addD` would be nonsense. */
export const scaleD = (a: Dollars, k: number): Dollars => dollars(a.n * k);

// ── the wire ─────────────────────────────────────────────────────────────────
/** Leave the type system. Every call site is a place where a unit stops being
 *  checked, so they are meant to be few and to sit at the payload boundary. */
export const wire = <U extends string>(m: Money<U>): number => m.n;
export const wireOrNull = <U extends string>(m: Money<U> | null): number | null => (m ? m.n : null);

/** What unit each money-bearing branch of the payload is in. Shipped WITH the
 *  payload: the browser is plain JavaScript and none of the above reaches it, so
 *  the only thing that can stop the next mis-format is the payload saying so. */
export type UnitManifest = Readonly<Record<string, UnitName>>;
