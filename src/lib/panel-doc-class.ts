// PANEL WIRING ARC (card #525, Brain ruling 2026-07-15) — CLASS-AWARE PANEL FIRING. The CR proved the panel
// no-fires on commercial SF-1449 buys (df202699): buildPanelInputs→detectSections finds no UCF §A–M structure, so
// the UCF manifest gate suppresses it. Brain ruling: dispatch on DOCUMENT CLASS.
//   • UCF (real §A–M header structure)     → existing checkManifest gate, unchanged.
//   • commercial / non-UCF (SF-1449 shape) → a DETERMINISTIC biddable-content completeness gate (pricing schedule ·
//     evaluation basis · submission instructions), each SCAN-CONFIRMED present (declaration ≠ presence — same
//     doctrine as 2c). Sections routed by CONTENT SIGNAL; whole-source single-bundle only as a fallback.
// Honest-fail is preserved on BOTH paths: a genuinely incomplete package → INCOMPLETE, never fabricated sections.
// Pure & deterministic → $0 gate-testable / bankable.
import { detectSections } from "./section-boundary-detector";
import type { ExtractedDocument } from "./pdf-text-extractor";
import type { ManifestResult } from "./agentic-panel";

function asExtractedDoc(text: string): ExtractedDocument {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return { pages: [{ pageNum: 1, text, lines }], rawText: text, pageCount: 1, extractionMethod: "fallback", warnings: [] };
}

export type DocumentClass = "ucf" | "commercial";

// A genuine UCF solicitation carries CANONICAL uppercase section headers at line start ("SECTION B - …"). This is
// the SHAPE that distinguishes it from a commercial SF-1449 package, which references "Section L/M" as mixed-case
// content labels (or not at all) — case-SENSITIVE on purpose (the boundary detector is lenient and would misclassify
// those mixed-case labels as real sections).
const UCF_HEADER_RE = /^\s*SECTION\s+([A-M])\b/gm;

/** Count DISTINCT canonical uppercase UCF section headers — the SHAPE dispatch signal. */
export function ucfHeaderCount(fullSource: string): number {
  const keys = new Set<string>();
  const re = new RegExp(UCF_HEADER_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullSource ?? "")) !== null) keys.add(m[1].toUpperCase());
  return keys.size;
}

/** Deterministic class dispatch by SHAPE: ≥3 distinct canonical uppercase UCF headers ⇒ a real UCF §A–M
 *  solicitation; everything else (SF-1449 commercial, delimited-document packages — the df202699 shape, whose
 *  "Section L/M" are mixed-case content labels) ⇒ commercial. Pure. */
export function detectDocumentClass(fullSource: string): DocumentClass {
  return ucfHeaderCount(fullSource) >= 3 ? "ucf" : "commercial";
}

// The three biddable-content essentials — each a SCAN-CONFIRMED presence marker (declaration carries zero weight,
// per Brain + the 2c doctrine). A commercial package missing any of these cannot be evaluated.
const BIDDABLE_CONTENT: Array<{ label: string; present: RegExp }> = [
  { label: "pricing schedule / CLIN structure", present: /\bCLIN\b|\bline items?\b|price schedule|schedule of (?:items|supplies|prices)|unit price|\bSF[\s-]?1449\b|supplies or services and prices/i },
  { label: "evaluation basis", present: /evaluation (?:criteria|factors?|basis)|basis (?:for|of) award|lowest[- ]priced technically acceptable|\bLPTA\b|best[- ]value|technically acceptable|section m\b/i },
  { label: "submission instructions", present: /instructions? to (?:offerors|quoters)|how to submit|submission (?:instructions|requirements)|offers? (?:are )?due|quotes? shall|proposals? (?:are )?due|section l\b/i },
];

/** Non-UCF FIRING GATE. The panel fires ONLY when all three biddable-content essentials are SCAN-CONFIRMED present
 *  in the actual source. A genuinely incomplete commercial package → INCOMPLETE (honest-fail, panel suppressed, no
 *  charge) naming what is missing. Same ManifestResult contract as checkManifest, so the runner treats it uniformly. */
export function checkBiddableContent(fullSource: string): ManifestResult {
  const src = fullSource ?? "";
  const missing = BIDDABLE_CONTENT.filter((c) => !c.present.test(src)).map((c) => c.label);
  const ok = missing.length === 0;
  return {
    ok,
    missing,
    statement: ok
      ? "Biddable content present (pricing · evaluation · submission) — panel may evaluate (commercial/non-UCF path)."
      : `INCOMPLETE — MISSING ${missing.join(" · ")}. Panel suppressed: a commercial package without biddable content cannot be evaluated (no charge).`,
  };
}

// Content anchors → UCF lens key. Each anchor's slice runs to the next anchor (position-ordered), so the commercial
// source is carved into UCF-keyed buckets the panel lenses consume. HEADER-LIKE markers ONLY (section titles / block
// headers) — NOT mid-content keywords (CLIN / "technically acceptable"), which would fragment a section mid-sentence.
// (The broader biddable-content markers stay in BIDDABLE_CONTENT above for the firing GATE — a separate concern.)
const COMMERCIAL_ANCHORS: Array<{ key: string; re: RegExp }> = [
  { key: "L", re: /instructions? to (?:offerors|quoters)|submission (?:instructions|requirements)|section l\b/i },
  { key: "M", re: /evaluation (?:criteria|factors?)|basis (?:for|of) award|section m\b/i },
  { key: "C", re: /statement of work|performance work statement|scope of work|description\/specifications|section c\b/i },
  { key: "B", re: /schedule of (?:items|supplies|prices)|supplies\/services|price schedule|section b\b|supplies or services and prices/i },
  { key: "I", re: /contract clauses|clauses incorporated (?:by reference)?|section i\b/i },
];

/** Route a commercial/non-UCF source into UCF-keyed section text by CONTENT SIGNAL (position-ordered anchor slicing),
 *  so the panel lenses still receive relevant text. Returns {sectionText, routed}. `routed` is true only when the
 *  core evaluation (M) AND submission (L) content were placed — what the lenses most need; otherwise the caller uses
 *  the whole-source single-bundle fallback. Pure. */
export function routeCommercialSections(fullSource: string): { sectionText: Record<string, string>; routed: boolean } {
  const src = fullSource ?? "";
  const hits: Array<{ pos: number; key: string }> = [];
  for (const a of COMMERCIAL_ANCHORS) {
    const re = new RegExp(a.re.source, "ig");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) hits.push({ pos: m.index, key: a.key });
  }
  hits.sort((x, y) => x.pos - y.pos);
  const sectionText: Record<string, string> = {};
  for (let i = 0; i < hits.length; i++) {
    const slice = src.slice(hits[i].pos, i + 1 < hits.length ? hits[i + 1].pos : src.length).trim();
    if (slice.length < 20) continue;
    sectionText[hits[i].key] = sectionText[hits[i].key] ? `${sectionText[hits[i].key]}\n\n${slice}` : slice;
  }
  return { sectionText, routed: !!(sectionText["L"] && sectionText["M"]) };
}

/** The UCF lens keys populated by the whole-source single-bundle fallback (content routing failed). Every lens then
 *  reads the full source once (assembleLensPasses dedupes identical section text across a lens's assigned keys). */
export const FALLBACK_BUNDLE_KEYS = ["B", "C", "L", "M"] as const;
