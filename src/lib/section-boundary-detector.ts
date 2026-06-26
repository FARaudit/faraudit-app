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

import type { ExtractedDocument } from "./pdf-text-extractor";

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
  // §L — UCF titles (line-start) OR COMMERCIAL forms: FAR 52.212-1 IS the commercial "Instructions to
  //   Offerors" (Part-12), which appears clause-number-prefixed ("52.212-1  Instructions to Offerors…").
  L: /^(Instructions,?\s+Conditions|Special\s+Notes\s+and\s+Instructions|Notice\s+to\s+Quoter|Notes\s+to\s+Offeror)|Instructions\s+to\s+Offerors?\b|^5?2\.212-1\b/im,
  // §M — UCF titles OR COMMERCIAL forms: "Evaluation and Basis for Award" / FAR 52.212-2 (Evaluation—
  //   Commercial). Commercial RFQs phrase §M as "Basis for Award", not "Evaluation Factors for Award".
  M: /^(Evaluation\s+Factors\s+for\s+Award|Technical\s+Evaluation)|Evaluation\s+and\s+Basis\s+for\s+Award|Basis\s+for\s+Award\b|FAR\s+5?2\.212-2|^5?2\.212-2\b/im,
};

// Format detection patterns.
const SF1449_HEADER_RE = /SF\s*1449|SOLICITATION\/CONTRACT\/ORDER\s+FOR\s+COMMERCIAL/i;
const SF18_HEADER_RE = /\bSF[-\s]?18\b|REQUEST\s+FOR\s+QUOTATION/i;

function confidenceRank(c: SectionConfidence): number {
  return { high: 3, medium: 2, low: 1, missing: 0 }[c];
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

  // ─── Format detection ─────────────────────────────────────────────────────
  let formatDetected: FormatType = "unknown";
  let formatConfidence: SectionConfidence = "low";

  if (SF1449_HEADER_RE.test(fullText)) {
    formatDetected = "SF-1449-RFQ";
    formatConfidence = "high";
  } else if (SF18_HEADER_RE.test(fullText)) {
    formatDetected = "SF-18";
    formatConfidence = "high";
  } else if (UCF_HEADER_PATTERNS.some((p) => p.test(fullText))) {
    formatDetected = "UCF";
    formatConfidence = "medium";
  } else {
    warnings.push("FORMAT_UNKNOWN: no recognized solicitation header found — pattern matching will be degraded");
  }

  // ─── Section boundary detection (two-pass) ────────────────────────────────
  interface Boundary { key: string; lineIdx: number; confidence: SectionConfidence; matchedPattern: string; }
  const boundaries: Boundary[] = [];

  // Pass 1: explicit "SECTION X" headers — high confidence
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].text.trim();
    for (const pat of UCF_HEADER_PATTERNS) {
      const m = pat.exec(line);
      if (m && m[1]) {
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
    for (let i = 0; i < allLines.length; i++) {
      if (pattern.test(allLines[i].text.trim())) {
        boundaries.push({ key, lineIdx: i, confidence: "medium", matchedPattern: pattern.source });
        foundKeys.add(key);
        break;
      }
    }
  }

  // Pass 2.5: §C fallback for DLA SF-18 combined format — scope lives inline as
  // NSN-anchored item description block, not under a labeled §C header.
  // Anchor on NSN pattern (4-2-3-4 digits) OR "Item Description" / "MFG name"
  // markers. Confidence: low — schedule-embedded inference.
  if (!foundKeys.has("C")) {
    const NSN_RE = /\b\d{4}-\d{2}-\d{3}-\d{4}\b/;
    const ITEM_DESC_RE = /\b(ITEM\s+DESCRIPTION|MFG\s+name|Schedule\s+of\s+Supplies)/i;
    for (let i = 0; i < allLines.length; i++) {
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
    const endLineIdx = next ? next.lineIdx - 1 : allLines.length - 1;
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
