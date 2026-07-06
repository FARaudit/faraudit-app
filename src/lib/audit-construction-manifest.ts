// Construction (SF-1442 / Part-36) binding-content manifest — Brain card 288 (ruling: narrowed OUT_OF_SCOPE;
// document-bounded SF-1442 with a resolvable offer structure reaches a DECIDED verdict via a construction carrier).
//
// DOCTRINE (Brain cards 287/288, NON-NEGOTIABLE):
//   • The completeness GATE must NEVER self-certify from the compressed 90KB digest ("trusting the compressor about
//     itself"). This sweep runs over each document's FULL text PRE-compression and seals every binding element with a
//     compression-STABLE ANCHOR (a short distinctive token — clause number / distinctive phrase) + its source-doc +
//     a sha256 of the grounded region + a sha256 of the whole doc.
//   • CROSS-COMPRESSION-BOUNDARY design (adversarial-review card 288, Rule 69): the map-reduce digest keeps VERBATIM
//     compliance EXCERPTS, not contiguous full-text windows — so a full 220-char window will NOT reliably reappear in
//     the read source even when the binding content was semantically KEPT. The gate therefore keys on the ANCHOR: an
//     element SURVIVED iff its anchor is present in the read source (compressor kept the binding content); a grounded
//     finding ANALYZED it iff the finding's excerpt carries that anchor. A binding element the compressor DROPPED →
//     anchor absent from the read source → uncovered ⇒ INCOMPLETE (honest, never a false decided verdict).
//   • The :574 completeness FORMULA is untouched — only the CARRIER that populates `required` changes for
//     part36-construction (Brain #3: "gate never weakens, only the carrier changes").
//   • FORMAT AUTHORITY is PRIMARY-region-scoped ([[feedback_ingest_no_format_authority]] / card 265): a stray
//     "SF 1442" in an ATTACHMENT must not flip a services/UCF buy to construction. isConstruction reads the PRIMARY
//     doc header (+ the authoritative SAM NAICS), never an attachment body.
//   • Deterministic, $0, NO model. Rule 64: never PRESENT without a verbatim span in the named doc.

import { createHash } from "crypto";
import { hasEngineText } from "./sam-attachments";

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const norm = (s: string): string => s.replace(/[‐-―]/g, "-").replace(/\s+/g, " ").toLowerCase().trim();

/** The binding CONTENT elements of a construction (SF-1442) solicitation — the carrier that replaces §A–M. */
export type ConstructionElementKey = "bonding" | "wage_determination" | "submission" | "scope" | "set_aside";

/** CORE construction elements — the honest-fail analog of §C/§L/§M. A solicitation-type construction buy that cannot
 *  ground ALL of these cannot certify a biddable package ⇒ INCOMPLETE (never a decided verdict over unread bars). */
export const CONSTRUCTION_CORE: ConstructionElementKey[] = ["bonding", "wage_determination", "submission"];

export interface ConstructionElement {
  key: ConstructionElementKey;
  present: boolean;
  sourceDoc: string | null;   // which document it grounded in (null when absent)
  anchor: string | null;      // the compression-STABLE matched token (the survival + analyzed join key); null when absent
  span: string | null;        // the verbatim grounded span (Rule 64 — never PRESENT without a real span; report/trace)
  regionHash: string | null;  // sha256 of the grounded region (full-text-bound; provenance for the trace)
}

/** Per-document sealed attestation (Brain card 289 — card-285 Fix-2 generalized to attachments). Computed at ingest
 *  over each doc's FULL (pre-compression) text. The gate consumes THIS, never the digest: an obligation-FREE binding
 *  attachment READ IN FULL (hasText, hash-bound, obligation detector swept the full text → zero) may be ATTESTED
 *  covered without a finding-in-doc; an attachment WITH obligations still needs a grounded finding; an UNREAD /
 *  no-text attachment (hasText=false) can NEVER be attested → INCOMPLETE (Brain HARD LINE: read-and-empty ≠ unread). */
export interface DocAttestation {
  name: string;
  fullTextHash: string;         // sha256 of the FULL pre-compression text — the hash-bound provenance
  hasText: boolean;             // the doc carried substantive machine-readable text (read in full) — false ⇒ never attestable
  groundableObligations: number;// count of binding-obligation sentences over the FULL text (0 ⇒ attest read-and-empty)
}

export interface ConstructionManifest {
  /** True iff this package is a construction (SF-1442 / NAICS sector-23) buy — set from the PRIMARY-doc header + NAICS. */
  isConstruction: boolean;
  elements: ConstructionElement[];
  /** sha256 over each document's FULL (pre-compression) text — the provenance root. */
  docHashes: Array<{ name: string; hash: string }>;
  /** Per-doc sealed attestation over FULL text (Brain card 289) — the per-doc coverage condition consumes this. */
  docAttestations: DocAttestation[];
}

// A binding-obligation signal over FULL text. This MUST be a STRICT SUPERSET of the general-path detector
// (audit-orchestrator.ts obligationsOf: shall|must|provide|submit|furnish|required|quote|deliver) — else a
// construction attachment written in IMPERATIVE mood ("Furnish and install…", "Provide formwork", "Submit shop
// drawings"), the CSI-spec standard, would read obligation-FREE and be attested covered with ZERO analysis
// (false-COMPLETE = false-BID; caught by Rule-69 card-289 review). Superset = obligationsOf's verbs + construction
// imperatives. Broadening only raises false-INCOMPLETE (the safe zero-contract-loss direction); the attest-empty
// relief valve then fires ONLY on a genuinely prose-free drawing set. If obligationsOf's verb list ever changes,
// this must stay a superset (guarded by the imperative-spec regression test).
const OBLIGATION_RE = /\b(?:shall|must|provide|submit|furnish|required|quote|deliver|install|erect|construct|responsible\s+for|is\s+required\s+to|are\s+required\s+to|no\s+later\s+than|at\s+no\s+(?:additional|extra)\s+cost|to\s+be\s+provided\s+by)\b/gi;
function countGroundableObligations(text: string): number {
  return (text.match(OBLIGATION_RE) ?? []).length;
}

// ── Deterministic element detectors (verbatim, $0, NO model). Each anchored to a construction-SPECIFIC, distinctive,
//    compression-stable signal — NOT generic vocabulary and NOT the classification token (adversarial-review hardening). ──
const ELEMENT_DEFS: Array<{ key: ConstructionElementKey; re: RegExp }> = [
  // bonding — bid guarantee / performance & payment bonds (FAR 52.228-1/-15/-16). Bonding is inherently construction.
  { key: "bonding", re: /\b52\.228-(?:1|15|16)\b|bid\s+guarantee|performance\s+and\s+payment\s+bond|performance\s+bond|payment\s+bond/i },
  // wage determination — Davis-Bacon CONSTRUCTION wage standard (52.222-6 family) ONLY. The generic "wage determination"
  // / "WD NN-NNNN" alternates were REMOVED — they match SCA SERVICE wage determinations (52.222-41), a different, in-scope
  // case, and would false-satisfy the construction core off service boilerplate (adversarial-review finding).
  { key: "wage_determination", re: /\b52\.222-6\b|davis[\s-]?bacon|construction\s+wage\s+rate/i },
  // offer/submission MECHANICS — bid schedule / offer-due / receipt-of-offers. The bare "SF-1442" token was REMOVED: it
  // is the SAME token that classifies isConstruction, so keying the submission CORE on it made the element a tautology
  // (every header-classified buy trivially "present"). The core now requires REAL submission mechanics.
  { key: "submission", re: /bid\s+schedule|offers?\s+(?:are\s+)?due|offer\s+due\s+date|receipt\s+of\s+offers|bid\s+opening/i },
  // scope of work — SOW or CSI MasterFormat spec codes (distinctive). Bare "specifications" was removed (too generic).
  { key: "scope", re: /statement\s+of\s+work|\bscope\s+of\s+work\b|\bSECTION\s+\d{2}\s+\d{2}\s+\d{2}\b/i },
  // set-aside / eligibility — the who-can-win gate the null profile cannot verify.
  { key: "set_aside", re: /set[\s-]?aside|\b8\(a\)\b|SDVOSB|HUBZone|WOSB|small\s+business\s+(?:set|concern|program)/i },
];

// Key → detector regex, for the coverage SURVIVAL / ANALYZED checks (below). Survival keys on whether the element's
// binding SIGNAL (ANY detector alternate) reached the read source — NOT one brittle exact anchor phrase. Rationale
// (Rule-69 W9126 diagnosis): the map-reduce compressor keeps the stable clause TOKEN ("52.222-6") but may drop the
// prose title ("Construction Wage Rate"); a single-phrase anchor false-INCOMPLETEs a package whose binding content
// the compressor semantically KEPT. Re-testing the detector on the read source is robust to digest phrasing AND still
// gate-strong (the clause token's presence IS the binding signal; coverage still requires a grounded finding too).
const ELEMENT_RE: Record<ConstructionElementKey, RegExp> = Object.fromEntries(ELEMENT_DEFS.map((d) => [d.key, d.re])) as Record<ConstructionElementKey, RegExp>;

// SF-1442 header — the construction counterpart to SF-1449 (commercial). Classification signal, PRIMARY-region only.
const SF1442_HEADER_RE = /\bSF[-\s]?1442\b|STANDARD\s+FORM\s+1442|SOLICITATION[\/,\s]+OFFER[\/,\s]+(?:AND\s+)?AWARD\s*\(?\s*CONSTRUCTION/i;

/**
 * Sweep the binding construction elements over each document's FULL text (PRE-compression), sealed + anchor-bound.
 * `docs` MUST be the full per-document text (the executor's pre-assembly set), never the compressed digest; docs[0]
 * is the PRIMARY solicitation (format authority). Pure, deterministic, $0.
 */
export function sweepConstructionManifest(
  docs: Array<{ name: string; text: string }>,
  naicsCode?: string | null,
): ConstructionManifest {
  const naics = (naicsCode ?? "").trim();
  const naicsConstruction = /^23\d{4}$/.test(naics);
  // PRIMARY-region-scoped format authority (card 265 / feedback_ingest_no_format_authority): only the FIRST doc's
  // header may flip the format — never an attachment body. NAICS-23 is authoritative SAM metadata, so it may fire alone.
  const primaryText = docs[0]?.text ?? "";
  const headerConstruction = SF1442_HEADER_RE.test(primaryText);
  const isConstruction = naicsConstruction || headerConstruction;

  const docHashes = docs.map((d) => ({ name: d.name, hash: sha256(d.text) }));
  // Per-doc sealed attestation over FULL text (Brain card 289). hasText gates the HARD LINE (no-text ⇒ never
  // attestable); groundableObligations===0 enables attest-read-and-empty. hasText uses the codebase's authoritative
  // read/no-text check `hasEngineText` (word floor + mojibake + [PDF_EXTRACTION_FAILED guards) — NOT an ad-hoc char
  // floor (Rule-69 card-289 review): a header-only text layer or a failed-extraction marker must read hasText=false
  // ⇒ uncovered ⇒ INCOMPLETE, especially on the upload path where there is no upstream content-loss cap.
  const docAttestations: DocAttestation[] = docs.map((d) => {
    const groundableObligations = countGroundableObligations(d.text ?? "");
    // hasText = the doc extracted REAL machine-readable content (was READ), vs a scanned / failed-extraction stub.
    // hasEngineText catches clean prose; but an ANNOTATION-HEAVY doc (construction drawings: dimensions, grid labels,
    // symbols + some spec prose) trips hasEngineText's garbled/word-floor heuristic yet is genuinely READ. Its
    // detected obligation VERBS (shall / furnish / provide …) are real English words that CANNOT occur in a scanned
    // stub or mojibake — so groundableObligations>0 PROVES the doc was read (Brain HARD LINE: read-and-empty ≠ unread;
    // a doc with obligations is READ, and still needs its obligations grounded — never attested read-and-empty). A
    // scanned/[PDF_EXTRACTION_FAILED] stub has obl=0 → hasText stays false → correctly never attestable.
    return {
      name: d.name,
      fullTextHash: sha256(d.text),
      hasText: hasEngineText(d.text) || groundableObligations > 0,
      groundableObligations,
    };
  });

  const elements: ConstructionElement[] = ELEMENT_DEFS.map((def) => {
    for (const d of docs) {
      const m = def.re.exec(d.text);
      if (m && typeof m.index === "number") {
        const start = Math.max(0, m.index - 60);
        const end = Math.min(d.text.length, m.index + m[0].length + 160);
        const region = d.text.slice(start, end);
        return {
          key: def.key,
          present: true,
          sourceDoc: d.name,
          anchor: m[0].replace(/\s+/g, " ").trim(),   // the compression-STABLE join key (matched token)
          span: region.replace(/\s+/g, " ").trim(),
          regionHash: sha256(region),
        };
      }
    }
    return { key: def.key, present: false, sourceDoc: null, anchor: null, span: null, regionHash: null };
  });

  return { isConstruction, elements, docHashes, docAttestations };
}

/** Carrier — the construction `required` set = the elements DETECTED PRESENT (the §A–M analog). Never empty for a real
 *  SF-1442 (always ≥1 present element) → the :574 `required.length>0` guard stays satisfiable; a misclassified empty
 *  blob yields required=[] → still INCOMPLETE (guard intact, never a false BID). */
export function constructionRequired(m: ConstructionManifest): string[] {
  return m.elements.filter((e) => e.present).map((e) => e.key);
}

/** Honest-fail CORE analog of coreMissingFor's §C/§L/§M — the construction core elements DETECTED ABSENT. A
 *  solicitation-type construction buy missing any core element cannot certify a biddable package ⇒ INCOMPLETE. */
export function constructionCoreMissing(m: ConstructionManifest): string[] {
  const present = new Set(m.elements.filter((e) => e.present).map((e) => e.key));
  return CONSTRUCTION_CORE.filter((k) => !present.has(k));
}

/**
 * Part36 coverage — ANCHOR-based (compression-boundary-safe). An element is COVERED iff (1) its compression-stable
 * ANCHOR SURVIVED into the source the auditor read (present in `fullSource` — the compressor kept this binding
 * content), AND (2) a grounded finding ANALYZED it (a finding excerpt carries that anchor). A present element whose
 * anchor the compressor dropped (anchor absent from fullSource) → uncovered ⇒ INCOMPLETE (the auditor never saw it —
 * the false-COMPLETE-via-digest interceptor). A present, survived element with no finding citing its anchor →
 * uncovered ⇒ INCOMPLETE (present-but-unanalyzed; silence ≠ coverage). Certifies against the SEALED anchor set from
 * FULL text, NEVER the digest self-certifying, and stays sound across the map-reduce excerpt boundary.
 */
export function constructionCoverage(
  m: ConstructionManifest,
  fullSource: string,
  findingExcerpts: string[],
  analyzedDocs?: Set<string>,   // doc names where a grounded finding lands (Brain card 289 — element analyzed via its source doc)
): { covered: string[]; missing: string[]; survived: string[]; droppedByCompressor: string[] } {
  const nSource = norm(fullSource);
  const nExcerpts = findingExcerpts.map(norm).filter((e) => e.length > 0);
  const covered: string[] = [];
  const missing: string[] = [];
  const survived: string[] = [];
  const droppedByCompressor: string[] = [];

  for (const e of m.elements) {
    if (!e.present) continue; // only PRESENT elements are `required`; absent ones are handled by coreMissing
    const re = ELEMENT_RE[e.key]; // stateless (/i, no /g) — safe to reuse across calls
    const nAnchor = e.anchor ? norm(e.anchor) : "";
    // SURVIVED iff the element's binding SIGNAL (any detector alternate — e.g. the stable clause token) reached the
    // read source. Robust to compression phrasing: the prose title may be dropped but the clause number survives.
    const inSource = (nAnchor.length > 0 && nSource.includes(nAnchor)) || re.test(fullSource);
    if (!inSource) { droppedByCompressor.push(e.key); missing.push(e.key); continue; }
    survived.push(e.key);
    // ANALYZED iff a grounded finding addresses this element. Two accepted signals (Brain card 289):
    //   (1) a finding excerpt carries the element's binding SIGNAL (matches the detector regex, or the exact anchor) —
    //       a direct token join; OR
    //   (2) a grounded finding lands in the element's SOURCE DOCUMENT (analyzedDocs). Correctness fix: the element
    //       DETECTOR matches STRUCTURAL markers (CSI codes, "statement of work") while a FINDING about the element is
    //       CONTENT (the work / the obligation) — they share no tokens, so a regex-only check false-missed a genuinely
    //       analyzed element. Grounding a finding in the doc that carries the element = the auditor read+reasoned that
    //       doc. NOT a weakening: still requires a real grounded finding in the right document; combined with per-doc
    //       attestation (each binding doc grounded/attested) + element PRESENCE (coreMissing) the bar stays strong.
    const inSourceDoc = !!(e.sourceDoc && analyzedDocs?.has(e.sourceDoc));
    const analyzed = inSourceDoc || nExcerpts.some((ex) => (nAnchor.length > 0 && ex.includes(nAnchor)) || re.test(ex));
    if (analyzed) covered.push(e.key);
    else missing.push(e.key);
  }
  return { covered, missing, survived, droppedByCompressor };
}
