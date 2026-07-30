// $0 regression lock for REPORT-TRUTH #1 — `documents.analyzed` must count documents ANALYZED, never documents READ.
// Run: npx tsx src/lib/audit-executor-v3-analyzed-truth.test.ts
//
// WHAT BROKE (live run 95698f91, W9123826QA032, 2026-07-30): the report published documents = {read:3, analyzed:3,
// complete:true, missing:[]} while the engine's OWN `documentsCovered` had independently returned
// uncovered=["WAGE DETERMINATIONS - 20260513.pdf"]. The customer was then told the SCA wage rates were "unknown" over a
// 29,427-char Wage Determination carrying all 21 of them. Root cause: `analyzed` was an INGESTION count
// (`ingested && has_text !== false`) that never consulted a finding, and the honest gap list had no consumer on the
// display path. This locks the fix: ONE computation feeds both the verdict and the display.
//
// The subject is `deriveAnalyzedDocuments` — the exact function the executor calls (production composition, not a
// re-implementation of its logic in the test).
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;
const NOTICE = "SAM Notice Body";

(async () => {
  const { deriveAnalyzedDocuments } = await import("./audit-executor-v3");

  // ---- 1. THE REGRESSION ITSELF: the 95698f91 package shape ----------------------------------------------------
  // 4 regions (primary + notice body + PWS + WD); the WD is the doc the engine read in full and drew nothing from.
  const PKG = doc("Solicitation - W9123826QA032.pdf", "The following factors will be used to evaluate offers: Price Only.")
    + doc(NOTICE, "All questions must be submitted in writing to the Contract Specialist.")
    + doc("PWS KO Appropved - 20260720.pdf", "The contractor shall furnish all necessary labor, material and equipment to mow and edge.")
    + doc("WAGE DETERMINATIONS - 20260513.pdf", "WD 2015-5631 Rev 27. Gardener 27.19. Health & Welfare 5.55 per hour.");

  const real = deriveAnalyzedDocuments(PKG, ["WAGE DETERMINATIONS - 20260513.pdf"]);
  ok("95698f91: analyzed is 2, NOT the 3 that shipped", real.analyzed === 2);
  ok("95698f91: denominator excludes the notice body (3, not 4)", real.analyzed_of === 3);
  ok("95698f91: the WD is NAMED, never a silent gap", real.unanalyzed.length === 1 && real.unanalyzed[0].name === "WAGE DETERMINATIONS - 20260513.pdf");
  ok("95698f91: the reason says NOT analyzed, not 'not retrieved'", /not analyzed/i.test(real.unanalyzed[0]?.reason ?? ""));
  // The defect in one assertion: analyzed must not equal the read count when a read doc yielded nothing.
  ok("95698f91: analyzed < analyzed_of (the whole point)", real.analyzed < real.analyzed_of);

  // ---- 1b. DISCRIMINATING POWER: the OLD formula, on the SAME package, gets it wrong -------------------------
  // Verbatim from executor-v3 (`ingested && has_text !== false`) against the ingestion manifest this package
  // corresponds to: 3 posted files, all fetched, all with a text layer — including the WD, which HAS text and simply
  // was never analyzed. Reproduced here so the assertions above are shown to discriminate rather than merely pass.
  const OLD_ING_FILES = [
    { name: "Solicitation - W9123826QA032.pdf", ingested: true, has_text: true },
    { name: "PWS KO Appropved - 20260720.pdf", ingested: true, has_text: true },
    { name: "WAGE DETERMINATIONS - 20260513.pdf", ingested: true, has_text: true },
  ];
  const oldAnalyzed = OLD_ING_FILES.filter((f) => f.ingested && f.has_text !== false).length;
  ok("OLD formula returns 3 (the number that shipped)", oldAnalyzed === 3);
  ok("OLD formula names nothing — the gap was invisible", real.analyzed !== oldAnalyzed);

  // ---- 2. FALSIFICATION: a clean package must NOT be flagged --------------------------------------------------
  // Written before trusting the green above — a derivation that flags everything would pass every assertion in §1.
  const clean = deriveAnalyzedDocuments(PKG, []);
  ok("clean package: nothing named unanalyzed", clean.unanalyzed.length === 0);
  ok("clean package: analyzed === analyzed_of === 3", clean.analyzed === 3 && clean.analyzed_of === 3);

  // ---- 3. PLANTED POSITIVE: every binding doc uncovered --------------------------------------------------------
  const allGone = deriveAnalyzedDocuments(PKG, [
    "Solicitation - W9123826QA032.pdf", "PWS KO Appropved - 20260720.pdf", "WAGE DETERMINATIONS - 20260513.pdf",
  ]);
  ok("all uncovered: analyzed floors at 0, never negative", allGone.analyzed === 0);
  ok("all uncovered: all three named", allGone.unanalyzed.length === 3);

  // ---- 4. THE NOTICE BODY IS NOT A POSTED DOCUMENT -------------------------------------------------------------
  // It is SAM's description field. It must not inflate the denominator, and an uncovered notice body must not be
  // reported as an unanalyzed FILE (the posted/read counts make the same exclusion).
  const nb = deriveAnalyzedDocuments(PKG, [NOTICE]);
  ok("notice body: excluded from the denominator", nb.analyzed_of === 3);
  ok("notice body: never listed as an unanalyzed document", nb.unanalyzed.length === 0);
  ok("notice body: does not decrement analyzed", nb.analyzed === 3);

  // ---- 5. SUBSET DISCIPLINE: a name outside the region set cannot drive the count ------------------------------
  // `uncovered` is a subset of the regions by construction today. If that ever diverges, the count must UNDER-report
  // the gap rather than go negative or invent a document the customer never received.
  const stray = deriveAnalyzedDocuments(PKG, ["A Document That Is Not In This Package.pdf", "WAGE DETERMINATIONS - 20260513.pdf"]);
  ok("stray name: ignored, only the real gap is named", stray.unanalyzed.length === 1 && stray.unanalyzed[0].name === "WAGE DETERMINATIONS - 20260513.pdf");
  ok("stray name: analyzed stays coherent (2 of 3)", stray.analyzed === 2 && stray.analyzed_of === 3);

  // ---- 6. SINGLE-DOC PACKAGE (no delimiter) --------------------------------------------------------------------
  // docRegions collapses to one primary region; section completeness governs. Must stay coherent, never 0-of-0.
  const single = deriveAnalyzedDocuments("A plain single solicitation body with no document delimiter at all.", []);
  ok("single-doc: analyzed_of === 1", single.analyzed_of === 1);
  ok("single-doc: analyzed === 1, nothing named", single.analyzed === 1 && single.unanalyzed.length === 0);

  console.log(`\nREPORT-TRUTH #1 · analyzed-not-read: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
