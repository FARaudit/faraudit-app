/**
 * RED-TEAM RETROACTIVE GAUNTLET — PR #271 AUDIT_COMMERCIAL_ROUTING_V2 (#525 fix). $0, pure, no API calls.
 *   npx tsx scripts/audit-ai/_redteam-pr271-routing-gauntlet.ts
 *
 * Rounds:
 *  R1 — Claim(1) flag-combo hole: predicate certifies COMMERCIAL map, reader (INTEGRITY=off) uses UCF map.
 *  R2 — Claim(2) residue: V2 §L phrase anchors firing MID-CONTENT inside §C (fragmenter probes).
 *  R3 — near-miss "Section L/M" mid-sentence cross-references (anchor doctrine: header vs sentence).
 *  R4 — pre-first-anchor HEAD drop (set-aside cover statement) + unroutedBinding visibility.
 *  R5 — Claim(3) strict `=== "true"` parse divergence ("TRUE" silently disables V2).
 */
import { routeCommercialSections } from "../../src/lib/panel-doc-class";
import { commercialRoutingSafe, buildPanelInputs } from "../../src/lib/panel-adapter";
import { assembleLensPasses, lensAssignedSections, LENS_SECTIONS, LENS_SECTIONS_COMMERCIAL, type PanelLensKey } from "../../src/lib/agentic-sections";

let breaks = 0;
const report = (name: string, broke: boolean, detail = "") => {
  console.log(`${broke ? "BREAK" : "HOLD "}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (broke) breaks++;
};

// ────────────────────────────────────────────────────────────────────────────────────────────
// R1 — FLAG-COMBO HOLE. Package places {B,C,L,M} but NOT §I (no clauses block — plausible RFQ).
// ────────────────────────────────────────────────────────────────────────────────────────────
const r1Src = [
  "Request for Quote 47QQ-TEST-0001. Commercial services, FAR Part 12.",
  "",
  "Price Schedule", // §B anchor
  "Item 0001 Janitorial services, monthly, unit price $4,200.00, 12 months.",
  "",
  "Statement of Work", // §C anchor
  "The contractor is responsible for nightly cleaning of Building 4. Performance hours are 1800-2200.",
  "",
  "Instructions to Quoters", // §L anchor
  "Quotes are due 2026-08-01 at 1400 ET. Email quotes to the contracting officer.",
  "",
  "Evaluation criteria", // §M anchor
  "Award will be made to the lowest priced technically acceptable quote.",
].join("\n");

{
  const v2 = routeCommercialSections(r1Src, { v2: true });
  const placed = v2.placedKeys;
  const predicateSafe = commercialRoutingSafe(placed);
  console.log(`R1 placedKeys=[${placed.join(",")}] predicateSafe=${predicateSafe}`);
  report("R1a fixture shape (I must be ABSENT, B/C/L/M placed)", !( !placed.includes("I") && ["B","C","L","M"].every(k=>placed.includes(k)) ), `placed=[${placed.join(",")}]`);

  // Predicate certifies against COMMERCIAL map…
  report("R1b predicate says SAFE (commercial map: proposal_compliance [H,I,L] → L placed)", false, `predicateSafe=${predicateSafe}`);

  // …but the READER with INTEGRITY=off serves the UCF map.
  delete process.env.AUDIT_LENS_EMISSION_INTEGRITY; // INTEGRITY OFF
  const assignedOff = lensAssignedSections("proposal_compliance", "commercial");
  const passesOff = assembleLensPasses("proposal_compliance", v2.sectionText, { docClass: "commercial" });
  const textOff = passesOff.passes.map((p) => p.text).join("").trim();
  const starvedOff = textOff.length === 0;

  process.env.AUDIT_LENS_EMISSION_INTEGRITY = "true"; // INTEGRITY ON
  const passesOn = assembleLensPasses("proposal_compliance", v2.sectionText, { docClass: "commercial" });
  const textOn = passesOn.passes.map((p) => p.text).join("").trim();
  delete process.env.AUDIT_LENS_EMISSION_INTEGRITY;

  report(
    "R1c HOLE: predicate SAFE=true + INTEGRITY=off ⇒ proposal_compliance STARVED (0 chars) while INTEGRITY=on feeds it",
    predicateSafe && starvedOff && textOn.length > 0,
    `INTEGRITY=off assigned=[${assignedOff.join(",")}] text=${textOff.length} chars · INTEGRITY=on text=${textOn.length} chars`
  );

  // End-to-end: buildPanelInputs must NOT fall back (proving the starved route ships).
  process.env.AUDIT_COMMERCIAL_ROUTING_V2 = "true";
  const pi = buildPanelInputs(r1Src);
  const fellBack = Object.values(pi.sectionText).some((t) => t === r1Src); // whole-source fallback assigns src verbatim
  report("R1d end-to-end buildPanelInputs(V2=true, INTEGRITY=off) routes WITHOUT fallback (starvation ships)", !fellBack && predicateSafe, `sections=[${Object.keys(pi.sectionText).join(",")}]`);
  delete process.env.AUDIT_COMMERCIAL_ROUTING_V2;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// R2 — V2 §L PHRASE ANCHORS MID-CONTENT. "offerors shall provide …" inside the §C PWS body.
// ────────────────────────────────────────────────────────────────────────────────────────────
const r2Src = [
  "Instructions to Quoters", // real §L
  "Submit quotes by email no later than 2026-08-01.",
  "",
  "Statement of Work", // real §C
  "The contractor cleans Building 4 nightly.",
  "Prior to badge issuance offerors shall provide proof of citizenship for all staff.", // V2 L anchor fires HERE (mid-§C)
  "The remaining PWS tasks: floor waxing quarterly; window washing semiannually; HVAC filter checks monthly.",
  "",
  "Evaluation criteria", // real §M
  "Award will be made on price alone.",
  "",
  "Price Schedule",
  "Item 0001 unit price.",
  "",
  "Contract clauses",
  "52.212-4 incorporated by reference.",
].join("\n");

{
  const v2 = routeCommercialSections(r2Src, { v2: true });
  const cSlice = v2.sectionText["C"] ?? "";
  const lSlice = v2.sectionText["L"] ?? "";
  const tailInC = cSlice.includes("floor waxing quarterly");
  const tailInL = lSlice.includes("floor waxing quarterly");
  report(
    "R2a mid-§C 'offerors shall provide' relabels the PWS tail as §L (fragmenter)",
    !tailInC && tailInL,
    `C=${cSlice.length}ch L=${lSlice.length}ch · PWS tail in C=${tailInC} in L=${tailInL}`
  );
  // Consequence under the COMMERCIAL map: pricing_contracts_risk owns [B,C,I,H,J] — NOT L — so it loses the PWS tail.
  const pricingOwnsL = LENS_SECTIONS_COMMERCIAL["pricing_contracts_risk"].includes("L");
  report("R2b pricing lens (owns C, not L) permanently loses the relabeled PWS tail", !tailInC && tailInL && !pricingOwnsL, `pricing owns L=${pricingOwnsL}`);

  // predicate still says safe → no fallback → mis-slice ships
  report("R2c predicate blesses the mis-slice (placement ≠ fidelity)", commercialRoutingSafe(v2.placedKeys), `placed=[${v2.placedKeys.join(",")}]`);
}

// R2d — "Volume 2:" morphology inside §C (V2 L anchor `\bvolume\s+[ivx1-9]…[:\-.]`)
const r2dSrc = [
  "Instructions to Quoters",
  "Email quotes to the CO.",
  "",
  "Statement of Work",
  "The contractor maintains the archive. Records retention follows agency schedule Volume 3: permanent records, held on site.",
  "Additional PWS tasks continue here: pest control monthly.",
  "",
  "Evaluation criteria",
  "Award will be made to the lowest quote.",
].join("\n");
{
  const v2 = routeCommercialSections(r2dSrc, { v2: true });
  const tailLostFromC = !(v2.sectionText["C"] ?? "").includes("pest control monthly");
  report("R2d mid-§C 'Volume 3:' fires the V2 §L volume anchor and fragments §C", tailLostFromC, `C="${(v2.sectionText["C"] ?? "").slice(0, 60)}…"`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// R3 — NEAR-MISS "Section L/M" mid-sentence cross-reference vs header (anchor doctrine).
// ────────────────────────────────────────────────────────────────────────────────────────────
const r3Src = [
  "Instructions to Quoters",
  "Quotes shall be submitted by email.",
  "",
  "Statement of Work",
  "Deliverables must conform to the format described in Section L of this RFQ, using the template in Attachment 2.", // mid-sentence x-ref
  "PWS task list continues: mowing weekly; edging biweekly.",
  "",
  "Evaluation criteria",
  "Award will be made to the lowest priced technically acceptable quote.",
].join("\n");
{
  const v2 = routeCommercialSections(r3Src, { v2: true });
  const cSlice = v2.sectionText["C"] ?? "";
  const fragmented = !cSlice.includes("mowing weekly");
  report("R3a mid-sentence 'in Section L of this RFQ' fires the §L anchor and fragments §C", fragmented, `C="${cSlice.slice(0, 60)}…"`);
  // header-position vs sentence-position indistinguishable?
  const headerOnly = routeCommercialSections("Section L\nSubmission details here for at least twenty chars.\n\nEvaluation criteria\nAward will be made on price.", { v2: true });
  report("R3b (control) header-position 'Section L' routes correctly", !(headerOnly.sectionText["L"] ?? "").includes("Submission details"), `L placed=${!!headerOnly.sectionText["L"]}`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// R4 — PRE-FIRST-ANCHOR HEAD DROP. Set-aside statement on the cover, before any anchor.
// ────────────────────────────────────────────────────────────────────────────────────────────
const setAsideLine = "This procurement is a 100 percent set-aside for small business concerns under NAICS 561210.";
const r4Src = [
  "Request for Quote 47QQ-TEST-0004.",
  setAsideLine, // ← HEAD content: no binding verb, before the first anchor
  "",
  "Price Schedule",
  "Item 0001 unit price $1.00.",
  "",
  "Instructions to Quoters",
  "Email quotes to the CO by 2026-08-01.",
  "",
  "Evaluation criteria",
  "Award will be made to the lowest quote.",
  "",
  "Statement of Work",
  "Mow the lawn weekly.",
  "",
  "Contract clauses",
  "52.212-4 incorporated by reference.",
].join("\n");
{
  process.env.AUDIT_COMMERCIAL_ROUTING_V2 = "true";
  const pi = buildPanelInputs(r4Src);
  delete process.env.AUDIT_COMMERCIAL_ROUTING_V2;
  const inAnySlice = Object.values(pi.sectionText).some((t) => t.includes("set-aside for small business"));
  const surfacedUnrouted = pi.unroutedBinding.some((l) => l.includes("set-aside for small business"));
  report(
    "R4a set-aside cover statement DROPPED from every slice AND absent from unroutedBinding (silent loss)",
    !inAnySlice && !surfacedUnrouted,
    `inSlice=${inAnySlice} unrouted=${surfacedUnrouted} · smallbiz lens goes blind to the set-aside`
  );
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// R5 — STRICT FLAG PARSE. "TRUE" (dashboard-case) silently disables V2 vs isEnvOn tolerance.
// Fixture: §L reachable ONLY via a V2-only anchor ("offerors shall submit"), so V2-on slices, V2-off falls back.
// ────────────────────────────────────────────────────────────────────────────────────────────
const r5Src = [
  "Request for Quote.",
  "",
  "Price Schedule",
  "Item 0001 unit price $1.00.",
  "",
  "To be considered, offerors shall submit a one-page capability statement with the quote.", // V2-only §L anchor
  "",
  "Evaluation criteria",
  "Award will be made to the lowest quote.",
  "",
  "Statement of Work",
  "Mow the lawn weekly.",
  "",
  "Contract clauses",
  "52.212-4 incorporated by reference.",
].join("\n");
{
  process.env.AUDIT_COMMERCIAL_ROUTING_V2 = "true";
  const piTrue = buildPanelInputs(r5Src);
  process.env.AUDIT_COMMERCIAL_ROUTING_V2 = "TRUE";
  const piTRUE = buildPanelInputs(r5Src);
  delete process.env.AUDIT_COMMERCIAL_ROUTING_V2;
  const slicedTrue = !Object.values(piTrue.sectionText).some((t) => t === r5Src);
  const fellBackTRUE = Object.values(piTRUE.sectionText).some((t) => t === r5Src);
  report(
    'R5 "TRUE" ≠ "true": dashboard-case value silently disables V2 (whole-source fallback) while lowercase slices',
    slicedTrue && fellBackTRUE,
    `"true"→sliced=${slicedTrue} · "TRUE"→whole-source=${fellBackTRUE} (isEnvOn would accept both)`
  );
}

console.log(`\n${breaks} BREAK(s) recorded.`);
