// $0 gate for Step 8 — procurementType as a first-class fact + format-aware core-section honest-fail (fail-safe #10).
//   npx tsx scripts/audit-ai/test-procurement-sections.ts
//
// coreMissing lives in the ORCHESTRATOR (not deriveVerdict), so the honest proof is here, against crafted
// fullSource strings (pure, $0). Doctrine (Brain card 135 Step 8):
//  • procurementPart is the SINGLE deterministic format source, derived off detectFormat — no parallel surface.
//  • Part-15 UCF core = §C/§L/§M (UNCHANGED) — any absent → INCOMPLETE (honest-fail intact, flag-independent).
//  • Part-12 commercial core-equiv = {52.212-1 ≡ §L instructions} + {52.212-2 ≡ §M evaluation}; honest-fail ONLY
//    if BOTH absent. Flag-gated: OFF ⇒ commercial returns [] (today's free pass, byte-identical).

import { procurementPart, detectFormat, type AuditToolContext } from "@/lib/audit-tools";
import { coreMissingFor } from "@/lib/audit-orchestrator";

const ctxOf = (s: string): AuditToolContext => ({ fullSource: s });

const UCF_FULL = ctxOf([
  "SECTION B - SUPPLIES AND PRICES", "Offerors shall submit pricing for CLIN 0001.",
  "SECTION C - STATEMENT OF WORK", "The contractor shall furnish one mini-excavator.",
  "SECTION I - CONTRACT CLAUSES", "52.219-6 Total Small Business Set-Aside incorporated.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS FOR AWARD", "Award on a Lowest-Priced Technically Acceptable basis.",
].join("\n"));
const UCF_NO_M = ctxOf([
  "SECTION B - SUPPLIES AND PRICES", "Offerors shall submit pricing for CLIN 0001.",
  "SECTION C - STATEMENT OF WORK", "The contractor shall furnish one mini-excavator.",
  "SECTION I - CONTRACT CLAUSES", "52.219-6 Total Small Business Set-Aside incorporated.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Submit a Certificate of Conformance with the offer.",
].join("\n"));
// A T-38-shaped commercial RFQ (SF-1449, 52.212-1/-2/-4) — the load-bearing anchor.
const COMM_FULL = ctxOf([
  "SF 1449 SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL ITEMS", "NAICS 336413.",
  "52.212-1  Instructions to Offerors—Commercial Products and Commercial Services", "Submit your quote per these instructions and addenda.",
  "52.212-2  Evaluation—Commercial Products and Commercial Services", "Award will be made on a Lowest-Priced Technically Acceptable basis.",
  "52.212-4  Contract Terms and Conditions—Commercial Products and Commercial Services", "FOB destination.",
].join("\n"));
// A commercial RFQ missing BOTH the instructions-equiv AND the evaluation-equiv (a genuinely partial read).
const COMM_NO_CORE = ctxOf([
  "SF 1449 SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL ITEMS", "NAICS 336413.",
  "Line item 0001: widget, quantity 10.", "Deliver FOB destination by 30 SEP 2026.",
  "52.212-4  Contract Terms and Conditions—Commercial Products and Commercial Services", "Standard commercial terms apply.",
].join("\n"));
// SINGLE-MISSING commercial fixtures — prove the cap fires ONLY when BOTH are absent (AND, not OR).
const COMM_L_ONLY = ctxOf([
  "SF 1449 SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL ITEMS", "NAICS 336413.",
  "52.212-1  Instructions to Offerors—Commercial Products and Commercial Services", "Submit your quote per these instructions.",
  "52.212-4  Contract Terms and Conditions—Commercial Products and Commercial Services", "FOB destination.",
].join("\n"));
const COMM_M_ONLY = ctxOf([
  "SF 1449 SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL ITEMS", "NAICS 336413.",
  "52.212-2  Evaluation—Commercial Products and Commercial Services", "Award on a Lowest-Priced Technically Acceptable basis.",
  "52.212-4  Contract Terms and Conditions—Commercial Products and Commercial Services", "FOB destination.",
].join("\n"));
const JUNK = ctxOf("not a solicitation at all");

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };
const ON = { commercialHonestFail: true };

// (iv) SINGLE SOURCE — procurementPart derives off detectFormat; no parallel surface. (Assert the format too,
//      so a misclassified crafted source fails loudly here rather than silently downstream.)
eq("iv detectFormat(UCF_FULL) = UCF", detectFormat(UCF_FULL), "UCF");
eq("iv procurementPart(UCF_FULL) = part15-ucf", procurementPart(UCF_FULL), "part15-ucf");
eq("iv detectFormat(COMM_FULL) = SF-1449-RFQ", detectFormat(COMM_FULL), "SF-1449-RFQ");
eq("iv procurementPart(COMM_FULL) = part12-commercial", procurementPart(COMM_FULL), "part12-commercial");
eq("iv procurementPart(junk) = unknown", procurementPart(ctxOf("not a solicitation at all")), "unknown");

// (i) T-38 commercial with 52.212-1 + 52.212-2 → NO coreMissing INCOMPLETE.
eq("i  commercial w/ 52.212-1 + 52.212-2 → coreMissing [] (flag ON)", coreMissingFor(COMM_FULL, ON), []);

// (ii) LOAD-BEARING honest-fail: Part-15 UCF genuinely missing §M → STILL flagged (flag-INDEPENDENT).
eq("ii UCF missing §M → coreMissing includes M (flag OFF)", coreMissingFor(UCF_NO_M).includes("M"), true);
eq("ii UCF missing §M → coreMissing includes M (flag ON)", coreMissingFor(UCF_NO_M, ON).includes("M"), true);
eq("ii UCF full → coreMissing [] (no false cap)", coreMissingFor(UCF_FULL), []);

// (iii) LOAD-BEARING honest-fail: commercial missing BOTH instr-equiv AND eval-equiv → STILL INCOMPLETE (flag ON),
//       disclosed by the commercial clause numbers (not §L/§M).
eq("iii commercial missing BOTH → coreMissing [52.212-1, 52.212-2] (flag ON)", coreMissingFor(COMM_NO_CORE, ON), ["52.212-1", "52.212-2"]);
// AND-not-OR: a SINGLE missing core-equiv must NOT cap (this is what distinguishes AND from OR — H2 guard).
eq("iii-and commercial 52.212-1 present, 52.212-2 absent → [] (no cap)", coreMissingFor(COMM_L_ONLY, ON), []);
eq("iii-and commercial 52.212-2 present, 52.212-1 absent → [] (no cap)", coreMissingFor(COMM_M_ONLY, ON), []);

// FLAG-OFF BYTE-IDENTICAL: commercial path is a no-op when the flag is off (today's free pass).
eq("OFF commercial missing both → [] (byte-identical, free pass)", coreMissingFor(COMM_NO_CORE), []);
eq("OFF commercial full → [] ", coreMissingFor(COMM_FULL), []);
// unknown format → [] under BOTH flag states (byte-identical; the change never touches non-UCF/non-commercial).
eq("unknown format → [] (flag OFF)", coreMissingFor(JUNK), []);
eq("unknown format → [] (flag ON)", coreMissingFor(JUNK, ON), []);
// UCF path is flag-INDEPENDENT (the flag only gates the commercial branch).
eq("UCF coreMissing identical with/without flag (full)", JSON.stringify(coreMissingFor(UCF_FULL)), JSON.stringify(coreMissingFor(UCF_FULL, ON)));
eq("UCF coreMissing identical with/without flag (no-M)", JSON.stringify(coreMissingFor(UCF_NO_M)), JSON.stringify(coreMissingFor(UCF_NO_M, ON)));

console.log(`procurement-sections gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — single-source procurementPart; UCF honest-fail UNCHANGED; commercial honest-fail (both-missing) flag-gated; OFF byte-identical.");
process.exit(0);
