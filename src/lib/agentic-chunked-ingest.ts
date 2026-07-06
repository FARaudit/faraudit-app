// AUDIT_CHUNKED_INGEST — map-reduce ingest (Brain card 271, R1/R2/R3). Own Rule-61 step.
//
// PROBLEM (Rule-66 run 1, W9126G26RA087): assembleFullSourceBudgeted keeps whole docs in priority order until
// a char ceiling, then DROPS the overflow docs → truncated=true → documents_complete=false → deriveVerdict caps
// to INCOMPLETE. The 1,668-page primary alone (3.36M chars) blew the 1.4M budget, so every AMENDMENT was dropped
// — a $2.10 process-then-decline that read nothing but the primary. Byte/page/size is the WRONG reason to fail.
//
// FIX (Brain ruling): when the package would overflow, DON'T drop — COMPRESS the OVER-BUDGET ATTACHMENTS to
// GROUNDED compliance digests via a chunked cheap-model MAP → reduce. Nothing is dropped; amendments are ALWAYS
// mapped (R2-c). The digest feeds the SAME single-fullSource auditPackage contract — ingest/location ONLY;
// deriveVerdict stays the sole verdict authority (R2-a). Honest-fail is reserved for GENUINE unreadability (R1).
//
// DESIGN INVARIANTS (hardened after adversarial code-review, card 271):
//   • PRIMARY IS NEVER COMPRESSED. docs[0] carries the UCF §L/§M/§C section structure that format-detection and
//     the completeness gate depend on — a shredded primary would break both. Only ATTACHMENTS (idx ≥ 1) compress.
//     A primary that alone exceeds the char budget is kept WHOLE (complete-but-large, R1 — never a false fail).
//   • CANONICAL DOCUMENT HEADER. The delimiter is byte-identical to assembleFullSource ("==== DOCUMENT: name ===="),
//     so docRegions / findingProvenance / detectAmendments / manifest reconciliation still parse the clean name.
//     The read-mode disclosure lives INSIDE the doc body, never in the header (would pollute the parsed name).
//   • CONTENT-LOSS FAIL-SAFE (never a false-COMPLETE). If compressing a BINDING doc yields an EMPTY digest (the MAP
//     surfaced no verbatim span AND the deterministic floor found no clause), its material content was NOT captured
//     — that doc is a CONTENT LOSS: it is surfaced (contentLossDocs) and forces documents_complete=false (honest
//     INCOMPLETE), exactly like a scanned no-text binding doc. Compression can never silently empty an amendment.
//   • GROUNDING (R2-b). Every mapped excerpt must be a VERBATIM substring of its chunk (isGroundedInSource) or it
//     is REJECTED. The digest is therefore 100% verbatim source — a finding grounded on the digest is grounded on
//     the original, so find_in_source stays sound end-to-end.
//   • DETERMINISTIC FLOOR (R2-c). FAR/DFARS clause numbers are extracted from the FULL doc text regardless of what
//     the MAP surfaced — a map miss can never delete a clause from the record.
//   • ABORT IS HONEST. If the budget/wall-clock signal fires mid-compression, the read is INCOMPLETE (truncated=true),
//     never a partial digest presented as complete.
//
// FLAG-OFF ⇒ never entered; executor uses assembleFullSourceBudgeted (byte-identical).
// FLAG-ON, package FITS ⇒ whole assembly, byte-identical to a full read, ZERO paid map calls.
// Map-reduce engages ONLY on a genuine overflow, and ONLY on attachments.

import { isGroundedInSource } from "./audit-judgment-layer";
import { extractClauseNumbers } from "./section-extractors";
import { isBindingDoc } from "./sam-attachments";
import type { AgenticDoc } from "./agentic-orchestrator";

/** Chars per MAP window. 40k ≈ ~10k tokens — inside any cheap model's context with room for the instruction +
 *  structured output, and small enough that a per-window failure loses little. */
export const MAP_CHUNK_CHARS = Number(process.env.AGENTIC_MAP_CHUNK_CHARS) || 40_000;

/** OVERLAP between consecutive windows (code-review card 271). chunk-boundary safety: a compliance span up to this
 *  many chars straddling a window edge appears WHOLE in the next window, so it is never fragmented/lost; the exact-
 *  equality dedupeSpans then collapses the copy the overlap duplicated. 4k covers any clause/sentence/date line. */
export const MAP_OVERLAP_CHARS = Number(process.env.AGENTIC_MAP_OVERLAP_CHARS) || 4_000;

/** Overlapping windows over the doc text — GUARANTEES a span ≤ MAP_OVERLAP_CHARS crossing a window edge is present
 *  intact in at least one window (fixes the non-overlapping-chunk boundary loss). Pure. */
export function overlappingWindows(text: string, size: number, overlap: number): string[] {
  const s = Math.max(1, Math.floor(size));
  if (text.length <= s) return [text];
  // Clamp overlap to [0, s-1] so a misconfigured AGENTIC_MAP_OVERLAP_CHARS ≥ size can never collapse step to 1
  // and explode into ~text.length single-char-step windows (a paid-call cost footgun). Defense-in-depth.
  const ov = Math.min(Math.max(0, Math.floor(overlap)), s - 1);
  const step = Math.max(1, s - ov);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + s));
    if (i + s >= text.length) break;
  }
  return out;
}

// R2-c DETERMINISTIC FLOOR (Brain card 271) — the MATERIAL scalars an amendment typically changes and that the MAP,
// being recall-imperfect, might miss (they are prose, not clause numbers). Extracted from FULL doc text by regex so
// a map miss can never delete them from the record. Brain named "clause/date/CLIN"; set-aside is added because a
// set-aside flip is the single most decision-relevant amendment change. Each category is capped to bound noise.
const DATE_RE = /\b(?:\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:[AaPp]\.?[Mm]\.?)?(?:\s*[A-Z]{2,4})?)?/g;
const CLIN_RE = /\b(?:Sub-?CLIN|CLIN|ELIN)\s*[:#]?\s*\d{3,4}[A-Z]{0,2}\b/gi;
const SETASIDE_RE = /\b(?:total\s+small\s+business|100%\s+small\s+business|8\(a\)|SDVOSBs?|service-disabled\s+veteran|HUBZone|EDWOSBs?|WOSBs?|women-owned|veteran-owned)\b[^.\n]{0,50}/gi;
// #3 (ultracode hardening) — CONTENT-based amendment detection. Filenames are unreliable ("am_2" ≠ "amend"), so we
// detect amendment LANGUAGE in the full text and surface it into the floor → the compressed digest carries it →
// detectAmendments (which scans the region's first ~4000 chars) fires even when the header wasn't a surfaced span.
const AMENDMENT_RE = /\bamendment of solicitation\b|\bamendment\s+(?:no\.?|number|#)?\s*0*\d+\b|\bSF[\s-]?30\b/gi;

const capUniq = (matches: string[], cap: number): string[] => Array.from(new Set(matches.map((m) => m.trim()).filter(Boolean))).slice(0, cap);

/** Build the deterministic floor for one doc's FULL text: clause numbers + material dates + CLIN ids + set-aside
 *  markers + amendment markers. Runs on the whole doc regardless of chunking/map recall (R2-c). [] when nothing. Pure. */
export function deterministicFloor(text: string): string[] {
  const clauses = extractClauseNumbers(text);
  const dates = capUniq(text.match(DATE_RE) ?? [], 20);
  const clins = capUniq(text.match(CLIN_RE) ?? [], 30);
  const setAsides = capUniq(text.match(SETASIDE_RE) ?? [], 10);
  const amendments = capUniq(text.match(AMENDMENT_RE) ?? [], 5);
  const parts: string[] = [];
  if (clauses.length) parts.push(`clauses: ${clauses.join(", ")}`);
  if (dates.length) parts.push(`dates: ${dates.join(" | ")}`);
  if (clins.length) parts.push(`CLINs: ${clins.join(", ")}`);
  if (setAsides.length) parts.push(`set-aside markers: ${setAsides.join(" | ")}`);
  if (amendments.length) parts.push(`amendment markers: ${amendments.join(" | ")}`);
  return parts;
}

/** Read-mode for a doc in the assembled source. "full" = verbatim whole doc; "map-reduce" = compressed digest. */
export type DocReadMode = "full" | "map-reduce";

/** In-body disclosure prepended to a map-reduced doc (R3). NOT in the header — the header stays canonical. */
const READMODE_NOTE =
  "[READ-MODE: map-reduce — compliance-relevant VERBATIM spans extracted from this document; NOT a full-text read. " +
  "Non-compliance prose is omitted.]\n\n";

/** Byte-identical to assembleFullSource's delimiter — docRegions parses the clean name from this exact shape. */
const canonicalHeader = (name: string): string => `\n\n==== DOCUMENT: ${name} ====\n\n`;

export interface ChunkedDocResult {
  name: string;
  mode: DocReadMode;
  text: string;          // the doc's body contribution (whole text, or READMODE_NOTE + grounded digest)
  chunks: number;        // MAP chunks processed (0 when kept whole)
  spansKept: number;     // grounded excerpts kept (0 when kept whole)
  spansRejected: number; // excerpts the model returned that were NOT verbatim in-source → rejected (R2-b)
  failedWindows: number; // windows whose map call THREW / returned unparseable JSON (0 when kept whole) — coverage gate
  contentLoss: boolean;  // true iff a BINDING doc read to nothing OR mostly-failed windows — honest-fail, never false-COMPLETE
}

export interface ChunkedAssembly {
  source: string;
  truncated: boolean;         // true ONLY on a genuine incomplete read (abort mid-compress, or a content-loss doc)
  keptDocs: number;
  droppedDocs: string[];      // ALWAYS empty — the map-reduce path never drops a doc (R1)
  contentLossDocs: string[];  // BINDING docs whose compressed digest was empty → force documents_complete=false
  perDoc: ChunkedDocResult[]; // read-mode audit trail for the report (R3) — never silent
}

/** The MAP call contract — inject a $0 stub in tests, the real cheap-model caller in prod (PAID).
 *  Given one chunk of a doc, return the VERBATIM compliance-relevant excerpts found in it. */
export type ChunkMapCall = (args: {
  docName: string;
  chunk: string;
  chunkIndex: number;
  chunkCount: number;
}) => Promise<{ excerpts: string[] }>;

/** De-dup by EXACT equality only (chunk overlap can surface the identical span twice). Deliberately NOT substring
 *  containment — a short distinct compliance token (e.g. "SF-30") must never be dropped for being a coincidental
 *  substring of an unrelated longer span. A little digest redundancy is harmless; losing a distinct span is not. */
function dedupeSpans(spans: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const s of spans) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    kept.push(t);
  }
  return kept;
}

const isBinding = (name: string): boolean => isBindingDoc({ role: "attachment", name });

/** Map-reduce ONE doc into a grounded compliance digest. Never throws (fail-safe): a failed/aborted chunk
 *  contributes nothing, but the deterministic clause floor + other chunks still cover the doc — the doc is NEVER
 *  dropped. Grounding (R2-b): an excerpt is kept only if it is a verbatim substring of its chunk. A BINDING doc
 *  whose digest ends up EMPTY (no spans + no clauses) is flagged contentLoss — the caller turns that into an
 *  honest documents_complete=false, never a silent false-COMPLETE. */
export async function mapReduceDoc(
  doc: AgenticDoc,
  mapCall: ChunkMapCall,
  signal?: AbortSignal,
): Promise<ChunkedDocResult> {
  const windows = overlappingWindows(doc.text, MAP_CHUNK_CHARS, MAP_OVERLAP_CHARS);
  // PARALLEL COMPRESSION (Brain card 286-B, ratified). A bounded-concurrency worker pool pulls windows by a shared
  // cursor (AGENTIC_MAP_CONCURRENCY at a time) instead of one-at-a-time — the sequential loop made an 11MB package's
  // ~314 map calls too slow to finish inside any sane wall-clock (the W9126 false-INCOMPLETE root). Assembly is
  // DETERMINISTIC BY WINDOW INDEX: each window's grounded spans land in perWindowSpans[i] and are flattened in index
  // order, NEVER completion order — so the compressed digest is byte-identical regardless of concurrency or which
  // call returns first (the property the regression test pins). Abort/failed-window semantics are preserved exactly:
  // on abort a worker stops pulling new windows ("keep what we have", the old `break`); an un-attempted window is
  // simply empty and NOT counted failed; only a THROWN/unparseable window increments failedWindows (the content-loss
  // gate). Increments are safe under this pool because JS is single-threaded — they run synchronously between awaits.
  const CONCURRENCY = Math.max(1, Number(process.env.AGENTIC_MAP_CONCURRENCY) || 6);
  const perWindowSpans: string[][] = Array.from({ length: windows.length }, () => []);
  let rejected = 0;
  let failedWindows = 0;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return;                     // upstream budget fired — stop pulling new windows
      const i = cursor++;                              // unique per pull (single-threaded: no interleave mid-statement)
      if (i >= windows.length) return;
      const chunk = windows[i];
      let res: { excerpts: string[] };
      try {
        res = await mapCall({ docName: doc.name, chunk, chunkIndex: i, chunkCount: windows.length });
      } catch {
        failedWindows++;                               // #2 — a window that THREW / returned unparseable JSON is UNREAD,
        continue;                                      // never dropped; counted so a mostly-failed binding doc fails safe
      }
      for (const ex of res.excerpts ?? []) {
        // R2-b GROUNDING: verbatim substring of THIS window, or REJECTED. A hallucinated / paraphrased span cannot
        // enter the digest, so the digest is 100% verbatim source (find_in_source stays sound downstream).
        if (typeof ex === "string" && isGroundedInSource(ex, chunk)) perWindowSpans[i].push(ex);
        else rejected++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, windows.length) }, () => worker()));
  const grounded: string[] = perWindowSpans.flat();    // DETERMINISTIC assembly — window-index order, not completion
  const spans = dedupeSpans(grounded);
  // R2-c DETERMINISTIC FLOOR — clause numbers + material DATES + CLIN ids + set-aside markers from the FULL doc
  // text, always, regardless of MAP recall. This is the backstop for the material scalars an amendment changes
  // (a moved due date, a set-aside flip) that are prose the recall-imperfect MAP might miss (code-review card 271).
  const floor = deterministicFloor(doc.text);
  const floorLine = floor.length ? `\n\n[DETERMINISTIC FLOOR (full-text scan): ${floor.join(" · ")}]` : "";
  // CONTENT LOSS (fail-safe, never false-COMPLETE) — a BINDING doc is a genuine content loss when EITHER it yielded
  // NOTHING (no grounded span AND an empty deterministic floor), OR a MAJORITY of its windows FAILED (threw /
  // unparseable-truncated JSON) so most of the doc went unread even though a stray span/floor item survived (#2
  // — the sustained-failure gap the ultracode review flagged). Either way → honest documents_complete=false.
  const empty = spans.length === 0 && floor.length === 0;
  const mostlyUnread = windows.length >= 2 && failedWindows * 2 >= windows.length;
  const contentLoss = isBinding(doc.name) && (empty || mostlyUnread);
  // #3 — CONTENT-based amendment marker at the TOP of the digest. Fires only when the deterministicFloor actually
  // found amendment LANGUAGE in the text (no filename over-match), and sits in the first chars so detectAmendments
  // (which scans the region's first ~4000 chars) reliably fires even on a large compressed digest.
  const amendHeader = floor.some((p) => p.startsWith("amendment markers:"))
    ? "[AMENDMENT OF SOLICITATION — this document contains amendment language]\n\n" : "";
  const body = spans.length
    ? spans.join("\n\n")
    : "[no compliance-relevant spans surfaced by the map for this document — see deterministic floor below]";
  return {
    name: doc.name,
    mode: "map-reduce",
    text: `${amendHeader}${READMODE_NOTE}${body}${floorLine}`,
    chunks: windows.length,
    spansKept: spans.length,
    spansRejected: rejected,
    failedWindows,
    contentLoss,
  };
}

const bodyLen = (r: ChunkedDocResult, multi: boolean): number => (multi ? canonicalHeader(r.name).length : 0) + r.text.length;

/** Rank for compression order: compress the LARGEST full ATTACHMENT first (biggest budget win per map). Index 0
 *  (the primary) is NEVER a candidate — its section structure is load-bearing. Returns -1 when no attachment is
 *  left in "full" mode to compress. `tried` excludes attachments that already failed to shrink (no-progress). */
function largestFullAttachmentIndex(results: ChunkedDocResult[], tried: Set<number>): number {
  let best = -1;
  let bestLen = -1;
  for (let i = 1; i < results.length; i++) {           // start at 1 — never the primary
    if (results[i].mode !== "full" || tried.has(i)) continue;
    if (results[i].text.length > bestLen) { bestLen = results[i].text.length; best = i; }
  }
  return best;
}

/** Map-reduce assembly (Brain card 271). Replaces assembleFullSourceBudgeted's DROP-on-overflow with
 *  COMPRESS-on-overflow. Contract-compatible: returns a single fullSource for auditPackage.
 *   • total ≤ maxChars ⇒ every doc kept WHOLE, byte-identical to a full read, ZERO paid map calls.
 *   • total > maxChars ⇒ compress the largest full ATTACHMENTS (cheap-model grounded map) until it fits or none
 *     remain. The PRIMARY is never compressed. NOTHING is dropped. truncated stays false UNLESS the run aborted
 *     mid-compress or a binding attachment compressed to an empty digest (both ⇒ honest documents_complete=false). */
export async function assembleFullSourceChunked(
  docs: AgenticDoc[],
  mapCall: ChunkMapCall,
  maxChars: number,
  signal?: AbortSignal,
): Promise<ChunkedAssembly> {
  const multi = docs.length > 1;
  const results: ChunkedDocResult[] = docs.map((d) => ({
    name: d.name, mode: "full" as DocReadMode, text: d.text, chunks: 0, spansKept: 0, spansRejected: 0, failedWindows: 0, contentLoss: false,
  }));
  // total = sum of (header + body) PLUS the "\n\n" separators the final join inserts between the N pieces (2×(N−1)).
  const sepLen = multi ? Math.max(0, results.length - 1) * 2 : 0;
  const total = () => results.reduce((n, r) => n + bodyLen(r, multi), 0) + sepLen;

  const tried = new Set<number>();
  let aborted = false;
  // Compress the largest full attachment, re-measure, repeat until it fits or nothing is left to compress.
  while (total() > maxChars) {
    if (signal?.aborted) { aborted = true; break; }
    const idx = largestFullAttachmentIndex(results, tried);
    if (idx < 0) break;                                // only the primary (+ already-compressed docs) remain — accept complete-but-large (R1)
    const compressed = await mapReduceDoc(docs[idx], mapCall, signal);
    if (compressed.text.length >= results[idx].text.length) {
      // No-progress: the digest did not shrink this doc (already tiny). Leave it WHOLE (mode stays "full" — the
      // read-mode disclosure must not claim map-reduce on a doc we kept verbatim) and try the next attachment.
      tried.add(idx);
      continue;
    }
    results[idx] = compressed;
  }
  if (signal?.aborted) aborted = true;

  const source = results
    .map((r) => (multi ? `${canonicalHeader(r.name)}${r.text}` : r.text))
    .join("\n\n")
    .trim();

  const contentLossDocs = results.filter((r) => r.contentLoss).map((r) => r.name);
  return {
    source,
    truncated: aborted || contentLossDocs.length > 0,
    keptDocs: results.length,
    droppedDocs: [],
    contentLossDocs,
    perDoc: results,
  };
}

/** True when the package would overflow the budget under a whole-doc assembly — i.e. the map-reduce path would
 *  actually engage and incur paid map calls. Uses the SAME formula as assembleFullSourceChunked's total() at the
 *  all-full starting state, so the two never disagree about whether compression is needed. Pure. */
export function wouldOverflow(docs: AgenticDoc[], maxChars: number): boolean {
  const multi = docs.length > 1;
  const sepLen = multi ? Math.max(0, docs.length - 1) * 2 : 0;
  const total = docs.reduce((n, d) => n + (multi ? canonicalHeader(d.name).length : 0) + d.text.length, 0) + sepLen;
  return total > maxChars;
}

/** STRICT filename-based amendment check (SF-30 / "amendment" in the name). Does NOT treat every binding doc as an
 *  amendment — that over-match spuriously flagged spec sheets. Amendment CONTENT is detected separately by the
 *  deterministicFloor AMENDMENT_RE (the reliable, filename-independent path); this predicate is a name-only hint. */
export function isAmendmentDoc(name: string): boolean {
  return /amend|sf-?30\b|sf ?30\b/i.test(name);
}

const MAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    excerpts: {
      type: "array",
      items: { type: "string" },
      description:
        "VERBATIM excerpts (copy the exact characters) of every compliance-relevant span in THIS CHUNK: " +
        "set-aside / eligibility statements, instructions to offerors (§L), evaluation factors / basis for award " +
        "(§M), submission deadlines, offer due dates, FAR/DFARS clause references and their obligations, bonding / " +
        "insurance / certification / licensing requirements, and any amendment to the terms (changed dates, prices, " +
        "quantities, set-aside). Copy exactly — never paraphrase, summarize, or invent. Empty array if none.",
    },
  },
  required: ["excerpts"],
} as const;

/** Build the real (PAID) MAP caller — a grounded compliance-extraction call over ONE chunk. Constructed ONLY when
 *  AUDIT_CHUNKED_INGEST is on AND the package overflows (executor), so the flag-OFF / fits paths make ZERO paid
 *  calls. Extract verbatim, never summarize — the isGroundedInSource gate in mapReduceDoc rejects anything that is
 *  not a verbatim substring, so a hallucinated span can never enter the digest (R2-b). */
export function makeChunkMapCaller(
  callStructured: (args: { model: string; system: string; user: string; schema: object; maxTokens: number; signal?: AbortSignal }) => Promise<string>,
  model: string,
  signal?: AbortSignal,
): ChunkMapCall {
  return async ({ docName, chunk, chunkIndex, chunkCount }) => {
    const system =
      "You are a COMPLIANCE EXTRACTOR, not a summarizer. You are given ONE CHUNK of a federal solicitation " +
      "document. Return the VERBATIM text (copy the exact characters) of every span in THIS CHUNK that bears on " +
      "bid eligibility or proposal compliance: set-aside / eligibility statements, instructions to offerors (§L), " +
      "evaluation factors / basis for award (§M), submission deadlines and offer due dates, FAR/DFARS clause " +
      "references and their obligations, bonding / insurance / certification / licensing requirements, and any " +
      "amendment to the terms (changed dates, prices, quantities, set-aside). Copy exactly — never paraphrase, " +
      "summarize, invent, or lightly edit. Only copy text actually present in the chunk. If the chunk contains " +
      "none, return an empty array. Never guess.";
    const user =
      `Document: ${docName} (chunk ${chunkIndex + 1} of ${chunkCount}).\n\n` +
      `Extract every compliance-relevant VERBATIM span from the chunk below.\n\n---CHUNK---\n${chunk}`;
    const text = await callStructured({ model, system, user, schema: MAP_SCHEMA, maxTokens: 4096, signal });
    let parsed: { excerpts?: unknown };
    try {
      parsed = JSON.parse(text) as { excerpts?: unknown };
    } catch {
      // #2 — unparseable / truncated output is a window FAILURE, not a genuine empty. THROW so mapReduceDoc counts
      // it toward the coverage gate (a majority of failed windows on a binding doc → honest content-loss). A VALID
      // {"excerpts":[]} still returns cleanly below (genuine "no compliance content here"), which is not a failure.
      throw new Error("chunk map: unparseable structured output");
    }
    const excerpts = Array.isArray(parsed.excerpts) ? parsed.excerpts.filter((e): e is string => typeof e === "string") : [];
    return { excerpts };
  };
}
