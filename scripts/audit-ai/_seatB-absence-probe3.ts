// SEAT B round 3 — isolate the MECHANISM of each root with matched near-miss pairs.
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
const doc = (n: string, b: string) => `==== DOCUMENT: ${n} ====\n${b}\n`;
const EXH1 = doc("Exhibit 1 - GFP.pdf", "X. ".repeat(300));
const EXHA = doc("Exhibit A - GFP.pdf", "X. ".repeat(300));
const PWS = doc("PWS KO Approved - 20260720.pdf", "P. ".repeat(300));
const pairs: Array<[string, string, string[]]> = [
  ["digit distinguisher", "Exhibit 2 is not provided.", ["Exhibit 1 - GFP.pdf"]],
  ["letter distinguisher", "Exhibit B is not provided.", ["Exhibit A - GFP.pdf"]],
  ["elided copula",  "The PWS is attached, the drawings not provided.", ["PWS KO Approved - 20260720.pdf"]],
  ["explicit copula","The PWS is attached, the drawings are not provided.", ["PWS KO Approved - 20260720.pdf"]],
  ["paren subject",  "(Drawings in the PWS) are not provided.", ["PWS KO Approved - 20260720.pdf"]],
  ["bare subject",   "Drawings in the PWS are not provided.", ["PWS KO Approved - 20260720.pdf"]],
];
for (const [label, claim, prov] of pairs) {
  const src = claim.includes("Exhibit 2") ? EXH1 : claim.includes("Exhibit B") ? EXHA : PWS;
  const r = reconcileAbsenceClaims([{ id: "x", requirement: claim }], src, new Set(prov), null);
  console.log(`${r.refuted.length ? "FIRED     " : "stood down"}  ${label.padEnd(20)} ${JSON.stringify(claim)}`);
}
