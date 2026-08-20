// $0 regression lock for THE COVERAGE DEFINITION (src/lib/audit-coverage-definition.ts).
// Run: npx tsx src/lib/audit-coverage-definition.test.ts
//
// SUBJECT: the production `deriveDocumentCoverage` / `coverageDisclosure`.
//
// THE RISK THIS LOCKS, and it is the cardinal one: coverage is the number that decides whether the
// engine commits or refuses, so its failure direction is toward false-COMPLETE. The whole safety of
// this module rests on ONE property — an excerpt credits a document only if it is verbatim in THAT
// document and in NO other. That property is what the live `documentsCovered` predicate lacks: on the
// flagship it credited three documents nothing had analysed, because each shared its crediting phrase
// with a sibling. Every negative control below attacks the uniqueness clause directly. A gate that only
// proved the happy path would pass while the guard was gone.
import { deriveDocumentCoverage, coverageDisclosure, NOTICE_BODY_DOC_NAME } from "./audit-coverage-definition";
import type { TypedFinding } from "./audit-findings";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

const UNIQUE_SOW = "The Contractor shall repave the north apron before the thirtieth of September.";
const SHARED     = "The Contractor shall comply with all applicable Federal acquisition regulations.";
const UNIQUE_WD  = "Laborers must be paid no less than the rate listed for El Paso County herein.";
const NO_DUTY    = "This page intentionally contains a table of figures and nothing else at all.";

const R = (name: string, text: string) => ({ name, text });
const F = (id: string, excerpt: string, grounded = true): TypedFinding =>
  ({ id, excerpt, grounded } as unknown as TypedFinding);

const regions = [
  R(NOTICE_BODY_DOC_NAME, `Notice body. ${SHARED}`),
  R("Statement of Work.pdf", `${UNIQUE_SOW} ${SHARED} More scope prose.`),
  R("Wage Determination TX.pdf", `${UNIQUE_WD} ${SHARED} Rate tables follow.`),
  R("Bid Schedule NM.pdf", `${SHARED} Line items follow for New Mexico.`),
  R("Attachment C - Sample Report.pdf", NO_DUTY),
];

console.log("── a UNIQUE excerpt analyses exactly the document it is in");
{
  const c = deriveDocumentCoverage(regions, [F("f1", UNIQUE_SOW)]);
  ok("analysed === 1", c.analysed === 1);
  ok("it is the SOW", c.findingsPerDocument[0]?.doc === "Statement of Work.pdf");
  ok("the notice body is out of the denominator", c.received === 4);
}

console.log("── ⛔ NEGATIVE CONTROL: a SHARED excerpt analyses NOTHING (the live defect)");
{
  const c = deriveDocumentCoverage(regions, [F("f1", SHARED)]);
  ok("analysed === 0 — a phrase in four documents proves none of them was analysed", c.analysed === 0);
  ok("and the shared credit is NAMED, not silent", c.sharedExcerptCreditOnly.length >= 3);
  ok("Bid Schedule NM is NOT credited", !c.findingsPerDocument.some((d) => d.doc === "Bid Schedule NM.pdf"));
}

console.log("── ⛔ NEGATIVE CONTROL: an UNGROUNDED finding credits nothing (Rule 64)");
{
  const c = deriveDocumentCoverage(regions, [F("f1", UNIQUE_SOW, false)]);
  ok("analysed === 0", c.analysed === 0);
}

console.log("── ⛔ NEGATIVE CONTROL: a PARAPHRASE credits nothing — verbatim or nothing");
{
  const c = deriveDocumentCoverage(regions, [F("f1", "The contractor will repave the northern apron by September 30")]);
  ok("analysed === 0", c.analysed === 0);
}

console.log("── obligation-carrying is counted over full text, and the gap is NAMED");
{
  const c = deriveDocumentCoverage(regions, [F("f1", UNIQUE_SOW)]);
  ok("3 of 4 posted documents carry an obligation ('shall'/'must'/'paid')", c.obligationCarrying === 3);
  ok("the duty-free sample report is not in the obligation denominator",
     !c.unanalysedObligationCarrying.includes("Attachment C - Sample Report.pdf"));
  ok("the two unanalysed obligation-carriers are NAMED", c.unanalysedObligationCarrying.length === 2);
  ok("obligationCarryingAndAnalysed === 1", c.obligationCarryingAndAnalysed === 1);
}

console.log("── residue is NAMED, never silently defaulted");
{
  const c = deriveDocumentCoverage(regions, []);
  ok("the sample report falls to residue and is named", c.residue.includes("Attachment C - Sample Report.pdf"));
  ok("assigned + residue === received", c.assigned + c.residue.length === c.received);
}

console.log("── the disclosure NAMES what was not analysed (doctrine rule 4 / Rule 61)");
{
  const c = deriveDocumentCoverage(regions, [F("f1", UNIQUE_SOW)]);
  const s = coverageDisclosure(c);
  ok("it states the fraction", /1 of 3/.test(s));
  ok("it NAMES the wage determination", s.includes("Wage Determination TX.pdf"));
  ok("it NAMES the bid schedule", s.includes("Bid Schedule NM.pdf"));
  const all = deriveDocumentCoverage(regions, [F("f1", UNIQUE_SOW), F("f2", UNIQUE_WD), F("f3", "Line items follow for New Mexico")]);
  ok("full coverage says so without naming anything", /All 3 of the 4/.test(coverageDisclosure(all)));
}

console.log("── a package with no posted documents does not divide by zero");
{
  const c = deriveDocumentCoverage([R(NOTICE_BODY_DOC_NAME, "body")], []);
  ok("received === 0 and the disclosure is honest", c.received === 0 && /No posted binding documents/.test(coverageDisclosure(c)));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
