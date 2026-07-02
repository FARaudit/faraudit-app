// $0 gate for FIX #1 item A — detectSections emits "combined-synopsis" for a BARE Part-12 combined
// synopsis/solicitation (FAR 12.603 boilerplate, no SF-1449 form header), flag-gated default-OFF.
//   npx tsx scripts/audit-ai/test-combined-synopsis-emit.ts
//
// Doctrine proven here (pure, $0):
//  • BARE combined synopsis (no SF-1449/SF-18/UCF markers) + flag ON  → formatDetected="combined-synopsis"
//    → procurementPart="part12-commercial".
//  • Same source + flag OFF (unset) → "unknown" (prod byte-identical — the branch is never consulted).
//  • A FORM-HEADED commercial doc (SF-1449) that ALSO carries "combined synopsis/solicitation" prose — the
//    real SP3300 case — STILL classifies SF-1449-RFQ (SF-1449 wins above; the emit never steals it). This is
//    the load-bearing regression: FIX #1's combined-synopsis emit does NOT change SP3300's classification.
//  • A genuine UCF Part-15 doc is UNAFFECTED under BOTH flag states (the boilerplate isn't UCF prose).

import { readFileSync } from "fs";
import { detectSections, type FormatType } from "@/lib/section-boundary-detector";
import { procurementPart, type AuditToolContext } from "@/lib/audit-tools";

const asDoc = (s: string) => ({
  pages: [{ pageNum: 1, text: s, lines: s.split("\n").map((l) => l.trim()).filter(Boolean) }],
  rawText: s, pageCount: 1, extractionMethod: "fallback" as const, warnings: [],
});
const fmt = (s: string): FormatType => detectSections(asDoc(s)).formatDetected;
const part = (s: string) => procurementPart({ fullSource: s } as AuditToolContext);

// A BARE combined synopsis/solicitation — FAR 12.603 definitional statement, NO SF-1449 form header, no §A–M.
const BARE_CS = [
  "This is a combined synopsis/solicitation for commercial products and commercial services prepared in",
  "accordance with the format in Subpart 12.6, as supplemented with additional information in this notice.",
  "The Government intends to award a firm-fixed-price purchase order. NAICS 337214.",
  "52.212-1 Instructions to Offerors—Commercial. Submit your quote per these instructions.",
  "52.212-2 Evaluation—Commercial. Award on a Lowest-Priced Technically Acceptable basis.",
].join("\n");
// Boilerplate-only variant (the 12.6-format phrase without the exact slash phrase).
const CS_126_ONLY = [
  "The contractor shall furnish office chairs. This notice is prepared in accordance with the format",
  "prescribed in FAR Subpart 12.6. Quotes are due 29 JUN 2026.",
].join("\n");
// A genuine UCF Part-15 doc — must be unaffected.
const UCF = [
  "SECTION B - SUPPLIES AND PRICES", "Offerors shall submit pricing for CLIN 0001.",
  "SECTION C - STATEMENT OF WORK", "The contractor shall furnish one mini-excavator.",
  "SECTION M - EVALUATION FACTORS FOR AWARD", "Award on an LPTA basis.",
].join("\n");

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`);
};
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS;
  if (on) process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS = "true"; else delete process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS; else process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS = prev;
  }
};

// (1) BARE combined synopsis — flag ON → combined-synopsis / part12-commercial.
withFlag(true, () => {
  eq("1 BARE_CS format = combined-synopsis (flag ON)", fmt(BARE_CS), "combined-synopsis");
  eq("1 BARE_CS part   = part12-commercial (flag ON)", part(BARE_CS), "part12-commercial");
  eq("1 CS_126_ONLY format = combined-synopsis (flag ON)", fmt(CS_126_ONLY), "combined-synopsis");
});

// (2) BARE combined synopsis — flag OFF → unknown (prod byte-identical; branch never consulted).
withFlag(false, () => {
  eq("2 BARE_CS format = unknown (flag OFF)", fmt(BARE_CS), "unknown");
  eq("2 BARE_CS part   = unknown (flag OFF)", part(BARE_CS), "unknown");
  eq("2 CS_126_ONLY format = unknown (flag OFF)", fmt(CS_126_ONLY), "unknown");
});

// (3) LOAD-BEARING regression — the REAL SP3300 source: SF-1449 form header wins under BOTH flag states, so
//     the combined-synopsis emit does NOT change its classification (proves FIX #1-A is a no-op for SP3300).
const SP3300 = readFileSync("scripts/audit-ai/gold-sets/SP3300-26-Q-0165-FULL-SOURCE.txt", "utf8");
withFlag(true,  () => eq("3 SP3300 format = SF-1449-RFQ (flag ON — emit does NOT steal it)", fmt(SP3300), "SF-1449-RFQ"));
withFlag(false, () => eq("3 SP3300 format = SF-1449-RFQ (flag OFF)", fmt(SP3300), "SF-1449-RFQ"));
withFlag(true,  () => eq("3 SP3300 part   = part12-commercial (flag ON)", part(SP3300), "part12-commercial"));

// (4) UCF Part-15 unaffected under BOTH flag states.
withFlag(true,  () => eq("4 UCF format = UCF (flag ON)", fmt(UCF), "UCF"));
withFlag(false, () => eq("4 UCF format = UCF (flag OFF)", fmt(UCF), "UCF"));

console.log(`combined-synopsis emit gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — bare combined synopsis emits under flag; OFF byte-identical; SF-1449 (SP3300) & UCF unaffected.");
process.exit(0);
