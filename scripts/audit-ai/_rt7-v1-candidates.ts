// $0 CANDIDATE HARNESS for adversarial vector 1 (name-token SUBSET over-refute).
//
// The round-3 record's instruction, followed literally: "Any candidate rule must be run against the 4 banked true
// positives AND the executed break set before it is believed — recompute the subject span exactly as the shipped
// rule does, then apply the candidate condition to it."
//
// It exists because three consecutive fixes to this module were each defeated by the next paraphrase, and one
// proposed fix (require token EQUALITY) was believed until it was executed and found to destroy 2 of the 4 true
// positives. A candidate is a hypothesis until it has been run against BOTH sets. This runs both.
//
// TRUE POSITIVES are not hand-listed — they are the claims the SHIPPING rule refutes across the banked corpus,
// dumped by _rt7-v1-groundtruth.ts. BREAKS are the executed counterexamples from the round-3 record.
//
// Read-only, no model call, no flag, no write.
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";

// The corpus regions the breaks exploit, in the engine's assembled format.
const SRC = [
  "==== DOCUMENT: Solicitation - FA813726R0033.pdf ====", "Section B", "x".repeat(300),
  "==== DOCUMENT: ATT12_Submittal Register.pdf ====", "Submittal register content.", "y".repeat(300),
  "==== DOCUMENT: ATT11_260007_Design Narrative.pdf ====", "Design narrative content.", "z".repeat(300),
  "==== DOCUMENT: Attachment_0004_Quoted_Price_Submission_Form.xlsx ====", "Pricing sheet.", "w".repeat(300),
  "==== DOCUMENT: PWS KO Appropved - 20260720.pdf ====", "The contractor shall mow.", "v".repeat(300),
  "==== DOCUMENT: WAGE DETERMINATIONS - 20260513.pdf ====", "Wage Determination No.: 2015-5631", "u".repeat(300),
].join("\n");
const PROV = new Set(["Solicitation - FA813726R0033.pdf"]);

// MUST REFUTE — verbatim subject forms of the 4 banked corpus true positives (61aaaa95, 583df921 x2, 95698f91).
const TRUE_POSITIVES = [
  "PWS (Attachment 0001) is listed but not reproduced in the source — SOW obligations are unknown",
  "PWS (Attachment 0001) is referenced but not provided in the assigned source — staffing requirements are unknown",
  "Wage Determination (Attachment 0002) is referenced but not reproduced — SCA wage rates are unknown",
  "Wage Determination (Attachment 0002) is referenced but not reproduced — fringe benefits are unknown",
];

// MUST STAND DOWN — executed counterexamples. Refuting any of these DELETES A TRUE WARNING.
const BREAKS = [
  ["v1 bare head noun", "The register is not provided."],
  ["v1 bare head noun (2)", "The narrative is not attached."],
  ["v1 bare head noun (3)", "The design is not provided."],
  ["v4 ordinary-word filename", "The pricing is not provided for CLIN 0003."],
  ["v2 identifying number", "Wage Determination 15-5110 is not provided."],
  ["r2 modifier object", "Appendix C to the PWS is not attached."],
  ["r2 coordinated subject", "The PWS, the QASP and the bonding certificate are not provided."],
  ["r2 possessive", "The PWS's appendix is not attached."],
  ["r2 final conjunct", "The drawings and the PWS are not provided."],
];

const fires = (claim: string) =>
  reconcileAbsenceClaims([{ id: "c", requirement: claim }], SRC, PROV, null).refuted.length > 0;

let tpKept = 0, breaksHeld = 0;
console.log("=== TRUE POSITIVES — every one must still REFUTE ===");
for (const t of TRUE_POSITIVES) {
  const f = fires(t);
  if (f) tpKept++;
  console.log(`  ${f ? "✓ refutes " : "✗ LOST    "} ${t.slice(0, 76)}`);
}
console.log("\n=== BREAKS — every one must STAND DOWN (refuting deletes a true warning) ===");
for (const [label, c] of BREAKS) {
  const f = fires(c);
  if (!f) breaksHeld++;
  console.log(`  ${f ? "✗ OVER-REFUTES" : "✓ stands down "}  [${label}] ${c}`);
}

const okAll = tpKept === TRUE_POSITIVES.length && breaksHeld === BREAKS.length;
console.log(`\nTRUE POSITIVES KEPT ${tpKept}/${TRUE_POSITIVES.length} · BREAKS HELD ${breaksHeld}/${BREAKS.length}`);
console.log(okAll ? "PASS" : "FAIL — a candidate that loses a true positive or leaks a break is not shippable");
process.exit(okAll ? 0 : 1);
