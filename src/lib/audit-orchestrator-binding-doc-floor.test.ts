// $0 regression lock for the BINDING-DOC ANALYSIS FLOOR (flag AUDIT_BINDING_DOC_ANALYSIS_FLOOR).
// Run: npx tsx src/lib/audit-orchestrator-binding-doc-floor.test.ts
//
// WHAT BROKE. REPORT-TRUTH #1 made the documents card report the verdict path's own gap list instead of an ingestion
// count — but that gap list comes from `documentsCovered`, which grants a FREE PASS to any binding attachment whose
// `obligationsOf` finds no obligation SENTENCE. obligationsOf is a DUTY-VERB detector
// (shall|must|provide|submit|furnish|required|quote|deliver), and an amendment states its operative content in the
// INDICATIVE: "The purpose of this amendment is to extend the close date from 07/01/2026 to 07/21/2026." Zero duty
// verbs ⇒ free pass ⇒ the document counts as ANALYZED while no finding ever read it.
//
// The bodies below are VERBATIM from banked runs (36C24126Q0569 audit bb1d6997, SPRRA2-26-R-0034 audit 8c6fbf67),
// not invented prose — the defect is only interesting on the text that actually shipped. `_census-read-not-analyzed.ts`
// found 10 such documents across 15 banked audits, every one of them through this single path.
//
// SUBJECT: `documentsCovered` — the production function, not a re-implementation.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;

// VERBATIM specimen bodies (whitespace-collapsed) from the banked runs.
const AMD_DEADLINE =
  "36C24126Q0569 0003.docx SUBJECT* West Haven Ground Maintenance GENERAL INFORMATION CONTRACTING OFFICE'S ZIP CODE* 04330 "
  + "SOLICITATION NUMBER* 36C24126Q0569 RESPONSE DATE/TIME/ZONE 07-21-2026 10am EASTERN TIME, NEW YORK, USA SET-ASIDE SDVOSBC "
  + "NAICS CODE* 561730 DESCRIPTION The purpose of this amendment is to extend the close date from 07/01/2026 @ 10am to 07/21/2026 @ 10am.";
const AMD_QUANTITY =
  "DEFENSE LOGISTICS AGENCY AVIATION RE: Letter Request for Proposal (RFP) SPRRA2-26-R-0034 AMENDMENT 001 THE PURPOSE OF THIS "
  + "AMENDMENT IS TO: 1) EXTEND THE DUE DATE FOR THE “24K Environmental Control Unit (ECU)” FROM: 29 JANUARY, 2026 at 4:00 PM CST. "
  + "TO: 30 APRIL, 2026 at 4:00 PM CST. 2) UPDATE THE QUANINTY FOR LINE 1: FROM: P/N: 2714M1000-90 QUANTITY: 75 TO: P/N: 2714M1000-90 "
  + "QUANTITY: 45 4) ALL OTHER TERMS AND CONDITIONS REMAIN UNCHANGED AND IN EFFECT.";
// The NEGATIVE CONTROL — also 0 obligation sentences, but genuinely non-operative (a figure's label list).
// It must behave EXACTLY like the amendments under the floor: the floor does not try to tell them apart by content.
const APPENDIX_F =
  "Appendix F – Storm Drains Newington B1 Memorial Road P Memorial Road Veterans Drive B2E B3 B2C B2W B65 B12 P6 "
  + "VICTORY GARDENS Veterans Circle B4 B14 B33 B34B32 B44 B42 B10 P4 P4A P2A P2 P1 B8 B7 B13 -- 1 of 1 --";
const PRIMARY = "Solicitation 36C24126Q0569. The Government will award to the lowest priced technically acceptable offeror.";
const PWS_WITH_DUTY = "The contractor shall furnish all necessary labor, material and equipment to mow and edge all turf areas.";

const withFlag = async <T>(on: boolean, fn: () => Promise<T> | T): Promise<T> => {
  const prev = process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR;
  if (on) process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR = "true"; else delete process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR; else process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR = prev;
  }
};

(async () => {
  // Live worker flag state for the surrounding gates, so the test measures the production path
  // (AUDIT_ATTACHMENT_COVERAGE=false ⇒ crossAttGate off ⇒ the ELIGIBILITY_BAR_RE floor beside this one is inert).
  process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
  const { documentsCovered } = await import("./audit-orchestrator");

  // A finding grounded in the PWS and nowhere else — the amendments have no finding, which is the whole point.
  const findings = [{ excerpt: "The contractor shall furnish all necessary labor, material and equipment", grounded: true, severity: "medium", kind: "requirement" }] as never;

  const PKG = doc("Solicitation 36C24126Q0569.pdf", PRIMARY)
    + doc("PWS.pdf", PWS_WITH_DUTY)
    + doc("36C24126Q0569 0003.docx", AMD_DEADLINE)
    + doc("Request for Proposal_Raytheon_SPRRA2-26-R-0034_AMD 001.pdf", AMD_QUANTITY)
    + doc("Appendix F Storm Drains Newington.pdf", APPENDIX_F);

  // ---- 1. THE DEFECT, flag OFF (this is prod-today, and it must stay byte-identical) -----------------------------
  const off = await withFlag(false, () => documentsCovered(PKG, findings, undefined));
  ok("flag OFF: the deadline amendment is counted COVERED — the live defect, reproduced", !off.uncovered.includes("36C24126Q0569 0003.docx"));
  ok("flag OFF: the quantity amendment is counted COVERED", !off.uncovered.includes("Request for Proposal_Raytheon_SPRRA2-26-R-0034_AMD 001.pdf"));
  ok("flag OFF: documentsCovered therefore reports COMPLETE", off.complete === true);

  // ---- 2. THE FIX, flag ON ---------------------------------------------------------------------------------------
  const on = await withFlag(true, () => documentsCovered(PKG, findings, undefined));
  ok("flag ON: the deadline amendment is NAMED uncovered", on.uncovered.includes("36C24126Q0569 0003.docx"));
  ok("flag ON: the quantity amendment is NAMED uncovered", on.uncovered.includes("Request for Proposal_Raytheon_SPRRA2-26-R-0034_AMD 001.pdf"));
  ok("flag ON: coverage is no longer COMPLETE", on.complete === false);

  // ---- 3. NO OVER-NAMING: a document a finding actually analyzed stays covered -----------------------------------
  ok("flag ON: the PWS carries a grounded finding, so it stays COVERED", !on.uncovered.includes("PWS.pdf"));
  ok("flag ON: the primary is never listed (section completeness governs it)", !on.uncovered.includes("Solicitation 36C24126Q0569.pdf"));

  // ---- 4. The floor withdraws a PASS; it never invents a bar. The negative control is named for the SAME reason --
  // Appendix F is genuinely non-operative, and under the floor it is named too. That is correct and deliberate: the
  // floor's claim is "no finding analyzed this", which is TRUE of Appendix F. It caps and names (Rule 70), it does not
  // assert the document contains an obligation — an honest "nothing was drawn from this" beats a guess either way.
  ok("flag ON: the non-operative appendix is named on the same honest ground", on.uncovered.includes("Appendix F Storm Drains Newington.pdf"));

  // ---- 4b. THE NOTICE BODY IS EXCLUDED --------------------------------------------------------------------------
  // Found by the OFF→ON delta on the banked corpus, not by reasoning: the first cut of this floor newly named
  // "SAM Notice Body" on 3 runs. It is SAM's description FIELD, not a posted document — excluded from both sides of
  // the customer-facing count — so naming it would seat a document in the completeness veto that can never appear in
  // the card explaining it, and on an otherwise-clean run would force incompleteness off a synopsis blurb alone.
  const NB = "SAM Notice Body";
  const NB_PKG = doc("Solicitation.pdf", PRIMARY)
    + doc(NB, "24K Environmental Control Unit (ECU) Sole Source to Raytheon. Place of Performance Andover, MA USA.")
    + doc("PWS.pdf", PWS_WITH_DUTY);
  const nbOn = await withFlag(true, () => documentsCovered(NB_PKG, findings, undefined));
  ok("flag ON: the notice body is NEVER named by this floor", !nbOn.uncovered.includes(NB));
  ok("flag ON: a notice-body-only package stays COMPLETE (no false decline off a synopsis blurb)", nbOn.complete === true);

  // ---- 5. The valve is not the path when obligations DO exist: identical both ways -------------------------------
  const DUTY_PKG = doc("Solicitation.pdf", PRIMARY) + doc("Spec.pdf", "The contractor shall deliver all items within 30 days of award.");
  const dOff = await withFlag(false, () => documentsCovered(DUTY_PKG, [] as never, undefined));
  const dOn = await withFlag(true, () => documentsCovered(DUTY_PKG, [] as never, undefined));
  ok("a doc WITH obligation sentences is unaffected by the flag (same uncovered set)", JSON.stringify(dOff.uncovered) === JSON.stringify(dOn.uncovered));
  ok("and it was already uncovered without a grounded finding", dOn.uncovered.includes("Spec.pdf"));

  // ---- 6. Single-document packages short-circuit before the valve, both ways -------------------------------------
  const SINGLE = "A plain single solicitation body with no document delimiter at all.";
  ok("single-region package: COMPLETE under both flag states", (await withFlag(true, () => documentsCovered(SINGLE, [] as never, undefined))).complete === true
    && (await withFlag(false, () => documentsCovered(SINGLE, [] as never, undefined))).complete === true);

  console.log(`\nbinding-doc analysis floor: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
