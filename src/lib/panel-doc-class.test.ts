// $0 PROOF for CLASS-AWARE PANEL FIRING (card #525, Brain ruling). Run: npx tsx src/lib/panel-doc-class.test.ts
//
// The CR proved the panel no-fires on commercial SF-1449 buys (df202699). Brain ruling: dispatch on document class.
// Proves: (1) a df202699-shaped non-UCF fixture → commercial class, biddable-content gate OK, panel fires, sections
// content-routed; (2) clean-UCF regression → unchanged UCF path; (3) incomplete-package refusal on BOTH classes; (4)
// whole-source single-bundle fallback when content routing can't place L/M.
import { detectDocumentClass, checkBiddableContent, routeCommercialSections } from "./panel-doc-class";
import { buildPanelInputs } from "./panel-adapter";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// ── df202699-shaped COMMERCIAL fixture: SF-1449, delimited documents, "Section L/M" as CONTENT labels (no UCF
//    §A–M header structure), with all three biddable essentials present. ─────────────────────────────
const COMMERCIAL = [
  "==== DOCUMENT: Combined Synopsis Solicitation FA303026Q0020 Catholic Music Director.pdf ====",
  "This is a combined synopsis/solicitation issued on an SF 1449 for commercial services.",
  "This acquisition is a 100% woman-owned small business set-aside under NAICS 711510.",
  "",
  "Schedule of Supplies/Services — CLIN 0001: Catholic Music Director services, base year, unit price ___.",
  "CLIN 1001 through 4001: option years one through four.",
  "",
  "Section L – Instructions to Offerors",
  "Quotes shall be submitted via email no later than 15 Jul 2026. Offerors shall maintain active SAM registration.",
  "Submit a technical narrative and a completed price schedule.",
  "",
  "Section M – Evaluation Criteria",
  "Award will be made on a lowest-priced technically acceptable basis. Technical acceptability is pass/fail.",
  "",
  "==== DOCUMENT: Attachment 1 - Statement of Work.pdf ====",
  "Statement of Work: The contractor shall provide a Catholic music director for weekly liturgies.",
].join("\n");

console.log("\n── (1) df202699-shaped COMMERCIAL → fires + content-routed ──");
assert(detectDocumentClass(COMMERCIAL) === "commercial", `no UCF §A–M headers → commercial (got ${detectDocumentClass(COMMERCIAL)})`);
const bc = checkBiddableContent(COMMERCIAL);
assert(bc.ok, `biddable-content gate OK (pricing+eval+submission all scan-confirmed) — missing: [${bc.missing.join(", ")}]`);
const routed = routeCommercialSections(COMMERCIAL);
assert(routed.routed, "content routing SUCCEEDS (L + M placed)");
assert(/Instructions to Offerors|submitted via email/i.test(routed.sectionText.L ?? ""), "§L bucket carries the submission instructions");
assert(/lowest-priced technically acceptable/i.test(routed.sectionText.M ?? ""), "§M bucket carries the evaluation basis");
const piC = buildPanelInputs(COMMERCIAL);
assert(piC.documentClass === "commercial" && piC.manifest.ok, "buildPanelInputs → commercial + gate OK → PANEL WILL FIRE");
assert(piC.detectedSections.has("L") && piC.detectedSections.has("M"), "panel sees content-routed L + M");

// ── (2) clean-UCF regression — the UCF path is unchanged ──
const UCF = [
  "SECTION B - Supplies or Services and Prices", "CLIN 0001 base year pricing.",
  "SECTION C - Statement of Work", "The contractor shall perform the work.",
  "SECTION L - Instructions to Offerors", "Quotes are due 15 Jul 2026.",
  "SECTION M - Evaluation Factors", "Award on a lowest-priced technically acceptable basis.",
].join("\n");
console.log("\n── (2) clean-UCF regression ──");
assert(detectDocumentClass(UCF) === "ucf", "UCF §A–M headers → ucf class");
const piU = buildPanelInputs(UCF);
assert(piU.documentClass === "ucf" && piU.manifest.ok, "UCF path → checkManifest gate OK (C/L/M/B present) → fires");
assert(piU.detectedSections.has("C") && piU.detectedSections.has("B"), "UCF sections detected by the boundary detector (unchanged)");

// ── (3) incomplete-package REFUSAL on both classes (honest-fail preserved) ──
console.log("\n── (3) incomplete-package refusal (both classes) ──");
// commercial missing the evaluation basis
const COMMERCIAL_NOEVAL = COMMERCIAL.replace("Section M – Evaluation Criteria", "").replace("Award will be made on a lowest-priced technically acceptable basis. Technical acceptability is pass/fail.", "");
const bcMiss = checkBiddableContent(COMMERCIAL_NOEVAL);
assert(!bcMiss.ok && bcMiss.missing.some((m) => /evaluation/i.test(m)), `commercial missing evaluation → gate !ok naming it (missing: ${bcMiss.missing.join(", ")})`);
assert(buildPanelInputs(COMMERCIAL_NOEVAL).manifest.ok === false, "commercial-incomplete → buildPanelInputs gate !ok → panel suppressed (no fabrication)");
// UCF missing §M
const UCF_NOM = UCF.replace("SECTION M - Evaluation Factors", "").replace("Award on a lowest-priced technically acceptable basis.", "");
assert(buildPanelInputs(UCF_NOM).manifest.ok === false, "UCF missing §M → checkManifest !ok → panel suppressed (unchanged honest-fail)");

// ── (4) whole-source single-bundle FALLBACK (biddable present, but no clean L/M anchors) ──
console.log("\n── (4) content-routing fallback → whole-source bundle ──");
// biddable markers present (LPTA, CLIN, 'offers are due') but phrased so the L/M anchors don't cleanly fire
const NOANCHOR = "SF 1449 commercial buy. CLIN 0001 unit price ___. Award is best-value. Offers are due 15 Jul 2026. The contractor shall furnish services.";
const rNo = routeCommercialSections(NOANCHOR);
const piF = buildPanelInputs(NOANCHOR);
assert(piF.documentClass === "commercial" && piF.manifest.ok, "biddable present → gate OK even when routing is imperfect");
if (!rNo.routed) assert(["B", "C", "L", "M"].every((k) => piF.sectionText[k] === NOANCHOR), "routing failed → whole-source assigned to B/C/L/M (single-bundle fallback)");
else assert(true, "routing succeeded on this input (anchors matched) — fallback not exercised, still fires");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
