// REPORT-TRUTH #7 — RECONCILE ABSENCE CLAIMS AGAINST THE RUN'S OWN LEDGER (flag AUDIT_ABSENCE_RECONCILE, default OFF).
//
// THE DEFECT, as the Gauntlet's contracts-attorney named it and the red-team upheld it: "UNVERIFIED ABSENCE is emitted
// per-lens and never reconciled against the run's own provenance ledger — hallucinated absence, the mirror of
// hallucinated coverage." Both surviving AUTO-Fs on live run 583df921 are this one root:
//
//   "PWS (Attachment 0001) is referenced but NOT PROVIDED in the assigned source"
//        → the region "PWS KO Appropved - 20260720.pdf" is 28,728 chars of that very source, AND produced 3 findings
//   "Wage Determination (Attachment 0002) is referenced but NOT REPRODUCED … rates are unknown"
//        → the region "WAGE DETERMINATIONS - 20260513.pdf" is 29,427 chars of that very source
//
// WHY REPORT-TRUTH #2 DID NOT FIX THIS. #2 WRAPPED these claims ("UNVERIFIED ABSENCE — … this audit did not locate
// it"). Hedging a false statement does not make it true: the PWS *is* provided, and the report quotes it three
// findings later. The engine was holding the ledger that refutes the claim and never consulted it. This is that
// consultation — deterministic, $0, no model call.
//
// NO VOCABULARY. The document names are not a hardcoded list — they are read from the RUN'S OWN SOURCE via
// docRegions(). Matching a claim to a document uses tokens derived from those names at runtime, so this cannot become
// the blocklist treadmill card #515 forbids: a solicitation with different attachments yields different tokens.
//
// FAILURE DIRECTION — the load-bearing choice. Wrongly refuting a TRUE absence claim would DELETE a real warning,
// which is the dangerous direction. So the match is deliberately narrow (the document token must sit in SUBJECT
// position, immediately before the absence predicate), and a refuted claim is never silently dropped — its assertion
// is REPLACED with what the ledger actually says, which per REPORT-TRUTH #1 is either "analyzed" or "retrieved but
// not analyzed". The customer ends up with a true statement instead of a false one, never with silence.

import { docRegions } from "./audit-orchestrator";
// Shared with REPORT-TRUTH #8 so both correctors hold the SAME budget as the renderer — one definition, one number.
import { fitToRender } from "./audit-force-grounding";

export interface AbsenceReconcileResult<T> { findings: T[]; refuted: Array<{ id: string; doc: string; kind: "present_and_analyzed" | "present_not_analyzed"; before: string; after: string }>; }

/** Absence predicates asserted OF A DOCUMENT — "not provided", "not reproduced", "not attached", "not included",
 *  "not furnished", "was not located". Shape only; none names a procurement concept.
 *
 *  THE CONNECTIVE SLOT IS QUANTIFIED, NOT ENUMERATED. v1 permitted exactly one interjection — `referenced\s+but` —
 *  and live run 61aaaa95 wrote "PWS (Attachment 0001) IS LISTED BUT not reproduced", which walked straight through
 *  the rule written to stop it. One hardcoded connective is a blocklist with better branding: "listed but", "cited
 *  but", "referenced yet", "identified however" are all phrasings a competent writer reaches for, and every one of
 *  them defeated v1 (probe `_rt8-absence-shape.ts` LEG 2: 12/84 matched pre-fix). So the slot now admits ANY run of
 *  words — no word is named.
 *
 *  WHAT BOUNDS IT IS GRAMMATICAL RELATION, NOT WORD COUNT. The danger of a loose gap is reaching a DIFFERENT
 *  subject: in "the PWS is complete and the drawings are not provided", a purely length-bounded gap lets the match
 *  start at the PWS copula, so the 60-char subject window sees "PWS" and a claim about the DRAWINGS gets refuted —
 *  deleting a possibly-true warning, the dangerous direction. A word cap cannot separate those two cases; a cap
 *  loose enough for "incorporated by reference but" (4 words) is already loose enough to leak. The discriminator is
 *  that a second subject needs a SECOND COPULA, so the gap forbids one. Two structural bounds, zero vocabulary:
 *    (1) `[A-Za-z]+,?` matches no period, semicolon or colon — the gap cannot cross a clause boundary.
 *        A comma is allowed, because "is listed, but not reproduced" keeps the same subject.
 *    (2) no `is|are|was|were` inside the gap — the gap cannot span into a coordinate clause's own subject.
 *  The remaining `{0,5}` is a runaway backstop, not the safety property.
 *
 *  FAILURE DIRECTION of the right-hand participle list: it fails SAFE. An unenumerated verb means no refutation,
 *  which leaves the status quo (a false claim ships) — it never deletes a true warning. It is widened here to the
 *  clear presence/provision class only. Verbs about the GOVERNMENT'S ACT rather than presence — "incorporated",
 *  "released", "published", "posted" — are deliberately excluded: those claims can be true even when the document's
 *  text is sitting in the source, so refuting them from region presence would delete a real warning. */
const DOC_ABSENCE = /\b(?:is|are|was|were)\s+(?:(?!(?:is|are|was|were)\b)[A-Za-z]+,?\s+){0,5}not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located|given|delivered|enclosed|appended)\b/i;

/** Exported for the falsification probe only — the probe must measure the SHIPPED rule, not a copy of it that can
 *  silently drift from it. Not part of the module's behavioural surface. */
export const DOC_ABSENCE_FOR_TEST = DOC_ABSENCE;

/** Distinctive tokens for a document, derived from its own name at runtime. Drops extensions, dates, pure numbers and
 *  short/common words, so "PWS KO Appropved - 20260720.pdf" yields ["pws"] and "WAGE DETERMINATIONS - 20260513.pdf"
 *  yields ["wage","determination"]. Plural is trimmed to a stem so "Determinations" matches a claim's "Determination". */
const STOP = new Set(["the", "and", "for", "pdf", "doc", "docx", "final", "copy", "signed", "rev", "revised", "attachment", "attach", "amendment", "solicitation", "notice", "body"]);
function docTokens(name: string): string[] {
  return (name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^A-Za-z]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w));
}

/** True when `claim` asserts that THIS document is absent — the doc token must sit in SUBJECT position, within
 *  MAX_GAP characters BEFORE the absence predicate. That adjacency is what separates
 *    "PWS (Attachment 0001) is referenced but not provided"   (a claim about the DOCUMENT — refutable here)
 *  from
 *    "the set-aside type is not stated anywhere in the solicitation"   (a claim about CONTENT — NOT this gate's
 *  business, and refuting it from region presence would delete a potentially true warning). */
const MAX_GAP = 60;
export const CORRECTED_PREFIX = "CORRECTED — ";
export const UNANALYZED_PREFIX = "NOT ANALYZED — ";

/** Drop the FALSE PREMISE clause and keep the CONSEQUENCE the lens reasoned about. A finding of this class reads
 *  "<false absence assertion> — <real consequence>", so the consequence survives the em-dash. Preserving the original
 *  verbatim was the first design and it was wrong: it left the false sentence on the page under a correction header,
 *  which is the same "hedge, don't fix" mistake REPORT-TRUTH #2 made. If there is no separable consequence, nothing is
 *  carried — a corrected premise with no surviving analysis is simply the correction. */
function consequenceOf(claim: string): string {
  // Strip REPORT-TRUTH #2's caveat too. #2 appends "(this audit did not locate it; absence was not verified…)" to
  // every absence claim. Once #7 has PROVEN the document IS in the source, that caveat is itself false — two of our
  // own fixes contradicting each other inside one sentence. #7 is the later, stronger fact and wins.
  const body = claim
    .replace(/^UNVERIFIED ABSENCE — /, "")
    .replace(/\s*\(this audit did not locate it;[^)]*\)/gi, "")
    .trim();
  const dash = body.search(/\s[—–-]\s/);
  if (dash < 0) return "";
  const tail = body.slice(dash).replace(/^\s[—–-]\s/, "").trim();
  return tail.length > 20 ? tail : "";
}
/** A SECOND subject between the document token and the predicate means the predicate is not about the document.
 *  Another copula opens a new clause with its own subject ("the PWS is complete and THE DRAWINGS are not provided");
 *  a sentence terminator ends the claim entirely ("the PWS is in the source. The drawings are not provided.").
 *  Both are grammatical relations, not vocabulary. */
const INTERVENING_SUBJECT = /\b(?:is|are|was|were)\b|[.;:]/i;

function assertsDocAbsent(claim: string, tokens: string[]): boolean {
  const m = DOC_ABSENCE.exec(claim);
  if (!m) return false;
  const lead = claim.slice(Math.max(0, m.index - MAX_GAP), m.index);
  const lower = lead.toLowerCase();
  // PROXIMITY IS NOT SUBJECT POSITION. v1 asked only whether the token appeared in the 60-char window, which this
  // function's own contract called "SUBJECT position" — it is not the same thing, and the gap is an over-refute:
  // in "The PWS is complete and the drawings are not provided", the window before "are not provided" still contains
  // "PWS", so a claim about the DRAWINGS was refuted from the PWS's presence, deleting a possibly-true warning.
  // Falsification probe `_rt8-absence-shape.ts` LEG 4 planted five such sentences; the shipped rule leaked 4 of 5.
  // The token must therefore be the NEAREST subject: nothing that opens a new clause may sit between it and the
  // predicate. A parenthetical ("PWS (Attachment 0001) is listed but not reproduced") passes; a coordinate clause
  // does not. Failure direction is safe — "PWS, which is Attachment 0001, is not provided" is now missed, which
  // leaves a false claim standing rather than deleting a true one.
  for (const t of tokens) {
    const at = lower.lastIndexOf(t);
    if (at < 0) continue;
    if (INTERVENING_SUBJECT.test(lead.slice(at + t.length))) continue;
    return true;
  }
  return false;
}

/** SECOND ARM — a RESOLVED-FACT absence claim. The third AUTO-F component on run 583df921 was not about a document:
 *  "Set-aside type is not stated…" while the report's OWN masthead prints `SBA` (the row's resolved set_aside). A
 *  claim that a fact is unstated, made in a report that states that very fact three panels earlier, is self-
 *  contradicting on its face — and refuting it needs only the value the run already resolved. Shape-only: the
 *  predicate must be asserted OF the resolved field, so a claim about some OTHER unstated thing is untouched. */
const FACT_ABSENCE = /\b(?:is|are|was|were)\s+not\s+(?:stated|specified|identified|designated|indicated|declared)\b/i;
const SET_ASIDE_SUBJECT = /\bset[\s-]?aside\b[^.;:]{0,40}$/i;

/** Reconcile every absence claim against the run's own source + provenance ledger. Pure; deterministic; no I/O.
 *  `provenanceDocs` = the set of document names that produced at least one grounded finding in THIS run.
 *  `resolvedSetAside` = the run's own resolved set-aside (the value the masthead prints), when it has one. */
export function reconcileAbsenceClaims<T extends { id?: string; requirement?: string }>(
  findings: T[],
  fullSource: string,
  provenanceDocs: Set<string>,
  resolvedSetAside?: string | null,
): AbsenceReconcileResult<T> {
  const regions = docRegions(fullSource || "").map((r) => ({ name: r.name, tokens: docTokens(r.name), chars: r.text.length }));
  const refuted: AbsenceReconcileResult<T>["refuted"] = [];
  if (!regions.length) return { findings, refuted };

  const out = findings.map((f) => {
    const before = f.requirement ?? "";
    if (!before) return f;
    if (before.startsWith(CORRECTED_PREFIX) || before.startsWith(UNANALYZED_PREFIX)) return f; // already reconciled — never re-wrap
    // Only the region the claim actually names — never "some document exists, therefore the claim is false".
    const hit = regions.find((r) => r.tokens.length > 0 && assertsDocAbsent(before, r.tokens));
    if (!hit) {
      // Resolved-fact arm: the claim says the set-aside is unstated, but this run resolved one and prints it.
      const fm = FACT_ABSENCE.exec(before);
      if (resolvedSetAside && fm && SET_ASIDE_SUBJECT.test(before.slice(Math.max(0, fm.index - MAX_GAP), fm.index))) {
        // Strip the SENTENCE carrying the false premise and keep the rest of the analysis. The first design took the
        // leading sentence as a fallback, which on the live claim was itself the false statement ("Set-aside type is
        // not stated in Section B") — re-publishing the very thing being corrected.
        const saConseq = before
          .replace(/^UNVERIFIED ABSENCE — /, "")
          .split(/(?<=[.!?])\s+/)
          .filter((sent) => !FACT_ABSENCE.test(sent) && !/UNVERIFIED ABSENCE/.test(sent))
          .join(" ")
          .trim();
        const after = `${CORRECTED_PREFIX}this solicitation's set-aside resolved to ${resolvedSetAside}, which this report states on its own masthead; an earlier statement that it was unstated was wrong. Confirm your firm qualifies under it.${saConseq ? ` Related analysis: ${saConseq}` : ""}`;
        refuted.push({ id: f.id ?? "(unidentified)", doc: `set-aside:${resolvedSetAside}`, kind: "present_and_analyzed", before, after });
        return { ...f, requirement: after };
      }
      return f;
    }

    const analyzed = provenanceDocs.has(hit.name);
    // Replace the ASSERTION, keep the consequence the lens reasoned about — the risk it raised may still be real,
    // it was simply attached to a false premise.
    // BUDGET. The report renders `requirement` through truncateOnWord(..., 400), so on the live specimen this text
    // grew to 443 characters and the renderer silently cut the tail — which is precisely the CONSEQUENCE this module
    // exists to carry forward ("...cannot build a compliant compliance matrix without it."). The correction survived
    // and the risk it was preserving did not. Two changes hold the budget: the boilerplate loses its generic
    // read-the-findings pointer (guidance is worth less than the actual risk), and the join is shortened. fitToRender
    // is the backstop, so what is persisted equals what renders instead of diverging silently.
    const truth = analyzed
      ? `${CORRECTED_PREFIX}"${hit.name}" IS in the analyzed source (${hit.chars.toLocaleString()} characters) and this audit drew findings from it; an earlier statement that it was missing was wrong.`
      : `${UNANALYZED_PREFIX}"${hit.name}" IS in the retrieved source (${hit.chars.toLocaleString()} characters), but this audit produced no grounded finding from it, so nothing here reflects its contents. It is not missing; it is unanalyzed. Read it directly.`;
    const conseq = consequenceOf(before);
    const after = fitToRender(conseq ? `${truth} Risk still raised: ${conseq}` : truth);
    refuted.push({ id: f.id ?? "(unidentified)", doc: hit.name, kind: analyzed ? "present_and_analyzed" : "present_not_analyzed", before, after });
    return { ...f, requirement: after };
  });
  return { findings: out, refuted };
}
