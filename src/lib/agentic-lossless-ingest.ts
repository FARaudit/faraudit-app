// ── LOSSLESS INGEST (deterministic, $0, NO model) — the map-reduce COMPRESSOR replacement ──────────────
//
// WHY (2026-07-06, CEO-directed "take the leap"): the map-reduce compressor (agentic-chunked-ingest.ts, ~314
// cheap-model MAP calls, ~$4/15-min per giant) SUMMARIZES over-budget docs into a small digest, and a summary
// silently DROPS content (W9126 lost its §M evaluation factors + the Davis-Bacon wage table; panel-confirmed).
// No industry pipeline summarizes; the standard is clean EXTRACTION → structured read. The engine already has
// clean text (pdftotext-quality docs), so the fix is to stop SUMMARIZING.
//
// ★ DESIGN = DROP-NOISE, NOT KEEP-BINDING (adversarial-review REVISE, 2026-07-06). A first cut KEPT only lines
// matching a "binding" keyword regex — but a keyword filter can NEVER be provably complete: an eligibility bar
// with no obligation verb ("Firms lacking a facility clearance are not eligible"), a spelled-out §L page limit,
// a present-tense spec ("concrete attains 4,000 psi"), and third-person verbs ("provides/submits") ALL slipped it,
// and on the fits-budget path the drop was SILENT → false-eligible BID. Unacceptable for a completeness moat.
// So we INVERT: keep EVERY line that carries real prose (any obligation, whatever its phrasing), and drop ONLY
// PROVABLE NOISE — drawing dimension callouts, grid/scale/sheet furniture, symbol/number-only lines. A binding
// obligation is always prose, so it can never be dropped. Lossless-FOR-PROSE by construction, no oracle needed.
//
// This shrinks drawing-heavy giants (the drawings are mostly dimension noise) while keeping every text document
// essentially whole. A PROSE package that still exceeds the read window is NOT force-summarized — it routes to
// per-document reads (giant path) or reads honest-INCOMPLETE (named whole-doc drop, never a silent cut).
//
// Grounding: because only NOISE is dropped, no binding span is ever removed, so grounding against the assembled
// (noise-dropped) source can never miss an obligation the model needed to see. Flag-gated (AUDIT_LOSSLESS_INGEST);
// OFF ⇒ never called ⇒ byte-identical to today.

import type { AgenticDoc } from "./agentic-orchestrator";
import type { TypedFinding } from "./audit-findings";
import { assembleFullSource, assembleFullSourceBudgeted, MAX_FULLSOURCE_CHARS, type AssembledSource } from "./agentic-executor";

export interface LosslessAssembled extends AssembledSource {
  contentLossDocs: string[];   // WHOLE docs dropped (honest documents_complete=false) — [] when the noise-drop fits
  filteredDocs: string[];      // docs whose NOISE was dropped (all prose kept verbatim) — NOT content loss
}

// A line is PROSE if it carries real English — ≥ PROSE_MIN_WORDS tokens of ≥3 letters. ANY real obligation
// qualifies regardless of phrasing (verb, tense, party noun, vocabulary) — this is why the drop-noise design is
// provably complete where a keep-binding regex is not. Drawing callouts / grid labels / dimensions do NOT qualify.
const WORD = /[A-Za-z]{3,}/g;
const PROSE_MIN_WORDS = 4;

// PROVABLE NOISE — a line that is ONLY drawing/sheet furniture: blank / symbol-only, a dimension callout
// (12'-6"), or a grid/scale/sheet/elevation/detail label with no trailing prose. Deliberately CONSERVATIVE: it
// must match the WHOLE line (…$) so a label that is followed by real words is NOT noise and is kept.
//
// ★ NEVER drop a line merely because it is letter-free-but-NUMERIC (adversarial-review FINDING 1, 2026-07-06): the
// first alternation was `^[\s\W\d]*$`, which matched ANY line with no letters — silently dropping pdftotext
// column-split binding table cells (a Davis-Bacon wage rate "38.50 22.15", a §L page limit "50", a bid-bond "20%",
// a CLIN quantity) on the over-budget noise-drop path → a false-COMPLETE (documents_complete=true over lost content,
// the very W9126 wage-table loss this module was built to end). FIX: alt-1 is now `^[\s\W]*$` — it drops ONLY
// blank / pure-symbol / separator lines (no digits). Any line carrying a NUMBER is KEPT (a few cheap tokens vs a
// silent binding-value loss). Explicit dimension callouts still drop via alt-2; drawing labels via alt-3.
const NOISE_SHAPE = /^[\s\W]*$|^\s*\d+\s*['"]?\s*[-x×]\s*\d+\s*['"]?\s*$|^\s*(?:GRID|SCALE|SHEET|REV|DETAIL|NORTH|SOUTH|EAST|WEST|SECTION\s+[A-Z][-\s]?[A-Z]|PLAN\s+VIEW|ELEV(?:ATION)?|TYP|DWG|DRAWING\s+(?:NO|NUMBER))\b(?:\s+[A-Z]{1,2}[-.]?\d+[A-Z]?)?[\s\W\d]*$/i;

/** True iff the line carries real prose (could be a binding obligation). Over-inclusive on purpose — the cost of
 *  keeping a borderline line is a few tokens; the cost of dropping a real obligation is a completeness miss. */
export function isProse(line: string): boolean {
  return (line.match(WORD)?.length ?? 0) >= PROSE_MIN_WORDS;
}

/** Drop ONLY provable NOISE from a document; KEEP ALL PROSE verbatim (never summarize/reorder). Lossless-for-prose:
 *  a binding obligation is always prose, so it survives whatever its phrasing. Returns kept text + char accounting. */
export function dropNoise(text: string): { kept: string; keptChars: number; rawChars: number } {
  const lines = text.split("\n");
  // KEEP a line unless it is NON-prose AND matches the whole-line noise shape.
  const out = lines.filter((ln) => isProse(ln) || !NOISE_SHAPE.test(ln));
  const kept = out.join("\n");
  return { kept, keptChars: kept.length, rawChars: text.length };
}

/** Assemble a package by DROPPING NOISE (never summarizing). Fits-whole → untouched whole read. Over-budget →
 *  noise-drop each doc (all prose kept) → if it now fits, ONE complete read (contentLoss=[]); if the PROSE alone
 *  still exceeds the window, the package is too large for a single read → drop WHOLE non-binding-first overflow
 *  docs (named, honest documents_complete=false). A giant should instead route to per-document reads BEFORE this
 *  whole-doc drop (see the giant per-doc path); this function's whole-doc drop is the honest last-resort. */
export function assembleFullSourceLossless(docs: AgenticDoc[], maxChars: number = MAX_FULLSOURCE_CHARS): LosslessAssembled {
  // 1. Fits whole → NO filtering (byte-identical whole read — every char preserved). Gate on ACTUAL assembled size,
  //    NOT budgeted.truncated (a single over-budget doc never "truncates" → would skip the shrink; L2 regression).
  const wholeSource = assembleFullSource(docs);
  if (wholeSource.length <= maxChars) return { source: wholeSource, truncated: false, keptDocs: docs.length, droppedDocs: [], contentLossDocs: [], filteredDocs: [] };

  // 2. Over budget → drop NOISE from each doc (all prose kept verbatim).
  const filtered = docs.map((d) => {
    const f = dropNoise(d.text);
    return { doc: { ...d, text: f.kept } as AgenticDoc, name: d.name, changed: f.keptChars < f.rawChars };
  });
  const filteredSet = filtered.map((f) => f.doc);
  const filteredNames = filtered.filter((f) => f.changed).map((f) => f.name);
  const assembledText = assembleFullSource(filteredSet);

  // 3a. Noise-drop fits → ONE complete read. Dropping NOISE is NOT content loss (all prose/binding retained).
  if (assembledText.length <= maxChars) {
    return { source: assembledText, truncated: false, keptDocs: filteredSet.length, droppedDocs: [], contentLossDocs: [], filteredDocs: filteredNames };
  }

  // 3b. PROSE alone still exceeds the window → too large for a SINGLE read. Honest last-resort: drop whole
  //     non-binding-first overflow docs on the noise-dropped set (named + documents_complete=false). The giant
  //     per-doc path (runGiantPerDoc) should intercept BEFORE here so no binding doc is dropped.
  const fb = assembleFullSourceBudgeted(filteredSet, maxChars);
  return { ...fb, contentLossDocs: fb.droppedDocs, filteredDocs: filteredNames };
}

export interface GiantPerDocResult {
  findings: TypedFinding[];       // UNION of per-doc findings — the caller runs ONE deriveVerdict over this
  documentsComplete: boolean;     // false ⇒ a doc could not be read in full ⇒ honest INCOMPLETE (never false-COMPLETE)
  readDocs: string[];             // docs read in full (noise-dropped text fit a single read)
  unreadDocs: string[];           // docs whose noise-dropped text ALONE exceeds the window (could not be read)
}

/** Read a GIANT (combined content exceeds the single-read window) by reading each DOCUMENT SEPARATELY and gathering
 *  its findings; the caller then runs ONE deterministic deriveVerdict over the UNION — the single reconciliation
 *  authority, NEVER a naive merge of N per-doc verdicts (adversarial-review requirement). COMPLETENESS is HARD-gated:
 *  a document whose noise-dropped text ALONE still exceeds `maxChars` cannot be read → it lands in `unreadDocs` and
 *  forces documentsComplete=false (honest INCOMPLETE). This can NEVER produce a false-COMPLETE: a doc is only counted
 *  read when its full (noise-dropped) text was passed to `auditOne`. `auditOne` is INJECTED (the real per-doc audit
 *  in prod, a stub in tests) so this orchestration is $0 unit-testable. Each doc grounds against its OWN full text. */
export async function runGiantPerDoc(
  docs: AgenticDoc[],
  maxChars: number,
  auditOne: (docText: string, docName: string) => Promise<TypedFinding[]>,
): Promise<GiantPerDocResult> {
  const findings: TypedFinding[] = [];
  const readDocs: string[] = [];
  const unreadDocs: string[] = [];
  for (const d of docs) {
    const text = dropNoise(d.text).kept;
    // A single document whose noise-dropped text still exceeds one read window cannot be read completely (would need
    // intra-doc chunking or a larger-context model). Fail SAFE: record it unread → honest INCOMPLETE, never a partial
    // read passed off as complete. (e.g. W9126's 340-page amendment.)
    if (text.length > maxChars) { unreadDocs.push(d.name); continue; }
    const f = await auditOne(text, d.name);
    findings.push(...f);
    readDocs.push(d.name);
  }
  return { findings, documentsComplete: unreadDocs.length === 0, readDocs, unreadDocs };
}
