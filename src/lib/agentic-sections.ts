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

/** Split text into chunks each ≤ maxChars, preferring paragraph (blank-line) then line then hard
 *  boundaries. NO content is dropped — `chunks.join("") === text` exactly (the #4 anti-drop guarantee:
 *  budget pressure produces MORE passes, never a lost section). Pure → gate-testable. */
export function chunkText(text: string, maxChars: number): string[] {
  const max = Math.max(1, Math.floor(maxChars));
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let buf = "";
  const flush = () => { if (buf) { chunks.push(buf); buf = ""; } };
  for (const para of text.split(/(\n\n+)/)) {            // keep separators as elements (no loss on rejoin)
    if (para.length > max) {                              // a single paragraph too big → go finer
      if (buf.length + para.length > max) flush();
      for (const line of para.split(/(\n)/)) {
        if (line.length > max) {                          // pathological single line → hard slices
          flush();
          let i = 0;
          while (i < line.length) {
            let end = Math.min(i + max, line.length);
            // re-review #6: don't end a slice on a high surrogate (would split a 😀-style pair and
            // hand a lens a lone/broken code unit in its excerpt) — push it to the next chunk.
            if (end < line.length) { const c = line.charCodeAt(end - 1); if (c >= 0xd800 && c <= 0xdbff) end -= 1; }
            if (end <= i) end = Math.min(i + max, line.length); // never zero-progress (degenerate max=1)
            chunks.push(line.slice(i, end));
            i = end;
          }
        } else if (buf.length + line.length > max) { flush(); buf = line; }
        else buf += line;
      }
      continue;
    }
    if (buf.length + para.length > max) { flush(); buf = para; }
    else buf += para;
  }
  flush();
  return chunks;
}

/** #4 — CHUNK-REDUCE assembly (Brain ruling). Like assembleLensSource but NEVER drops a section for
 *  budget: assigned sections are bin-packed into one or more PASSES (each ≤ budget); a single section
 *  larger than the budget is chunked across passes. The runner calls the lens once per pass and
 *  REDUCES (merges) the findings — so every binding section is read in full, no matter the size. The
 *  §B-drop root cause is gone: budget pressure costs an extra pass, not a lost section. Returns the
 *  passes, the absent (missing) sections, and the concatenated source (for excerpt-grounding across
 *  all passes). Pure → gate-testable. */
export function assembleLensPasses(
  lens: PanelLensKey,
  sectionText: Record<string, string>,
  opts: { perLensBudgetChars?: number } = {}
): { passes: LensSourceBundle[]; missingSections: string[]; sourceConcat: string } {
  const budget = opts.perLensBudgetChars ?? DEFAULT_LENS_BUDGET_CHARS;
  const assigned = LENS_SECTIONS[lens] ?? [];
  const missingSections: string[] = [];
  // 1) build blocks; chunk any single section that alone exceeds budget (header preserved per part).
  const blocks: Array<{ key: string; text: string }> = [];
  for (const key of assigned) {
    const raw = (sectionText[key] ?? "").trim();
    if (!raw) { missingSections.push(key); continue; }
    const header = `## SECTION ${key}`;
    const full = `${header}\n${raw}`;
    if (full.length <= budget) { blocks.push({ key, text: full }); continue; }
    // chunk budget must leave room for the per-part header "## SECTION X (part 99/99)\n" (re-review #4
    // — a too-small allowance produced over-budget parts). 20 chars covers the part-label + newline.
    const chunks = chunkText(raw, Math.max(1, budget - header.length - 20));
    chunks.forEach((c, i) => blocks.push({ key, text: `${header} (part ${i + 1}/${chunks.length})\n${c}` }));
  }
  // 2) first-fit bin-pack blocks into passes ≤ budget (preserves the priority order of LENS_SECTIONS).
  const passes: LensSourceBundle[] = [];
  let cur: { parts: string[]; keys: Set<string>; used: number } | null = null;
  const flush = () => { if (cur) { passes.push({ lens, text: cur.parts.join("\n\n"), includedSections: [...cur.keys], missingSections, droppedForBudget: [] }); cur = null; } };
  for (const b of blocks) {
    if (cur && cur.used + b.text.length > budget && cur.parts.length) flush();
    if (!cur) cur = { parts: [], keys: new Set(), used: 0 };
    cur.parts.push(b.text); cur.keys.add(b.key); cur.used += b.text.length + 2;
  }
  flush();
  if (!passes.length) passes.push({ lens, text: "", includedSections: [], missingSections, droppedForBudget: [] });
  return { passes, missingSections, sourceConcat: passes.map((p) => p.text).join("\n\n") };
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
  /** called with the amendment-resolution audit trail (#3) — which amendment superseded which per
   *  section/exhibit. Observability, not a gap (resolution is the fix, not a failure). */
  onResolutionLog?: (log: string[]) => void;
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

/** Route ONE binding attachment to a destination by filename (Stage-6 completion #2 — route everything).
 *  Returns a UCF section key ("C", "J", …) for additive base content the lens reads directly;
 *  "AMENDMENTS" for SF-30 covers AND "revised Section X" replacements — these CANNOT be appended to
 *  their section as-is (that would put the superseded original AND its replacement in front of the lens
 *  as conflicting text — the exact trap Brain flagged); they go to amendment-resolution (#3) which
 *  assembles the current version before chunking; or null for genuinely unclassifiable content (still
 *  surfaced → coverage floor, never silently dropped). Order = most-specific first. Pure → gate-testable.
 *
 *  Real N4008526R0065 names this resolves (was 28 unrouted):
 *    "Amendment 0005 Revised Section C …"        → AMENDMENTS (replacement, needs resolution)
 *    "N4008525R2574 Section C ANNEXES.pdf"        → C  (base annex, additive)
 *    "J-1503010-09 Inventory.xlsx"                → J  (J-exhibit)
 *    "Solicitation Amendment …SF 30.pdf"          → AMENDMENTS
 *    "Site Visit Sign-In Sheet_Redacted.pdf"      → null (administrative; flagged, not dropped) */
/** REGEX: an attachment is an amendment/revision (vs base content). SF-30 covers, ANY "Amendment"/
 *  "Amend", "revised/revision/conformed/amended", and "Mod(ification)". Re-review HIGH #1 fix: the
 *  prior version required a DIGIT right after "Amendment" or the literal word "revised", so a real
 *  amendment named "Conformed Section M" / "Amendment - Section C Update" slipped through as base
 *  content and got merged with the superseded original — the exact conflicting-text trap this module
 *  exists to kill. Broadened to bare amendment verbs; over-flagging errs SAFE (→ resolution/INCOMPLETE),
 *  under-flagging errs DANGEROUS (conflicting text). Shared by routeAttachment (#2) + classifyAttachment (#3). */
export const AMENDMENT_NAME_RE = /\bsf[\s_-]?30\b|solicitation\s+amendment|\bamendments?\b|\bamend(?:ed|ment)?\b|\b(revised|revision|conformed)\b|\bmod(?:ification)?\b/i;

/** The UCF section letter an attachment's CONTENT belongs to, by filename (NO amendment logic —
 *  shared by routeAttachment + classifyAttachment so the two never drift). Returns null if no rule
 *  matches. Order = most-specific first. Pure. */
export function sectionLetterFromName(name: string): string | null {
  const sec = name.match(/\bsection\s+([a-m])\b/i);
  if (sec) return sec[1].toUpperCase();
  const ex = name.match(/\b([a-m])-\d{3,}/i); // exhibit naming "J-1503010-09", "C-0200000"
  if (ex) return ex[1].toUpperCase();
  if (/\b(pws|sow|soo|statement\s+of\s+work|performance\s+work\s+statement|statement\s+of\s+objectives|scope\s+of\s+work|salient\s+characteristics?|item\s+description|purchase\s+description|product\s+description|technical\s+requirements?|requirements?\s+document|description\s+of\s+(?:supplies|services|requirements?))\b/i.test(name)) return "C";
  // §C technical requirements named as a SPEC. "Specs_Mini-Excavator" — note the trailing "_" is a word
  // char so a naive \bspecs\b fails; use a non-word/sep/end lookahead. spec | specs | specification(s).
  // Role-correct (the spec IS the §C description/salient-characteristics the technical lens evaluates),
  // NOT a catch-all (Brain guard). The §C-1240LP26Q0067 unrouted-binding bug.
  if (/\bspec(?:ification)?s?(?=[\s_.\-]|$)/i.test(name)) return "C";
  if (/\b(wage\s*det(?:ermination)?|sca|cba|collective\s+bargaining|davis-bacon)\b/i.test(name)) return "B";
  if (/\b(inventory|elins?|government\s+furnished|gfp|gfe|exhibit|annex(?:es)?|service\s+level\s+standards?)\b/i.test(name)) return "J";
  return null;
}

/** COVERAGE-FROM-CONTENT (Fix #2, Brain Card-1 Option B): when the NAME can't place a binding
 *  attachment, classify it by what it actually CONTAINS — the read — not the filename and not the
 *  ingestion log. Runs the SAME deterministic section detector on the attachment body and routes to
 *  the most-specific binding UCF section it genuinely exhibits (high/medium confidence only).
 *  ROLE-appropriate (the content decides the section), NEVER a catch-all default — if the body shows
 *  no confident binding section, it returns null and the caller keeps it an HONEST coverage gap.
 *  Pure (no model/network). */
export function sectionLetterFromContent(text: string | null): string | null {
  const body = (text ?? "").trim();
  if (body.length < 200) return null; // too little to classify confidently
  let bag;
  try { bag = detectSections(asExtractedDoc(body)); }
  catch { return null; }
  // Specificity order for binding content: C (specs/SOW) → M (eval) → L (instructions) → B → H → F → I.
  for (const k of ["C", "M", "L", "B", "H", "F", "I"]) {
    const s = bag.sections[k];
    if (s && s.text && s.text.trim() && (s.confidence === "high" || s.confidence === "medium")) return k;
  }
  return null;
}

// ── FABRICATION-SUPPRESSION (Fix b, Brain card 40 · Rule 64) ──────────────────────
// "A clause the document never contained cannot be cited as document truth." A FAR/DFARS clause NUMBER
// the engine raises but that is NOT literally in the package source is a fabricated cite (e.g. inferring
// 52.219-14 from a Total-SB set-aside). These two pure helpers gate clause cites on literal source
// presence; the caller strips the fabricated cite before it can propagate or be scored. Pure → testable.
const CLAUSE_NUM_RE = /\b2?52\.\d{3}-\d{1,4}\b/g;
const normClauseCite = (s: string) => s.replace(/[‐-―]/g, "-").replace(/\s+/g, "");

/** Build a literal-source-presence checker for clause numbers (normalizes en-dashes + whitespace so
 *  "52.219 – 14" matches "52.219-14"). */
export function makeClauseSourceChecker(sourceText: string): (clause: string) => boolean {
  const norm = normClauseCite(sourceText);
  return (clause: string) => norm.includes(normClauseCite(clause));
}

/** Replace any clause NUMBER not literally in source with an honest marker. Returns the cleaned text and
 *  the suppressed clause numbers. The underlying CONCERN survives; the unfounded clause cite does not. */
export function stripFabricatedClauses(text: string, inSource: (c: string) => boolean): { clean: string; stripped: string[] } {
  const stripped: string[] = [];
  let clean = text;
  for (const c of new Set(text.match(CLAUSE_NUM_RE) ?? [])) {
    if (!inSource(c)) { clean = clean.split(c).join("[clause not in source — suppressed]"); stripped.push(c); }
  }
  return { clean, stripped };
}

/** The section letter ONLY when the name EXPLICITLY says "Section X" (whole-section identity), NOT when
 *  it was inferred by content type (wage→B, PWS→C). Content-loss fix (Brain 2026-06-25): a revision may
 *  REPLACE a whole section only when it explicitly names that section ("Revised Section B"); a content-
 *  routed revision ("Revised Wage Determination" → §B by heuristic) is §B CONTENT, not the whole §B, and
 *  must APPEND — replacing §B with just the WD drops the primary's pricing schedule. Pure. */
export function explicitSectionLetter(name: string): string | null {
  const sec = name.match(/\bsection\s+([a-m])\b/i);
  return sec ? sec[1].toUpperCase() : null;
}

/** Is an attachment an UNAMBIGUOUSLY administrative artifact carrying NO binding obligations (a sign-in
 *  sheet, attendance roster, visitor log, distribution/mailing list, table of contents)? Such a file
 *  routes to no UCF section, but it is NOT a coverage gap — forcing INCOMPLETE on it is the over-precision
 *  bug that killed the 6E run (a redacted Site Visit Sign-In Sheet). CONSERVATIVE on BOTH axes (Brain's
 *  "under-flagging errs DANGEROUS"): the NAME must match a clearly-administrative pattern AND the body
 *  must carry no obligation language — if either is uncertain, it stays a binding gap (honest INCOMPLETE).
 *  A revision/amendment is NEVER administrative. Pure → gate-testable. */
const ADMIN_NAME_RE = /\b(sign[\s_-]?in|attendance|attendee|visitor)\b.*\b(sheet|roster|log|list)\b|\bsign[\s_-]?in\s+sheet\b|\bsite\s+visit\s+sign[\s_-]?in\b|\b(distribution|mailing)\s+list\b|\btable\s+of\s+contents\b|\b(toc)\b/i;
// Obligation language ⇒ the file may bind the offeror ⇒ treat as a coverage gap, never administrative.
const OBLIGATION_RE = /\b(shall|must|required|offeror|contractor\s+shall|wage|clause|far\s|dfars|deliverable|cdrl|evaluat|proposal|price|cost\b|period\s+of\s+performance|qaspx?|sow|pws)\b/i;
export function isAdministrativeNonBinding(name: string, text: string | null): boolean {
  if (AMENDMENT_NAME_RE.test(name)) return false;       // a revision is never benign-administrative
  if (!ADMIN_NAME_RE.test(name)) return false;          // name must be unambiguously administrative
  if (OBLIGATION_RE.test(text ?? "")) return false;     // body carries obligations → still a binding gap
  return true;
}

export function routeAttachment(name: string): string | "AMENDMENTS" | null {
  // Amendment covers + ANY "revised" replacement → resolution stream (must precede section/exhibit
  // matching: "Amendment 0005 Revised Section C" is a replacement, NOT a base §C to append).
  if (AMENDMENT_NAME_RE.test(name)) return "AMENDMENTS";
  return sectionLetterFromName(name);
}

/** Part-12 (commercial-item, streamlined) vs Part-15 (negotiated) classification from the incorporated
 *  clause set (Brain doctrine 2026-06-25). A 52.212-x clause ⇒ Part-12; a 52.215-x clause ⇒ Part-15;
 *  neither ⇒ UNKNOWN. Replaces any ASSUMED commercial-item treatment — the panel must apply the correct
 *  clause checklist (N4008526R0065 has zero 52.212-x and ten 52.215-x ⇒ Part-15). The classification
 *  feeds the (to-be-authored) judgment key, NOT a hardcoded default. Pure → gate-testable. */
export function classifyAcquisitionPart(clauseNumbers: string[]): "PART_12" | "PART_15" | "UNKNOWN" {
  if (clauseNumbers.some((c) => /\b2?52\.212-/.test(c))) return "PART_12"; // commercial-item provisions present
  if (clauseNumbers.some((c) => /\b52\.215-/.test(c))) return "PART_15";   // negotiated-procurement clauses present
  return "UNKNOWN";
}

/** Classify ANY attachment (base OR amendment) for resolution (#3): its amendment sequence NUMBER
 *  (base = 0; "Amendment 0011" = 11; SF-30 cover trailing seq), the EXHIBIT id if it revises one
 *  specific exhibit ("J-1503010-09" — must NOT wipe sibling §J exhibits), the parent SECTION letter,
 *  and whether it is a revision. Pure → gate-testable. */
export function classifyAttachment(name: string): { number: number; section: string | null; sectionExplicit: boolean; exhibitId: string | null; isRevision: boolean; isCover: boolean } {
  const isRevision = AMENDMENT_NAME_RE.test(name);
  let number = 0;
  const amd = name.match(/amendment\s*0*(\d+)/i); // capture the FULL run (re-review #5: \d{1,4} truncated "Amendment 10000"→1000)
  if (amd) number = parseInt(amd[1], 10);
  else { const sf = name.match(/(\d{2,4})\s*[\s_-]*sf[\s_-]*30/i); if (sf) number = parseInt(sf[1], 10); }
  const ex = name.match(/\b([a-m])-\d{3,}(?:-\d+)*/i);
  const exhibitId = ex ? ex[0].toUpperCase() : null;
  const section = sectionLetterFromName(name);
  // An SF-30 COVER (vs a "Revised Section/exhibit" replacement) carries no section text — its binding
  // Item-14 deltas (deadline extensions, Q&A) are captured by the MAP/facts layer, NOT a lens section.
  // So a cover is benign (logged), never a coverage gap. KEY DISTINCTION (2nd-pass review fix): a file
  // is a pure cover ONLY if it does NOT carry revised/conformed content or name an exhibit — that
  // carve-out must apply to BOTH the SF-30 branch AND the bare-amendment branch, else a combined
  // "Solicitation Amendment 0005 SF 30 Revised Section C" (cover + the revised pages in one PDF) is
  // misread as a benign cover and its replacement text is dropped. We carve out on revised/conformed/
  // exhibit (content IS here) but NOT on a bare "Section" mention (a cover that merely says "amends
  // Section B" is still a pure cover — the §B text isn't in it).
  const isCover = (/\bsf[\s_-]?30\b|solicitation\s+amendment/i.test(name) || /\bamendment\s*\d/i.test(name))
    && !/\b(revised|revision|conformed)\b/i.test(name) && !/\b[a-m]-\d{3,}/i.test(name);
  return { number, section, sectionExplicit: explicitSectionLetter(name) !== null, exhibitId, isRevision, isCover };
}

/** AMENDMENT RESOLUTION (Stage-6 #3, the architectural heart). Given ALL attachments (base + SF-30
 *  revisions), assemble the CURRENT version per section so a lens never sees a superseded original AND
 *  its replacement as conflicting text (the trap Brain flagged). Rules, each LATEST-sequence-wins:
 *   • EXHIBIT revision (has exhibitId) supersedes only THAT exhibit; surviving siblings stay — the
 *     winner merges into its parent section. (base counts as sequence 0, so any amendment beats it.)
 *   • SECTION-LEVEL "Revised Section X" REPLACES the whole section (returned in `replaces` so the
 *     caller overrides the primary's detected §X too — the amendment is the current §X).
 *   • plain base additive (no exhibit, not a revision) appends to its section.
 *   • a revision whose target can't be identified → `unresolved` (a coverage gap → INCOMPLETE).
 *  Returns the attachment-derived section text + which sections fully REPLACE the primary + an audit
 *  log of every supersession + the unresolved list. Pure → gate-testable. */
export function resolveAttachments(attachments: Array<{ name: string; text: string }>): {
  sections: Record<string, string>;
  replaces: Set<string>;
  log: string[];
  unresolved: string[];
} {
  const out: Record<string, string> = {};
  const replaces = new Set<string>();
  const log: string[] = [];
  const unresolved: string[] = [];
  const classified = attachments
    .map((a) => ({ ...a, ...classifyAttachment(a.name) }))
    .filter((a) => (a.text ?? "").trim());

  const exhibitGroups = new Map<string, typeof classified>();
  const sectionReplacements = new Map<string, typeof classified>();
  const plain: typeof classified = [];
  for (const a of classified) {
    // ORDER (re-review HIGH #2): a COVER is tested BEFORE "revision+section", so an SF-30 cover that
    // merely MENTIONS a section ("…SF 30 amends Section B") is logged benign — it can NEVER be
    // mistaken for a whole-section REPLACEMENT that would wipe the real §B. An exhibit id is still
    // most-specific (first). A genuine "Revised Section X" is not a cover (isCover excludes it).
    if (a.exhibitId) { const g = exhibitGroups.get(a.exhibitId) ?? []; g.push(a); exhibitGroups.set(a.exhibitId, g); }
    else if (a.isCover) log.push(`amendment cover ${a.number ? `(Amendment ${a.number}) ` : ""}${a.name} — Item-14 deltas captured upstream (MAP), no section text`);
    // CONTENT-LOSS FIX (Brain 2026-06-25): a revision REPLACES a whole section ONLY when it EXPLICITLY
    // names that section ("Revised Section B"). A content-routed revision ("Revised Wage Determination"
    // → §B by heuristic) is §B CONTENT, not the whole §B — it falls through to `plain` and APPENDS, so
    // the primary's pricing schedule is never overwritten.
    else if (a.isRevision && a.section && a.sectionExplicit) { const g = sectionReplacements.get(a.section) ?? []; g.push(a); sectionReplacements.set(a.section, g); }
    else if (a.section) plain.push(a);
    else if (isAdministrativeNonBinding(a.name, a.text)) log.push(`administrative (non-binding): ${a.name} — routes to no section but carries no obligation language; NOT a coverage gap`);
    else {
      // Fix #2 — COVERAGE-FROM-CONTENT (Brain Card-1 Option B): the filename gave no section and it is
      // not administrative → classify by the BODY (what the MAP read), not the name and not the ingestion
      // log. Route only when the content shows a confident binding section (role-appropriate, no catch-all).
      const bySec = sectionLetterFromContent(a.text);
      if (bySec) { plain.push({ ...a, section: bySec }); log.push(`${a.name} → §${bySec} by CONTENT (filename gave no section; routed from the read, not the ingestion log)`); }
      else unresolved.push(a.name); // genuinely unplaceable binding content → honest coverage gap (INCOMPLETE)
    }
  }

  // DETERMINISTIC latest-wins: sort by sequence, tie-break by name (re-review #3 — equal numbers were
  // resolved by array order, i.e. nondeterministic; a name tie-break makes the winner reproducible).
  const latestWins = (grp: typeof classified): typeof classified => [...grp].sort((x, y) => x.number - y.number || x.name.localeCompare(y.name));
  const collisionNote = (grp: typeof classified, label: string) => {
    const max = grp[grp.length - 1].number;
    const tied = grp.filter((g) => g.number === max);
    if (tied.length > 1) log.push(`⚠ ${label}: ${tied.length} attachments share sequence ${max} — winner picked by name (verify): ${tied.map((t) => t.name).join(" vs ")}`);
  };

  // ORDER MATTERS: section-level replacement first (it is the current §X FOUNDATION), THEN exhibits
  // APPEND to it — so a "Revised Section C" never clobbers a surviving C-NNNN exhibit (adversarial fix).
  for (const [sec, raw] of sectionReplacements) {
    const grp = latestWins(raw); const win = grp[grp.length - 1];
    out[sec] = `[Section ${sec} — CURRENT VERSION (Amendment ${win.number || "?"}): ${win.name}]\n${win.text.trim()}`;
    replaces.add(sec);
    collisionNote(grp, `§${sec} replacement`);
    log.push(`§${sec}: current = Amendment ${win.number || "?"} (${win.name})${grp.length > 1 ? `; superseded ${grp.slice(0, -1).map((s) => `Amd ${s.number || "?"}`).join(", ")}` : ""}`);
  }
  // exhibit revisions → latest per exhibit wins; winners merge into parent section (siblings preserved)
  for (const [exId, raw] of exhibitGroups) {
    const grp = latestWins(raw); const win = grp[grp.length - 1];
    const superseded = grp.slice(0, -1);
    const tag = `[exhibit ${exId} — CURRENT${win.number ? ` (Amendment ${win.number})` : ""}${superseded.length ? `; supersedes ${superseded.map((s) => s.number ? `Amd ${s.number}` : "base").join(", ")}` : ""}]\n${win.text.trim()}`;
    const parent = exId[0];
    out[parent] = out[parent] ? `${out[parent]}\n\n${tag}` : tag;
    collisionNote(grp, `exhibit ${exId}`);
    if (superseded.length) log.push(`exhibit ${exId}: current = ${win.number ? `Amendment ${win.number}` : "base"}; superseded ${superseded.map((s) => s.number ? `Amd ${s.number}` : "base").join(", ")}`);
  }
  // plain base additive — BUT if this section was REPLACED by an amendment, the base version is
  // SUPERSEDED by definition of a section-level replacement: do NOT append it (that would re-create
  // the conflicting-text trap the HIGH #1 fix closes), log it for the audit trail instead. (Genuine
  // surviving supplements are EXHIBITS — C-NNNN — and resolve via exhibitGroups, not here.)
  for (const a of plain) {
    if (replaces.has(a.section!)) { log.push(`§${a.section} base "${a.name}" not merged — superseded by the amendment replacement (avoids conflicting text)`); continue; }
    const tag = `[attachment: ${a.name}]\n${a.text.trim()}`;
    out[a.section!] = out[a.section!] ? `${out[a.section!]}\n\n${tag}` : tag;
  }
  return { sections: out, replaces, log, unresolved };
}

/** Build the UCF-section → source-text map the lenses read (Step 2 substrate). detectSections on
 *  the primary yields A–M where present; binding attachments are routed to their section by
 *  routeAttachment() (#2 route-everything) — the primary's §C/§B/§J often only REFERENCE the
 *  attachment, so the binding text lives in the attachment. SF-30 / "revised" attachments are NOT
 *  routed to a section (they need amendment-resolution first, #3) — they're reported via onAmendments;
 *  unclassifiable attachments via onUnrouted. Both lists are coverage gaps the caller must honor.
 *  Deterministic (no model/network). */
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
  // #3 — resolve base + amendments to the CURRENT version BEFORE the lens reads (no conflicting text).
  const { sections: attSections, replaces, log, unresolved } = resolveAttachments(opts.attachments ?? []);
  for (const [sec, txt] of Object.entries(attSections)) {
    // a section-level "Revised Section X" is the current §X — it REPLACES the primary's detected §X.
    if (replaces.has(sec)) out[sec] = txt;
    else out[sec] = out[sec] ? `${out[sec]}\n\n${txt}` : txt; // exhibits / base additive append
  }
  if (log.length) opts.onResolutionLog?.(log);
  // a revision whose target could not be identified is binding content the lenses won't see — report
  // it (→ coverage floor → INCOMPLETE), never silently drop (the failure the reshape exists to kill).
  if (unresolved.length) opts.onUnrouted?.(unresolved);
  return out;
}

/** Does any lens bundle indicate content the panel will NOT see (dropped for budget)?
 *  Upstream coverage MUST flip to INCOMPLETE when true — the source-grounded successor to the
 *  matrix-trim honesty rule. (MISSING sections are reported per-lens but a genuinely-absent §J is
 *  not necessarily a coverage defect; DROPPED-for-budget always is.) */
export function lensBundlesDroppedContent(bundles: LensSourceBundle[]): string[] {
  return bundles.flatMap((b) => b.droppedForBudget.map((s) => `${b.lens}:§${s}`));
}
