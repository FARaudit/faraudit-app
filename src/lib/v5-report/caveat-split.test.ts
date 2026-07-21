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

// ── (Design flag, PR #266) continuation-merge: a clause with an INTERNAL semicolon stays one bullet ──
{
  const r = "…confirm each before bidding: FAR 52.219-14 Limitations on Subcontracting: the prime must self-perform at least 50% of the work; it will not pay more than 50% to non-similarly-situated subs.; Active, unrestricted license for RN; Beta requirement text";
  const { caveats } = splitCaveatRationale(r);
  assert(caveats.length === 3, `52.219-14 internal ';' does not split the clause: 3 items (got ${caveats.length})`);
  assert(/self-perform at least 50% of the work; it will not pay/.test(caveats[0]), "continuation re-joined into one whole clause");
  assert(!caveats.some((c) => /^[a-z]/.test(c)), "no lowercase-leading orphan bullet");
}

// ── (Design flag) paren balance: a dangling open paren is closed ──
{
  const r = "…confirm each before bidding: Item ending mid-paren (unclosed tail; Beta requirement text; Gamma requirement text";
  const { caveats } = splitCaveatRationale(r);
  const o = (caveats[0].match(/\(/g) || []).length, c = (caveats[0].match(/\)/g) || []).length;
  assert(o === c && caveats[0].endsWith(")"), "dangling open paren balanced with a closing paren");
}

// ── (Design flag) signature dedup: a REWORDED set-aside restatement folds (not just exact) ──
{
  const r = "…confirm each before bidding: Total Small Business Set-Aside under NAICS 561320 (Temporary Help Services) with a $34 million size standard. Only small business may quote.; FAR 52.219-14 Limitations on Subcontracting: prime self-performs 50 percent.; Total Small Business Set-Aside under NAICS 561320 (Temporary Help Services), size standard $34 million. Offeror must qualify as small.; Active license for Registered Nurse";
  const { caveats } = splitCaveatRationale(r);
  const setaside = caveats.filter((c) => /total small business set-?aside/i.test(c)).length;
  assert(setaside === 1, `reworded set-aside restatement folded into one (got ${setaside})`);
  assert(caveats.length === 3, `4 raw → 3 distinct after signature dedup (got ${caveats.length})`);
}

// ── over-collapse GUARD: distinct licensure gates are NEVER folded by the signature ──
{
  const r = "…confirm each before bidding: Active, unrestricted state license for Registered Nurse II (if RN labor category used); Active, unrestricted license for LPN (if LPN labor category used); Active, unrestricted license as Clinical Psychologist (if CMHC labor category used); Beta requirement text";
  const { caveats } = splitCaveatRationale(r);
  assert(caveats.length === 4, `RN / LPN / Psychologist kept distinct (got ${caveats.length})`);
}

// ── empty / null ──
assert(splitCaveatRationale("").caveats.length === 0 && splitCaveatRationale(null).lede === "", "empty/null safe");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
