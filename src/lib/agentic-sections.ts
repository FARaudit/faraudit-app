// STEP 2 — PER-SECTION FAN-OUT SUBSTRATE (Brain ruling 2026-06-24, post-6E).
//
// The compact matrix was a cost optimization that introduced SILENT accuracy loss (it dropped
// rows past a cap and still let coverage say "complete") and made the verifier CIRCULAR (it
// could only check the summary against the summary, forcing every doctrine claim to UNVERIFIABLE
// → guaranteed honest-fail on any real solicitation). The fix is NOT to patch the matrix — it is
// to let each panel lens read its ASSIGNED SOURCE SECTIONS directly, cite verbatim excerpts, and
// let the verifier check claim↔excerpt logic against real text.
//
// This module is the deterministic assignment + assembly layer. It is PURE (no I/O, no model) so
// it is gate-testable: given the detected section texts, it hands each lens exactly its sections,
// bounded by a budget, and reports — HONESTLY — which assigned sections were MISSING (not in the
// package) and which were DROPPED FOR BUDGET (present but cut). Anything dropped for budget MUST
// flip coverage to INCOMPLETE upstream (the matrix-trim honesty principle, reincarnated on source).
//
// Lens→section assignment is the Brain's explicit ruling (UCF section keys):
//   Capture Strategist           → B, C, L, M      (scope · work · instructions · eval)
//   Proposal Compliance Manager  → H, I            (special reqs · clause list)
//   Ex-KO Source-Selection Eval  → L, M            (instructions · eval factors)
//   Pricing & Contracts Risk     → B, H, J         (CLINs · special reqs · attachments list)
//   Small-Business Eligibility   → A, B, I         (cover/form · set-aside notices · 52.219 clauses in §I)
// (§H and §J are valid UCF sections — detectSections returns them when present; only B/C/F/I/L/M
//  are "critical" for fail-loud, not the full detectable set.)

import { detectSections } from "./section-boundary-detector";
import type { ExtractedDocument } from "./pdf-text-extractor";

export type PanelLensKey =
  | "capture_strategist"
  | "proposal_compliance"
  | "source_selection_evaluator"
  | "pricing_contracts_risk"
  | "smallbiz_eligibility_counsel";

/** Brain's deterministic lens→UCF-section assignment (2026-06-24). Order = priority for the budget. */
export const LENS_SECTIONS: Record<PanelLensKey, string[]> = {
  capture_strategist: ["B", "C", "L", "M"],
  proposal_compliance: ["H", "I"],
  source_selection_evaluator: ["L", "M"],
  pricing_contracts_risk: ["B", "H", "J"],
  smallbiz_eligibility_counsel: ["A", "B", "I"],
};

/** Default per-lens source budget (chars). Bounded so a lens call stays cheap; a section cut for
 *  budget is reported in `droppedForBudget` and MUST degrade coverage upstream — never silent. */
export const DEFAULT_LENS_BUDGET_CHARS = 60_000;

export interface LensSourceBundle {
  lens: PanelLensKey;
  /** the assembled source text the lens reads (assigned sections, headed by key, budget-bounded). */
  text: string;
  /** assigned sections that were present and included. */
  includedSections: string[];
  /** assigned sections NOT detected in the package — the lens is told they're absent (honest). */
  missingSections: string[];
  /** assigned sections present but CUT for budget — a coverage-INCOMPLETE trigger (never silent). */
  droppedForBudget: string[];
}

/** Assemble one lens's source bundle from the detected section texts. PURE.
 *  `sectionText` maps a UCF key (e.g. "L") to that section's source text (from detectSections).
 *  A section is MISSING if absent/blank; DROPPED if present but it would exceed the budget. */
export function assembleLensSource(
  lens: PanelLensKey,
  sectionText: Record<string, string>,
  opts: { perLensBudgetChars?: number } = {}
): LensSourceBundle {
  const budget = opts.perLensBudgetChars ?? DEFAULT_LENS_BUDGET_CHARS;
  const assigned = LENS_SECTIONS[lens] ?? []; // guard: an unknown lens key → empty, never a TypeError
  const includedSections: string[] = [];
  const missingSections: string[] = [];
  const droppedForBudget: string[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const key of assigned) {
    const raw = (sectionText[key] ?? "").trim();
    if (!raw) { missingSections.push(key); continue; }
    const block = `## SECTION ${key}\n${raw}`;
    if (used + block.length > budget) {
      // Present but over budget → DROPPED (honest), not silently truncated mid-section.
      droppedForBudget.push(key);
      continue;
    }
    parts.push(block);
    used += block.length;
    includedSections.push(key);
  }
  return { lens, text: parts.join("\n\n"), includedSections, missingSections, droppedForBudget };
}

/** Wrap raw extracted text as a minimal ExtractedDocument for section detection. Boundary
 *  detection is line/pattern based, so one synthetic page suffices — we only need the per-section
 *  .text slices, not real page numbers. */
function asExtractedDoc(text: string): ExtractedDocument {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return { pages: [{ pageNum: 1, text, lines }], rawText: text, pageCount: 1, extractionMethod: "fallback", warnings: [] };
}

export interface SectionTextOpts {
  /** binding attachments (name + extracted text) folded into the section their content belongs to. */
  attachments?: Array<{ name: string; text: string }>;
  /** called with attachment names that matched NO routing rule (binding content the lenses won't
   *  see) — the caller MUST treat a non-empty list as a coverage concern (anti silent-drop, #2b). */
  onUnrouted?: (names: string[]) => void;
}

/** Minimum normalized WORD count for an excerpt to count as grounding. A 2–3 word generic snippet
 *  ("the Government", "shall be") substring-matches almost any source, so without a floor a fabricated
 *  claim carrying a trivial snippet would pass the structural gate (review #2). A real cited span is a
 *  clause sentence — well above this. */
export const MIN_EXCERPT_WORDS = 5;

/** TRUE iff `excerpt` genuinely appears in `source`. The structural guard that makes the verbatim-
 *  excerpt discipline REAL (#4a): a lens excerpt NOT in its assigned source is paraphrased or
 *  FABRICATED — the failure the source-grounding reshape prevents. Normalizes case, whitespace, AND
 *  punctuation/quotes/dashes so OCR/curly-quote drift on a LEGITIMATE excerpt doesn't false-REFUTE it
 *  (review #3). Excerpts below MIN_EXCERPT_WORDS are too thin to be verifiable grounding (review #2).
 *  Pure → gate-testable. */
export function excerptInSource(excerpt: string, source: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[‘’“”]/g, "'")  // curly quotes → straight
      .replace(/[–—]/g, "-")              // en/em dash → hyphen
      .replace(/[^\w\s-]/g, " ")                    // drop other punctuation noise (both sides, symmetric)
      .replace(/\s+/g, " ")
      .trim();
  const e = norm(excerpt);
  if (e.split(" ").filter(Boolean).length < MIN_EXCERPT_WORDS) return false;
  return norm(source).includes(e);
}

/** Build the UCF-section → source-text map the lenses read (Step 2 substrate). detectSections on
 *  the primary yields A–M where present; PWS/SOW/SOO attachments augment §C (the work) and wage
 *  determination / CBA attachments augment §B (pricing floors) — the primary's §C/§B often only
 *  REFERENCE the attachment, so the binding text lives in the attachment. Deterministic (no model/
 *  network). Filename-routed conservatively; richer per-attachment classification is a later refinement. */
export function buildSectionText(primaryText: string, opts: SectionTextOpts = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (primaryText && primaryText.trim()) {
    // #1d: a detector exception (e.g. pathological regex input) must NOT kill the whole run —
    // fall back to attachment-only sections; the missing-section path then handles it honestly.
    try {
      const bag = detectSections(asExtractedDoc(primaryText));
      for (const [key, sec] of Object.entries(bag.sections)) {
        if (sec.text && sec.text.trim()) out[key] = sec.text.trim();
      }
    } catch { /* detector failed — leave `out` to be filled by attachments; lenses see MISSING sections */ }
  }
  const unrouted: string[] = [];
  for (const a of opts.attachments ?? []) {
    const t = (a.text ?? "").trim();
    if (!t) continue;
    const tagged = `[attachment: ${a.name}]\n${t}`;
    if (/\b(pws|sow|soo|statement\s+of\s+work|performance\s+work\s+statement|statement\s+of\s+objectives)\b/i.test(a.name)) {
      out.C = out.C ? `${out.C}\n\n${tagged}` : tagged;
    } else if (/\b(wage\s*det(?:ermination)?|sca|cba|collective\s+bargaining)\b/i.test(a.name)) {
      out.B = out.B ? `${out.B}\n\n${tagged}` : tagged;
    } else {
      // #2b: an attachment that matches NO rule is binding content the lenses won't see — report it,
      // never silently drop (the failure mode the whole reshape exists to kill).
      unrouted.push(a.name);
    }
  }
  if (unrouted.length) opts.onUnrouted?.(unrouted);
  return out;
}

/** Does any lens bundle indicate content the panel will NOT see (dropped for budget)?
 *  Upstream coverage MUST flip to INCOMPLETE when true — the source-grounded successor to the
 *  matrix-trim honesty rule. (MISSING sections are reported per-lens but a genuinely-absent §J is
 *  not necessarily a coverage defect; DROPPED-for-budget always is.) */
export function lensBundlesDroppedContent(bundles: LensSourceBundle[]): string[] {
  return bundles.flatMap((b) => b.droppedForBudget.map((s) => `${b.lens}:§${s}`));
}
