// Lever-3 STEP-2 — OCR-accuracy LAYER 2: deterministic structural validation of decision-bearing tokens.
//
// The CEO-ruled accuracy gate is layered (card #408/#410): layer-1 confidence floor (tesseract-TSV) → LAYER-2
// deterministic structural validation (THIS module) → layer-3 narrow vision-escalation on the residual → layer-4
// fail-toward-NHR. This module is the deterministic ANCHOR — it needs no model, no confidence, runs $0 on the OCR
// sidecar text, and is the layer that catches the visually-identical-substitution class (l/1, O/0, S/5, B/8, rn/m…)
// on tokens with KNOWN formats: FAR/DFARS clause numbers, dollar figures, dates, NAICS, set-aside codes.
//
// THE HARD BOUNDARY (CEO REFINEMENT 1): a FORMAT-VALID misread — 52.212-1 mis-OCR'd as 52.212-7, $1,300 as $1,800,
// a valid-but-wrong date — PASSES structural validation and is still wrong. Layer-2 CANNOT catch it. This module must
// therefore not merely pass/fail — it must PARTITION every decision-bearing token into:
//   • "suspect_misread"  — shaped like a known class but structurally impossible (digit-slot letter / out-of-range) →
//                          a CAUGHT OCR error → the finding it grounds must route to NHR (layer-4), never committal.
//   • "valid_format"     — structurally plausible but NOT verified correct → the RESIDUAL layer-3 (vision) / layer-4
//                          must own. Layer-2 success on suspect tokens must never read as "this token is proven right".
//   • null               — not a decision-bearing token → not gated here.

export type TokenClass = "far_clause" | "money" | "date" | "naics" | "setaside";
export type TokenStatus = "valid_format" | "suspect_misread";
export interface TokenVerdict {
  token: string;
  class: TokenClass;
  status: TokenStatus;
  reason?: string;
}

// Common OCR digit substitutions — a letter appearing in a digit slot is a caught misread.
const SUB = "lIoOsSbBzZgGqQ"; // l/I→1, o/O→0, s/S→5, b/B→8, z/Z→2, g/G/q/Q→9
const D = "0-9";

// Plausible procurement-context year window — a date year outside this is an implausible OCR misread (05/26/2085 obs).
// Deterministic + defensible: covers multi-year periods of performance without waving through a 60-year misread.
const YEAR_MIN = 2010, YEAR_MAX = 2045;
// STRICT (all-digit where digits belong) — the "valid format" acceptor. Suffix is \d{1,4}: FAR is 1-2 digits
// (52.212-1), DFARS is 4 (252.204-7012) — capping at 2 wrongly rejected every DFARS clause.
const FAR_CLAUSE_STRICT = new RegExp(`^\\d{2,3}\\.\\d{3}-\\d{1,4}$`);
const MONEY_STRICT = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?$/;
const DATE_STRICT = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/;
const NAICS_STRICT = /^\d{6}$/;
const SETASIDE_STRICT = /^(?:SBA|SBP|8A|8\(A\)|HZC|HZS|SDVOSBC|SDVOSBS|WOSB|WOSBSS|EDWOSB|VSA|VSS|IEE|ISBEE|LAS|BICiv|NONE)$/i;

// "SHAPED LIKE" a class but permitting the OCR-substitution characters — used to catch a token that WANTS to be a
// clause/money/date but has a digit-slot letter (the confident-substitution misread).
const FAR_CLAUSE_SHAPED = new RegExp(`^[${D}${SUB}]{2,3}[.,][${D}${SUB}]{3}[-–—][${D}${SUB}]{1,4}$`);
const MONEY_SHAPED = new RegExp(`^\\$[${D}${SUB},]{1,}(?:[.,][${D}${SUB}]{2})?$`);
const DATE_SHAPED = new RegExp(`^[${D}${SUB}]{1,2}[\\/-][${D}${SUB}]{1,2}[\\/-][${D}${SUB}]{2,4}$`);

const hasSubLetter = (s: string) => /[a-zA-Z@]/.test(s.replace(/^\$/, "").replace(/[A-Z()]/g, (m) => (SETASIDE_STRICT.test(m) ? m : m))); // any letter/@ in a numeric token

/** Validate a DATE's components are in range (a format-valid date can still be an impossible date = caught misread). */
function dateInRange(tok: string): boolean {
  const m = DATE_STRICT.exec(tok);
  if (!m) return false;
  const mo = +m[1], da = +m[2], yrRaw = +m[3];
  const yr = yrRaw < 100 ? 2000 + yrRaw : yrRaw;
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && yr >= YEAR_MIN && yr <= YEAR_MAX;
}

/** Classify + structurally validate ONE token. Returns null if the token is not decision-bearing. */
export function validateToken(raw: string): TokenVerdict | null {
  const t = raw.trim();
  // FAR/DFARS clause
  if (FAR_CLAUSE_STRICT.test(t)) return { token: t, class: "far_clause", status: "valid_format" };
  if (FAR_CLAUSE_SHAPED.test(t)) return { token: t, class: "far_clause", status: "suspect_misread", reason: "clause-shaped with digit-slot letter (OCR substitution)" };
  // Money
  if (MONEY_STRICT.test(t)) return { token: t, class: "money", status: "valid_format" };
  if (MONEY_SHAPED.test(t) && /[a-zA-Z@]/.test(t)) return { token: t, class: "money", status: "suspect_misread", reason: "money-shaped with letter/@ (OCR substitution)" };
  // Date
  if (DATE_STRICT.test(t)) return dateInRange(t)
    ? { token: t, class: "date", status: "valid_format" }
    : { token: t, class: "date", status: "suspect_misread", reason: "date component out of range (OCR misread)" };
  if (DATE_SHAPED.test(t) && /[a-zA-Z@]/.test(t)) return { token: t, class: "date", status: "suspect_misread", reason: "date-shaped with letter/@ (OCR substitution)" };
  // NAICS
  if (/^\d{6}$/.test(t)) return { token: t, class: "naics", status: "valid_format" };
  if (/^[0-9lIoOsSbBzZgGqQ]{6}$/.test(t) && /[a-zA-Z]/.test(t)) return { token: t, class: "naics", status: "suspect_misread", reason: "NAICS-shaped with letter (OCR substitution)" };
  // Set-aside code
  if (SETASIDE_STRICT.test(t)) return { token: t, class: "setaside", status: "valid_format" };
  return null;
}

export interface ExcerptScan {
  decisionTokens: TokenVerdict[];
  suspect: TokenVerdict[];       // caught misreads → force NHR (layer-4)
  validUnverified: TokenVerdict[]; // format-valid RESIDUAL → layer-3 (vision) / layer-4 owns; NOT proven correct
}

/** Scan an OCR'd excerpt for decision-bearing tokens and partition them (the layer-2 output the verdict path consumes).
 *  IMPORTANT: `validUnverified` being empty does NOT mean "excerpt is clean" — it means no KNOWN-format token was
 *  found; free-text misreads are out of scope for structural validation (that is confidence/vision territory). */
export function scanOcrExcerpt(excerpt: string): ExcerptScan {
  const candidates = (excerpt || "").split(/\s+/).map((w) => w.replace(/[^\w$().,\/-]+$/g, "").replace(/^[^\w$]+/g, "")).filter(Boolean);
  const decisionTokens: TokenVerdict[] = [];
  for (const c of candidates) { const v = validateToken(c); if (v) decisionTokens.push(v); }
  return {
    decisionTokens,
    suspect: decisionTokens.filter((v) => v.status === "suspect_misread"),
    validUnverified: decisionTokens.filter((v) => v.status === "valid_format"),
  };
}
