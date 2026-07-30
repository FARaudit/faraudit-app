// $0 regression lock for REPORT-TRUTH #4 — read the CLIN schedule the solicitation actually states.
// Run: npx tsx src/lib/audit-clin-schedule.test.ts
//
// The Gauntlet reported "the SF-1449 field layer yields LABELS WITHOUT VALUES (blocks 8/9/10/12)". The symptom was
// real; the cause was not. The posted SF-1449 is a BLANK template — there are no values in those blocks to extract.
// The real schedule sits in the continuation sheets, fully extracted, and the engine never read it: §B of run
// 95698f91 carries 26 line items with titles, quantities, pricing arrangement and NAICS, while the report's CLIN
// panel scraped four-digit tokens out of finding prose and rendered a street number as a line item.
//
// The fixtures below are VERBATIM §B/§E/§F shapes from that run, including its de-columnized wrapping.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const SRC = [
  "Section A - Solicitation/Contract Form",
  "8. OFFER DUE DATE/", "LOCAL TIME", "9. ISSUED BY", "21.", "QUANTITY", "23.", "UNIT PRICE",  // the blank SF-1449 labels
  "Section B - Supplies or Services & Prices or Costs",
  "Unit Unit Price Amount",
  "0001 Moving and Edging",
  "Product Service Code: S208",
  "North American Industry",
  "Classification System (NAICS):",
  "561730",
  "Pricing Arrangement: Firm Fixed",
  "Price",
  "52 Each",
  "0002 Weeding",
  "Product Service Code: S208",
  "Pricing Arrangement: Firm Fixed",
  "Price",
  "52 Each",
  "0004 Preventive Maintenance 2 Each",          // title and quantity share the item line
  "Product Service Code: S208",
  "Pricing Arrangement: Firm Fixed",
  "Price",
  "W9123826QA032", "Page 5 of 70", "", "-- 5 of 70 --", "",   // page furniture interleaved by the extractor
  "1005 North American Industry",                 // option item — the title column is genuinely EMPTY
  "Classification System (NAICS):",
  "561730",
  "Pricing Arrangement: Firm Fixed",
  "Price",
  "Section C - Description/Specifications/Statement of Work",
  "0001 this line is in section C and must not be read as a schedule item",
  "Section E - Inspection and Acceptance",
  "0001 Inspection and Acceptance Location",      // §E restates the SAME item numbers
  "Section F - Deliveries or Performance",
  "0001 52 Each\tQuantity",
  "Period of Performance",
  "From",
  "15 Sep 2026",
  "To",
  "31 Aug 2027",
  "0002 52 Each\tQuantity",
  "Period of Performance",
  "From",
  "01 Sep 2027",
  "To",
  "31 Aug 2028",
].join("\n");

(async () => {
  const { extractClinSchedule } = await import("./audit-clin-schedule");
  const rows = extractClinSchedule(SRC);
  const by = (c: string) => rows.find((r) => r.clin === c);

  // ---- 1. THE SCHEDULE IS READ ---------------------------------------------------------------------------------
  ok("four §B items extracted", rows.length === 4);
  ok("0001 title", by("0001")?.title === "Moving and Edging");
  ok("0001 quantity from the block", by("0001")?.qtyUnit === "52 Each");
  ok("0001 pricing arrangement, un-wrapped across two lines", by("0001")?.type === "Firm Fixed Price");
  ok("0001 period joined from §F", by("0001")?.period === "15 Sep 2026 – 31 Aug 2027");
  ok("0002 period is its OWN, not 0001's", by("0002")?.period === "01 Sep 2027 – 31 Aug 2028");
  ok("0004 title and qty split off a shared item line", by("0004")?.title === "Preventive Maintenance" && by("0004")?.qtyUnit === "2 Each");

  // ---- 2. ABSENT ≠ INVENTED (compute-or-absent, REPORT-TRUTH #3) -----------------------------------------------
  ok("1005 is extracted", !!by("1005"));
  ok("1005 has NO title — the source's title column is empty, so none is invented", by("1005")?.title === undefined);
  ok("1005 has no quantity (absent in its block)", by("1005")?.qtyUnit === undefined);
  ok("1005 still carries the pricing arrangement it DOES state", by("1005")?.type === "Firm Fixed Price");
  ok("no row carries a period §F never stated", by("1005")?.period === undefined && by("0004")?.period === undefined);

  // ---- 3. THE §B BOUND IS LOAD-BEARING -------------------------------------------------------------------------
  // §C, §E and §F all restate item 0001. An unbounded scan yields conflicting blocks and keeps whichever came last.
  ok("0001 was NOT overwritten by §E's 'Inspection and Acceptance Location'", by("0001")?.title === "Moving and Edging");
  ok("§C's decoy line did not become a schedule item", !rows.some((r) => (r.title ?? "").includes("section C")));
  ok("exactly one row per item number", new Set(rows.map((r) => r.clin)).size === rows.length);

  // ---- 4. THE BLANK SF-1449 LABELS ARE NOT ITEMS ---------------------------------------------------------------
  // "21." / "23." are form labels in §A, not line items — and they are outside §B, which is what excludes them.
  ok("no item invented from the blank SF-1449 label block", !rows.some((r) => ["0021", "0023", "0008", "0009"].includes(r.clin)));

  // ---- 5. FALSIFICATION: honest empties, never a partial guess --------------------------------------------------
  ok("no §B section ⇒ [] (not a guess from the rest of the document)",
    extractClinSchedule("Section F - Deliveries or Performance\n0001 52 Each\tQuantity").length === 0);
  ok("§B present but itemless ⇒ []", extractClinSchedule("Section B - Supplies or Services\nUnit Unit Price Amount\nno items here").length === 0);
  ok("empty source ⇒ []", extractClinSchedule("").length === 0);

  // A four-digit token in §B PROSE that is not at line start must not become an item — this is the #3 defect class.
  const prose = "Section B - Supplies or Services\nPlace of performance is 1810 Jefferson Blvd, Sacramento, CA 95833\nSection C - x";
  ok("a street number inside §B prose is not a line item", extractClinSchedule(prose).length === 0);

  console.log(`\nREPORT-TRUTH #4 · CLIN schedule extraction: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
