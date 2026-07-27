// ── EXCERPT RE-GROUNDING REPAIR PASS (Brain card 221) ──────────────────────────────────────────────
// A model expert-lens finding whose `excerpt` was CLIPPED by a max_tokens stop (the last string field of the
// last emitted finding cut mid-clause) leaves a grounded-but-truncated span: e.g. an excerpt ending
// "…Proposed for" whose source continues "…Proposed for Debarment, or Voluntarily Excluded." The clip is a
// VALID-JSON trailing field, so JSON parse succeeds and the truncation is silent — verify-run-quality's
// TRUNCATION signal is what surfaces it (a coverage-tick, not actionable content).
//
// This pass REPAIRS such an excerpt DETERMINISTICALLY (Rule-64-safe): locate the finding's clipped excerpt
// as a UNIQUE verbatim head anchor in the STORED source, then extend the span forward to its natural sentence
// / list-item boundary using the SAME guard set as the Fork-A procedural segmentation (so a decimal "$1.04",
// an email "michael.s.french@dla.mil", or an abbreviation "U.S." never counts as the boundary). The
// replacement is a VERBATIM source slice — the model NEVER completes an excerpt, and a finding is NEVER
// silently dropped. If no unique verbatim match is locatable, the excerpt STAYS clipped and the run-quality
// gate FAILS exactly as today (no loosening, no fabricated grounding).
//
// SCOPE: model expert lenses ONLY. Deterministic lenses (procedural_coverage — Fork-A owns its own
// segmentation fix — plus the sweep/temporal producers) emit verbatim spans by construction and are SKIPPED,
// which keeps a pre-Fork-A record (e.g. the SP3300 smoke) byte-stable under this pass.
//
// Deterministic; no model; $0. In-place defect fix (Fork-A precedent: repairing broken output of live
// behavior needs no new flag). The truncation DETECTOR here is THE single source of truth — verify-run-quality
// imports isTruncatedExcerpt so the gate and this pass share ONE definition of "clipped". (The gate applies it
// to both excerpt and requirement; this pass re-grounds only the verbatim EXCERPT — a truncated synthesized
// requirement has no source span to re-ground and correctly stays a gate failure, prevented by STEP-1 retry.)
import { PROCEDURAL_SENTENCE_GUARDS } from "./audit-procedural-coverage";
import type { TypedFinding } from "./audit-findings";

// Lenses whose findings are produced DETERMINISTICALLY (verbatim spans, not model-emitted) → never clipped by
// a model max_tokens stop → out of scope. procedural_coverage is Fork-A's domain (card 215).
export const REPAIR_EXCLUDED_LENSES = new Set(["procedural_coverage", "deterministic_sweep", "temporal_conflict"]);

const GUARD = ""; // U+E010 Private Use Area — cannot occur in real solicitation text; masks a guarded period

// ── TRUNCATION DETECTOR (shared with verify-run-quality via import) ─────────────────────────────────
// A stored obligation/excerpt is "truncated" if it ends mid-thought. Catches the observed max_tokens clips:
//   decimal cut: "…whole cents ($1."   address cut: "…via email at: michael."   dangling: "…date specified for"
// The address-cut branch requires a COLON after the connector (card 221 fix) so a normal sentence ending
// "…advantageous to Government." / "…conforming to solicitation." is NOT misread as a truncated address —
// that over-broad `(?:at|to|via)\s+[a-z0-9]+\.$` pattern was a FALSE POSITIVE that failed clean reports.
const DANGLERS = /\b(for|to|the|of|a|an|and|or|in|on|at|with|from|by|that|which|per|as|is|are|be|shall|must|will|no|not|date|specified)$/i;
export function isTruncatedExcerpt(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/\$\d+\.$/.test(t)) return true;                                              // decimal split ("$1.")
  if (/\b(?:at|to|via|email|e-mail)\s*:\s*[a-z0-9._%+-]+\.$/i.test(t)) return true; // colon-address cut ("at: michael.")
  if (DANGLERS.test(t.replace(/[)\]\s]+$/, ""))) return true;                       // ends on a dangling function word, no terminator
  return false;
}

function canonChar(c: string): string {
  if (c === "‘" || c === "’") return "'"; // curly → straight apostrophe
  if (c === "“" || c === "”") return '"'; // curly → straight quote
  return c;
}

/** Canonicalize a fragment for matching: canonical quotes, lowercase, whitespace collapsed to single spaces, trimmed. */
function canon(s: string): string {
  let out = "", prevSpace = false;
  for (const raw of s) {
    const c = canonChar(raw);
    if (/\s/.test(c)) { if (!prevSpace) { out += " "; prevSpace = true; } }
    else { out += c.toLowerCase(); prevSpace = false; }
  }
  return out.trim();
}

/** Canonicalized source + a map from each canonical-char index → its ORIGINAL source index, so a match found
 *  in canonical space can be sliced VERBATIM from the original (preserving its exact bytes). */
function normMap(source: string): { norm: string; map: number[] } {
  let norm = ""; const map: number[] = []; let prevSpace = false;
  for (let i = 0; i < source.length; i++) {
    const c = canonChar(source[i]);
    if (/\s/.test(c)) { if (prevSpace) continue; norm += " "; map.push(i); prevSpace = true; }
    else { norm += c.toLowerCase(); map.push(i); prevSpace = false; }
  }
  return { norm, map };
}

/** Offset in `window` of the first natural sentence / clause / list boundary END (inclusive of a terminator),
 *  computed with the Fork-A guard set masking so a guarded period (decimal · email/URL · abbreviation) is not
 *  mistaken for a sentence end. Length-preserving masking keeps offsets aligned to `window`. −1 ⇒ none found. */
function boundaryEnd(window: string): number {
  let m = window.replace(PROCEDURAL_SENTENCE_GUARDS.decimal, (_x, a, b) => `${a}${GUARD}${b}`);
  m = m.replace(PROCEDURAL_SENTENCE_GUARDS.emailUrl, (t) => t.replace(/\./g, GUARD));
  m = m.replace(PROCEDURAL_SENTENCE_GUARDS.abbrev, (t) => t.replace(/\./g, GUARD));
  const term = /[.!?;](?=\s|$)/.exec(m);         // sentence/clause terminator followed by whitespace or end
  if (term) return term.index + 1;               // include the terminator
  const nl = m.indexOf("\n");                     // else the next hard line boundary (list item)
  return nl >= 0 ? nl : -1;
}

// ── HEAD-SIDE RE-GROUNDING (ARC #747 · E1) ──────────────────────────────────────────────────────────
// Everything above this line is TAIL-side: `isTruncatedExcerpt` tests exclusively how a string ENDS, and
// `findRepairSpan` extends forward. Gate 4 on d0664ba2 (SPRRA2-26-R-0034) found the opposite failure —
// excerpts that start too LATE — and it is the more dangerous shape, because a cropped head does not look
// broken. It looks like corroboration:
//
//   C1  excerpt begins "15-2, Instructions…"          source line reads "…in accordance with FAR 15.408, Table 15-2, …"
//       The dropped head IS THE CITATION. The gate above the excerpt claimed "DFARS 215-2", and the crop
//       made the excerpt appear to support it. [[feedback_excerpt_start_truncation_fakes_corroboration]]
//   S2  excerpt begins "FY27 BEQ FY28 Min…"           the table row's own head columns start at FY26
//       The report then derived the span "FY27–FY30" FROM THE CROP; the record says FY2026–FY2030.
//   S7  excerpt begins "negative response be…"        the clause head reads "…in writing within five (5)
//       business days. It is requested that a negative response…" — the 5-business-day mechanic, the most
//       actionable near-term obligation in the record, was cropped out of existence.
//
// THE DISCRIMINATOR IS A SHAPE, NOT A WORD LIST. It does not ask what the excerpt starts with; it asks
// whether the text IMMEDIATELY PRECEDING the located span, on the same physical line, ends at a natural
// boundary. Text that stops mid-clause before the excerpt means the excerpt began mid-clause. Measured on
// the real record: 7 of 9 excerpts had preceding text on the line, 4 of them ended cleanly (a finished
// sentence, or a list enumerator) and are left untouched; the 3 that did not are exactly C1, S2 and S7.
//
// The repair mirrors the forward pass and inherits its refusals: unique verbatim anchor or nothing, never
// model-completed, never shrinks, and it extends BACKWARD only to the start of the clause on the same line —
// never across a newline, never past MAX_HEAD_EXTEND. When it cannot repair, the excerpt is left exactly as
// it was and the run-quality gate fails as it does today. Nothing is loosened.
//
// NOT IN THIS PASS (E1 items 3-4, deliberately separate): the no-derivation-from-window rule (a citation,
// figure or fiscal span asserted in requirement/reason must be re-derived from the full source line) and
// row-label alignment for tabular source. Re-grounding the span is the precondition for both — this is that
// precondition, not the whole of E1.
export const EXCERPT_HEAD_REGROUND_FLAG = "AUDIT_EXCERPT_HEAD_REGROUND";
export function headRegroundEnabled(): boolean {
  return process.env[EXCERPT_HEAD_REGROUND_FLAG] === "true";
}

const MAX_HEAD_EXTEND = 400; // chars; a backward reach longer than this is not a clause, it is a paragraph

/** Mask guarded periods (decimal · email/URL · abbreviation) length-preservingly so offsets stay aligned. */
function maskGuards(text: string): string {
  let m = text.replace(PROCEDURAL_SENTENCE_GUARDS.decimal, (_x, a, b) => `${a}${GUARD}${b}`);
  m = m.replace(PROCEDURAL_SENTENCE_GUARDS.emailUrl, (t) => t.replace(/\./g, GUARD));
  m = m.replace(PROCEDURAL_SENTENCE_GUARDS.abbrev, (t) => t.replace(/\./g, GUARD));
  return m;
}

// A head that ENDS on one of these is a clean start point for the excerpt, so there is nothing to repair:
// a finished sentence/clause, or a list enumerator ("1." / "(a)" / "•" / "—") introducing the excerpt.
const HEAD_ENDS_TERMINATED = /[.!?;:]["')\]]*\s*$/;
const HEAD_ENDS_ENUMERATOR = /(?:^|[\s(])(?:[-•*—]|\(?\d{1,2}[.)]|\(?[a-zA-Z][.)])\s*$/;

/** Offset within `head` where the excerpt's own clause begins: just past the last unguarded terminator, or 0
 *  (the line start) when the head contains none. */
function clauseStartInHead(head: string): number {
  const masked = maskGuards(head);
  let last = -1;
  for (const m of masked.matchAll(/[.!?;:](?=\s)/g)) last = m.index! + 1;
  if (last < 0) return 0;
  let i = last;
  while (i < head.length && /[\s"')\]]/.test(head[i])) i++; // step over the whitespace/quotes after it
  return i;
}

/** Where an excerpt sits in the source, under the SAME canonicalization the repair passes use (curly quotes
 *  and whitespace runs normalized). Exported so measurement code never re-implements the match — a second
 *  definition of "is this in the source" is how a strict-`includes` scan reports 205 absent excerpts on a
 *  corpus where 344 of 350 are really there. */
export function locateExcerpt(source: string, excerpt: string): "unique" | "ambiguous" | "absent" {
  const c = canon(excerpt || "");
  if (!source || !c) return "absent";
  const { norm } = normMap(source);
  const at = norm.indexOf(c);
  if (at < 0) return "absent";
  return norm.indexOf(c, at + 1) >= 0 ? "ambiguous" : "unique";
}

/** True when `excerpt`, as located in `source`, begins mid-clause. Source-relative by necessity: unlike tail
 *  truncation, head truncation is invisible in the string itself — "negative response be accompanied…" is a
 *  perfectly well-formed fragment. Only the record shows the head was cut. */
export function isHeadClippedExcerpt(source: string, excerpt: string): boolean {
  return locateHeadClip(source, excerpt) !== null;
}

/** Shared locator for the detector and the repair, so the two can never disagree about what "clipped" means
 *  (the same single-definition discipline the tail detector holds with verify-run-quality). */
function locateHeadClip(source: string, excerpt: string): { clauseStartOrig: number; endOrig: number } | null {
  const ex = (excerpt || "").trim();
  if (!source || ex.split(/\s+/).filter(Boolean).length < 4) return null; // too little to anchor safely
  const c = canon(ex);
  if (c.length < 12) return null;
  const { norm, map } = normMap(source);
  const at = norm.indexOf(c);
  if (at < 0) return null;                               // not verbatim in source → not this pass's problem
  if (norm.indexOf(c, at + 1) >= 0) return null;         // ambiguous → refuse (never mislocate)
  const startOrig = map[at];
  const endOrig = map[at + c.length - 1] + 1;
  const lineStart = source.lastIndexOf("\n", startOrig - 1) + 1;
  const head = source.slice(lineStart, startOrig);
  if (!head.trim()) return null;                         // excerpt starts the line → nothing was dropped
  if (HEAD_ENDS_TERMINATED.test(head)) return null;      // prior sentence/clause finished → clean start
  if (HEAD_ENDS_ENUMERATOR.test(head)) return null;      // "1. " / "(a) " / "• " introducing it → clean start
  const rel = clauseStartInHead(head);
  const clauseStartOrig = lineStart + rel;
  if (clauseStartOrig >= startOrig) return null;          // nothing left to prepend after trimming
  if (startOrig - clauseStartOrig > MAX_HEAD_EXTEND) return null; // too far back to still be one clause
  return { clauseStartOrig, endOrig };
}

/** The verbatim source span for a head-clipped excerpt, extended BACKWARD to its clause start. Null when the
 *  excerpt is not head-clipped, is unlocatable/ambiguous, or the extension would not strictly extend it. */
export function findHeadRepairSpan(source: string, excerpt: string): string | null {
  const hit = locateHeadClip(source, excerpt);
  if (!hit) return null;
  const span = source.slice(hit.clauseStartOrig, hit.endOrig);
  if (span.trim().length <= (excerpt || "").trim().length) return null; // must extend, never shrink/no-op
  return span.trim();
}

export interface ExcerptRepairResult {
  repaired: number;
  unrepairable: number;
  changes: Array<{ id?: string; lens: string; before: string; after: string }>;
  skipped: Array<{ id?: string; lens: string; reason: string }>;
}

/** Locate a clipped excerpt's UNIQUE verbatim head in `source` and return the source span extended to the next
 *  natural boundary. Returns null (⇒ leave clipped) when: the excerpt is too short to anchor safely, its head
 *  is NOT verbatim in source, the head is AMBIGUOUS (>1 occurrence — mislocation risk), no boundary is found,
 *  or the result would not strictly EXTEND the clipped text. The returned span is a literal source slice → its
 *  grounding is guaranteed (Rule-64). */
export function findRepairSpan(source: string, excerpt: string): string | null {
  const words = (excerpt || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return null;                       // too little to anchor without mislocation
  const head = words.slice(0, -1).join(" ");               // drop the trailing (clipped / dangling) word
  const headCanon = canon(head);
  if (headCanon.length < 12) return null;
  const { norm, map } = normMap(source);
  const at = norm.indexOf(headCanon);
  if (at < 0) return null;                                  // head not verbatim in source → no safe repair
  if (norm.indexOf(headCanon, at + 1) >= 0) return null;    // ambiguous head → refuse (never mislocate)
  const startOrig = map[at];
  const afterHeadOrig = map[at + headCanon.length - 1] + 1; // original index just past the matched head
  const window = source.slice(afterHeadOrig, afterHeadOrig + 600);
  const rel = boundaryEnd(window);
  if (rel < 0) return null;
  const span = source.slice(startOrig, afterHeadOrig + rel);
  if (span.length <= excerpt.trim().length) return null;    // repair MUST extend, never shrink/no-op
  // Rule-64 assertion: the repaired span must be a literal source substring (it is, by construction — a slice
  // of `source`). Reuse the already-computed `norm` (no second normMap pass) to confirm canonically.
  if (!norm.includes(canon(span))) return null;
  return span;
}

/** Repair clipped excerpts on the in-scope (model expert-lens) findings, IN PLACE. Returns a summary for the
 *  run record / diagnostics. Pure w.r.t. `source`; mutates finding.excerpt only when a verbatim extension exists. */
export function repairClippedExcerpts(findings: TypedFinding[], source: string): ExcerptRepairResult {
  const res: ExcerptRepairResult = { repaired: 0, unrepairable: 0, changes: [], skipped: [] };
  if (!source) return res;
  for (const f of findings) {
    if (REPAIR_EXCLUDED_LENSES.has(f.lens)) continue;       // deterministic lenses emit verbatim → out of scope
    if (!isTruncatedExcerpt(f.excerpt)) continue;           // only touch what the gate flags as truncated
    const span = findRepairSpan(source, f.excerpt);
    if (!span) {
      res.unrepairable++;
      res.skipped.push({ id: f.id, lens: f.lens, reason: "no unique verbatim head locatable — left clipped (gate still fails)" });
      continue;
    }
    res.changes.push({ id: f.id, lens: f.lens, before: f.excerpt, after: span });
    f.excerpt = span;                                        // verbatim source span → grounded + un-truncated
    res.repaired++;
  }
  return res;
}

/** Head-side twin of `repairClippedExcerpts` (ARC #747 · E1). Same scope rule (model expert lenses only —
 *  deterministic producers slice at clause boundaries by construction), same refusals, same in-place
 *  contract. Flag-gated: with `AUDIT_EXCERPT_HEAD_REGROUND` unset this returns an empty result and touches
 *  nothing, so a flag-OFF run is byte-identical. */
export function repairHeadClippedExcerpts(findings: TypedFinding[], source: string): ExcerptRepairResult {
  const res: ExcerptRepairResult = { repaired: 0, unrepairable: 0, changes: [], skipped: [] };
  if (!source || !headRegroundEnabled()) return res;
  for (const f of findings) {
    if (REPAIR_EXCLUDED_LENSES.has(f.lens)) continue;
    if (!f.excerpt || !f.excerpt.trim()) continue;
    if (!isHeadClippedExcerpt(source, f.excerpt)) continue;
    const span = findHeadRepairSpan(source, f.excerpt);
    if (!span) {
      // Detected as head-clipped but not safely extendable (reach too long, or no strict extension). Left
      // exactly as it was — an unrepaired crop is a gate problem, never a licence to synthesize the head.
      res.unrepairable++;
      res.skipped.push({ id: f.id, lens: f.lens, reason: "head clipped but no bounded clause start locatable — left as emitted" });
      continue;
    }
    res.changes.push({ id: f.id, lens: f.lens, before: f.excerpt, after: span });
    f.excerpt = span;
    res.repaired++;
  }
  return res;
}
