// $0 regression lock for the PER-DOCUMENT UNCOVERED REASON recorder.
// Run: npx tsx src/lib/audit-uncovered-reason.test.ts
//
// SUBJECT: the production `documentsCovered`, not a re-implementation.
//
// WHAT THIS PROTECTS. The value of this recorder is that the reason is SPECIFIC — "unreadable" and
// "read but nothing grounded a finding in it" demand completely different work, and collapsing them
// would make the field worse than useless because it would look informative. So the assertions that
// matter are the ones that FAIL if two distinct causes start reporting the same word, or if the
// detail list stops agreeing with the uncovered list it describes.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;
const SPAN = "The offeror shall submit a completed bid bond with the offer prior to the deadline.";

(async () => {
  const { documentsCovered } = await import("./audit-orchestrator");

  // A package with one readable attachment carrying obligations, and one that is textless.
  const PKG = doc("Solicitation.pdf", "Primary body for this package, with ordinary wording.")
            + doc("Attachment A - Spec.pdf", `${SPAN} Further specification prose follows here for the work.`)
            + doc("Attachment B - Scan.pdf", "   ");

  const base = documentsCovered(PKG, [] as never, undefined);

  // ---- 1. THE DETAIL LIST MUST DESCRIBE THE UNCOVERED LIST -------------------------------------------
  ok("a detail row exists for every uncovered document",
    (base.uncoveredDetail ?? []).length === base.uncovered.length);
  ok("...and names the same documents",
    JSON.stringify((base.uncoveredDetail ?? []).map((d) => d.doc).sort()) === JSON.stringify([...base.uncovered].sort()));

  const reasonFor = (n: string) => (base.uncoveredDetail ?? []).find((d) => d.doc === n)?.reason;

  // ---- 2. THE TWO CAUSES MUST NOT COLLAPSE INTO ONE --------------------------------------------------
  ok("a textless document reads 'unreadable'", reasonFor("Attachment B - Scan.pdf") === "unreadable");
  ok("a READ document with no finding reads 'no_grounded_finding'",
    reasonFor("Attachment A - Spec.pdf") === "no_grounded_finding");
  ok("...and the two are DIFFERENT — the whole point of the field",
    reasonFor("Attachment B - Scan.pdf") !== reasonFor("Attachment A - Spec.pdf"));

  // ---- 3. A COVERED DOCUMENT APPEARS IN NEITHER LIST --------------------------------------------------
  const covered = documentsCovered(PKG, [] as never, {
    extractedSpans: [{ doc: "Attachment A - Spec.pdf", excerpt: SPAN }],
  });
  ok("a credited document leaves the uncovered list", !covered.uncovered.includes("Attachment A - Spec.pdf"));
  ok("...and leaves the detail list too",
    !(covered.uncoveredDetail ?? []).some((d) => d.doc === "Attachment A - Spec.pdf"));
  ok("the textless one is still uncovered, still 'unreadable'",
    (covered.uncoveredDetail ?? []).find((d) => d.doc === "Attachment B - Scan.pdf")?.reason === "unreadable");

  // ---- 4. SPANS OFFERED BUT REJECTED gets its OWN reason, not the generic one -------------------------
  const rejected = documentsCovered(PKG, [] as never, {
    extractedSpans: [{ doc: "Attachment A - Spec.pdf", excerpt: "Text that appears in no document whatsoever." }],
  });
  ok("offered-but-rejected spans read 'extraction_spans_rejected', NOT the generic default",
    (rejected.uncoveredDetail ?? []).find((d) => d.doc === "Attachment A - Spec.pdf")?.reason === "extraction_spans_rejected");

  // ---- 5. `complete` and `uncovered` are UNTOUCHED by adding the recorder -----------------------------
  ok("adding the detail did not change completeness", base.complete === false);
  ok("single-region packages still short-circuit COMPLETE",
    documentsCovered("A single body with no delimiter.", [] as never, undefined).complete === true);

  console.log(`\nuncovered-reason: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
