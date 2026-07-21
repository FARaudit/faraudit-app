// CAVEAT NARRATIVE — top-N ranked, remainder grouped (card #612-(3c)).
// The self-clearable eligibility package inlined a ~50-item semicolon wall into the
// bottom line (LBJ 653570ea). splitCaveatRationale peels the lede from the list so the
// renderer shows a ranked top-5 with the remainder grouped; a normal sentence is untouched.
// Run: npx tsx src/lib/v5-report/caveat-split.test.ts
import { splitCaveatRationale } from "./core";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// ── package rationale: lede peeled, caveats enumerated + deduped ──
{
  const r = "⚠ ELIGIBILITY NOT VERIFIED — confirm X before relying. Self-clearable package — every requirement below is bidder-self-determinable; confirm each before bidding: Alpha item; Beta item; Alpha item; Gamma item; Delta item; Epsilon item; Zeta item";
  const { lede, caveats } = splitCaveatRationale(r);
  assert(/confirm each before bidding:$/.test(lede.trim()), "lede ends at the list intro (wall peeled off)");
  assert(!/Alpha item;.*Alpha item/.test(lede), "the wall is not left in the lede");
  assert(caveats.length === 6, `caveats de-duplicated: 7 raw → 6 distinct (got ${caveats.length})`);
  assert(caveats[0] === "Alpha item" && caveats[1] === "Beta item", "first-seen order preserved");
  assert(caveats.filter((c) => c === "Alpha item").length === 1, "exact restatement collapsed");
}

// ── normal single-sentence rationale: untouched, no false list ──
{
  const r = "A verified eligibility bar disqualifies this offeror. The sequence lands on Ineligible.";
  const { lede, caveats } = splitCaveatRationale(r);
  assert(lede === r && caveats.length === 0, "non-package rationale returned whole with empty caveats");
}

// ── degenerate: intro present but only one item → leave whole (not a real list) ──
{
  const r = "…confirm each before bidding: only one thing";
  const { caveats } = splitCaveatRationale(r);
  assert(caveats.length === 0, "single trailing item is not treated as a list");
}

// ── empty / null ──
assert(splitCaveatRationale("").caveats.length === 0 && splitCaveatRationale(null).lede === "", "empty/null safe");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
