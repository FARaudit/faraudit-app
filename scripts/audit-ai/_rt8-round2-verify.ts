// Verify the round-2 adversarial claims by executing the shipped code. Three paraphrases said to reopen both P0s.
import { groundModalForce, FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "../../src/lib/audit-force-grounding";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";

const ASRC = [
  "==== DOCUMENT: Solicitation - W91.pdf ====", "Section B", "x".repeat(300),
  "==== DOCUMENT: PWS KO Appropved - 20260720.pdf ====", "The contractor shall mow.", "y".repeat(300),
].join("\n");
const PROV = new Set(["PWS KO Appropved - 20260720.pdf"]);
const abs = (c: string) => reconcileAbsenceClaims([{ id: "c", requirement: c }], ASRC, PROV, null).refuted.length > 0;

console.log("A1 possessive — MODIFIER_OBJECT only inspects text LEFT of the token");
console.log("   'The PWS's appendix is not attached'            ->", abs("The PWS's appendix is not attached — the checklist is unavailable.") ? "REFUTED (deletes a true warning)" : "untouched");
console.log("A2 final conjunct — COORDINATED_SUBJECT only inspects text RIGHT of the token");
console.log("   'The drawings and the PWS are not provided'     ->", abs("The drawings and the PWS are not provided — pricing cannot be built.") ? "REFUTED (deletes a true warning)" : "untouched");
console.log("   (control) 'The PWS and the drawings are not provided' ->", abs("The PWS and the drawings are not provided — pricing cannot be built.") ? "REFUTED" : "untouched (guarded)");

console.log("\nB terminated heading — isHeadingLike requires NO terminal punctuation");
const S = "SITE VISIT.\nOfferors must attend on 13 August 2026.";
console.log("   segments naming 'site visit':", JSON.stringify(I.sentencesNaming(S, "site visit")));
const r = groundModalForce([{ id: "x", requirement: "Mandatory site visit.", excerpt: "SITE VISIT." }], S);
console.log("   gate fired:", r.corrected.length ? "YES — softened a REAL obligation" : "no");

console.log("\nC proof quote cut mid-word inside the quotation marks");
const LONG = "SITE VISIT\n" + "A site visit will be held at the United States Army Corps of Engineers Valley Resident Office located at 1810 Jefferson Boulevard in Old West Sacramento California on the thirteenth of August.";
const r2 = groundModalForce([{ id: "y", requirement: "Mandatory site visit.", excerpt: "" }], LONG);
const q = (String(r2.findings[0].requirement ?? "").match(/What the source says is: "([^"]+)"/) || [])[1] ?? "";
console.log("   quote tail:", JSON.stringify(q.slice(-40)), q && !/[\s.!?]$/.test(q) ? " <- cut mid-word inside the quotes" : "");
