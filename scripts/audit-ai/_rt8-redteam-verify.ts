// Verify the red-team's two P0s by EXECUTION against the shipped exports. A subagent's conclusion is a claim.
import { groundModalForce, FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "../../src/lib/audit-force-grounding";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";

console.log("P0-1 · line-broken source hides the obligating sentence from the subject scan");
const SRC = "SITE VISIT\nOfferors must attend on 13 August 2026.\nSubmit offers by 20 August.";
console.log("  sentences naming 'site visit':", JSON.stringify(I.sentencesNaming(SRC, "site visit")));
console.log("  does OBLIGATION_MARKER match the hidden line?", I.OBLIGATION_MARKER.test("Offerors must attend on 13 August 2026."));
const r1 = groundModalForce([{ id: "x", requirement: "Mandatory site visit on 13 August 2026.", excerpt: "SITE VISIT" }], SRC);
console.log("  gate fired:", r1.corrected.length === 1 ? "YES — softened a REAL obligation" : "no");
if (r1.corrected.length) console.log("  output:", String(r1.findings[0].requirement).slice(0, 190));

console.log("\nP0-1b · would adding `requirement` to condition 2 work? (red-team's proposed fix)");
console.log("  OBLIGATION_MARKER matches a bare fabricated requirement 'Mandatory site visit.':",
  I.OBLIGATION_MARKER.test("Mandatory site visit."), "  <- if true, that fix makes the gate INERT");

console.log("\nP0-2 · assertsDocAbsent refutes off a DIFFERENT artifact");
const ASRC = [
  "==== DOCUMENT: Solicitation - W91.pdf ====", "Section B", "x".repeat(300),
  "==== DOCUMENT: PWS KO Appropved - 20260720.pdf ====", "The contractor shall mow.", "y".repeat(300),
].join("\n");
const PROV = new Set(["PWS KO Appropved - 20260720.pdf"]);
for (const claim of [
  "Appendix C to the PWS is not attached — the inspection checklist is unavailable to bidders.",
  "The PWS, the QASP and the bonding certificate are not provided — pricing cannot be built.",
]) {
  const out = reconcileAbsenceClaims([{ id: "c", requirement: claim }], ASRC, PROV, null);
  console.log(`  ${out.refuted.length ? "REFUTED (deletes a true warning)" : "untouched"} :: ${claim.slice(0, 62)}`);
}
