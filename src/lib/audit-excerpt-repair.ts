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
