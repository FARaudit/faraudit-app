// Component 4 — Per-section deterministic extractors (Cycle 2)
//
// Each extractor takes bounded section text and returns structured facts.
// No LLM. Same input → same output by construction.
// These facts feed the single judgment LLM call (Component 5).

import type { DetectedSection } from "./section-boundary-detector";

// ── Output types ──────────────────────────────────────────────────────────

export interface ClinItem {
  lineItem: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  contractType: "FFP" | "T&M" | "CPFF" | "CPAF" | "other" | null;
  ambiguityFlag: string | null;
}

export interface DeliveryItem {
  lineItem: string;
  deliveryDate: string | null;
  dodaac: string | null;
  fobType: "government" | "contractor" | "origin" | "destination" | null;
  shipToAddress: string | null;
}

export interface ClauseItem {
  number: string;
  title: string;
  incorporated: "full_text" | "by_reference";
  effectiveDate: string | null;
  isTrap: boolean;
  trapReason: string | null;
}

export interface SubmissionRequirement {
  bucket: "deadline" | "format" | "mandatory_doc" | "representation" | "registration" | "other";
  text: string;
  sourceClause: string | null;
  isCritical: boolean;
}

export interface EvaluationFactor {
  factor: string;
  weight: string | null;
  method: "LPTA" | "best_value" | "other" | null;
}

export interface ExtractedFacts {
  clins: ClinItem[];
  delivery: DeliveryItem[];
  clauses: ClauseItem[];
  submissionRequirements: SubmissionRequirement[];
  evaluationFactors: EvaluationFactor[];
  contractType: "FFP" | "T&M" | "CPFF" | "IDIQ" | "other" | null;
  setAside: string | null;
  naicsCode: string | null;
  solicitorNumber: string | null;
  offerDueDate: string | null;
  issuingOffice: string | null;
  extractionWarnings: string[];
}

// ── DFARS trap clause list (matches engine DFARS_TRAPS) ───────────────────

const DFARS_TRAPS_MAP: Record<string, string> = {
  "252.223-7008": "Hexavalent chromium prohibition",
  "252.204-7018": "Covered telecommunications equipment ban",
  "252.204-7021": "CMMC compliance level required",
  "252.225-7060": "Xinjiang forced-labor prohibition",
  "252.225-7056": "Maduro regime business prohibition",
  "252.247-7023": "Transportation by sea — flag carrier requirement",
  "252.232-7006": "WAWF payment routing — DoDAAC must be correct",
  "5352.242-9000": "Air Force base access — escort + credential lead time",
};
const DFARS_TRAPS = new Set(Object.keys(DFARS_TRAPS_MAP));

// ── §B — CLIN extractor ──────────────────────────────────────────────────

export function extractClins(section: DetectedSection | null): ClinItem[] {
  if (!section) return [];
  const clins: ClinItem[] = [];
  const lines = section.text.split("\n");

  const clinPattern = /^(\d{4}[A-Z]?)\s+(.+)/;
  const contractTypePattern = /Firm\s+Fixed\s+Price|Time\s+and\s+Materials?|Cost\s+Plus|FFP\b/i;
  const quantityAmbPattern = /\(SET\s+OF\s+(\d+)\)\s*[—\-–]?\s*(\d+)\s*(Each|EA|LOT)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = clinPattern.exec(line);
    if (!match) continue;
    const lineItem = match[1];
    const descriptionLines = [match[2]];
    let j = i + 1;
    while (j < lines.length && !/^\d{4}/.test(lines[j].trim()) && lines[j].trim().length > 0) {
      descriptionLines.push(lines[j].trim());
      j++;
    }
    const fullDescription = descriptionLines.join(" ");

    const qtyMatch = /(\d+)\s*(Each|EA|LOT|Set|Unit)/i.exec(fullDescription);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
    const unit = qtyMatch ? qtyMatch[2] : null;

    const ctMatch = contractTypePattern.exec(fullDescription);
    let contractType: ClinItem["contractType"] = null;
    if (ctMatch) {
      const ct = ctMatch[0].toLowerCase();
      if (ct.startsWith("firm") || ct === "ffp") contractType = "FFP";
      else if (ct.includes("time")) contractType = "T&M";
      else if (ct.includes("cost")) contractType = "CPFF";
    }

    const ambMatch = quantityAmbPattern.exec(fullDescription);
    const ambiguityFlag = ambMatch
      ? `quantity_ambiguous: "SET OF ${ambMatch[1]} — ${ambMatch[2]} ${ambMatch[3]}" — verify total units vs sets`
      : null;

    clins.push({
      lineItem,
      description: fullDescription.slice(0, 300),
      quantity: qty,
      unit,
      contractType,
      ambiguityFlag,
    });
  }
  return clins;
}

// ── §F — Delivery extractor ──────────────────────────────────────────────

export function extractDelivery(section: DetectedSection | null): DeliveryItem[] {
  if (!section) return [];
  const items: DeliveryItem[] = [];
  const text = section.text;

  const datePattern = /\b(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i;
  const dodaacPattern = /DoDAAC[:\s]+([A-Z0-9]{6})/i;
  const fobPattern = /\bFOB\s+(Origin|Destination|Government|Contractor)/i;

  // Split on CLIN-shaped boundaries: 4-digit number at line start
  const blocks = text.split(/(?=^\s*0\d{3}\b)/m);
  for (const block of blocks) {
    const clinMatch = /^\s*(0\d{3})/.exec(block);
    if (!clinMatch) continue;
    const lineItem = clinMatch[1];

    const dateMatch = datePattern.exec(block);
    const dodaacMatch = dodaacPattern.exec(block);
    const fobMatch = fobPattern.exec(block);

    let fobType: DeliveryItem["fobType"] = null;
    if (fobMatch) {
      const fob = fobMatch[1].toLowerCase();
      if (fob === "origin") fobType = "origin";
      else if (fob === "destination") fobType = "destination";
      else if (fob === "government") fobType = "government";
      else if (fob === "contractor") fobType = "contractor";
    }

    items.push({
      lineItem,
      deliveryDate: dateMatch ? dateMatch[0] : null,
      dodaac: dodaacMatch ? dodaacMatch[1] : null,
      fobType,
      shipToAddress: null,
    });
  }
  return items;
}

// ── §I — Clause extractor ────────────────────────────────────────────────

export function extractClauses(section: DetectedSection | null): ClauseItem[] {
  if (!section) return [];
  const clauses: ClauseItem[] = [];
  const text = section.text;

  // FAR: 52.x-x · DFARS: 252.x-x · AFFARS / DAF: 5352.x-x
  const clausePattern = /\b(?:5352|252|52)\.\d{3}-\d{1,4}(?:[A-Z](?![A-Z]))?\b/g;

  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = clausePattern.exec(text)) !== null) {
    const number = m[0];
    if (seen.has(number)) continue;
    seen.add(number);

    // Grab title from next chunk after the clause number
    const after = text.slice(m.index + number.length, m.index + number.length + 220);
    const titleMatch = /^[\s.,:–-]+([A-Z][^\n.]{4,120})/.exec(after);
    const title = titleMatch ? titleMatch[1].trim().replace(/\.$/, "") : "";

    const isTrap = DFARS_TRAPS.has(number);
    const window500 = text.slice(m.index, m.index + 500);
    const incorporated: ClauseItem["incorporated"] =
      /full\s+text/i.test(window500) ? "full_text" : "by_reference";

    clauses.push({
      number,
      title,
      incorporated,
      effectiveDate: null,
      isTrap,
      trapReason: isTrap ? `${DFARS_TRAPS_MAP[number]} (DFARS trap)` : null,
    });
  }
  return clauses;
}

// ── §L — Submission requirements extractor ───────────────────────────────

export function extractSubmissionRequirements(section: DetectedSection | null): SubmissionRequirement[] {
  if (!section) return [];
  const reqs: SubmissionRequirement[] = [];
  const lines = section.text.split("\n");

  const buckets: Array<{ bucket: SubmissionRequirement["bucket"]; pattern: RegExp; critical: boolean }> = [
    { bucket: "deadline",        pattern: /due\s+(date|time)|no\s+later\s+than|submit\s+by|close\s+of\s+business|deadline/i, critical: true },
    { bucket: "registration",    pattern: /\bSAM\.gov|System\s+for\s+Award\s+Management|\bWAWF\b|\bregister/i, critical: true },
    { bucket: "mandatory_doc",   pattern: /must\s+include|shall\s+include|required\s+to\s+(submit|provide)|MFG\s+name|Part\s+Number|breakdown|CAGE\s+code/i, critical: true },
    { bucket: "representation",  pattern: /\brepresentation|certification|\bcertif/i, critical: false },
    { bucket: "format",          pattern: /english\s+language|U\.?S\.?\s+Currency|\bUSD\b|via\s+email|page\s+limit|font|format/i, critical: false },
  ];

  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 15) continue;
    const fp = trimmed.toLowerCase().slice(0, 80);
    if (seen.has(fp)) continue;

    let matched = false;
    for (const { bucket, pattern, critical } of buckets) {
      if (pattern.test(trimmed)) {
        reqs.push({ bucket, text: trimmed.slice(0, 300), sourceClause: null, isCritical: critical });
        seen.add(fp);
        matched = true;
        break;
      }
    }
    if (!matched && /\b(shall|must|required|mandatory|submit|offeror)\b/i.test(trimmed)) {
      reqs.push({ bucket: "other", text: trimmed.slice(0, 300), sourceClause: null, isCritical: false });
      seen.add(fp);
    }
  }
  return reqs;
}

// ── §M — Evaluation factors extractor ───────────────────────────────────

export function extractEvaluationFactors(section: DetectedSection | null): EvaluationFactor[] {
  if (!section) return [];
  const factors: EvaluationFactor[] = [];
  const text = section.text;

  const lptaPattern = /lowest\s+price\s+technically\s+acceptable|\bLPTA\b/i;
  const bestValuePattern = /best[-\s]?value\s+tradeoff/i;
  const method: EvaluationFactor["method"] = lptaPattern.test(text)
    ? "LPTA"
    : bestValuePattern.test(text)
      ? "best_value"
      : "other";

  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(technical|price|past\s+performance|management|small\s+business)/i.test(trimmed)) {
      const weightMatch = /(\d+)%/.exec(trimmed);
      factors.push({ factor: trimmed.slice(0, 200), weight: weightMatch ? `${weightMatch[1]}%` : null, method });
    }
  }

  if (factors.length === 0 && method !== "other") {
    factors.push({
      factor: method === "LPTA" ? "Lowest Price Technically Acceptable" : "Best Value",
      weight: null,
      method,
    });
  }
  return factors;
}

// ── Header (cross-section) extractor ────────────────────────────────────

export function extractHeader(sections: Record<string, DetectedSection>): Partial<ExtractedFacts> {
  const fullText = Object.values(sections).map((s) => s.text).join("\n");

  const solicNumPattern = /(?:Solicitation\s+Number|SOLICITATION\s+NUMBER|solicitation\s+no\.?)[:\s]+([A-Z0-9-]+)/i;
  const naicsPattern = /\bNAICS[:\s]+(\d{6})/i;
  const setAsidePattern = /SET[\s-]?ASIDE[:\s]+([^\n]{5,80})|100\s*%\s+(?:FOR\s+)?([^\n]{5,80})/i;
  const offerDuePattern = /(?:OFFER\s+DUE\s+DATE|Quote\s+Due|Proposal\s+due|due\s+date)[:\s/-]+([^\n]{5,80})/i;
  const issuingPattern = /ISSUED\s+BY[:\s]+\n?([A-Z][A-Z0-9\s\-,]{3,80})/i;

  const sa = setAsidePattern.exec(fullText);
  return {
    solicitorNumber: solicNumPattern.exec(fullText)?.[1]?.trim() ?? null,
    naicsCode: naicsPattern.exec(fullText)?.[1] ?? null,
    setAside: (sa?.[1] ?? sa?.[2] ?? null)?.trim() ?? null,
    offerDueDate: offerDuePattern.exec(fullText)?.[1]?.trim() ?? null,
    issuingOffice: issuingPattern.exec(fullText)?.[1]?.trim() ?? null,
  };
}

// ── Main orchestrator ────────────────────────────────────────────────────

export function extractAllFacts(sections: Record<string, DetectedSection>): ExtractedFacts {
  const warnings: string[] = [];
  const s = sections;

  const clins = extractClins(s["B"] ?? null);
  const delivery = extractDelivery(s["F"] ?? null);
  const clauses = extractClauses(s["I"] ?? null);
  const submission = extractSubmissionRequirements(s["L"] ?? null);
  const evaluation = extractEvaluationFactors(s["M"] ?? null);
  const header = extractHeader(s);

  if (clins.length === 0 && s["B"]) warnings.push("§B present but no CLINs extracted — verify format");
  if (clauses.length === 0 && s["I"]) warnings.push("§I present but no clauses extracted — verify format");
  if (submission.length === 0 && s["L"]) warnings.push("§L present but no submission requirements extracted");

  // FOB-conflict detection per Brain Cycle-2 spec.
  const fobTypes = delivery.map((d) => d.fobType).filter(Boolean) as string[];
  if (new Set(fobTypes).size > 1) {
    warnings.push(`FOB_CONFLICT: mixed FOB designations across CLINs (${Array.from(new Set(fobTypes)).join(" vs ")})`);
  }

  return {
    clins,
    delivery,
    clauses,
    submissionRequirements: submission,
    evaluationFactors: evaluation,
    contractType: clins.some((c) => c.contractType === "FFP") ? "FFP" : null,
    setAside: header.setAside ?? null,
    naicsCode: header.naicsCode ?? null,
    solicitorNumber: header.solicitorNumber ?? null,
    offerDueDate: header.offerDueDate ?? null,
    issuingOffice: header.issuingOffice ?? null,
    extractionWarnings: warnings,
  };
}
