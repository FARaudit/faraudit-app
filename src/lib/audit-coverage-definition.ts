// ── THE COVERAGE DEFINITION. ONE definition, ONE place. ───────────────────────────────────────────────
//
// Brain ruling R3, CEO-approved 2026-08-17, recorded in ENGINE-OWNERSHIP-MAP-2026-08-17.md:
// coverage had more than one definition and Rule 68 forbids that. This module IS the collapse. Every
// coverage figure any surface states must derive from here — nothing recomputes it, nothing records it.
//
// ⛔ THE DEFINITION, chosen deliberately:
//
//    A document is ANALYSED iff a grounded, decision-bearing finding's ANALYZED EXCERPT is verbatim in
//    THAT document AND in no other document region.
//
// Chosen because it is the measure the four-week target (R6) is stated in, the measure the ownership
// doctrine's rule 5 derives, and the only one of the three candidate layers a customer can verify by
// opening a single report. The obligation count (layer C, 2,879 on the flagship) stays a DIAGNOSTIC and
// is never called coverage. Section coverage (layer A) is untouched pending its own ruling.
//
// ⛔ WHY THE UNIQUENESS CLAUSE IS THE LOAD-BEARING HALF, measured 2026-08-19 on run 3b5bba30:
// `documentsCovered` tests each region INDEPENDENTLY, so one excerpt that is verbatim in two documents
// credits BOTH. Measured on the flagship: SIX documents have no credit other than a shared excerpt —
// both Bid Schedules, both Solicitation Amendments, the Solicitation itself and the unrevised
// Instructions to Bidders. Three of those sit OUTSIDE the live gap list, i.e. the engine already counts
// them covered while nothing is attributed to them at all. Under this definition, none of the six is
// analysed. (Both figures are real and answer different questions: 3 is what the live predicate gets
// visibly wrong today; 6 is what the uniqueness clause withholds. Quote them apart.)
// The guard for this exists at audit-orchestrator.ts:857 and is INERT in production: it needs opts that
// only arrive under AUDIT_ATTACHMENT_COVERAGE, which reads false on the live worker. A shared excerpt
// proves the PHRASE was read. It does not prove the DOCUMENT was analysed, and for near-duplicate
// siblings everything that DIFFERS between them is exactly what went unread.
//
// Deterministic. $0. No model call, no I/O. Takes regions rather than importing `docRegions`, so this
// module has no dependency on the orchestrator and the orchestrator can depend on it.
import { analyzedExcerptOf } from "./audit-excerpt-repair";
import { countGroundableObligations } from "./audit-construction-manifest";
import { ownerOf, type Owner } from "./audit-doc-ownership";
import type { TypedFinding } from "./audit-findings";

/** SAM's description field, not a posted document. It is UNIVERSAL — every lens already reads it — so it
 *  never enters the ownership map and never inflates a coverage denominator. Mirrors the exclusion
 *  `deriveAnalyzedDocuments` already applies. */
export const NOTICE_BODY_DOC_NAME = "SAM Notice Body";

export type DocRegion = { name: string; text: string; isPrimary?: boolean };

export type DocumentCoverage = {
  /** posted binding documents in the package (the notice body excluded) */
  received: number;
  /** …of those, carrying at least one binding-obligation verb over FULL text */
  obligationCarrying: number;
  /** …of those received, assignable to exactly one owning lens by the document-keyed map */
  assigned: number;
  /** …of those received, ANALYSED by the definition above */
  analysed: number;
  /** the intersection that the four-week target is measured on */
  obligationCarryingAndAnalysed: number;
  /** per document, how many findings are uniquely grounded in it */
  findingsPerDocument: Array<{ doc: string; findings: number }>;
  /** documents no observed shape matched — NAMED, never silently defaulted (they go to former_ko BY RULE) */
  residue: string[];
  /** ⛔ the gap the refusal must NAME: carries an obligation, nothing analysed it */
  unanalysedObligationCarrying: string[];
  /** documents credited by an excerpt they SHARE with another document — covered by the old predicate,
   *  not analysed by this one. Kept visible because it is the delta that made two numbers disagree. */
  sharedExcerptCreditOnly: string[];
};

const norm = (s: string): string => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

/** A finding counts toward coverage only if the engine itself grounded it. An ungrounded excerpt is
 *  dropped upstream by `isGrounded`, but keying on the flag here means this module cannot be handed a
 *  fabricated finding by a future caller and quietly credit a document with it (Rule 64). */
const isDecisionBearing = (f: TypedFinding): boolean => f.grounded !== false && !!analyzedExcerptOf(f);

/**
 * THE derivation. Nothing here is recorded; every field is counted from the package and the findings.
 * Re-running it on the same inputs must produce the same numbers — that is what makes it checkable.
 */
export function deriveDocumentCoverage(regions: DocRegion[], findings: TypedFinding[]): DocumentCoverage {
  const posted = regions.filter((r) => r.name !== NOTICE_BODY_DOC_NAME);
  const normed = regions.map((r) => ({ name: r.name, n: norm(r.text) }));

  // uniquely-grounded: the analyzed excerpt is verbatim in exactly ONE region.
  const uniqueHits = new Map<string, number>();
  const sharedCredited = new Set<string>();
  for (const f of findings) {
    if (!isDecisionBearing(f)) continue;
    const ex = norm(analyzedExcerptOf(f));
    if (!ex) continue;
    const inRegions = normed.filter((r) => r.n.includes(ex));
    if (inRegions.length === 1) {
      const k = inRegions[0].name;
      uniqueHits.set(k, (uniqueHits.get(k) ?? 0) + 1);
    } else {
      // credited by the OLD predicate in every one of these regions; by this definition, in none.
      for (const r of inRegions) sharedCredited.add(r.name);
    }
  }
  for (const name of uniqueHits.keys()) sharedCredited.delete(name); // a real hit outranks a shared one

  let obligationCarrying = 0, assigned = 0, analysed = 0, both = 0;
  const residue: string[] = [];
  const unanalysed: string[] = [];
  for (const r of posted) {
    const carries = countGroundableObligations(r.text) > 0;
    if (carries) obligationCarrying++;
    const owner: Owner = ownerOf(r.name).owner;
    if (owner === "RESIDUE") residue.push(r.name); else assigned++;
    const isAnalysed = (uniqueHits.get(r.name) ?? 0) > 0;
    if (isAnalysed) { analysed++; if (carries) both++; }
    else if (carries) unanalysed.push(r.name);
  }

  return {
    received: posted.length,
    obligationCarrying,
    assigned,
    analysed,
    obligationCarryingAndAnalysed: both,
    findingsPerDocument: [...uniqueHits.entries()]
      .map(([doc, n]) => ({ doc, findings: n }))
      .sort((a, b) => b.findings - a.findings || a.doc.localeCompare(b.doc)),
    residue,
    unanalysedObligationCarrying: unanalysed,
    sharedExcerptCreditOnly: [...sharedCredited].filter((n) => n !== NOTICE_BODY_DOC_NAME).sort(),
  };
}

/** The one sentence a customer-visible surface may state about coverage, built from the derivation and
 *  never from a stored number. Names what went unanalysed — refusing without naming does the hard half
 *  and skips the half a prospect can verify in ninety seconds (doctrine rule 4, Rule 61). */
export function coverageDisclosure(c: DocumentCoverage, opts?: { maxNamed?: number }): string {
  const max = opts?.maxNamed ?? 8;
  if (c.received === 0) return "No posted binding documents were received with this notice.";
  if (c.unanalysedObligationCarrying.length === 0) {
    return `All ${c.obligationCarrying} of the ${c.received} posted binding documents that carry an obligation were analysed.`;
  }
  const named = c.unanalysedObligationCarrying.slice(0, max);
  const rest = c.unanalysedObligationCarrying.length - named.length;
  return [
    `${c.obligationCarryingAndAnalysed} of ${c.obligationCarrying} posted binding documents that carry an obligation were analysed`,
    ` (${c.received} documents received). Not analysed: `,
    named.join("; "),
    rest > 0 ? `; and ${rest} more` : "",
    ".",
  ].join("");
}
