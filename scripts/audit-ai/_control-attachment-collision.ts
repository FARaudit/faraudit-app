// Seat C (different model, premise-free) found: parenthetical stripping discards the ATTACHMENT NUMBER, which is
// the only thing distinguishing two same-named documents — so a true claim about Attachment 0009 gets refuted off
// Attachment 0002. It tested main. Does the affirmative rewrite on the branch close it?
import { reconcileAbsenceClaims as MAIN } from "../../src/lib/audit-absence-reconcile";
import { reconcileAbsenceClaims as BRANCH } from "./_branch-reconcile";

const SRC = [
  "==== DOCUMENT: WAGE DETERMINATIONS - 20260513.pdf ====",
  "This is the full body of Wage Determination (Attachment 0002), covering the janitorial labor category at the primary site. Rates: SCA WD 2015-4281 Rev 23.",
].join("\n");
const PROV = new Set(["WAGE DETERMINATIONS - 20260513.pdf"]);
const CASES = [
  ["TRUE absence of a DIFFERENT attachment (must NOT refute)", "Wage Determination (Attachment 0009) is referenced but not provided in the assigned source — rates for the electrical labor category at the annex site are unknown."],
  ["TRUE absence, no attachment number (must NOT refute — 0009 is absent)", "Wage Determination for the annex site is not provided — rates unknown."],
  ["the real false claim it targets (SHOULD refute)", "Wage Determination (Attachment 0002) is referenced but not reproduced — SCA rates are unknown."],
];
for (const [label, claim] of CASES) {
  const m = MAIN([{ id: "x", requirement: claim }], SRC, PROV, null).refuted.length;
  const b = BRANCH([{ id: "x", requirement: claim }], SRC, PROV, null).refuted.length;
  console.log(`  main=${m ? "REFUTES" : "stands down"}  branch=${b ? "REFUTES" : "stands down"}   ${label}`);
}
