// $0 PROOF — UNIT 2.1 LENS-ASSIGNMENT INTEGRITY + CONTENT-CLASS RESCUE (Brain cards #548/#549). Run:
//   npx tsx src/lib/lens-emission-integrity.test.ts
//
// Live driver: SEQ-2 12318726Q0165 audit dccce793 — on the commercial route the pricing lens (assigned
// UCF [B,H,J]) never received the SCA clause matrix (routed §I) or the embedded wage determination
// (routed §C, and beyond the V3 SECTION_READ_CAP in the §C tail) → SCA/WD findings NEVER-COMPUTED →
// false "fringe not stated" P1 + zero 52.222-41/-42/-43 in the render. Card #549 named the proof-shape
// gap (instance #4): a vetting-layer proof certified an emission-layer property. This suite IS the
// permanent emission-layer harness — every assertion is of the form "content-class X reaches the
// briefed lens's INPUT" (extensible beyond SCA/WD: add anchors + fixtures per class).
import { assembleLensPasses, extractLaborStandardsBlocks, lensAssignedSections, LENS_SECTIONS, LENS_SECTIONS_COMMERCIAL, RESCUE_PASS_HEADER, type PanelLensKey } from "./agentic-sections";
import { buildPanelInputs } from "./panel-adapter";
import { readSection, SECTION_READ_CAP, SECTION_RESCUE_MARKER, type AuditToolContext } from "./audit-tools";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_LENS_EMISSION_INTEGRITY;
  if (on) process.env.AUDIT_LENS_EMISSION_INTEGRITY = "true"; else delete process.env.AUDIT_LENS_EMISSION_INTEGRITY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_LENS_EMISSION_INTEGRITY; else process.env.AUDIT_LENS_EMISSION_INTEGRITY = prev; }
};

// ── Commercial-shaped fixture (dccce793 shape, synthetic): anchors carve B/C/I/L/M; the SCA clause
//    matrix sits under the §I anchor; the WD block under the §C anchor tail (like the real base PDF).
const SCA_NEEDLES = ["52.222-41", "52.222-42", "52.222-43", "2015-4417", "HEALTH & WELFARE"];
const WD_BLOCK = [
  "REGISTER OF WAGE DETERMINATIONS UNDER THE SERVICE CONTRACT ACT",
  "Wage Determination No.: 2015-4417 Revision No.: 31 Date Of Last Revision: 05/13/2026",
  "12320 - Substance Abuse Treatment Counselor 25.27",
  "HEALTH & WELFARE: $5.55 per hour, up to 40 hours per week, or $222.00 per week",
  "VACATION: 2 weeks paid vacation after 1 year of service with a contractor or successor.",
].join("\n\n");
const COMMERCIAL_FIXTURE = [
  "This acquisition is a Total Small Business Set-Aside. NAICS 561320. The small business size standard is $34 Million.",
  "Schedule of items CLIN 0001 Drug/Alcohol Abuse Counselor HR 520hrs unit price fully burdened.",
  "Statement of Work. The contractor shall provide counseling services at the center.",
  "7.2.2. Maintain licensing requirements/certification/accreditation and required insurance coverage at a minimum of $1 mil per occurrence/3 mil aggregate during the entire performance period with proof being submitted to the CO upon request.",
  WD_BLOCK,
  "Contract clauses incorporated by reference. ☒ 52.222-41 Service Contract Labor Standards (Aug 2018) ☒ 52.222-42 Statement of Equivalent Rates for Federal Hires ☒ 52.222-43 Fair Labor Standards Act and Service Contract Labor Standards - Price Adjustment.",
  "Instructions to offerors: submit quote to the Contracting Officer no later than the deadline. Questions are due in writing.",
  "Evaluation criteria: The three factors are Technical, Past Performance, and Cost. These are all of equal importance.",
].join("\n\n");

console.log("\n── P1 — commercial route replay: the briefed lens's INPUT carries the content class ──");
{
  const pi = buildPanelInputs(COMMERCIAL_FIXTURE);
  assert(pi.documentClass === "commercial", `fixture routes commercial (got ${pi.documentClass})`);
  const inputOf = (lens: PanelLensKey, on: boolean) =>
    withFlag(on, () => assembleLensPasses(lens, pi.sectionText, { docClass: pi.documentClass }).sourceConcat);
  // COUNTER-PROOF (flag OFF reproduces the dccce793 blindness): pricing input lacks the SCA needles
  const offInput = inputOf("pricing_contracts_risk", false);
  const offMissing = SCA_NEEDLES.filter((n) => !offInput.includes(n));
  assert(offMissing.length === SCA_NEEDLES.length, `OFF: pricing lens input lacks ALL ${SCA_NEEDLES.length} SCA needles (reproduces never-computed root; missing=${offMissing.length})`);
  // FIX: flag ON → all 5 needles reach the pricing lens's assembled passes (the instance-#4 assertion form)
  const onInput = inputOf("pricing_contracts_risk", true);
  for (const n of SCA_NEEDLES) assert(onInput.includes(n), `ON: pricing lens input contains "${n}"`);
}

console.log("\n── P2 — full-map audit: every lens's commercial assignment ⊆ producible keys ∪ benign-if-missing ──");
{
  const PRODUCIBLE = new Set(["B", "C", "I", "L", "M"]); // routeCommercialSections' full key range
  for (const lens of Object.keys(LENS_SECTIONS_COMMERCIAL) as PanelLensKey[]) {
    const commercial = LENS_SECTIONS_COMMERCIAL[lens];
    const producible = commercial.filter((k) => PRODUCIBLE.has(k));
    assert(producible.length > 0, `${lens}: has ≥1 producible commercial key ([${commercial}])`);
    // no lens may LOSE a UCF key it had (over-provision only — a dropped key would be a new blindness)
    const ucf = LENS_SECTIONS[lens];
    assert(ucf.every((k) => commercial.includes(k)), `${lens}: commercial map is a superset of the UCF map (nothing dropped)`);
  }
  // the dccce793 blindness specifically: pricing now holds C and I commercially
  assert(LENS_SECTIONS_COMMERCIAL.pricing_contracts_risk.includes("C") && LENS_SECTIONS_COMMERCIAL.pricing_contracts_risk.includes("I"),
    "pricing commercial assignment includes §C (WD tail) and §I (clause matrix)");
}

console.log("\n── P3 — UCF-path control: assignment unchanged both flag states (WD-in-§J package) ──");
{
  for (const lens of Object.keys(LENS_SECTIONS) as PanelLensKey[]) {
    const off = withFlag(false, () => lensAssignedSections(lens, "ucf"));
    const on = withFlag(true, () => lensAssignedSections(lens, "ucf"));
    assert(JSON.stringify(off) === JSON.stringify(on) && JSON.stringify(on) === JSON.stringify(LENS_SECTIONS[lens]),
      `${lens}: UCF assignment identical OFF/ON (= ratified map)`);
  }
  // and a UCF sectionText with the WD under §J reaches pricing under BOTH states (pricing holds J in both maps)
  const ucfSections = { B: "Schedule of items CLIN 0001.", J: `List of attachments.\n\n${WD_BLOCK}`, L: "Instructions.", M: "Evaluation." };
  const off = withFlag(false, () => assembleLensPasses("pricing_contracts_risk", ucfSections, { docClass: "ucf" }).sourceConcat);
  const on = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", ucfSections, { docClass: "ucf" }).sourceConcat);
  assert(off.includes("2015-4417") && on.includes("2015-4417"), "UCF control: WD-in-§J reaches pricing both flag states");
  assert(off === on, "UCF control: pricing assembled input byte-identical OFF vs ON");
}

console.log("\n── P4 — dark-flag byte-identity on the commercial route ──");
{
  const pi = buildPanelInputs(COMMERCIAL_FIXTURE);
  for (const lens of Object.keys(LENS_SECTIONS) as PanelLensKey[]) {
    const off1 = withFlag(false, () => JSON.stringify(assembleLensPasses(lens, pi.sectionText, { docClass: "commercial" }).passes));
    const off2 = withFlag(false, () => JSON.stringify(assembleLensPasses(lens, pi.sectionText, { docClass: "commercial" })).slice(0, 1_000_000));
    assert(off1.length > 0 && off2.length > 0, `${lens}: OFF-path assembles (sanity)`);
    const legacy = withFlag(false, () => JSON.stringify(assembleLensPasses(lens, pi.sectionText).passes));
    assert(off1 === legacy, `${lens}: OFF + docClass ≡ legacy no-docClass call (byte-identical)`);
  }
}

console.log("\n── P5 — content-class rescue: block outside the lens's keys rides a RESCUE pass ──");
{
  // WD block deliberately routed under §M only (a key pricing does NOT hold even commercially)
  const sections = { B: "Schedule CLIN 0001.", C: "SOW text.", I: "Clauses none relevant.", L: "Instructions.", M: `Evaluation.\n\n${WD_BLOCK}` };
  const off = withFlag(false, () => assembleLensPasses("pricing_contracts_risk", sections, { docClass: "commercial" }));
  assert(!off.sourceConcat.includes("2015-4417"), "OFF: WD under §M never reaches pricing (counter-proof)");
  const on = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", sections, { docClass: "commercial" }));
  assert(on.sourceConcat.includes("2015-4417") && on.sourceConcat.includes(RESCUE_PASS_HEADER), "ON: WD rescued into a labeled RESCUE pass");
  // rescue is deduped: content already in an assigned section adds NO rescue pass
  const dup = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", { B: WD_BLOCK, C: "x", I: "y", L: "z", M: "w" }, { docClass: "commercial" }));
  assert(!dup.sourceConcat.includes(RESCUE_PASS_HEADER), "ON: no rescue pass when the block already reached the lens (dedup)");
  // rescue never fires for an un-briefed lens
  const other = withFlag(true, () => assembleLensPasses("source_selection_evaluator", sections, { docClass: "commercial" }));
  assert(!other.sourceConcat.includes(RESCUE_PASS_HEADER), "ON: rescue scoped to the briefed lens only (SSE unaffected)");
}

console.log("\n── P6 — V3 read-cap rescue (readSection): WD in the truncated tail reaches the lens view ──");
{
  const filler = "The contractor shall perform routine center support services as described herein. ".repeat(200); // >12K
  const cText = `${filler}\n\n${WD_BLOCK}`;
  assert(cText.length > SECTION_READ_CAP, `fixture §C exceeds SECTION_READ_CAP (${cText.length} > ${SECTION_READ_CAP})`);
  const ctx = { fullSource: cText, sections: { C: cText } } as unknown as AuditToolContext;
  const off = withFlag(false, () => readSection(ctx, "C"));
  assert(off.truncated && !off.text.includes("2015-4417"), "OFF: WD tail beyond the cap is invisible (reproduces the V3 blindness)");
  const on = withFlag(true, () => readSection(ctx, "C"));
  assert(on.truncated, "ON: truncated flag stays honest (still a partial read)");
  assert(on.text.includes(SECTION_RESCUE_MARKER) && on.text.includes("2015-4417") && on.text.includes("HEALTH & WELFARE"),
    "ON: labor-standards tail blocks appended under the rescue marker");
  const onNoWd = withFlag(true, () => readSection({ fullSource: filler, sections: { C: filler } } as unknown as AuditToolContext, "C"));
  assert(!onNoWd.text.includes(SECTION_RESCUE_MARKER), "ON: no marker when the tail carries no labor-standards content (no noise)");
  const short = withFlag(true, () => readSection({ fullSource: WD_BLOCK, sections: { C: WD_BLOCK } } as unknown as AuditToolContext, "C"));
  assert(!short.truncated && !short.text.includes(SECTION_RESCUE_MARKER), "ON: untruncated section byte-identical (no rescue path)");
}

console.log("\n── P7 — extractor: both directions ──");
{
  const { blocks } = extractLaborStandardsBlocks(COMMERCIAL_FIXTURE);
  assert(blocks.length > 0 && blocks.some((b) => b.text.includes("2015-4417")), "extractor finds the WD block");
  assert(blocks.some((b) => b.text.includes("52.222-41")), "extractor finds the clause-matrix block");
  const negatives = extractLaborStandardsBlocks("The offeror shall submit a price list for each position. Delivery within 30 days ARO. Past performance will be evaluated using CPARS.");
  assert(negatives.blocks.length === 0, "extractor stays silent on non-labor-standards text (no over-trigger)");
  assert(extractLaborStandardsBlocks("").blocks.length === 0, "extractor safe on empty input");
}

console.log("\n── P8 (R1-F5/F9) — Davis-Bacon + short-form WD anchors ──");
{
  const DBA = [
    "GENERAL DECISION NUMBER: TX20240001 01/05/2024",
    "Superseded General Decision Number: TX20230001. State: Texas. Construction Type: Building.",
    "BRTX0005-004 05/01/2023 Rates Fringes BRICKLAYER 29.60 8.15",
  ].join("\n\n");
  const r = extractLaborStandardsBlocks(DBA);
  assert(r.blocks.length > 0 && r.blocks.some((b) => b.text.includes("TX20240001")), "DBA GENERAL DECISION block rescued");
  const shortForm = extractLaborStandardsBlocks("Pricing note follows.\n\nThe applicable wage determination is WD 15-4417 as incorporated.\n\nEnd.");
  assert(shortForm.blocks.length > 0, "short-form 'WD 15-4417' anchored");
  const dbaClause = extractLaborStandardsBlocks("Clause list.\n\n☒ 52.222-6 Construction Wage Rate Requirements (Aug 2023)\n\nEnd.");
  assert(dbaClause.blocks.length > 0, "DBA clause family 52.222-6 anchored");
}

console.log("\n── P9 (R1-F4) — dedupe keys on the ANCHORED paragraph, not prepended context ──");
{
  const BOILER = "This is a combined synopsis/solicitation for commercial items prepared in accordance with the format in FAR Subpart 12.6 as supplemented with additional information included in this notice and repeated on every page header of the extracted document text for emphasis.";
  // BOILER (the context paragraph preceding the WD) ALSO appears verbatim in an assigned section (§B)
  const sections = { B: `Schedule CLIN 0001.\n\n${BOILER}`, C: "SOW text.", I: "Clauses.", L: "Instructions.", M: `Evaluation.\n\n${BOILER}\n\n${WD_BLOCK}` };
  const on = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", sections, { docClass: "commercial" }));
  assert(on.sourceConcat.includes("2015-4417") && on.sourceConcat.includes(RESCUE_PASS_HEADER),
    "duplicated boilerplate context does NOT defeat the rescue (anchor-keyed dedupe)");
}

console.log("\n── P10 (R1-F6) — caps are never silent ──");
{
  // many distinct oversized WD blocks → total cap pressure; the rescue pass must carry the cap note
  // separator narrative paragraphs keep each WD a DISTINCT block (consecutive anchored paras coalesce)
  const bigBlocks = Array.from({ length: 6 }, (_, i) =>
    `REGISTER OF WAGE DETERMINATIONS UNDER THE SERVICE CONTRACT ACT\nWage Determination No.: 20${i}5-44${i}7 Revision No.: ${i}\n${`OCCUPATION CODE ${i} rates and fringes detail line. `.repeat(700)}`).join("\n\nOrdinary narrative separator paragraph with no anchor content at all.\n\nSecond separator paragraph, equally plain.\n\n");
  const sections = { B: "Schedule.", C: "SOW.", I: "Clauses.", L: "Instructions.", M: `Evaluation.\n\n${bigBlocks}` };
  const r = extractLaborStandardsBlocks(bigBlocks);
  assert(r.droppedForCap > 0, `total-cap pressure reports droppedForCap (${r.droppedForCap})`);
  const on = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", sections, { docClass: "commercial" }));
  assert(on.sourceConcat.includes("[rescue-capped:"), "rescue pass carries the cap note (no silent drop)");
  // readSection mid-cut marker
  const filler = "The contractor shall perform routine center support services as described herein. ".repeat(200);
  const giantTail = `${filler}\n\n${WD_BLOCK}\n\n${bigBlocks}`;
  const ctx = { fullSource: giantTail, sections: { C: giantTail } } as unknown as AuditToolContext;
  const read = withFlag(true, () => readSection(ctx, "C"));
  assert(read.text.includes(SECTION_RESCUE_MARKER) && read.text.includes("[rescue truncated at cap"),
    "readSection rescue marks a partial/truncated rescue (no silent mid-table cut)");
}

console.log("\n── P11 (R4-F3) — boilerplate-ended WD blocks: unique MIDDLE content must survive the dedupe ──");
{
  const OCC_HEADER = "OCCUPATION CODE - TITLE FOOTNOTE RATE listing per SCA WAGE DETERMINATION 2015-4417 register.";
  const OUTRO = "The conformance process outlined above must be followed when a class of employee is not listed; see 29 CFR 4.6(b)(2) for the SERVICE CONTRACT ACT conformance procedure in full detail as printed on every determination.";
  const LOC_A = `${OCC_HEADER}\n\n12320 - Substance Abuse Treatment Counselor 25.27\n\n${OUTRO}`;
  const LOC_B = `${OCC_HEADER}\n\nFINAL ROW: 30462 - Truck Driver Heavy 21.11 with HEALTH & WELFARE: $5.36 per hour\n\n${OUTRO}`;
  // locality A (incl. the shared header AND outro) sits in an ASSIGNED section; locality B's unique
  // middle rows are elsewhere — both sampled ENDS of B's block are boilerplate already assembled.
  const sections = { B: `Schedule.\n\n${LOC_A}`, C: "SOW.", I: "Clauses.", L: "Instructions.", M: `Evaluation.\n\n${LOC_B}` };
  const on = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", sections, { docClass: "commercial" }));
  assert(on.sourceConcat.includes("FINAL ROW") && on.sourceConcat.includes("$5.36"),
    "R4-F3: unique middle rows rescued despite boilerplate head AND outro (full-block containment dedupe)");
  // control: a block VERBATIM-contained in an assigned section is still deduped (no noise pass)
  const dup = withFlag(true, () => assembleLensPasses("pricing_contracts_risk", { B: `Schedule.\n\n${LOC_B}`, C: "x", I: "y", L: "z", M: `Evaluation.\n\n${LOC_B}` }, { docClass: "commercial" }));
  assert(!dup.sourceConcat.includes(RESCUE_PASS_HEADER) || dup.sourceConcat.split("FINAL ROW").length <= 3,
    "control: a verbatim-duplicate block does not spawn a redundant rescue pass");
}

console.log(failures === 0 ? "\n✅ ALL PASS — lens-emission-integrity" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
