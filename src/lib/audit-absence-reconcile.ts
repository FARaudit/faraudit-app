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

export interface AbsenceReconcileResult<T> { findings: T[]; refuted: Array<{ id: string; doc: string; kind: "present_and_analyzed" | "present_not_analyzed"; before: string; after: string }>; }

/** Absence predicates asserted OF A DOCUMENT — "not provided", "not reproduced", "not attached", "not included",
 *  "not furnished", "was not located". Shape only; none names a procurement concept. */
const DOC_ABSENCE = /\b(?:is|are|was|were)\s+(?:referenced\s+but\s+)?not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located)\b/i;

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
function assertsDocAbsent(claim: string, tokens: string[]): boolean {
  const m = DOC_ABSENCE.exec(claim);
  if (!m) return false;
  const lead = claim.slice(Math.max(0, m.index - MAX_GAP), m.index).toLowerCase();
  return tokens.some((t) => lead.includes(t));
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
    const truth = analyzed
      ? `${CORRECTED_PREFIX}"${hit.name}" IS in the analyzed source (${hit.chars.toLocaleString()} characters) and this audit drew findings from it; an earlier statement that it was missing was wrong. Read the findings citing that document.`
      : `${UNANALYZED_PREFIX}"${hit.name}" IS in the retrieved source (${hit.chars.toLocaleString()} characters), but this audit produced no grounded finding from it, so nothing here reflects its contents. It is not missing; it is unanalyzed. Read it directly.`;
    const conseq = consequenceOf(before);
    const after = conseq ? `${truth} The risk raised against that document still stands: ${conseq}` : truth;
    refuted.push({ id: f.id ?? "(unidentified)", doc: hit.name, kind: analyzed ? "present_and_analyzed" : "present_not_analyzed", before, after });
    return { ...f, requirement: after };
  });
  return { findings: out, refuted };
}
