// DOES A DOCUMENT REGION ACTUALLY CARRY TEXT? — the floor under every "it IS in the source" claim.
//
// THE INVERSION THIS CLOSES. audit-absence-reconcile refutes a lens's "X is not provided" by finding a region
// named X and publishing `"X" IS in the retrieved source (N characters)`. N was `region.text.length` with NO
// floor, so a FAILED EXTRACTION was published to the customer as PRESENCE — the exact Rule 61 shape the engine
// forbids everywhere else (a failed dependency must yield a visible failure state, never a plausible answer).
// Worst case measured: an attachment whose entire region text is the engine's OWN non-extraction marker,
// `[Attachment "…xlsx" — office/zip, 32358 bytes, not text-extracted]`, refuting a TRUE absence claim at
// "105 characters". The engine said it could not read the file and the report said it had.
//
// WHY THE FLOOR IS STRUCTURAL AND NOT A CHARACTER COUNT. Measured over 374 regions in the banked corpus, a
// magnitude floor gets this exactly backwards: the failed Wage Determination region is 116 chars — LONGER than
// the 105-char non-extraction marker, and longer than nothing legitimate. Meanwhile the shortest region carrying
// real prose is 221 chars. Any threshold that clears the 116 also clears half the failures, and any threshold
// that catches them sits close enough to 221 to start condemning genuine short attachments. The three failure
// modes are recognisable by SHAPE, and after stripping they reduce to ZERO substantive characters while every
// legitimate region keeps essentially all of its own:
//   · empty            — "\n\n\n\n"
//   · scaffolding-only — "-- 1 of 7 --\n\n-- 2 of 7 --…", i.e. the page separators of a document whose every
//                        page extracted blank (a scanned/image PDF). This is the Wage Determination class,
//                        which is the document at the centre of the panel's most expensive finding.
//   · declared failure — the ingest's own `[Attachment "name" — type, N bytes, not text-extracted]` marker.
//
// DIRECTION: this only ever REMOVES a refutation, so its failure mode is leaving a lens's absence claim standing
// (which the Rule-64 non-presence wrapper already frames as unverified) rather than asserting a false presence.
// Stated as a positive shape — substantive iff letters survive the strip — never as a list of bad shapes, which
// is what leaks on paraphrase.
import { looksMojibake } from "./pdf-ocr";

/** The extractor's per-page separator, `-- 3 of 50 --`. Scaffolding the ingest ADDS; never document content. */
const PAGE_SEPARATOR_RE = /--\s*\d+\s+of\s+\d+\s*--/g;
/** The ingest's own declared non-extraction marker for a binary/office attachment it could not read. */
const NOT_EXTRACTED_MARKER_RE = /\[Attachment\s+"[^"]*"\s*[—-][^\]]*not text-extracted\s*\]/gi;
/** Letters only. A region of pure punctuation or digits is not prose the engine could have analyzed. */
const LETTER_RE = /\p{L}/gu;

/**
 * Substantive letter count once the ingest's own scaffolding and failure markers are removed.
 * Exported for the gate, which prints the whole corpus classification rather than trusting a summary.
 */
export function substantiveLetterCount(text: string): number {
  const stripped = (text ?? "").replace(NOT_EXTRACTED_MARKER_RE, " ").replace(PAGE_SEPARATOR_RE, " ");
  return (stripped.match(LETTER_RE) ?? []).length;
}

// The floor sits in the measured GAP, not at a guessed magnitude. Over the 374 banked regions the separation is
// total and empty: 14 regions strip to EXACTLY 0 substantive letters — every known failure, including all four
// Wage Determination instances — and the next region up keeps 124. Nothing lands in between. 40 is far above
// the failures and far below the real content, so it is insensitive to a stray glyph in either direction. A
// future region landing between 1 and 39 is genuinely ambiguous, and this refuses to refute it — the safe
// direction, since refusing only leaves the lens's absence claim standing.
export const SUBSTANTIVE_LETTER_FLOOR = 40;

/**
 * May a "this document IS in the source" claim be made about this region?
 * TRUE only when the region carries real, readable text — never merely because bytes exist.
 */
export function regionCarriesText(text: string): boolean {
  if (substantiveLetterCount(text) < SUBSTANTIVE_LETTER_FLOOR) return false;
  // Garbled OCR is present-but-unreadable: the engine cannot have analyzed it, so we must not claim it read it.
  // (looksMojibake self-limits to ≥300 chars; below that the letter floor above is the operative guard.)
  if (looksMojibake(text)) return false;
  return true;
}
