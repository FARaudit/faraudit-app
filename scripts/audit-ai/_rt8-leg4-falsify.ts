// FALSIFIABILITY WITNESS for _rt8-absence-shape.ts LEG 4. A leg that cannot fail proves nothing, and LEG 4's first
// draft could not: its guard expression was malformed and reported 0 leaks on a rule that leaks 4 of 5.
//
// Two layers decide whether a document-absence claim is refuted:
//   L1  DOC_ABSENCE       — does the sentence carry an absence predicate at all
//   L2  subject position  — is the document token the NEAREST subject of that predicate
// This witness shows the leak is real once L1 is widened, and is closed only by L2 — so both the widening and the
// guard are load-bearing, and neither alone is sufficient. Run it after any change to either.
const ABSENCE = /\b(?:is|are|was|were)\s+(?:(?!(?:is|are|was|were)\b)[A-Za-z]+,?\s+){0,5}not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located|given|delivered|enclosed|appended)\b/i;
const INTERVENING_SUBJECT = /\b(?:is|are|was|were)\b|[.;:]/i;
const MAX_GAP = 60;

// Each names document A ("PWS", genuinely present) then asserts absence of a document B this solicitation lacks.
const LEAKS = [
  "The PWS is complete and the drawings are not provided in the source.",
  "PWS (Attachment 0001) is present, but the past performance questionnaire is not attached.",
  "The PWS is thorough although the site visit details are not furnished.",
  "PWS is analyzed; the pricing schedule is not included.",
  "The PWS is in the source. The drawings are not provided.",
];
const TRUE_POSITIVE = "UNVERIFIED ABSENCE — PWS (Attachment 0001) is listed but not reproduced in the source — obligations unknown.";

/** guard=false reproduces the shipped v1 semantics: the token appearing anywhere in the 60-char window was treated
 *  as "SUBJECT position", which is what the function's own comment claimed and its code did not enforce. */
function refutes(claim: string, token: string, subjectGuard: boolean): boolean {
  const m = ABSENCE.exec(claim);
  if (!m) return false;
  const lead = claim.slice(Math.max(0, m.index - MAX_GAP), m.index);
  const at = lead.toLowerCase().lastIndexOf(token);
  if (at < 0) return false;
  if (subjectGuard && INTERVENING_SUBJECT.test(lead.slice(at + token.length))) return false;
  return true;
}

let ok = true;
for (const guard of [false, true]) {
  const leaked = LEAKS.filter((s) => refutes(s, "pws", guard)).length;
  const tp = refutes(TRUE_POSITIVE, "pws", guard);
  console.log(`subject-position guard ${guard ? "ON " : "OFF"} · leaks ${leaked}/${LEAKS.length} · true-positive ${tp ? "kept" : "LOST"}`);
  for (const s of LEAKS) if (refutes(s, "pws", guard)) console.log(`    leak: ${s}`);
  if (guard && (leaked !== 0 || !tp)) ok = false;
  if (!guard && leaked === 0) ok = false; // the witness itself must witness something
}
console.log(`\nExpected: OFF leaks >0 (proximity is not subject position) · ON leaks 0/5 and keeps the true positive.`);
console.log(ok ? "WITNESS OK — LEG 4 is falsifiable and the guard closes it." : "WITNESS BROKEN — LEG 4 may be a placebo.");
process.exit(ok ? 0 : 1);
