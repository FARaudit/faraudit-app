// $0 regression lock for the CODE-TO-SOLICITATION SCOPE CHECK (src/lib/audit-naics-scope.ts).
// Run: npx tsx src/lib/audit-naics-scope.test.ts
//
// THE THREE WAYS THIS FEATURE GOES WRONG, and every one of them is silent:
//   • IT BECOMES A BAR. A declared NAICS list is self-asserted marketing. If OUT_OF_SCOPE ever reads as a
//     disqualifier, the engine tells an eligible firm it cannot bid work it lawfully bids every day. The module
//     must emit no eligibility token of any kind — nothing a bar could consume.
//   • PREFIX MATCHING. "23731" must not match "237310", and "237310" must not be satisfied by "2373". Federal
//     text defeats substring comparison; the engine has already been bitten by that class.
//   • SILENT "IN SCOPE" ON MISSING DATA. A package with no code, or a profile with no codes, must be UNKNOWN and
//     say so. Reading absence as agreement is exactly how this drifted unnoticed for months.
// Fixture codes are the REAL corpus: 237310 is the 55-document Fort Bliss paving flagship, 336611 the Puget
// Sound barge job, 561730 the landscaping packages, 332710/336412 the profile's original aerospace codes.
import { checkNaicsScope, type NaicsScopeResult } from "./audit-naics-scope";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

const PROFILE = ["332710", "336412", "336611", "237310", "561730"];   // the profile as written 2026-08-22
const OLD     = ["332710", "336412", "336611"];                       // the profile as it was

console.log("── the corpus, against the profile BEFORE it was corrected");
{
  ok("paving flagship 237310 was OUT_OF_SCOPE", checkNaicsScope("237310", OLD).verdict === "OUT_OF_SCOPE");
  ok("landscaping 561730 was OUT_OF_SCOPE", checkNaicsScope("561730", OLD).verdict === "OUT_OF_SCOPE");
  ok("barge 336611 was IN_SCOPE", checkNaicsScope("336611", OLD).verdict === "IN_SCOPE");
  ok("3 of the 4 families were outside the profile", ["237310", "561730", "336611", "561730"].filter((c) => checkNaicsScope(c, OLD).verdict !== "IN_SCOPE").length === 3);
}

console.log("── the same corpus, against the profile AS WRITTEN — every family now in scope");
for (const c of ["237310", "561730", "336611", "332710", "336412"])
  ok(`${c} ⇒ IN_SCOPE`, checkNaicsScope(c, PROFILE).verdict === "IN_SCOPE");

console.log("── IT IS NOT A BAR — the result carries nothing a verdict could consume");
{
  const r: NaicsScopeResult = checkNaicsScope("237310", OLD);
  const keys = Object.keys(r).sort().join(",");
  ok(`shape is exactly the advisory shape (${keys})`, keys === "addCode,adjacent,declared,disclosure,solicitationNaics,verdict");
  const blob = JSON.stringify(r).toLowerCase();
  for (const forbidden of ["ineligible", "no_bid", "disqualif", "eligible", "satisfiedattributes", "attr", "bar"])
    ok(`emits no "${forbidden}" token`, !blob.includes(forbidden));
  ok("the disclosure says out-of-scope does not stop a bid", r.disclosure.includes("You can still bid it"));
}

console.log("── NO PREFIX MATCHING, in either direction");
{
  ok("5-digit declared does not satisfy a 6-digit package", checkNaicsScope("237310", ["23731"]).verdict === "UNKNOWN");
  ok("4-digit declared does not satisfy", checkNaicsScope("237310", ["2373"]).verdict === "UNKNOWN");
  ok("7-digit declared is not a code", checkNaicsScope("237310", ["2373100"]).verdict === "UNKNOWN");
  ok("a 5-digit package code is not a code", checkNaicsScope("23731", PROFILE).verdict === "UNKNOWN");
  ok("237310 vs 237320 share only 4 digits ⇒ OUT_OF_SCOPE, not ADJACENT", checkNaicsScope("237310", ["237320"]).verdict === "OUT_OF_SCOPE");
  ok("541511 vs declared 541512 (both under 54151) ⇒ ADJACENT", checkNaicsScope("541511", ["541512"]).verdict === "ADJACENT");
  ok("…and ADJACENT is never IN_SCOPE", checkNaicsScope("541511", ["541512"]).verdict !== "IN_SCOPE");
}

console.log("── ADJACENT is the 5-digit industry, never broader");
{
  const r = checkNaicsScope("541511", ["541512", "541330", "332710"]);
  ok("adjacent names only the same 5-digit industry", r.adjacent.join(",") === "541512");
  ok("541330 (same sector, different industry) is not adjacent", !r.adjacent.includes("541330"));
  ok("332710 (different sector) is not adjacent", !r.adjacent.includes("332710"));
  ok("a 4-digit-only relative is OUT_OF_SCOPE, not ADJACENT", checkNaicsScope("237310", ["237990"]).verdict === "OUT_OF_SCOPE");
}

console.log("── MISSING DATA IS UNKNOWN AND SAYS SO — never a silent pass");
for (const [sol, dec, why] of [
  [null, PROFILE, "no package code"],
  ["237310", [], "no declared codes"],
  ["237310", null, "declared is not an array"],
  [null, null, "neither side"],
  ["", PROFILE, "empty string code"],
  ["  ", PROFILE, "whitespace code"],
  ["n/a", PROFILE, "non-numeric code"],
] as Array<[unknown, unknown, string]>) {
  const r = checkNaicsScope(sol, dec);
  ok(`${why} ⇒ UNKNOWN`, r.verdict === "UNKNOWN");
  ok(`${why} ⇒ says so in words`, r.disclosure.length > 0 && !r.disclosure.includes("is on your profile"));
}

console.log("── normalization: input noise never changes the answer");
{
  ok("whitespace around a declared code is tolerated", checkNaicsScope("237310", [" 237310 "]).verdict === "IN_SCOPE");
  ok("numeric declared codes are tolerated", checkNaicsScope("237310", [237310 as unknown as string]).verdict === "IN_SCOPE");
  ok("duplicates collapse", checkNaicsScope("999999", ["237310", "237310"]).declared.length === 1);
  ok("garbage entries are dropped, not coerced", checkNaicsScope("999999", ["237310", null, {}, "abc"]).declared.join(",") === "237310");
  ok("declared order is preserved", checkNaicsScope("999999", PROFILE).declared.join(",") === PROFILE.join(","));
}

console.log("── addCode is the remedy, and only when there is one");
{
  ok("IN_SCOPE offers nothing to add", checkNaicsScope("237310", PROFILE).addCode === null);
  ok("OUT_OF_SCOPE offers the package's code", checkNaicsScope("237310", OLD).addCode === "237310");
  ok("ADJACENT offers the package's code", checkNaicsScope("541511", ["541512"]).addCode === "541511");
  ok("no package code ⇒ nothing to add", checkNaicsScope(null, PROFILE).addCode === null);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
