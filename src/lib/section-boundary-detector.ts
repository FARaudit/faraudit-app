// Component 2 — Section Boundary Detector (Cycle 2 document-extraction rebuild)
//
// Brain ruling 2026-06-07: §L imperatives / §K reps / §M factors / §I clauses
// are FACTS that exist verbatim in the document. The model decides scope
// boundary inconsistently across runs (the 25/22/19 flicker on the cycle-2
// baseline). Deterministic regex on bounded section text fixes that by
// construction.
//
// Detects UCF (Uniform Contract Format, §A–§M) and SF-18 / SF-1449 RFQ
// formats. Outputs a SectionBag with per-section confidence:
//   high   — explicit "SECTION X" header matched
//   medium — title-pattern match (e.g. "Instructions, Conditions to Offerors")
//   low    — structural inference only
//   missing — section not detected
//
// CONDITION 1 (FAIL LOUD): when a critical section (§B/§C/§F/§I/§L/§M) is
// missing or low-confidence, the SectionBag warnings carry an explicit signal
// the engine must propagate to the audit_json. Downstream renderers surface
// "extraction incomplete — verify" on the affected surface. Never emit a
// confidently-wrong deterministic parse.

import { parseDelimiterName, resolvePrimary } from "./primary-doc-resolve";
// Construction recognizers live in ONE leaf module: this file decides OUT_OF_SCOPE/"hard" off them while
// audit-construction-manifest runs the Rule 69 completeness carrier off byte-identical copies (engine audit pass 2).
import { SF1442_HEADER_RE, DAVIS_BACON_RE, OFFER_STRUCTURE_RE } from "./construction-recognizers";
import type { ExtractedDocument } from "./pdf-text-extractor";
import { isEnvOff, isEnvOn } from "./env-flags";

export type SectionConfidence = "high" | "medium" | "low" | "missing";
export type FormatType = "UCF" | "SF-18" | "SF-1449-RFQ" | "combined-synopsis" | "unknown";

export interface DetectedSection {
  key: string;
  canonicalName: string;
  text: string;
  startPage: number;
  endPage: number;
  lineStart: number;
  lineEnd: number;
  confidence: SectionConfidence;
  matchedPattern: string;
  warningFlags: string[];
}

export interface SectionBag {
  sections: Record<string, DetectedSection>;
  formatDetected: FormatType;
  formatConfidence: SectionConfidence;
  overallConfidence: number;
  sectionCount: number;
  missingSections: string[];
  warnings: string[];
}

const UCF_SECTIONS: Record<string, string> = {
  A: "Solicitation/Contract Form",
  B: "Supplies or Services & Prices/Costs",
  C: "Description/Specifications/Statement of Work",
  D: "Packaging and Marking",
  E: "Inspection and Acceptance",
  F: "Deliveries or Performance",
  G: "Contract Administration Data",
  H: "Special Contract Requirements",
  I: "Contract Clauses",
  J: "List of Attachments",
  K: "Representations, Certifications & Other Statements",
  L: "Instructions, Conditions & Notices to Offerors",
  M: "Evaluation Factors for Award",
};

// Critical sections — missing or low-confidence triggers a FAIL LOUD warning.
const CRITICAL_SECTIONS = new Set(["B", "C", "F", "I", "L", "M"]);

// Explicit UCF headers (high confidence).
const UCF_HEADER_PATTERNS: RegExp[] = [
  /^SECTION\s+([A-M])\b/im,
  /^Section\s+([A-M])\s*[-–—:]/m,
  /^PART\s+I\s*[-–—]\s*SECTION\s+([A-M])/im,
];

// Title-only patterns (medium confidence) for sections without explicit headers.
const UCF_TITLE_PATTERNS: Record<string, RegExp> = {
  B: /^(Supplies\s+or\s+Services|Schedule\s+of\s+Supplies)/im,
  C: /^(Description\/Specifications|Statement\s+of\s+Work|Statement\s+of\s+Need|Requirements|ITEM\s+DESCRIPTION|Scope\s+of\s+Work|Item\s+Description)/im,
  D: /^(Packaging\s+and\s+Marking)/im,
  E: /^(Inspection\s+and\s+Acceptance)/im,
  F: /^(Deliveries\s+or\s+Performance|Period\s+of\s+Performance)/im,
  G: /^(Contract\s+Administration\s+Data)/im,
  H: /^(Special\s+Contract\s+Requirements)/im,
  // §I — UCF "Contract Clauses" OR COMMERCIAL forms: FAR 52.212-4 (Contract Terms & Conditions—Commercial)
  //   and 52.212-5 (Terms & Conditions Required to Implement Statutes) ARE the §I clause section of a
  //   Part-12 combined RFQ; they appear as headings / clause-number-prefixed lines. Line-anchored (^) so a
  //   prose mention can't false-fire. Coverage-depth (Brain card 40): §I was undetected on commercial #2.
  I: /^(Contract\s+Clauses|Clauses\s+Incorporated\s+by\s+Reference|Contract\s+Terms\s+and\s+Conditions|(?:ADDENDUM\s+TO\s+)?(?:FAR\s+)?5?2\.212-[45])\b/im,
  J: /^(List\s+of\s+Attachments)/im,
  K: /^(Representations,?\s+Cert|Other\s+Statements\s+of\s+Offerors)/im,
  // §L — UCF titles OR COMMERCIAL forms: FAR 52.212-1 IS the commercial "Instructions to Offerors"
  //   (Part-12), appearing clause-number-prefixed ("52.212-1  Instructions to Offerors…") or as an
  //   ADDENDUM heading. ALL alternatives are LINE-ANCHORED (the ^ leads the whole group) and
  //   detectSections tests per-line, so a match means a heading line, never a prose mention — a prose
  //   "…the instructions to offerors say…" must NOT credit §L (that would mask a genuine missing-§L
  //   gap; no-silent-drop). The 52.212-1 clause-number alt covers the legit "52.212-1 Instructions…" head.
  L: /^(Instructions,?\s+Conditions|Special\s+Notes\s+and\s+Instructions|Notice\s+to\s+Quoter|Notes\s+to\s+Offeror|Instructions\s+to\s+Offerors?|Quote\s+Preparation|(?:ADDENDUM\s+TO\s+)?(?:FAR\s+)?5?2\.212-1)\b/im,
  // §M — UCF titles OR COMMERCIAL forms: "Evaluation and Basis for Award" / FAR 52.212-2 (Evaluation—
  //   Commercial). Commercial RFQs phrase §M as "Basis for/of Award" or "Evaluation Criteria". Same
  //   line-anchor discipline as §L — a prose "…basis for award is described in…" must NOT credit §M.
  M: /^(Evaluation\s+Factors\s+for\s+Award|Technical\s+Evaluation|Evaluation\s+and\s+Basis\s+for\s+Award|Basis\s+(?:for|of)\s+Award|Evaluation\s+Criteria|(?:ADDENDUM\s+TO\s+)?(?:FAR\s+)?5?2\.212-2)\b/im,
};

// Format detection patterns.
const SF1449_HEADER_RE = /SF\s*1449|SOLICITATION\/CONTRACT\/ORDER\s+FOR\s+COMMERCIAL/i;
const SF18_HEADER_RE = /\bSF[-\s]?18\b|REQUEST\s+FOR\s+QUOTATION/i;
// FAR 12.603 combined synopsis/solicitation — the DEFINITIONAL statement a Part-12 combined notice must carry
// ("This is a combined synopsis/solicitation…") OR the 12.6-format boilerplate ("…prepared in accordance with
// the format in Subpart 12.6"). This anchors a commercial Part-12 classification for a BARE combined-synopsis
// notice that lacks the SF-1449 form header (which, when present, ALREADY wins above — SP3300 is that case).
// Both alternatives are specific FAR boilerplate, not prose a UCF Part-15 doc would carry. Gate: only consulted
// under AUDIT_PROCUREMENT_TYPE_SECTIONS (default-OFF) so prod stays byte-identical until proven on a real
// bare-combined-synopsis anchor. Placed AFTER SF-1449/SF-18 and BEFORE UCF (a combined synopsis is narrative,
// not §A–M), so it can never steal a form-headed commercial doc nor a genuine UCF doc.
const COMBINED_SYNOPSIS_RE = /combined\s+synopsis\s*\/?\s*solicitation|format\s+(?:prescribed\s+)?in\s+(?:FAR\s+)?subpart\s+12\.6/i;

function confidenceRank(c: SectionConfidence): number {
  return { high: 3, medium: 2, low: 1, missing: 0 }[c];
}

// A table-of-contents entry ("…………53" — a dot-leader run + page number) matches the same header/title patterns
// as a real section heading but at an EARLIER line, so — via the lowest-line dedup — it can STEAL the boundary
// from the true header and mis-scope (or false-COMPLETE) the section (T0-7, engine line-audit 2026-07-06). A
// heading candidate is a TOC entry when it, OR its wrapped continuation line, ends in a dot-leader page ref.
// Shared by Pass 1 (SECTION header) / Pass 2 (title) / Pass 2c (commercial clause).
const TOC_LEADER_RE = /\.{5,}\s*\d{1,4}\s*$/;
// SAME-LINE only — for Pass 1 (SECTION header) + Pass 2 (title): those headings are single-line, so a real
// header must NOT be skipped merely because the NEXT line is a TOC entry (a real §A header directly preceding
// the TOC block would otherwise vanish — observed regression). Catches the single-line "SECTION B … …3" form.
function isTocLine(text: string): boolean {
  return TOC_LEADER_RE.test(text.trim());
}
// WRAPPED — for Pass 2c (commercial clause): the "E.5 52.212-2 EVALUATION—COMMERCIAL PRODUCTS AND COMMERCIAL"
// TOC entry wraps its dot-leader page ref onto the NEXT line, so the i+1 look-ahead is required there. The clause
// candidate is specific enough that a real heading directly followed by an unrelated TOC line is not a concern.
function isTocEntry(allLines: { text: string }[], i: number, end: number): boolean {
  return isTocLine(allLines[i].text) || (i + 1 < end && isTocLine(allLines[i + 1].text));
}

export function detectSections(doc: ExtractedDocument): SectionBag {
  const warnings: string[] = [];
  if (doc.warnings.length > 0) {
    for (const w of doc.warnings) warnings.push(`extractor: ${w}`);
  }

  // Build a flat line array with page attribution.
  interface LineRef { text: string; pageNum: number; }
  const allLines: LineRef[] = [];
  for (const page of doc.pages) {
    for (const line of page.lines) allLines.push({ text: line, pageNum: page.pageNum });
  }
  const fullText = doc.rawText;

  // ── ATTACHMENT BOUNDARY (C-6 / C-11) ──────────────────────────────────────
  // The assembled package separates the primary solicitation from each attachment with a
  // "==== DOCUMENT: <name> ====" delimiter (agentic-executor assembleFullSource). UCF sections A–M belong to the
  // PRIMARY solicitation; an attachment is a separate binding document (per-binding-doc attestation handles it),
  // NEVER a UCF section. So: (1) detect UCF boundaries ONLY within the primary region — an attachment-internal
  // "SECTION X" can never mint a UCF boundary (C-11); (2) the last section's text ends at the first delimiter,
  // never EOF — attachment text can never bleed into §M (C-6). Single-document packages carry NO delimiter ⇒
  // primaryEnd = allLines.length ⇒ byte-identical (the per-doc extraction path + every single-blob gold source
  // are unaffected — the Option-A guard).
  // assembleFullSource prefixes EVERY document with its own delimiter when >1 doc, so marker[0] labels the
  // PRIMARY solicitation and marker[1] starts the FIRST attachment. The primary region is [marker[0], marker[1]).
  // Fewer than 2 markers ⇒ single-doc package ⇒ primaryEnd = EOF (byte-identical).
  const DOC_DELIM_RE = /^={4}\s+DOCUMENT:\s+.+\s+={4}$/i; // the EXACT assembleFullSource delimiter (4 equals both sides) — strict so a stray in-body "=== DOCUMENT" line can't false-split
  const docMarkers: number[] = [];
  for (let i = 0; i < allLines.length; i++) { if (DOC_DELIM_RE.test(allLines[i].text.trim())) docMarkers.push(i); }
  let primaryStart = 0;
  let primaryEnd = docMarkers.length >= 2 ? docMarkers[1] : allLines.length;
  // ── PRIMARY-DOCUMENT ELECTION (root-b U1, flag AUDIT_PRIMARY_DOC_ELECTION, default-OFF) ──────────────────
  // The positional primary ([marker0, marker1)) assumes doc#1 IS the solicitation — but SAM assembly routinely
  // writes AMENDMENTS first (measured 2026-07-29: 150c3ab3, SPRRA2-26-R-0034, 36C24126Q0569 — 3/3 packages put a
  // stub amendment at doc#1 and the real solicitation last, so the section map came back EMPTY on the real buy).
  // Under the flag, the primary REGION is chosen by the SAME ratified identity election docRegions uses
  // (resolvePrimary, Card #370 R1: solicitation-form / UCF-density score; amendment markers DISQUALIFY; panel-on-
  // design ruling 2026-07-29: ONE election in the engine, never a second scoring). Fail direction: the election is
  // honored ONLY when confident — on confident=false the positional window is RETAINED and a warning is pushed;
  // the existing primaryIndeterminate path (audit-orchestrator, ATTACHMENT_COVERAGE) owns the honest-fail/NHR
  // routing, and this detector must not invent a second one. Flag-OFF ⇒ positional, byte-identical.
  if (isEnvOn(process.env.AUDIT_PRIMARY_DOC_ELECTION) && docMarkers.length >= 2) {
    const bounds = docMarkers.map((m, i) => ({
      start: m + 1,
      end: i + 1 < docMarkers.length ? docMarkers[i + 1] : allLines.length,
      name: parseDelimiterName(allLines[m].text) ?? "(unnamed)",
    }));
    const regions = bounds.map((b) => ({ name: b.name, text: allLines.slice(b.start, b.end).map((l) => l.text).join("\n") }));
    const pick = resolvePrimary(regions);
    if (pick.confident && pick.index >= 0) {
      primaryStart = bounds[pick.index].start;
      primaryEnd = bounds[pick.index].end;
      if (pick.index !== 0) warnings.push(`primary-doc election: region #${pick.index + 1} "${regions[pick.index].name}" elected as the solicitation over doc#1 (identity election, Card #370)`);
    } else {
      warnings.push("primary-doc election: no region confidently identifies as the solicitation — positional primary retained (honest-fail routing owns the escalation)");
    }
  }
  // The FORMAT of a solicitation is a property of its PRIMARY document, never of an attachment or the
  // Layer-1 notice body. Scope format detection to the primary region (same [marker0, marker1) discipline
  // section detection uses — C-11), else a stray "REQUEST FOR QUOTATION" / "SF 1449" / combined-synopsis
  // phrase in a downstream doc flips a genuine UCF solicitation to a commercial format and — when §L/§M are
  // absent from a recognized primary form — collapses coreMissingFor to [] = a FALSE-COMPLETE (the exact
  // notice-body-blind class L1 closes). A single-doc package has no delimiter ⇒ primaryEnd = EOF ⇒ this is
  // the whole source ⇒ byte-identical to the pre-scoping behavior (every single-blob gold source unaffected).
  const primaryText = docMarkers.length >= 2 ? allLines.slice(primaryStart, primaryEnd).map((l) => l.text).join("\n") : fullText;

  // ─── Format detection (primary region only — see primaryText note above) ───
  let formatDetected: FormatType = "unknown";
  let formatConfidence: SectionConfidence = "low";

  if (SF1449_HEADER_RE.test(primaryText)) {
    formatDetected = "SF-1449-RFQ";
    formatConfidence = "high";
  } else if (SF18_HEADER_RE.test(primaryText)) {
    formatDetected = "SF-18";
    formatConfidence = "high";
  } else if (isEnvOn(process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS) && COMBINED_SYNOPSIS_RE.test(primaryText)) {
    // Bare Part-12 combined synopsis/solicitation (no SF-1449 form header). Flag-gated default-OFF ⇒ when the
    // flag is unset this branch is skipped and the doc falls through to UCF/unknown exactly as before (prod
    // byte-identical). procurementPart() maps "combined-synopsis" → part12-commercial.
    formatDetected = "combined-synopsis";
    formatConfidence = "high";
  } else if (UCF_HEADER_PATTERNS.some((p) => p.test(primaryText))) {
    formatDetected = "UCF";
    formatConfidence = "medium";
  } else {
    warnings.push("FORMAT_UNKNOWN: no recognized solicitation header found — pattern matching will be degraded");
  }

  // ─── Section boundary detection (two-pass) ────────────────────────────────
  interface Boundary { key: string; lineIdx: number; confidence: SectionConfidence; matchedPattern: string; }
  const boundaries: Boundary[] = [];

  // Pass 1: explicit "SECTION X" headers — high confidence (primary region only — C-11)
  for (let i = primaryStart; i < primaryEnd; i++) {
    const line = allLines[i].text.trim();
    if (isTocLine(line)) continue; // T0-7 — a single-line TOC entry ("SECTION B … …3") must not mint a boundary that beats the real header
    for (const pat of UCF_HEADER_PATTERNS) {
      const m = pat.exec(line);
      if (m && m[1]) {
        // CANDIDATE #1 (Brain card 104/105) — UCF UPPERCASE GUARD, DEFAULT-ON (Brain card 105 flip; set ="false" to disable). The generic
        // pattern #0 (/^SECTION\s+([A-M])\b/im) is case-INSENSITIVE on the captured letter, so a CBA/attachment's
        // internal "Section l" (Article §1 — the numeral "1" rendered as a lowercase "l") false-matches as a §L
        // boundary and (with equal high confidence + lower line) beats the REAL "Section L" header in dedup. Reject
        // a LOWERCASE captured letter on pattern #0 only; uppercase "SECTION L"/"Section L" still matches. Patterns
        // #1 (dash/colon) and #2 (PART I) are untouched. Flag OFF ⇒ behavior is byte-identical to the prior detector.
        if (!isEnvOff(process.env.AUDIT_UCF_UPPERCASE_GUARD) && pat === UCF_HEADER_PATTERNS[0] && !/[A-M]/.test(m[1])) continue;
        const key = m[1].toUpperCase();
        if (UCF_SECTIONS[key]) {
          boundaries.push({ key, lineIdx: i, confidence: "high", matchedPattern: pat.source });
        }
      }
    }
  }

  // Pass 2: title-only patterns — medium confidence — only for keys not already found
  const foundKeys = new Set(boundaries.map((b) => b.key));
  for (const [key, pattern] of Object.entries(UCF_TITLE_PATTERNS)) {
    if (foundKeys.has(key)) continue;
    for (let i = primaryStart; i < primaryEnd; i++) {
      if (pattern.test(allLines[i].text.trim())) {
        if (isTocLine(allLines[i].text)) continue; // T0-7 — skip a single-line TOC entry; keep scanning for the real heading
        boundaries.push({ key, lineIdx: i, confidence: "medium", matchedPattern: pattern.source });
        foundKeys.add(key);
        break;
      }
    }
  }

  // Pass 2b: PROSE HEADINGS (C-9) — a bare UCF letter + separator + a title that matches that section, e.g.
  // "M - BASIS FOR AWARD" / "L – Instructions to Offerors", which the "SECTION X" + title-only passes miss.
  // GUARDED: the leading letter must equal the key AND the post-separator title must match that section's title
  // pattern (so "A - SOMETHING" cannot false-fire — A has no title pattern). Primary region only; medium; skips
  // keys already found. Anti-false-positive: a genuine "C - 1.0 SCOPE" only credits §C if §C's title keywords follow.
  const LETTER_DASH_RE = /^([A-M])\s*[-–—:]\s*(.+)$/;
  for (let i = primaryStart; i < primaryEnd; i++) {
    const m = LETTER_DASH_RE.exec(allLines[i].text.trim());
    if (!m) continue;
    const key = m[1].toUpperCase();
    if (foundKeys.has(key)) continue;
    const titlePat = UCF_TITLE_PATTERNS[key];
    if (titlePat && titlePat.test(m[2].trim())) {
      boundaries.push({ key, lineIdx: i, confidence: "medium", matchedPattern: `LETTER_DASH_TITLE(${key})` });
      foundKeys.add(key);
    }
  }

  // Pass 2c: COMMERCIAL clause headings (§L ≡ 52.212-1, §M ≡ 52.212-2). VA/agency combined RFQs
  // number the commercial instructions/evaluation clauses under their OWN sub-section id — e.g.
  // "E.1 52.212-1 INSTRUCTIONS TO OFFERORS—COMMERCIAL PRODUCTS", "E.5 52.212-2 EVALUATION—COMMERCIAL
  // PRODUCTS". The §L/§M title patterns lead the line-anchored group with the bare clause number, so a
  // "E.5 " agency prefix defeats them and §M reads ABSENT even though its content is present
  // (36C25626Q0947: §M was false-missing while the 52.212-2 evaluation heading sat under an E.5 prefix).
  // ADDITIVE + guarded: only for §L/§M NOT already found; the leading letter/number prefix is optional,
  // and a TABLE-OF-CONTENTS entry (this line — or its wrapped continuation — ending in a dot-leader page
  // number) is skipped so the boundary lands on the REAL heading, never the TOC. Medium confidence. Cannot
  // change any already-detected section, so gold sources with §L/§M present are byte-identical.
  const COMMERCIAL_CLAUSE_HEAD: Record<string, RegExp> = {
    L: /^(?:ADDENDUM\s+TO\s+)?(?:[A-M]\.\d+\s+)?(?:FAR\s+)?5?2\.212-1\b/i,
    M: /^(?:ADDENDUM\s+TO\s+)?(?:[A-M]\.\d+\s+)?(?:FAR\s+)?5?2\.212-2\b/i,
  };
  for (const [key, pat] of Object.entries(COMMERCIAL_CLAUSE_HEAD)) {
    if (foundKeys.has(key)) continue;
    for (let i = primaryStart; i < primaryEnd; i++) {
      const t = allLines[i].text.trim();
      if (!pat.test(t)) continue;
      // Reject a PROSE / cross-reference line — the catastrophic false-COMPLETE vector (expert-panel
      // finding, 2026-07-06): a wrapped body line like "52.212-2, the Government will evaluate…" or
      // "52.212-1 is incorporated by reference…" would else credit §M/§L off a genuinely-absent section
      // and hide the coreMissingFor cap on a part-15 UCF buy. A REAL heading has the clause number
      // followed by its UPPERCASE title (EVALUATION / INSTRUCTIONS) or nothing — never lowercase running
      // text. (Case-sensitive on purpose; the pattern's /i can't distinguish case in a character class.)
      const afterClause = t.replace(pat, "").replace(/^[\s,.:;—–-]+/, "");
      if (/^[a-z]/.test(afterClause)) continue;
      // Skip a TOC entry: the candidate line, or its wrapped continuation, ends in a dot-leader page ref.
      if (isTocEntry(allLines, i, primaryEnd)) continue;
      boundaries.push({ key, lineIdx: i, confidence: "medium", matchedPattern: `COMMERCIAL_CLAUSE(${key})` });
      foundKeys.add(key);
      break;
    }
  }

  // Pass 2.5: §C fallback for DLA SF-18 combined format — scope lives inline as
  // NSN-anchored item description block, not under a labeled §C header.
  // Anchor on NSN pattern (4-2-3-4 digits) OR "Item Description" / "MFG name"
  // markers. Confidence: low — schedule-embedded inference.
  if (!foundKeys.has("C")) {
    const NSN_RE = /\b\d{4}-\d{2}-\d{3}-\d{4}\b/;
    const ITEM_DESC_RE = /\b(ITEM\s+DESCRIPTION|MFG\s+name|Schedule\s+of\s+Supplies)/i;
    for (let i = primaryStart; i < primaryEnd; i++) {
      const t = allLines[i].text.trim();
      if (NSN_RE.test(t) || ITEM_DESC_RE.test(t)) {
        boundaries.push({ key: "C", lineIdx: i, confidence: "low", matchedPattern: "DLA_SF18_NSN_INLINE" });
        foundKeys.add("C");
        break;
      }
    }
  }

  // Deduplicate: keep highest-confidence boundary per key, then sort by line.
  const dedup = new Map<string, Boundary>();
  for (const b of boundaries) {
    const prev = dedup.get(b.key);
    if (!prev || confidenceRank(b.confidence) > confidenceRank(prev.confidence)) {
      dedup.set(b.key, b);
    }
  }
  const finalBoundaries = Array.from(dedup.values()).sort((a, b) => a.lineIdx - b.lineIdx);

  // ─── Build DetectedSection per boundary ───────────────────────────────────
  const sections: Record<string, DetectedSection> = {};
  for (let i = 0; i < finalBoundaries.length; i++) {
    const b = finalBoundaries[i];
    const next = finalBoundaries[i + 1];
    // C-6: the last section ends at the first attachment delimiter (primaryEnd - 1), NEVER EOF — attachment text
    // never bleeds into §M. next.lineIdx is already within the primary region (boundaries are primary-only).
    const endLineIdx = next ? next.lineIdx - 1 : primaryEnd - 1;
    const lines = allLines.slice(b.lineIdx, endLineIdx + 1);
    const sectionText = lines.map((l) => l.text).join("\n");
    const startPage = allLines[b.lineIdx]?.pageNum ?? 0;
    const endPage = allLines[endLineIdx]?.pageNum ?? startPage;

    sections[b.key] = {
      key: b.key,
      canonicalName: UCF_SECTIONS[b.key] ?? b.key,
      text: sectionText,
      startPage,
      endPage,
      lineStart: b.lineIdx,
      lineEnd: endLineIdx,
      confidence: b.confidence,
      matchedPattern: b.matchedPattern,
      warningFlags: [],
    };
  }

  // ─── FAIL LOUD on missing or low-confidence critical sections ─────────────
  const missingSections: string[] = [];
  for (const key of Object.keys(UCF_SECTIONS)) {
    if (!sections[key]) {
      missingSections.push(key);
      if (CRITICAL_SECTIONS.has(key)) {
        warnings.push(`MISSING_CRITICAL_SECTION_${key}: ${UCF_SECTIONS[key]} not detected — extraction incomplete — verify`);
      }
    } else if (CRITICAL_SECTIONS.has(key) && sections[key].confidence === "low") {
      warnings.push(`LOW_CONFIDENCE_${key}: ${UCF_SECTIONS[key]} detected at low confidence — verify against source`);
    }
  }

  // ─── Composite overall confidence ─────────────────────────────────────────
  const criticalFound = Array.from(CRITICAL_SECTIONS).filter((k) => sections[k]).length;
  const totalFound = Object.keys(sections).length;
  const overallConfidence = Math.round(
    (criticalFound / CRITICAL_SECTIONS.size) * 60 +
      (totalFound / Object.keys(UCF_SECTIONS).length) * 40
  );

  return {
    sections,
    formatDetected,
    formatConfidence,
    overallConfidence,
    sectionCount: totalFound,
    missingSections,
    warnings,
  };
}

// ─── Construction out-of-scope detector (Brain construction ruling 2026-06-26) ──────────────
//
// The engine's domain is DISCRETE-DOCUMENT supply / repair / services solicitations. CONSTRUCTION
// (FAR Part 36) is the known structural-incompatibility class. Rather than render a degraded verdict
// it isn't designed for (which would be the "false/partial report a customer bids on" the honest-
// failure law forbids), the engine DETECTS construction and HONEST-FAILS out-of-scope BEFORE any paid
// model call — no charge. Outcome = OUT_OF_SCOPE, reason = "out_of_scope:construction".
//
// Detection is DETERMINISTIC and reads EXISTING fields (Brain Q3 ruling: no re-parsing, PSC deferred —
// PSC-Y/Z would be the next lever but PSC is not a captured field today, so it is documented, not used):
//   HARD (any one):     NAICS sector 23 (naicsCode /^23\d{4}$/)  OR  SF-1442 construction form header.
//   BOUNDARY (>=2):      Davis-Bacon construction-wage standard  AND  CSI MasterFormat multi-division spec.
// Symmetric-risk lean (Brain): UNDER-fire over false-positive — an in-scope facility-REPAIR/services sol
// (e.g. SCA wage determination, NAICS 336/541) must NEVER trip. Davis-Bacon is construction-specific
// (distinct from SCA service-contract wages); a single boundary signal is NOT enough.

export type ConstructionTier = "hard" | "boundary";
export interface ConstructionDetection {
  outOfScope: true;
  outcome: "OUT_OF_SCOPE";
  reason: "out_of_scope:construction";
  tier: ConstructionTier;
  /** Objective, citable signals that fired — NOT a verdict (Rule 64). */
  matchedSignals: string[];
}

// SF-1442 = "Solicitation, Offer and Award (Construction, Alteration, or Repair)" — the construction
// counterpart to SF-1449 (commercial). Anchored to the form id / its construction title.
// CSI MasterFormat section codes ("NN NN NN") — only construction specs/drawings use these.
const CSI_SECTION_RE = /\bSECTION\s+\d{2}\s+\d{2}\s+\d{2}\b/gi;

/**
 * Deterministic construction out-of-scope detector. Returns the OUT_OF_SCOPE signal when the package
 * is construction, or null when it is in-scope (or undetermined → let the normal pipeline run).
 * Pure → gate-testable; runs at the pre-paid classify stage and short-circuits before any model call.
 */
// Resolvable OFFER/SUBMISSION structure — a document-bounded construction solicitation the engine CAN reason over
// (SF-1442 offer form + bid schedule / offer-due / receipt-of-offers mechanics). Its presence VETOES out-of-scope
// (Brain card 288 RULING 1: OOS is a CAPABILITY boundary, not a form/NAICS one). Keyed on SUBMISSION MECHANICS, NOT
// bonding — bonding is statutory on essentially every construction buy, so vetoing on it would disable the boundary
// for the whole population (adversarial-review finding); a design-build drawing set with a stray bond mention but no
// way to submit an offer must still fall to OOS. Keyed on SUBMISSION MECHANICS only — the SF-1442 form token is the
// CLASSIFIER, not proof of biddability (Rule-69 re-review): an SF-1442 design-build with NO bid schedule must still
// fall to OOS, not escape on the bare form name. W9126 (bid schedule + offers-due) has real offer structure.

export function detectConstructionOutOfScope(opts: {
  naicsCode?: string | null;
  fullText: string;
}): ConstructionDetection | null {
  const naics = (opts.naicsCode ?? "").trim();
  const text = opts.fullText ?? "";

  // Brain card 288 RULING 1 (NARROWED, supersedes the 2026-06-26 form/NAICS ruling): OUT_OF_SCOPE ONLY for packages
  // with NO resolvable offer/submission structure — design-heavy CSI/drawing-dominant design-build the engine cannot
  // reason over. A resolvable offer structure (bid schedule + bonds + submission) → decided path via the construction
  // carrier, regardless of NAICS-23 or SF-1442. This is the WIRED narrowed trigger; the detector no longer HARD-fires
  // on form/NAICS alone (the landmine Brain flagged).
  if (OFFER_STRUCTURE_RE.test(text)) return null; // biddable — decided path, never out of scope

  // No offer structure → the genuinely-unreasonable class fires ONLY when the package is CSI-spec/drawing-DOMINANT
  // (a multi-division spec book with no way to bid it). NAICS-23 alone no longer fires (capability, not code).
  const csiSections = new Set((text.match(CSI_SECTION_RE) ?? []).map((s) => s.toUpperCase()));
  if (csiSections.size >= 3) {
    const signals = [`CSI MasterFormat multi-division spec (${csiSections.size} section codes) with NO resolvable offer/submission structure`];
    if (/^23\d{4}$/.test(naics)) signals.push(`NAICS ${naics} (Construction, sector 23)`);
    if (DAVIS_BACON_RE.test(text)) signals.push("Davis-Bacon construction wage rate (FAR 52.222-6 / construction WD)");
    return { outOfScope: true, outcome: "OUT_OF_SCOPE", reason: "out_of_scope:construction", tier: "hard", matchedSignals: signals };
  }

  return null; // undetermined — let the normal pipeline run
}
