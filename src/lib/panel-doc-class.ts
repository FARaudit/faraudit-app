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

// COMMERCIAL_ANCHORS_V2 (#525 fix, Brain card #629 shape-(i)) — the base anchors MISS RFQ/SF-1449 packages that
// embed the instructions/eval in the cover with NO distinct "Section L/M" or "Instructions to Offerors" block
// (N0016726Q1089: §L never placed → whole-source fallback → all 5 lenses read full source → 5× cost/wall). These
// add the POSITIVE-SHAPE RFQ markers those packages actually use (proposal-submission phrasing for §L, contract-
// line-item phrasing for §B) — positive shape allowlist, never a bar-vocab blocklist. Base kept for back-compat.
const COMMERCIAL_ANCHORS_V2: Array<{ key: string; re: RegExp }> = [
  { key: "L", re: /instructions? to (?:offerors|quoters)|submission (?:instructions|requirements)|section l\b|proposal shall (?:contain|include|consist)|offerors?\s+shall\s+(?:submit|furnish|provide)|\bvolume\s+(?:[ivx]+|[1-9])\s*[:\-.]|(?:shall|must)\s+(?:provide|furnish|submit)[^.]{0,50}(?:as part of|with)\s+(?:its|the|your)?\s*(?:offer|quote|proposal)/i },
  // §M: award-DECISION / LPTA-full-phrase language only — NOT bare "technically acceptable" (fires inside a PWS spec).
  { key: "M", re: /evaluation (?:criteria|factors?)|basis (?:for|of) award|section m\b|lowest[- ]priced?[, ]+technically acceptable|award (?:will|shall) be made/i },
  { key: "C", re: /statement of work|performance work statement|scope of work|description\/specifications|section c\b/i },
  // §B: HEADER-LIKE "Contract Line Item … Number/Schedule" phrase ONLY — NOT bare "CLIN" or "line item", which recur
  //     mid-content (a PWS/spec referencing "CLIN 0001") and would fragment §C, per this file's anchor doctrine (L67).
  { key: "B", re: /schedule of (?:items|supplies|prices)|supplies\/services|price schedule|section b\b|supplies or services and prices|contract line items?\s+(?:number|schedule)/i },
  { key: "I", re: /contract clauses|clauses incorporated (?:by reference)?|section i\b/i },
];

/** Route a commercial/non-UCF source into UCF-keyed section text by CONTENT SIGNAL (position-ordered anchor slicing),
 *  so the panel lenses still receive relevant text. Returns {sectionText, routed}. `routed` is true only when the
 *  core evaluation (M) AND submission (L) content were placed — what the lenses most need; otherwise the caller uses
 *  the whole-source single-bundle fallback. Pure. */
export function routeCommercialSections(
  fullSource: string,
  opts?: { v2?: boolean }
): { sectionText: Record<string, string>; routed: boolean; placedKeys: string[]; headChars: number; headCovered: boolean } {
  const src = fullSource ?? "";
  const anchors = opts?.v2 ? COMMERCIAL_ANCHORS_V2 : COMMERCIAL_ANCHORS;
  const hits: Array<{ pos: number; key: string }> = [];
  for (const a of anchors) {
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
  // ── HEAD COVERAGE (flag AUDIT_ROUTING_HEAD_COVERAGE, default-OFF) ──────────────────────────────────────────
  // Slicing runs from the FIRST ANCHOR to EOF, so everything BEFORE that anchor was silently dropped — never
  // read by any lens, and (unlike a dropped section) never reported. Measured over the banked corpus: 16 of the
  // 18 distinct commercial packages that ROUTE lose head content — 89%, median ~2.0K chars, worst 9,121 chars
  // (14.4% of that document). This is the R4a hole in _redteam-pr271-routing-gauntlet.ts.
  //
  // It is DOUBLY lost: `computeUnrouted` (panel-adapter) only surfaces lines matching shall/must/furnish/…, and
  // the canonical casualty — "This acquisition is set aside for small business" — contains none of those verbs,
  // so the honesty net does not catch it either. R4a recorded exactly that: the set-aside cover statement absent
  // from every slice AND from unroutedBinding, leaving the small-business lens blind to the set-aside.
  //
  // The head of a solicitation is the highest-density binding region in the package: response deadline, questions
  // deadline, set-aside designation, NAICS, and the submission point of contact. Dropping it is not a cosmetic
  // coverage gap — it is the region that decides WHO MAY BID and BY WHEN.
  //
  // Placement is deliberate, and over-provision is safe by ruling (card #549 — a lens receiving extra text is
  // benign; chunk-reduce costs a pass, never a dropped section):
  //   • → "A" (Solicitation/Contract Form) — the UCF-semantic home of cover-page/form content, and the key
  //     `smallbiz_eligibility_counsel` owns in BOTH lens maps, which is the lens R4a proved went blind.
  //   • → prepended to "L" — deadlines and submission mechanics are §L-class facts, and L is owned by
  //     capture_strategist + source_selection_evaluator (+ proposal_compliance on the commercial map), none of
  //     which own "A". Without this the 0900 questions deadline reaches only the small-business lens.
  // DECISION ISOLATION — the head is ADDITIVE COVERAGE, never a routing-decision input. `routed` and `placedKeys`
  // are frozen from the ANCHOR-DERIVED slices BEFORE injection, because injecting an "L" the anchors never placed
  // would flip the caller's route-vs-fallback test (`routed`, and `commercialRoutingSafe(placedKeys)`) from
  // FALLBACK to ROUTE — swapping a complete whole-source read for a partial routed one. That would be a coverage
  // REGRESSION dressed as a coverage fix, on exactly the packages whose anchors are weakest.
  const anchorPlacedKeys = Object.keys(sectionText);
  const anchorRouted = !!(sectionText["L"] && sectionText["M"]);
  // `headChars` is computed on BOTH poles and REPORTED even when the flag is off — the size of the silently
  // dropped region is exactly the fact that was never measurable before, so the routing-integrity log should
  // carry it whether or not we are recovering it yet. Reported, never inferred: a caller trying to locate the
  // first anchor by searching for a slice's opening text latches onto duplicate occurrences (a table-of-contents
  // entry rather than the body), which is how a 2K head measured as 101K during this fix's own probe run.
  const head = hits.length > 0 && hits[0].pos > 0 ? src.slice(0, hits[0].pos).trim() : "";
  const headChars = head.length;
  // `headCovered` means EXACTLY ONE THING: the head text was injected into slices. It must NOT be pre-set true for
  // a sub-threshold head — an earlier revision initialized it to `headChars < 20`, and the routing log then printed
  // "RECOVERED→A,L" for an 18-char head on a flag-OFF run, asserting an injection that never happened. A status
  // field that reports an action must be set by the action, never by the condition that skipped it.
  const headCovered = headChars >= 20 && process.env.AUDIT_ROUTING_HEAD_COVERAGE === "true";
  if (headCovered) {
    sectionText["A"] = sectionText["A"] ? `${head}\n\n${sectionText["A"]}` : head;
    sectionText["L"] = sectionText["L"] ? `${head}\n\n${sectionText["L"]}` : head;
  }
  // `routed` (legacy predicate: §L AND §M placed) kept for back-compat; `placedKeys` lets the caller apply the
  // stronger no-lens-starved predicate (#525 fix — route whenever every lens gets its owned content, fall back to
  // whole-source ONLY when a lens would be starved, which is worse than whole-source per Brain #629).
  return { sectionText, routed: anchorRouted, placedKeys: anchorPlacedKeys, headChars, headCovered };
}

/** The UCF lens keys populated by the whole-source single-bundle fallback (content routing failed). Every lens then
 *  reads the full source once (assembleLensPasses dedupes identical section text across a lens's assigned keys). */
export const FALLBACK_BUNDLE_KEYS = ["B", "C", "L", "M"] as const;
