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

export const DFARS_TRAPS_MAP: Record<string, string> = {
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

// extractClins now accepts the section bag. CLIN tokens legitimately live in
// §B (priced schedule), §C (some SF-1449 embed schedule under SOW area), §F
// (per-CLIN delivery), and §E (per-CLIN inspection). We scan all four with
// §B prioritized FIRST so its richer descriptions win the dedup. SF-1449
// flattened tables sometimes split the schedule across the §B→§C page
// boundary, leaving 0001 in §B and 0002/0003 in §C — this was the F1 defect.
export function extractClins(sections: Record<string, DetectedSection>): ClinItem[] {
  const sourceText = ["B", "C", "F", "E"]
    .map((k) => sections[k]?.text ?? "")
    .filter((t) => t.length > 0)
    .join("\n\n");
  if (sourceText.length === 0) return [];

  // Normalize CRLF. Token scan finds every plausible CLIN reference at line-
  // start or after whitespace — handles flattened PDF tables where CLINs are
  // not necessarily anchored at column 0.
  const text = sourceText.replace(/\r/g, "");

  // CLIN token = 4-digit (+ optional uppercase letter) followed by whitespace
  // and a description token starting with a capital letter or paren. Rejects
  // bare years (19xx/20xx). Lookahead is non-consuming so subsequent matches
  // start cleanly after the lineItem.
  const tokenRe = /(?:^|\n|\s)(\d{4}[A-Z]?)(?=\s+[A-Z(])/g;

  interface Hit { lineItem: string; index: number; }
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    const li = m[1];
    // Reject obvious year tokens.
    if (/^(19|20)\d{2}$/.test(li)) continue;
    // m.index is start of the entire match (which may begin with \n or \s).
    // The lineItem sits at m.index + (length of the leading whitespace char).
    const liIdx = text.indexOf(li, m.index);
    if (liIdx < 0) continue;
    hits.push({ lineItem: li, index: liIdx });
  }

  // Dedup by lineItem (first occurrence wins — §B priority via concat order).
  const seen = new Set<string>();
  const ordered: Hit[] = [];
  for (const h of hits) {
    if (seen.has(h.lineItem)) continue;
    seen.add(h.lineItem);
    ordered.push(h);
  }

  // Sort hits by index (preserve document order after dedup).
  ordered.sort((a, b) => a.index - b.index);

  const contractTypeRe = /Firm\s+Fixed\s+Price|Time\s+and\s+Materials?|Cost\s+Plus|FFP\b/i;
  const quantityAmbRe = /\(SET\s+OF\s+(\d+)\)\s*[—\-–]?\s*(\d+)\s*(Each|EA|LOT)/i;
  const qtyUnitRe = /(\d+)\s*(Each|EA|LOT|Set|Unit)\b/i;
  // Strong CLIN content signals — descriptions on real CLIN line items contain
  // at least one of these markers in every fixture observed (SF-1449 + SF-18 +
  // DLA + Navy). Used to admit non-0-prefix CLINs (option-year 1xxx/2xxx,
  // optional 9xxx) without admitting form numbers / ISO standard refs / zip
  // codes that happen to be 4-digit tokens followed by capital text.
  const CLIN_CONTENT_RE = /Pricing\s+Arrangement:|Product\s+Service\s+Code:|Mfr\s+(CAGE|Part\s+Number):|\(SET\s+OF\b|\bCDRL\s+A\d{3}|\bFAT\)|Pricing\s+Type:/i;

  const clins: ClinItem[] = [];
  for (let k = 0; k < ordered.length; k++) {
    const cur = ordered[k];
    const next = ordered[k + 1];
    const descStart = cur.index + cur.lineItem.length;
    // Description bounded to text BEFORE the next CLIN token, or 600 chars
    // past the current item (whichever is shorter). This prevents one CLIN's
    // description from absorbing the next CLIN's content.
    const descEnd = next ? next.index : Math.min(text.length, descStart + 600);
    const rawDesc = text.slice(descStart, descEnd);
    const fullDescription = rawDesc.replace(/\s+/g, " ").trim();

    // Dual-criterion admission filter:
    //   (a) lineItem starts with "0" — federal base-CLIN convention (0001-0999)
    //   (b) OR the FIRST 150 chars of the description contain a strong CLIN
    //       content marker — admits non-0-prefix CLINs (option-year 1xxx,
    //       optional 9xxx) only when their own description (not a downstream
    //       CLIN's header that bled into the window) confirms it's a real
    //       procurement line item.
    // Rejects: form numbers (1449 SF form), PSC codes (1680), zip codes (1324),
    // ISO standards (9001), building numbers (4522), tailoring fragments.
    const startsWithZero = cur.lineItem.startsWith("0");
    const hasContentMarker = CLIN_CONTENT_RE.test(fullDescription.slice(0, 150));
    if (!startsWithZero && !hasContentMarker) continue;

    const qtyMatch = qtyUnitRe.exec(fullDescription);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
    const unit = qtyMatch ? qtyMatch[2] : null;

    const ctMatch = contractTypeRe.exec(fullDescription);
    let contractType: ClinItem["contractType"] = null;
    if (ctMatch) {
      const ct = ctMatch[0].toLowerCase();
      if (ct.startsWith("firm") || ct === "ffp") contractType = "FFP";
      else if (ct.includes("time")) contractType = "T&M";
      else if (ct.includes("cost")) contractType = "CPFF";
    }

    const ambMatch = quantityAmbRe.exec(fullDescription);
    const ambiguityFlag = ambMatch
      ? `quantity_ambiguous: "SET OF ${ambMatch[1]} — ${ambMatch[2]} ${ambMatch[3]}" — verify ${ambMatch[2]} sets vs ${ambMatch[2]} units`
      : null;

    clins.push({
      lineItem: cur.lineItem,
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

// Cycle 2 v2 — §I incorporation type is HEADER-driven, not proximity-driven.
// Federal solicitations organize §I into two banners:
//   "CLAUSES INCORPORATED BY FULL TEXT"  → every clause below it = full_text
//   "CLAUSES INCORPORATED BY REFERENCE"  → every clause below it = by_reference
// The prior proximity heuristic (/full\s+text/ in a 500-char window of the
// clause) misclassified by-reference clauses whose title happened to mention
// "full text" downstream, and missed full-text clauses too far from any
// "Full Text" string. Header-walk is deterministic and matches real §I layout.
const FULL_TEXT_HEADER_RE = /CLAUSES?\s+INCORPORATED\s+BY\s+FULL\s+TEXT/i;
const BY_REF_HEADER_RE = /CLAUSES?\s+INCORPORATED\s+BY\s+REFERENCE/i;

export function extractClauses(section: DetectedSection | null): ClauseItem[] {
  if (!section) return [];
  const clauses: ClauseItem[] = [];
  const text = section.text;

  // FAR: 52.x-x · DFARS: 252.x-x · AFFARS / DAF: 5352.x-x
  const clausePattern = /\b(?:5352|252|52)\.\d{3}-\d{1,4}(?:[A-Z](?![A-Z]))?\b/g;

  // Pre-scan: index every header occurrence to build a header-position table.
  // For each clause hit, lookup the most-recent header BEFORE the clause's
  // index — that header dictates the clause's incorporation type.
  interface HeaderHit { index: number; mode: ClauseItem["incorporated"]; }
  const headers: HeaderHit[] = [];
  for (const re of [FULL_TEXT_HEADER_RE, BY_REF_HEADER_RE]) {
    const globalRe = new RegExp(re.source, "gi");
    let h: RegExpExecArray | null;
    while ((h = globalRe.exec(text)) !== null) {
      headers.push({
        index: h.index,
        mode: re === FULL_TEXT_HEADER_RE ? "full_text" : "by_reference",
      });
    }
  }
  headers.sort((a, b) => a.index - b.index);

  // Default mode when no header has been seen yet: by_reference (the safer
  // assumption for the standard incorporation pattern).
  const headerModeAt = (idx: number): ClauseItem["incorporated"] => {
    let mode: ClauseItem["incorporated"] = "by_reference";
    for (const h of headers) {
      if (h.index <= idx) mode = h.mode;
      else break;
    }
    return mode;
  };

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
    const incorporated = headerModeAt(m.index);

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

const SUBMISSION_BUCKETS: Array<{ bucket: SubmissionRequirement["bucket"]; pattern: RegExp; critical: boolean }> = [
  { bucket: "deadline",        pattern: /due\s+(date|time)|no\s+later\s+than|submit\s+by|close\s+of\s+business|deadline/i, critical: true },
  { bucket: "registration",    pattern: /\bSAM\.gov|System\s+for\s+Award\s+Management|\bWAWF\b|\bregister/i, critical: true },
  { bucket: "mandatory_doc",   pattern: /must\s+include|shall\s+include|required\s+to\s+(submit|provide)|MFG\s+name|Part\s+Number|breakdown|CAGE\s+code/i, critical: true },
  { bucket: "representation",  pattern: /\brepresentation|certification|\bcertif/i, critical: false },
  { bucket: "format",          pattern: /english\s+language|U\.?S\.?\s+Currency|\bUSD\b|via\s+email|page\s+limit|font|format/i, critical: false },
];

// FA-128a: §09 item quality gate — an item must read as an actionable
// instruction to the offeror, not a clause excerpt. Rep/cert provisions
// (FAR 52.212-3 etc.) arrive as full clause text in many solicitations;
// line-splitting then turns every wrapped line into a "requirement"
// (DLA fixture: 42 junk items like "'will' in the representation in
// paragraph (d)(1) …"). Two-stage gate:
//   1. hard-reject clause-excerpt fingerprints + wrapped-line fragments
//   2. the broad rep/cert bucket and the verb-only fallback must also show
//      an instruction signal (precise buckets carry their own precision)
const EXCERPT_FINGERPRINTS: RegExp[] = [
  /["'“”‘’][a-z]{2,}["'“”‘’]\s+in\s+the\s+\w+/i,           // quoted-word definition ("'will' in the representation…")
  /\(end of (?:provision|clause)\)/i,
  /\bas\s+(?:defined|prescribed|used)\s+in\b/i,
  /\bparagraph\s*\([a-z0-9]{1,4}\)[\s\S]{0,40}?\bof\s+this\s+(?:provision|clause|section|solicitation)/i,
  /\b(?:offeror|quoter|contractor)\s+(?:represents?|certifies)\b/i, // declarative rep/cert boilerplate
  /\bby\s+submission\s+of\s+(?:its|this)\s+(?:offer|quotation|quote)\b/i,
];
const ACTION_SIGNAL_RE =
  /\b(?:shall|must|will|(?:is|are)\s+(?:required|requested)\s+to)\b[\s\S]{0,60}?\b(?:submit|provid\w*|includ\w*|complet\w*|regist\w*|sign\w*|return\w*|acknowledg\w*|deliver\w*|furnish\w*|insert\w*|check\w*|mark\w*|email\w*|upload\w*|attach\w*|quot\w*|propos\w*|compl\w*|address\w*)\b|^\s*(?:\(?\w{1,4}\)?[\s.:-]*)?(?:submit|provide|include|complete|register|email|upload|attach|ensure|verify|sign)\b|due\s+(?:date|time)|no\s+later\s+than|submit\s+by|close\s+of\s+business|\bdeadline\b/i;

export function isActionableSubmissionItem(text: string, bucket: string): boolean {
  const t = text.trim();
  if (/^[a-z]/.test(t)) return false; // mid-sentence wrap fragment
  if (EXCERPT_FINGERPRINTS.some((re) => re.test(t))) return false;
  if (bucket === "representation" || bucket === "other") return ACTION_SIGNAL_RE.test(t);
  return true;
}

// FA-139 — shared bucketizer so externally bound §L lines (V1 vision) get
// the same bucket/criticality treatment as document-extracted ones.
export function bucketizeSubmissionLine(text: string): { bucket: SubmissionRequirement["bucket"]; isCritical: boolean } {
  for (const { bucket, pattern, critical } of SUBMISSION_BUCKETS) {
    if (pattern.test(text)) return { bucket, isCritical: critical };
  }
  return { bucket: "other", isCritical: false };
}

export function extractSubmissionRequirements(section: DetectedSection | null): SubmissionRequirement[] {
  if (!section) return [];
  const reqs: SubmissionRequirement[] = [];
  const lines = section.text.split("\n");

  const buckets = SUBMISSION_BUCKETS;

  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 15) continue;
    const fp = trimmed.toLowerCase().slice(0, 80);
    if (seen.has(fp)) continue;

    let matched = false;
    for (const { bucket, pattern, critical } of buckets) {
      if (pattern.test(trimmed)) {
        // FA-128a: bucket-matched lines still pass the quality gate — a
        // rejected line is consumed (seen) but never emitted, and never
        // falls through to the 'other' fallback.
        if (isActionableSubmissionItem(trimmed, bucket)) {
          reqs.push({ bucket, text: trimmed.slice(0, 300), sourceClause: null, isCritical: critical });
        }
        seen.add(fp);
        matched = true;
        break;
      }
    }
    if (!matched && /\b(shall|must|required|mandatory|submit|offeror)\b/i.test(trimmed)) {
      if (isActionableSubmissionItem(trimmed, "other")) {
        reqs.push({ bucket: "other", text: trimmed.slice(0, 300), sourceClause: null, isCritical: false });
      }
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

  // Attachment-reference catch — §M sometimes says "see attachment X" with
  // the actual factor list living outside §M proper. Still emit a row so
  // downstream renders convey the method + a verify-attachment cue.
  if (factors.length === 0) {
    const attachRef = /see\s+(?:attachment|exhibit|section)\s+([A-Z0-9-]+)/i.exec(text);
    if (attachRef) {
      factors.push({
        factor: `Evaluation criteria in ${attachRef[0]} — review attachment before bid`,
        weight: null,
        method,
      });
    } else if (method !== "other") {
      factors.push({
        factor: method === "LPTA" ? "Lowest Price Technically Acceptable" : "Best Value",
        weight: null,
        method,
      });
    }
  }
  return factors;
}

// ── Header (cross-section) extractor ────────────────────────────────────

// FA-142 — masthead shape validators. The header regexes scan FULL document
// text, so clause boilerplate can satisfy them mid-sentence ("…issued by the
// IRS…", "…100 % FOR: …" inside a rep/cert). A captured value only counts if
// it has the SHAPE of the field it claims to be; otherwise extraction yields
// null and the external SAM/V1 metadata gets to bind instead.
const ORG_JUNK_RE = /\b(deviation|paragraph|clause|pursuant|shall|will|offeror|hereby|representation|certification|provision)\b/i;

export function looksLikeOrgName(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (s.length < 3 || s.length > 80) return false;
  if (!/^[A-Z0-9]/.test(s)) return false;      // fragments start mid-sentence, lowercase
  if (/[%;:]/.test(s)) return false;
  if (ORG_JUNK_RE.test(s)) return false;
  return /[A-Za-z]{2}/.test(s);
}

export function looksLikeSetAsideValue(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s || s.length > 80) return false;
  // FA-158: reject clause-prose fragments that merely MENTION a set-aside term
  // inside a sentence (e.g. "for small business and has a value above the
  // simplified acquisition threshold"). A real set-aside value is a short
  // vocabulary phrase, never a sentence — so 3+ words AND a sentence-structure
  // connector ⇒ clause prose ⇒ reject (caller falls through to the next
  // source). Exempt the canonical "full and open" phrase, whose "and" is
  // vocabulary (matched on the line below), not sentence structure.
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  const isFullAndOpen = /^full\s+(?:and|&)\s+open(?:\s+competition)?$/i.test(s);
  if (
    !isFullAndOpen &&
    wordCount >= 3 &&
    /\b(?:for|and|that|which|with|above|below|under|has|have|is|are|was|were)\b/i.test(s)
  ) {
    return false;
  }
  return (
    /(small\s+business|8\s*\(\s*a\s*\)|hubzone|wosb|edwosb|sdvosb|vosb|veteran[\s-]owned|service[\s-]disabled|unrestricted|full\s+(?:and|&)\s+open|sole\s+source|set[\s-]?aside)/i.test(s) ||
    /^\d{1,3}\s*%\s*(?:small|sb\b|set)/i.test(s)
  );
}

export function extractHeader(sections: Record<string, DetectedSection>): Partial<ExtractedFacts> {
  const fullText = Object.values(sections).map((s) => s.text).join("\n");

  const solicNumPattern = /(?:Solicitation\s+Number|SOLICITATION\s+NUMBER|solicitation\s+no\.?)[:\s]+([A-Z0-9-]+)/i;
  const naicsPattern = /\bNAICS[:\s]+(\d{6})/i;
  const setAsidePattern = /SET[\s-]?ASIDE[:\s]+([^\n]{5,80})|100\s*%\s+(?:SET[\s-]?ASIDE\s+)?(?:FOR\s+)?([^\n]{5,80})/i;
  const offerDuePattern = /(?:OFFER\s+DUE\s+DATE|Quote\s+Due|Proposal\s+due|due\s+date)[:\s/-]+([^\n]{5,80})/i;
  // Case-SENSITIVE + line-anchored: only the uppercase form-box label counts,
  // never prose "…issued by …" inside a clause (the Army/DLA SPRS fragment).
  const issuingPattern = /(?:^|\n)[^\S\n]*ISSUED\s+BY\b[:\s]*\n?\s*([A-Z][A-Z0-9 \-,.&()/]{3,80})/;

  const sa = setAsidePattern.exec(fullText);
  const saRaw = (sa?.[1] ?? sa?.[2] ?? null)?.trim() ?? null;
  const issRaw = issuingPattern.exec(fullText)?.[1]?.trim() ?? null;
  return {
    solicitorNumber: solicNumPattern.exec(fullText)?.[1]?.trim() ?? null,
    naicsCode: naicsPattern.exec(fullText)?.[1] ?? null,
    setAside: saRaw && looksLikeSetAsideValue(saRaw) ? saRaw : null,
    offerDueDate: offerDuePattern.exec(fullText)?.[1]?.trim() ?? null,
    issuingOffice: issRaw && looksLikeOrgName(issRaw) ? issRaw : null,
  };
}

// ── Main orchestrator ────────────────────────────────────────────────────

export function extractAllFacts(sections: Record<string, DetectedSection>): ExtractedFacts {
  const warnings: string[] = [];
  const s = sections;

  const clins = extractClins(s);
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
