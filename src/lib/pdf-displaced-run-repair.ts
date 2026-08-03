// DISPLACED-RUN REPAIR — flag AUDIT_INGEST_DISPLACED_RUN, default OFF (flag-off ⇒ byte-identical).
//
// THE DEFECT, measured on live run eab43ada (W50S6U26QA019), primary region `Solicitation - W50S6U26QA0190002.pdf`.
// FAR 52.212-1(e) reads:
//     "(e) Debriefings. If a postaward debriefing is given to requesting Vendors, the Government will
//      disclose the following information, if applicable:"
// The engine's assembled source reads:
//     "(e) . If a postaward debriefing is given to requesting Vendors, the Government will\t\n
//      Debriefings\n
//      disclose the following information, if applicable:"
// The heading run has been INTERPOLATED into the middle of the sentence it introduces. Split on newlines — which
// is what every downstream segmenter and every lens effectively does — and the subject and its predicate land in
// different segments. The third segment, "disclose the following information, if applicable:", reads as a
// subjectless imperative. Downstream, finding #65 published a GOVERNMENT debriefing duty as a bidder gate-to-clear.
//
// TWO CORRECTIONS TO THE ORIGINAL WRITE-UP, both load-bearing for this design:
//   1. NOTHING IS DELETED. The adjudication recorded the grammatical subject as deleted ("subject gone"). It is
//      present — "the Government will" survives verbatim. The sentence is SEVERED, not truncated. A repair that
//      tries to restore a missing subject would be inventing text; a repair that re-joins a severed sentence is
//      moving text we already hold. Only the second is honest, and only the second is what this module does.
//   2. IT IS NOT LIMITED TO HEADINGS. A first pass recognised "heading-like" runs (<=6 words, unterminated) and
//      classified 13 of 49 sites as a non-heading complement to be left alone. Every one of those 13 was the same
//      defect wearing a different length: "Electronic invoicing." (terminated), "Compliance with laws unique to
//      Government contracts" (7 words), and — decisively — a displaced italic "e.g." that left "( , duplicate
//      payment, erroneous payment" behind. The class is any STYLED RUN, not any heading. A recogniser narrow
//      enough to be called "heading" silently passes a quarter of the population.
//
// WHOSE BUG. Not ours, in the sense that we add no reordering: `extractText` takes pdf-parse v2's `getText()`
// output verbatim. But pdf-parse's own instrumentation is what makes the repair decidable — `cellSeparator`
// (default "\t") is emitted ONLY when it detects a large horizontal gap between two items it places on the same
// baseline, and `lineEnforce` then breaks the line. So a trailing "\t" is the extractor telling us, in its own
// output, "a run landed here that is horizontally far from its neighbour." We key on that signal rather than on
// a guess about typography.
//
// WHAT THE REPAIR DOES — and the line it will not cross. The displaced run is moved OUT of the sentence to its own
// line ABOVE the paragraph, and the severed sentence is re-joined. It is NEVER re-inserted at a guessed position
// inside the sentence. Re-insertion would read better and is the obvious idea; it is refused because the origin
// is only inferable (an orphaned ".", a "( ,", a trailing "-", and 4 of 36 sites carry no scar at all), and this
// text is what Rule 64 grounds verbatim excerpts against. Constructing a plausible source sentence and then
// certifying quotes against it is the exact defect this arc exists to remove. An ugly scar that is TRUE beats a
// clean sentence that is INVENTED.
//
// SAFETY INVARIANT — CONSERVATION. Every character except the "\t" marker itself is preserved; the repair only
// relocates. `repairDisplacedRuns` is therefore testable against a multiset comparison of non-whitespace
// characters, which `pdf-displaced-run-repair.test.ts` asserts on the real banked source. A repair that loses a
// character is a repair that lost source text, and fails closed: on ANY internal inconsistency the original
// string is returned unchanged.

/** Upper bounds on a displaced run. Generous by design — see correction (2): the previous cut at six words and
 *  "no terminal punctuation" discarded 13 of 49 real sites. These bound runaway matching, they do not shape it. */
const MAX_RUN_WORDS = 14;
const MAX_RUN_CHARS = 100;

/** The scar a displaced run leaves at its origin: punctuation stranded with whitespace before it, or a dangling
 *  opener. Any ONE of these, or a continuation that resumes mid-sentence, is enough corroboration.
 *
 *  THE TRAILING `(?:\s|$)` IS NOT COSMETIC. It was `\s`, which required whitespace AFTER the stranded
 *  punctuation — and so missed the strongest scar in the corpus: an enumerator whose ENTIRE heading was
 *  displaced, leaving the line as nothing but "(5) ." with the period at end-of-line. Three real sites in run
 *  eab43ada declined for exactly this reason ("(5) . / Interest", "(s) . / Unauthorized obligations",
 *  "(c) . / Late submissions, modifications, revisions, and withdrawals of quotations"). A gate that fires on a
 *  partial scar and not on a total one had its anchor, not its logic, wrong.
 *
 *  A trailing hyphen with NO preceding space ("clause-", "shall-") is deliberately NOT a scar: that is also
 *  ordinary end-of-line word hyphenation, and the two are not distinguishable here. Those sites stay unrepaired
 *  — under-repair leaves the text exactly as it is today, which is the safe direction. */
const ORIGIN_SCAR = /(?:^|\S)\s+[.,;:](?:\s|$)|\(\s*[,;]|\s[-–—]\s*$/;

/** True when `s` can be a displaced run: short, has letters, and is not itself a sentence carrying its own
 *  independent clause (a run containing ". " followed by a capital is prose, not a displaced label). */
function isDisplacedRunCandidate(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > MAX_RUN_CHARS) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (t.split(/\s+/).length > MAX_RUN_WORDS) return false;
  if (/\.\s+[A-Z]/.test(t)) return false;
  return true;
}

export interface DisplacedRunRepair {
  /** 0-based index of the line that carried the trailing cell-separator. */
  line: number;
  /** The run that was moved out of the sentence. */
  run: string;
  /** Which corroborating mark justified the repair — recorded so telemetry names the rule that fired. */
  mark: "origin-scar" | "lowercase-continuation" | "both";
}

export interface DisplacedRunResult {
  text: string;
  repairs: DisplacedRunRepair[];
  /** Set when the conservation check failed and the ORIGINAL text was returned untouched. */
  refused?: string;
}

/** Non-whitespace character multiset — the conservation witness. Whitespace is excluded because the repair
 *  legitimately trades a "\t" and a newline for a newline and a space. */
function charCensus(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of s) {
    if (/\s/.test(ch)) continue;
    m.set(ch, (m.get(ch) ?? 0) + 1);
  }
  return m;
}

function censusEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/**
 * Move every displaced styled run out of the sentence it was interpolated into, and re-join the sentence.
 *
 * Fires only when ALL THREE hold:
 *   1. a line ends with the extractor's cell separator ("\t") — its own signal of a large horizontal gap;
 *   2. the NEXT line is a displaced-run candidate (short, lettered, not independent prose);
 *   3. a corroborating mark is present — either an origin scar on the opening line, or a continuation line that
 *      resumes mid-sentence (lowercase). Requiring one of the two is what keeps a real two-column table row,
 *      whose continuation starts with a capital and whose opening line carries no scar, out of the population.
 *
 * Fails closed: if the conservation check does not hold, the input is returned verbatim with `refused` set.
 */
export function repairDisplacedRuns(text: string): DisplacedRunResult {
  if (!text || !text.includes("\t")) return { text, repairs: [] };

  const lines = text.split("\n");
  const out: string[] = [];
  const repairs: DisplacedRunRepair[] = [];

  for (let i = 0; i < lines.length; i++) {
    const opening = lines[i];
    const run = lines[i + 1];
    const cont = lines[i + 2];

    if (
      opening !== undefined && opening.endsWith("\t") &&
      run !== undefined && cont !== undefined &&
      isDisplacedRunCandidate(run)
    ) {
      const scar = ORIGIN_SCAR.test(opening.slice(0, -1));
      const lower = /^\s*[a-z]/.test(cont);
      if (scar || lower) {
        // Run first, on its own line — where a label belongs and where no segmenter will read it as part of the
        // sentence. Then the severed sentence, re-joined across the break the interpolation created.
        out.push(run.trim());
        out.push(`${opening.slice(0, -1).trimEnd()} ${cont.trimStart()}`);
        repairs.push({ line: i, run: run.trim(), mark: scar && lower ? "both" : scar ? "origin-scar" : "lowercase-continuation" });
        i += 2;
        continue;
      }
    }
    out.push(opening);
  }

  const repaired = out.join("\n");
  if (!censusEqual(charCensus(text), charCensus(repaired))) {
    return { text, repairs: [], refused: "conservation check failed — non-whitespace characters changed; original returned unmodified" };
  }
  return { text: repaired, repairs };
}
