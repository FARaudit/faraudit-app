// $0 regression lock for COVERAGE-ONLY PER-DOCUMENT EXTRACTION (flag AUDIT_DOC_EXTRACTION).
// Run: npx tsx src/lib/audit-doc-extraction.test.ts
//
// SUBJECT: the production `verifySpans` / `selectExtractionTargets` and the production
// `documentsCovered` — not re-implementations of either.
//
// THE RISK THIS LOCKS. Extraction credit is a NEW way for a document to count as covered, so its
// failure direction is toward false-COMPLETE — the cardinal sin. The safety rests on one property:
// a span credits a document only if it is VERBATIM in that document's region and ABSENT from the
// primary. Every negative control below attacks that property directly. A gate that only proved the
// happy path would pass while the guard was gone.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;

// A sentence long enough to clear MIN_SPAN_CHARS (40 normalized chars).
const REAL_SPAN = "The offeror shall submit a completed bid bond with the offer prior to the deadline.";
const FLOWDOWN  = "The Contractor shall comply with all applicable Federal acquisition regulations herein.";

const PKG = doc("Solicitation.pdf", `Primary body. ${FLOWDOWN} Offerors must register in SAM.`)
          + doc("Attachment A - Spec.pdf", `${REAL_SPAN} Additional specification prose follows for the work.`)
          + doc("Attachment B - Wage.pdf", `${FLOWDOWN} Wage rates are listed in the table that follows here.`);

const extract = (docName: string, texts: string[]) => ({
  docName, clauses: [], clins: [], delivery: [],
  submissionRequirements: texts.map((t) => ({ bucket: "other" as const, text: t, sourceClause: null, isCritical: false })),
  evaluationFactors: [], performanceRequirements: [], amendmentChanges: [],
  workStatementText: null, warnings: [], truncated: false,
});

(async () => {
  const { verifySpans, selectExtractionTargets, MIN_SPAN_CHARS, DOC_EXTRACTION_ENABLED } =
    await import("./audit-doc-extraction");
  const { documentsCovered } = await import("./audit-orchestrator");

  // ---- 1. The flag is default-OFF -------------------------------------------------------------------
  delete process.env.AUDIT_DOC_EXTRACTION;
  ok("flag defaults OFF", DOC_EXTRACTION_ENABLED() === false);
  process.env.AUDIT_DOC_EXTRACTION = "true";
  ok("flag reads ON when set to the exact string", DOC_EXTRACTION_ENABLED() === true);

  // ---- 2. verifySpans — POSITIVE: a verbatim, long-enough span survives -------------------------------
  const region = `${REAL_SPAN} Additional specification prose follows for the work.`;
  ok("verbatim in-region span is kept", verifySpans(extract("Attachment A - Spec.pdf", [REAL_SPAN]), region).length === 1);

  // ---- 3. verifySpans — NEGATIVE CONTROLS (each must reject) -----------------------------------------
  ok("PARAPHRASE is rejected (not verbatim)",
    verifySpans(extract("d", ["The offeror should send a bid bond before the closing date of this solicitation."]), region).length === 0);
  ok("TOO-SHORT span is rejected even though it IS verbatim",
    verifySpans(extract("d", ["The offeror shall"]), region).length === 0);
  ok(`the floor is ${MIN_SPAN_CHARS} normalized chars`, MIN_SPAN_CHARS === 40);
  ok("span from a DIFFERENT document is rejected",
    verifySpans(extract("d", ["Wage rates are listed in the table that follows here."]), region).length === 0);
  ok("empty / whitespace span is rejected", verifySpans(extract("d", ["", "   "]), region).length === 0);
  ok("duplicate spans collapse to one", verifySpans(extract("d", [REAL_SPAN, REAL_SPAN]), region).length === 1);
  ok("whitespace/case differences still match (normalized compare)",
    verifySpans(extract("d", [REAL_SPAN.toUpperCase().replace(/ /g, "   ")]), region).length === 1);

  // ---- 4. selectExtractionTargets — unreadable and primary are never targets --------------------------
  const regions = [
    { name: "Solicitation.pdf", text: "primary", isPrimary: true },
    { name: "Attachment A - Spec.pdf", text: "readable body", isPrimary: false },
    { name: "Attachment C - Scan.pdf", text: "", isPrimary: false },
  ];
  const targets = selectExtractionTargets(regions, () => true, (t) => t.length > 0);
  ok("primary is never an extraction target", !targets.some((t) => t.name === "Solicitation.pdf"));
  ok("unreadable document is never an extraction target", !targets.some((t) => t.name === "Attachment C - Scan.pdf"));
  ok("readable binding document IS a target", targets.some((t) => t.name === "Attachment A - Spec.pdf"));
  ok("non-binding filter is honoured", selectExtractionTargets(regions, () => false, () => true).length === 0);

  // ---- 5. documentsCovered — the credit actually lifts the document -----------------------------------
  const base = documentsCovered(PKG, [] as never, undefined);
  ok("baseline: both attachments uncovered with no findings and no spans",
    base.uncovered.includes("Attachment A - Spec.pdf") && base.uncovered.includes("Attachment B - Wage.pdf"));

  const credited = documentsCovered(PKG, [] as never, {
    extractedSpans: [{ doc: "Attachment A - Spec.pdf", excerpt: REAL_SPAN }],
  });
  ok("a verbatim span COVERS its document", !credited.uncovered.includes("Attachment A - Spec.pdf"));
  ok("...and covers ONLY that document", credited.uncovered.includes("Attachment B - Wage.pdf"));

  // ---- 6. documentsCovered — NEGATIVE CONTROLS on the credit path -------------------------------------
  const flowdown = documentsCovered(PKG, [] as never, {
    extractedSpans: [{ doc: "Attachment B - Wage.pdf", excerpt: FLOWDOWN }],
  });
  ok("a span shared with the PRIMARY credits nothing (flow-down sentence)",
    flowdown.uncovered.includes("Attachment B - Wage.pdf"));

  const wrongDoc = documentsCovered(PKG, [] as never, {
    extractedSpans: [{ doc: "Attachment B - Wage.pdf", excerpt: REAL_SPAN }],
  });
  ok("a span attributed to the WRONG document credits nothing",
    wrongDoc.uncovered.includes("Attachment B - Wage.pdf"));

  const fabricated = documentsCovered(PKG, [] as never, {
    extractedSpans: [{ doc: "Attachment A - Spec.pdf", excerpt: "A requirement that appears in no document at all here." }],
  });
  ok("a FABRICATED span credits nothing", fabricated.uncovered.includes("Attachment A - Spec.pdf"));

  // ---- 7. BYTE-IDENTITY when the feature is not used --------------------------------------------------
  const noOpts = documentsCovered(PKG, [] as never, undefined);
  const emptySpans = documentsCovered(PKG, [] as never, { extractedSpans: [] });
  ok("opts with empty extractedSpans === no opts at all",
    JSON.stringify(noOpts) === JSON.stringify(emptySpans));

  ok("extraction-only opts leave the legacy result identical to undefined",
    JSON.stringify(documentsCovered(PKG, [] as never, { extractedSpans: [] }).uncovered)
    === JSON.stringify(noOpts.uncovered));

  // ---- 8. crossAttGate MUST NOT switch on merely because opts is present -------------------------------
  // The discriminator: a binding document carrying ELIGIBILITY-BAR language but NO duty verb. obligationsOf
  // finds nothing, so it reaches the read_no_obligation valve, and there the two gate states DIVERGE —
  // crossAttGate OFF grants the free pass (covered), ON withdraws it (uncovered). Without this fixture the
  // suite was blind to the change: reverting `crossAttGate` to `opts != null` left every other assertion
  // green, which is how an unproven guard ships.
  // (Requires AUDIT_BINDING_DOC_ANALYSIS_FLOOR unset — that flag short-circuits the valve before the gate
  // is consulted, and would mask the divergence.)
  delete process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR;
  const BAR_PKG = doc("Solicitation.pdf", "Primary body with unrelated wording for this package.")
                + doc("Attachment D - Notice.pdf", "This acquisition is a HUBZone set-aside for qualified concerns.");
  const barNoOpts = documentsCovered(BAR_PKG, [] as never, undefined);
  const barExtractionOnly = documentsCovered(BAR_PKG, [] as never, { extractedSpans: [] });
  const barLegacyOpts = documentsCovered(BAR_PKG, [] as never, { docsRead: [], attestations: [] });

  ok("fixture is a real discriminator: legacy opts (crossAttGate ON) DO change the outcome",
    JSON.stringify(barLegacyOpts.uncovered) !== JSON.stringify(barNoOpts.uncovered));
  ok("extraction-only opts must NOT flip crossAttGate — identical to undefined",
    JSON.stringify(barExtractionOnly.uncovered) === JSON.stringify(barNoOpts.uncovered));

  console.log(`\ncoverage-only doc extraction: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
