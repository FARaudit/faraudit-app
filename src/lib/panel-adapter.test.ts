// $0 test for the PANEL WIRING ARC P1a adapter (card #523). Run: npx tsx src/lib/panel-adapter.test.ts
import { buildPanelInputs } from "./panel-adapter";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// A representative UCF §L/§M commercial RFQ shape (the seq-1 FA303026Q0020 family).
const SRC = [
  "PREAMBLE: the offeror must furnish a bid guarantee with the quote before award.",
  "",
  "SECTION B - Supplies or Services and Prices/Costs",
  "The contractor shall provide chapel music director services for a base plus four option years.",
  "",
  "SECTION L - Instructions, Conditions, and Notices to Offerors",
  "All questions must be submitted no later than 10 Jul 2026.",
  "This acquisition will be made as a 100% woman owned small business set-aside.",
  "Offerors shall maintain an active registration in the System for Award Management (SAM).",
  "",
  "SECTION M - Evaluation Factors for Award",
  "Award will be made to the lowest-priced, technically acceptable offeror.",
  "The Offeror shall demonstrate successful delivery of personnel to at least one position.",
].join("\n");

console.log("\n── P1a · sectionText decomposition ──");
const pi = buildPanelInputs(SRC);
assert(pi.detectedSections.has("L"), `§L detected (got ${[...pi.detectedSections].join(",")})`);
assert(pi.detectedSections.has("M"), "§M detected");
assert(pi.detectedSections.has("B"), "§B detected");
assert(/questions must be submitted/i.test(pi.sectionText.L ?? ""), "§L text carries the questions-deadline line");
assert(/lowest-priced, technically acceptable/i.test(pi.sectionText.M ?? ""), "§M text carries the LPTA award basis");
assert(Object.keys(pi.sectionText).length === pi.detectedSections.size, "sectionText keys == detectedSections");

console.log("\n── P1a · unroutedBinding (binding content that routed to no section) ──");
assert(pi.unroutedBinding.some((l) => /bid guarantee/i.test(l)), "preamble bid-guarantee binding line surfaced as unrouted");
assert(!pi.unroutedBinding.some((l) => /questions must be submitted/i.test(l)), "a routed §L binding line is NOT in unrouted (no double-count)");

console.log("\n── P1a · degenerate inputs (no crash, safe empties) ──");
const empty = buildPanelInputs("");
assert(empty.detectedSections.size === 0 && empty.unroutedBinding.length === 0, "empty source → empty inputs, no throw");
const noHeaders = buildPanelInputs("The contractor shall furnish widgets. Delivery is required within 30 days.");
assert(noHeaders.unroutedBinding.length >= 1, "headerless binding source → binding lines all unrouted (never lost)");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
