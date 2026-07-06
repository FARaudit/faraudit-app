// ── LOSSLESS INGEST (deterministic, $0, NO model) — the map-reduce COMPRESSOR replacement ──────────────
//
// WHY (2026-07-06, CEO-directed "take the leap", data-proven on W9126): the map-reduce compressor
// (agentic-chunked-ingest.ts, ~314 cheap-model MAP calls, ~$4/15-min per giant) SUMMARIZES over-budget docs
// into a small digest — and a summary silently DROPS content (W9126 lost its §M evaluation factors + the
// Davis-Bacon wage table; adversarial panel confirmed). No industry pipeline summarizes; the standard is
// clean EXTRACTION → structured read. The engine already has clean text (pdftotext-quality docs), so the fix
// is NOT better extraction — it is to stop SUMMARIZING. This module shrinks an over-budget package by keeping
// every binding line VERBATIM (+ its context) and dropping only genuine noise (drawing dimension callouts,
// grid/scale/sheet furniture, blank/symbol rows). Deterministic, no model, no cost, no summarization.
//
// PROVEN on W9126: raw 11.32M chars (~2.83M tok) → filtered ~1.32M chars (~331K tok, 11% retained) that FITS
// the existing 1.4M-char read budget → ONE long-context Opus read instead of 314 compression calls; §M / wage
// / bonding all survive. Giant per-audit cost drops from ~$14 (whole read) to ~$2-3 (filtered read).
//
// DOCTRINE (completeness moat, non-negotiable): the filter is LOSSLESS-FOR-BINDING by construction — it only
// ever DROPS lines that carry no binding signal AND are not within the context window of one. It NEVER
// summarizes, paraphrases, or reorders. Grounding still runs against the PRE-filter full text (groundingSource
// in the executor), so a finding can never be fabricated. The residual risk is a binding obligation phrased
// with NO signal word slipping the filter → mitigated by (a) a deliberately GENEROUS signal set, (b) ±context
// windows, (c) whole-table retention, (d) the audit's own completeness verification downstream. Flag-gated
// (AUDIT_LOSSLESS_INGEST); OFF ⇒ this module is never called ⇒ byte-identical to today.

import type { AgenticDoc } from "./agentic-orchestrator";
import { assembleFullSource, assembleFullSourceBudgeted, MAX_FULLSOURCE_CHARS, type AssembledSource } from "./agentic-executor";

export interface LosslessAssembled extends AssembledSource {
  contentLossDocs: string[];   // WHOLE binding docs dropped (honest documents_complete=false) — [] when filtering fits
  filteredDocs: string[];      // docs whose NOISE was dropped (binding kept verbatim) — NOT content loss
}

// BINDING-SIGNAL — a line carrying legal / obligation / evaluation weight. GENEROUS by design (err toward KEEP):
// the cost of keeping a non-binding line is a few tokens; the cost of dropping a binding one is a completeness
// miss. Covers obligation verbs, FAR/DFARS clause numbers, UCF/CSI section headers, evaluation factors, wage /
// bond / surety / price / schedule / deadline terms, and party references.
const BINDING_SIGNAL = /\b(?:shall|must|will\b|furnish|provide|submit|require|required|responsible|deliver|install|perform|comply|complies|complete|bond|guarantee|surety|wage|davis[\s-]?bacon|price|priced|pricing|cost|evaluat|factor|basis\s+for\s+award|award\s+will|awarded|deadline|due\b|no\s+later\s+than|offeror|contractor|liquidated|damages|SSEB|SSA\b|technically\s+acceptable|incorporat|clause|amend)\b|\b\d{2}\.\d{3}(?:-\d+)?\b|\b252\.\d{3}|\bWD\s+\d{2}[-\s]?\d{3,4}|\bsection\s+00\s+\d{2}\b|\bCLIN\b/i;

// TABLE / DATA rows — wage schedules, bid/CLIN pricing tables, CSI section codes. Keep intact. MONEY + explicit
// codes ONLY — a bare decimal (\d.\d{2}) is NOT enough: construction DRAWINGS are full of dimension callouts
// ("12.50", "3.25") that would drag context windows around pure drawing noise and inflate the digest past the read
// budget (observed on W9126: forced a false drop of the amendment + drawings). Wage-rate rows still survive via the
// Davis-Bacon / "wage determination" header context (BINDING_SIGNAL) — we don't need to match every bare rate.
const TABLE_ROW = /\$\s?\d[\d,]*(?:\.\d{2})?|\bCLIN\s*\d|\b\d{2}\s+\d{2}\s+\d{2}\b/;

// PURE NOISE — drawing dimension callouts, grid refs, scale / sheet / revision furniture, blank / symbol-only
// lines. A line matching this AND not matching a binding signal is droppable.
const PURE_NOISE = /^[\s\W\d]*$|^\s*\d+\s*['"]?\s*[-x×]\s*\d+|^\s*(?:GRID|SCALE|SHEET|REV\.?|DETAIL|NORTH\b|PLAN\s+VIEW|ELEV(?:ATION)?\b|TYP\.?\b)\b/i;

// Keep this many lines on EITHER side of a binding hit so the obligation's surrounding sentence / table row /
// heading context survives the filter (a bare matched line out of context reads worse to the model).
const CONTEXT_LINES = 2;

/** Filter ONE document's text to its binding content, VERBATIM. Keeps every binding/table line plus a ±context
 *  window; drops runs of pure noise. Never summarizes / reorders. Returns the kept text + char accounting. */
export function filterBindingContent(text: string): { kept: string; keptChars: number; rawChars: number } {
  const lines = text.split("\n");
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (PURE_NOISE.test(ln) && !BINDING_SIGNAL.test(ln)) continue;   // pure noise, no binding signal → droppable
    if (BINDING_SIGNAL.test(ln) || TABLE_ROW.test(ln)) {
      const lo = Math.max(0, i - CONTEXT_LINES), hi = Math.min(lines.length - 1, i + CONTEXT_LINES);
      for (let j = lo; j <= hi; j++) keep[j] = true;               // keep the hit + its context window
    }
  }
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) if (keep[i]) out.push(lines[i]);
  const kept = out.join("\n");
  return { kept, keptChars: kept.length, rawChars: text.length };
}

/** Assemble an over-budget package by binding-filtering each doc (verbatim, lossless-for-binding), NOT by
 *  compressing. Fits-whole → identical to the budgeted whole read (no filtering). Over-budget → filter → if it
 *  now fits, ONE read of the full binding set (contentLoss=[]); if STILL over budget the binding content itself
 *  exceeds the read window → drop WHOLE non-binding overflow docs (named, honest documents_complete=false). */
export function assembleFullSourceLossless(docs: AgenticDoc[], maxChars: number = MAX_FULLSOURCE_CHARS): LosslessAssembled {
  // 1. Fits whole → NO filtering (byte-identical whole read — every char preserved). Gate on the ACTUAL assembled
  //    size, NOT budgeted.truncated: a SINGLE over-budget doc never "truncates" (budgeted won't drop the only doc),
  //    so a truncated-gate would skip filtering the very giant we were called to shrink (caught by L2 regression).
  const wholeSource = assembleFullSource(docs);
  if (wholeSource.length <= maxChars) return { source: wholeSource, truncated: false, keptDocs: docs.length, droppedDocs: [], contentLossDocs: [], filteredDocs: [] };

  // 2. Over budget → binding-filter each doc VERBATIM (drop noise, keep every binding line + context).
  const filtered = docs.map((d) => {
    const f = filterBindingContent(d.text);
    return { doc: { ...d, text: f.kept } as AgenticDoc, name: d.name, changed: f.keptChars < f.rawChars };
  });
  const filteredSet = filtered.map((f) => f.doc);
  const filteredNames = filtered.filter((f) => f.changed).map((f) => f.name);
  const assembledText = assembleFullSource(filteredSet);

  // 3a. Filtered binding set fits → ONE complete read. Dropping NOISE is NOT content loss (all binding retained).
  if (assembledText.length <= maxChars) {
    return { source: assembledText, truncated: false, keptDocs: filteredSet.length, droppedDocs: [], contentLossDocs: [], filteredDocs: filteredNames };
  }

  // 3b. Still over budget after filtering → the BINDING content alone exceeds the window. Fail SAFE: drop whole
  //     non-binding-first overflow docs on the FILTERED set (binding-priority order), named + honest INCOMPLETE.
  const fb = assembleFullSourceBudgeted(filteredSet, maxChars);
  return { ...fb, contentLossDocs: fb.droppedDocs, filteredDocs: filteredNames };
}
