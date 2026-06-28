// $0 regression gate for the BOUNDED GRADUATION — Fix #1 (route-everything by ROLE) + Fix #2
// (coverage-from-content). Brain ruling card 39. #2 Gate-2 exposed "C04 Specs_Mini-Excavator.pdf"
// routing to NO lens → honest INCOMPLETE. Locks: (1) name → §C for the spec family + no false
// positives; (2) content fallback routes a binding doc whose NAME can't place it, BUT keeps a
// genuinely-unplaceable binding doc an honest gap, and never content-routes an admin file.
//   npx tsx scripts/audit-ai/test-route-everything.ts
import { sectionLetterFromName, sectionLetterFromContent, resolveAttachments } from "@/lib/agentic-sections";

let pass = 0;
const fails: string[] = [];
const check = (label: string, got: unknown, exp: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(exp)) pass++;
  else fails.push(`${label} → ${JSON.stringify(got)} (expected ${JSON.stringify(exp)})`);
};

// ── Fix #1: name-based routing ───────────────────────────────────────────────
const NAME: Array<[string, string | null]> = [
  ["C04 Specs_Mini-Excavator.pdf", "C"],          // THE #2 bug
  ["Specs.pdf", "C"], ["Specification.docx", "C"], ["Specifications-rev2.pdf", "C"],
  ["Salient Characteristics.pdf", "C"], ["Item Description.pdf", "C"],
  ["Purchase Description.pdf", "C"], ["Technical Requirements.pdf", "C"],
  ["PWS.pdf", "C"], ["Statement of Work.pdf", "C"],
  ["Wage Determination.pdf", "B"], ["J-1503010 Inventory.xlsx", "J"],
  ["N4008525R2574 Section C ANNEXES.pdf", "C"],
  ["Special Terms and Conditions.pdf", null],     // must NOT match "spec" in "special"
  ["Specialist Resume.pdf", null],
  ["Site Visit Sign-In Sheet.pdf", null],
];
for (const [name, exp] of NAME) check(`name(${name})`, sectionLetterFromName(name), exp);

// ── Fix #2: content-based fallback (sectionLetterFromContent) ─────────────────
const SOW_BODY = "Statement of Work\nThe contractor shall furnish all labor and materials required to "
  + "deliver one mini-excavator meeting the salient characteristics below. The contractor shall provide "
  + "product literature for the exact machine quoted. Delivery is required within 60 days of award. ".repeat(3);
check("content(SOW body)", sectionLetterFromContent(SOW_BODY), "C");
check("content(too short)", sectionLetterFromContent("shall comply"), null);
check("content(null)", sectionLetterFromContent(null), null);

// ── Fix #2 end-to-end through resolveAttachments ─────────────────────────────
// (a) name unhelpful + content is a binding SOW → routed to §C by content, NOT unresolved.
const r1 = resolveAttachments([{ name: "Attachment 1.pdf", text: SOW_BODY }]);
check("e2e content-route → §C present", Boolean(r1.sections["C"]), true);
check("e2e content-route → not unresolved", r1.unresolved, []);

// (b) name unhelpful + body has no binding section → HONEST gap (unresolved), never silently dropped.
const NOISE = "Page 1 of 3. ".repeat(40) + "misc notes about nothing structured here.";
const r2 = resolveAttachments([{ name: "Misc Notes.pdf", text: NOISE }]);
check("e2e unplaceable → unresolved", r2.unresolved, ["Misc Notes.pdf"]);

// (c) admin file is benign — NOT content-routed, NOT a gap.
const r3 = resolveAttachments([{ name: "Site Visit Sign-In Sheet.pdf", text: "Name  Company  Signature\n".repeat(20) }]);
check("e2e admin → not unresolved", r3.unresolved, []);
check("e2e admin → no section", Object.keys(r3.sections), []);

// (d) the #2 case end-to-end: spec attachment routes by NAME → §C, no coverage gap.
const r4 = resolveAttachments([{ name: "C04 Specs_Mini-Excavator.pdf", text: "Salient characteristics: the machine shall have an enclosed cab. ".repeat(8) }]);
check("e2e #2 spec → §C present", Boolean(r4.sections["C"]), true);
check("e2e #2 spec → not unresolved", r4.unresolved, []);

const total = pass + fails.length;
console.log(`route-everything gate: ${pass}/${total} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — Fix #1 (name→§C) + Fix #2 (content fallback) locked; honest gap preserved; admin benign; no catch-all.");
