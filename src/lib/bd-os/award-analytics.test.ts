// $0 REGRESSION for the three award-level derivations.
//
// Every number these produce gets PRINTED on /defense-spending, so each one is
// checked against a fixture whose right answer was computed by hand, not by
// running the code and blessing its output.
//
// Fixture: transcribed from the real 332710 / 336611 FY2026 award_sample, with
// the properties that broke things before deliberately preserved — a 12,600x
// value spread, a Huntington Ingalls name split across two spellings, and awards
// whose LIFETIME value exceeds the fiscal-year total of the code containing them.
//
// Run: npx tsx src/lib/bd-os/award-analytics.test.ts
import {
  awardSizeDistribution, primeSubcontractTargets, seasonality,
  normaliseRecipient, SUBCONTRACT_PLAN_THRESHOLD
} from "./award-analytics";
import type { AwardRecord, AwardSample } from "./award-analytics";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};
const near = (a: number | null, b: number, tol = 0.01) => a != null && Math.abs(a - b) <= tol;

const aw = (
  recipient: string, amount: number, start: string, sub_agency = "Department of the Navy"
): AwardRecord => ({
  award_id: `A${Math.round(amount)}`, recipient, amount, agency: "Department of Defense",
  sub_agency, award_type: "DEFINITIVE CONTRACT", start_date: start, end_date: "2027-09-30"
});

function main() {
  // ── 3 · SIZE DISTRIBUTION ─────────────────────────────────────────────────
  {
    // Nine values, chosen so every quartile is checkable by hand:
    // 100 200 300 400 500 600 700 800 900
    // p25 = index 2 = 300 · median = index 4 = 500 · p75 = index 6 = 700
    const s: AwardSample = {
      awards: [100, 900, 300, 700, 500, 200, 800, 400, 600].map((n, i) =>
        aw(`FIRM ${i}`, n, "2026-03-01")),
      sampled: 9, cap: 500, truncated: false
    };
    const d = awardSizeDistribution(s)!;
    assert(d.count === 9, "counts every positive award");
    assert(d.min === 100 && d.max === 900, "min and max are the real extremes");
    assert(near(d.p25, 300), `p25 = 300 (got ${d.p25})`);
    assert(near(d.median, 500), `median = 500 (got ${d.median})`);
    assert(near(d.p75, 700), `p75 = 700 (got ${d.p75})`);
    assert(d.inBand === 5, `5 of 9 awards fall inside p25..p75 (got ${d.inBand})`);

    // ⛔ THE MEAN MUST NOT BE REPORTED. A bimodal market's average describes no
    // award that exists. Structural check: no field on the result equals it.
    const real = [150310, 1895991038, 7122077, 14384084];
    const bimodal = awardSizeDistribution({
      awards: real.map((n, i) => aw(`F${i}`, n, "2026-03-01")), truncated: true
    })!;
    const mean = real.reduce((a, b) => a + b, 0) / real.length;
    assert(
      !Object.values(bimodal).some((v) => typeof v === "number" && near(v, mean, 1)),
      `no field carries the mean ($${Math.round(mean).toLocaleString()}) — it describes no real award`
    );
    assert(near(bimodal.median, (7122077 + 14384084) / 2),
      "the median sits between the two middle awards, not near the $1.9B outlier");
    assert(bimodal.truncated === true, "truncated rides along so no reader calls it the whole market");
    assert(awardSizeDistribution({ awards: [] }) === null, "an empty sample yields null, never a zeroed shape");
    assert(awardSizeDistribution(null) === null, "a missing sample yields null");
  }

  // ── 4 · PRIME SUBCONTRACTING TARGETS ──────────────────────────────────────
  {
    const s: AwardSample = {
      awards: [
        aw("HUNTINGTON INGALLS INCORPORATED", 5_000_000, "2026-02-01", "Department of the Navy"),
        aw("HUNTINGTON INGALLS INC", 2_360_000, "2026-05-01", "Department of the Army"),
        aw("ACMT, INC.", 3_389_832, "2026-03-01"),        // on the SB list → excluded
        aw("BIG PRIME CORP", 900_000, "2026-04-01"),
        aw("TINY AWARD LLC", 500_000, "2026-04-01")        // under threshold → out
      ],
      sampled: 5, cap: 500, truncated: true
    };
    const t = primeSubcontractTargets(s, ["ACMT, INC."])!;

    assert(t.threshold === SUBCONTRACT_PLAN_THRESHOLD && t.threshold === 750_000,
      "the FAR 19.702 threshold is stated, not implied");
    assert(!t.primes.some((p) => p.largest < 750_000),
      "no award under the threshold reaches the list — it carries no plan obligation");
    assert(!t.primes.some((p) => /ACMT/.test(p.recipient)),
      "a known small business is EXCLUDED — it has no subcontracting-plan obligation to sell to");
    assert(t.excludedSmallBusiness === 1, `the exclusion is counted, not silent (got ${t.excludedSmallBusiness})`);

    // The $7.36B lesson: two spellings of one company must be ONE row.
    const hi = t.primes.filter((p) => /HUNTINGTON/i.test(p.recipient));
    assert(hi.length === 1, `Huntington Ingalls is ONE prime, not two spellings (got ${hi.length})`);
    assert(hi[0].value === 7_360_000, `and its value is combined: $7,360,000 (got ${hi[0].value})`);
    assert(hi[0].contracts === 2, "with both contracts counted");
    assert(hi[0].agencies.length === 2, "and both buying agencies listed");
    assert(t.primes[0].recipient.includes("HUNTINGTON"), "ordered by combined value");
    assert(t.unverifiedSize === t.primes.length,
      "every kept prime is declared size-UNVERIFIED — we cannot prove any of them is large");
    assert(t.truncated === true, "truncation survives to the caller");
  }

  // ── normaliseRecipient ────────────────────────────────────────────────────
  {
    assert(normaliseRecipient("HUNTINGTON INGALLS INCORPORATED") === normaliseRecipient("HUNTINGTON INGALLS INC"),
      "INCORPORATED and INC fold together");
    assert(normaliseRecipient("ACMT, INC.") === normaliseRecipient("ACMT INC"),
      "punctuation does not split a firm");
    assert(normaliseRecipient("BETA ENGINEERING, INC.") !== normaliseRecipient("BETA SYSTEMS INC"),
      "genuinely different firms stay separate");
  }

  // ── 5 · SEASONALITY ───────────────────────────────────────────────────────
  {
    const s: AwardSample = {
      awards: [
        aw("A", 100, "2025-10-15"),   // Oct — fiscal month 1
        aw("B", 200, "2026-09-20"),   // Sep — fiscal month 12, Q4
        aw("C", 300, "2026-09-28"),   // Sep — Q4
        aw("D", 400, "2026-08-01"),   // Aug — Q4
        aw("E", 500, "")              // undated — must not become January
      ],
      sampled: 5, cap: 500, truncated: true
    };
    const q = seasonality(s)!;
    assert(q.months.length === 12, "all twelve months present — an absent month reads as missing data");
    assert(q.months[0].label === "Oct" && q.months[0].fiscalMonth === 1,
      "the fiscal year starts in October, not January");
    assert(q.months[11].label === "Sep", "and ends in September");
    assert(q.months[0].count === 1 && q.months[0].value === 100, "October carries its one award");
    const sep = q.months.find((m) => m.label === "Sep")!;
    assert(sep.count === 2 && sep.value === 500, "September combines both of its awards");
    assert(q.months.filter((m) => m.count === 0).length === 9, "quiet months are zero, not absent");

    // Undated rows are dropped, so totals must exclude the $500.
    // Q4 = Aug 400 + Sep 500 = 900 of 1000 dated = 90%.
    assert(near(q.q4Share, 90), `fiscal Q4 share = 90% (got ${q.q4Share})`);
    assert(q.peak?.label === "Sep", "September is the peak by value");
    const jan = q.months.find((m) => m.label === "Jan")!;
    assert(jan.count === 0, "the undated award did NOT land in January");
    assert(q.truncated === true, "biased-to-largest is declared");
    assert(seasonality({ awards: [aw("Z", 1, "")] }) === null,
      "a sample with no usable dates yields null rather than twelve zeroes");
  }

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
