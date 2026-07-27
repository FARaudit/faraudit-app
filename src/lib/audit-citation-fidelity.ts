// ARC #747 · E2 — CITATION FIDELITY GATE. Flag-gated, default-OFF, byte-identical when OFF.
//
// THE DEFECT (gate 4, PANEL-d0664ba2-GATE4.md C1). The report told a customer:
//   "Proposal must include Cost/Price Supporting Documentation per DFARS 215-2 (Instructions for Submitting
//    Cost/Price Proposals When Certified Cost or Pricing Data are required)"
// The source says "in accordance with FAR 15.408, Table 15-2, Instructions for Submitting Cost/Price
// Proposals…". A FAR table designator was re-prefixed DFARS and collapsed to a number that exists in no
// regulation. DFARS subpart 215.2 is real and is titled "Solicitation and Receipt of Proposals and
// Information"; it has no Table 15-2. Meanwhile the correct DFARS cite the record DID contain —
// 252.215-7009, the Proposal Adequacy Checklist — never reached the report.
//
// WHY THIS GATE IS NARROWER THAN THE SPEC ASKED FOR. `ceo/ARC-747-E2-INVESTIGATION.md` records the
// measurement. The spec's "every token must appear in the source" was wrong on 42 of 42 absent tokens across
// 1355 measured: they are AUTHORITY citations (13 CFR 121.406(b) for the SBA nonmanufacturer size standard;
// FAR 36.204 for construction magnitude), which assert what the LAW says rather than what the document
// prints, and NEGATIVE assertions ("No standalone FAR 52.219-6 set-aside clause was found in §I"), where the
// token's ABSENCE is the claim. A fail-closed presence gate would have deleted only true sentences. So
// presence is used here ONLY as an EXONERATING condition — never as a trigger.
//
// The trigger is GRAMMAR, which needs no source lookup and no guess about what the sentence is claiming.

// ── FLAG ────────────────────────────────────────────────────────────────────────────────────────────────
// Read per call, never frozen at import: a module-level const captures the value at import time and makes
// the flag un-testable and un-armable in a running worker. [[feedback_placebo_arm_record_surface_inert]]
export function citationFidelityEnabled(): boolean {
  return process.env.AUDIT_CITATION_FIDELITY === "true";
}

// ── GRAMMARS ────────────────────────────────────────────────────────────────────────────────────────────
// PERMISSIVE BY CONSTRUCTION: reject only what is structurally impossible in that corpus, never what is
// merely unusual. A first draft rejected "FAR 9.5" — a real FAR subpart — by demanding three digits after
// the dot. An over-strict grammar in a fail-closed gate deletes true citations, which is the failure this
// gate exists to prevent, pointed the other way.
//
//   FAR    48 CFR ch.1  · parts 1-53   · subpart/section 9.5 · 9.504 · 6.302-1 · 15.408 · clauses 52.XXX-YY
//   DFARS  48 CFR ch.2  · parts 201-253 · sections 2XX.YYY(-YY), incl. subpart 215.2 · clauses 252.XXX-7YYY
//   AFFARS 48 CFR ch.53 · 53XX.YYY · clauses 5352.XXX-YYYY
//   DLAD   48 CFR ch.54 · 54XX.YYY · clauses 5452.XXX-YYYY
//   VAAR   48 CFR ch.8  · 8XX.YYY  · clauses 852.XXX-YY
//   CFR/USC — the title lives OUTSIDE the token ("13 CFR 121.406"), so any part/section shape is admissible
export const CORPUS_GRAMMAR: Record<string, RegExp> = {
  FAR:    /^(?:52\.\d{3}-\d{1,3}|(?:[1-9]|[1-4]\d|5[0-3])\.\d{1,4}(?:-\d{1,2})?)$/,
  DFARS:  /^(?:252\.\d{3}-7\d{3}|2(?:0[1-9]|[1-4]\d|5[0-3])\.\d{1,4}(?:-\d{1,2})?)$/,
  AFFARS: /^(?:5352\.\d{3}-\d{4}|53\d{2}\.\d{1,4}(?:-\d{1,2})?)$/,
  DLAD:   /^(?:5452\.\d{3}-\d{4}|54\d{2}\.\d{1,4}(?:-\d{1,2})?)$/,
  VAAR:   /^(?:852\.\d{3}-\d{1,3}|8\d{2}\.\d{1,4}(?:-\d{1,2})?)$/,
  CFR:    /^\d{1,4}\.\d{1,4}(?:-\d{1,3})?$/,
};
// SCOPE LIMIT, stated rather than implied. The extractor recognizes DOTTED and DASHED designations only, so
// BARE-INTEGER references — "15 U.S.C. 644", "FAR part 19" — are never extracted and are therefore never
// judged. A USC grammar was drafted here and removed: nothing the extractor can produce could ever reach it,
// and a rule that cannot fire is indistinguishable from one that passes everything. If bare-integer statutory
// cites ever need governing, the extractor is what has to change first, not this table.
// Spelling variants normalize onto a canonical corpus key. "DFAR" is a common single-letter slip in model
// output and must not be treated as an unknown corpus (unknown ⇒ ungoverned ⇒ silently exempt).
const CORPUS_ALIAS: Record<string, string> = { DFAR: "DFARS", CFR: "CFR", USC: "USC" };

const CORPUS_WORD = "(?:FAR|DFARS|DFAR|AFFARS|VAAR|DLAD|C\\.?F\\.?R\\.?|U\\.?S\\.?C\\.?)";
// Dotted forms longest-first so 252.204-7012 is never truncated to 252.204; then the DASH-ONLY form, which
// is the shape the founding defect took and which an earlier revision of the census could not see at all.
const NUMBER = "\\d{1,4}\\.\\d{1,4}-\\d{1,4}|\\d{1,4}\\.\\d{1,4}|\\d{2,4}-\\d{1,3}";
// The connector words are OPTIONAL and consumed into the match so the replacement span stays contiguous.
const TOKEN_RE = new RegExp(`(${CORPUS_WORD})(\\s+(?:part|subpart|section|clause|table|§)?\\s*)(${NUMBER})(?![-.]?\\d)`, "gi");

export interface RegulationToken {
  /** canonical corpus key ("DFARS"), not the raw spelling */
  corpus: string;
  /** corpus word exactly as written, for verbatim replacement */
  corpusRaw: string;
  number: string;
  /** full matched span, e.g. "DFARS 215-2" */
  raw: string;
  start: number;
  end: number;
}

/** Every corpus-PREFIXED regulation reference in `text`. Bare numbers ("per 52.219-6") are deliberately not
 *  returned: with no stated corpus there is no grammar to test them against, and inferring one would be the
 *  guess this gate exists to refuse. */
export function extractRegulationTokens(text: string): RegulationToken[] {
  const out: RegulationToken[] = [];
  if (!text) return out;
  for (const m of text.matchAll(TOKEN_RE)) {
    const rawWord = m[1];
    const key = rawWord.replace(/\./g, "").toUpperCase();
    out.push({
      corpus: CORPUS_ALIAS[key] ?? key,
      corpusRaw: rawWord,
      number: m[3],
      raw: m[0],
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  return out;
}

/** BOUNDARY-ANCHORED presence. `String.includes` is unusable here: "215-2" is a substring of "52.215-22",
 *  which appears twice in the founding record's own source — so `includes` reports the FABRICATED token as
 *  present and exonerates it. `\b` is also insufficient, because in "52.215-22" the "." before "215" is
 *  itself a word boundary. The guard has to be an explicit not-adjacent-to-[.\d-] on both sides. */
export function numberPresentInSource(num: string, source: string): boolean {
  if (!num || !source) return false;
  const esc = num.replace(/[.\-]/g, "\\$&");
  return new RegExp(`(?<![-.\\d])${esc}(?![-.]?\\d)`).test(source);
}

/** An ascending numeric range, not a section number: "13 CFR 121-128" is parts 121 THROUGH 128, legitimate
 *  prose that appears in the engine's own corrective annotations. "215-2" is not ascending and is not a
 *  range. A shape test, not a vocabulary list. */
export function looksLikePartRange(num: string): boolean {
  const m = /^(\d{2,4})-(\d{1,3})$/.exec(num);
  if (!m) return false;
  const lo = Number(m[1]), hi = Number(m[2]);
  return hi > lo;
}

/** Which authorities does the SOURCE itself pair this number with? Empty when the number appears bare.
 *  This is what makes the deferral below safe: "the number is in the document" is not the same claim as
 *  "the document attributes it to the authority we printed". */
export function corporaPairedInSource(num: string, source: string): Set<string> {
  const out = new Set<string>();
  if (!num || !source) return out;
  const esc = num.replace(/[.\-]/g, "\\$&");
  const re = new RegExp(`(${CORPUS_WORD})[\\s,]*(?:part|subpart|section|clause|table|§)?\\s*${esc}(?![-.]?\\d)`, "gi");
  for (const m of source.matchAll(re)) {
    const key = m[1].replace(/\./g, "").toUpperCase();
    out.add(CORPUS_ALIAS[key] ?? key);
  }
  return out;
}

export type TokenVerdict =
  | { state: "ok" }
  | { state: "ok_quoted_from_source" }              // malformed, but the document itself prints this pairing
  | { state: "ok_part_range" }
  | { state: "withheld"; reason: string; alsoValidFor: string[] };

/** Adjudicate ONE token. Pure. The trigger is GRAMMAR; range and source-presence only ever EXONERATE. */
export function judgeToken(tok: RegulationToken, source: string): TokenVerdict {
  const grammar = CORPUS_GRAMMAR[tok.corpus];
  if (!grammar) return { state: "ok" };                      // corpus we do not govern — never invent a verdict
  if (grammar.test(tok.number)) return { state: "ok" };
  if (looksLikePartRange(tok.number)) return { state: "ok_part_range" };

  const alsoValidFor = Object.entries(CORPUS_GRAMMAR)
    .filter(([k, re]) => k !== tok.corpus && re.test(tok.number))
    .map(([k]) => k);

  if (numberPresentInSource(tok.number, source)) {
    const paired = corporaPairedInSource(tok.number, source);
    // DEFER TO THE DOCUMENT — but only when the document does not contradict us. A bare number, or one the
    // record itself attributes to this same authority, means the engine is quoting a (possibly sloppy)
    // solicitation rather than inventing, and reporting what the document says is the job.
    if (paired.size === 0 || paired.has(tok.corpus)) return { state: "ok_quoted_from_source" };
    // The number IS in the record, under a DIFFERENT authority. That is the body swap the spec named, and
    // deferring here would let the document's own text launder a re-prefixing the document never made.
    return {
      state: "withheld",
      reason: `"${tok.number}" is not a valid ${tok.corpus} designation; the solicitation attributes it to ${[...paired].join("/")}`,
      alsoValidFor,
    };
  }

  return {
    state: "withheld",
    reason: `"${tok.number}" is not a valid ${tok.corpus} designation and does not appear in the solicitation`,
    alsoValidFor,
  };
}

/** The customer-visible replacement. NEVER a silent scrub: an omission the reader cannot see is a claim
 *  about the world they did not consent to (the same principle that makes an uncomputed default a
 *  fabrication). The obligation text around it is preserved verbatim. */
export function withholdMarker(tok: RegulationToken, v: Extract<TokenVerdict, { state: "withheld" }>): string {
  const alt = v.alsoValidFor.length ? `; the number is a valid ${v.alsoValidFor.join("/")} form` : "";
  return `[citation withheld — ${v.reason}${alt}]`;
}

/** Engine-authored withholding markers, for callers that PARSE a citation structurally rather than display
 *  it. `findingSection` scans a citation for a bare UCF letter with `/([A-M])\b/i`; the marker's own prose
 *  ("…withhel**d** —") matches, so a gated citation would report section "D" where the original reported
 *  none, and replay coverage would drift from the live run. One exported definition so no caller re-invents
 *  it. (Review finding #4 on PR #294.) */
const WITHHOLD_MARKER_RE = /\[citation withheld[^\]]*\]/g;
export function stripWithholdMarkers(text: string): string {
  return (text ?? "").replace(WITHHOLD_MARKER_RE, " ").replace(/\s{2,}/g, " ").trim();
}

export interface CitationGateResult {
  text: string;
  withheld: Array<{ raw: string; corpus: string; number: string; reason: string; field?: string }>;
}

/** Apply the gate to one string. Replacements run RIGHT-TO-LEFT so earlier token offsets stay valid. */
export function gateCitationsInText(text: string, source: string, field?: string): CitationGateResult {
  const withheld: CitationGateResult["withheld"] = [];
  if (!text) return { text, withheld };
  const toks = extractRegulationTokens(text);
  let out = text;
  for (let i = toks.length - 1; i >= 0; i--) {
    const tok = toks[i];
    const v = judgeToken(tok, source);
    if (v.state !== "withheld") continue;
    out = out.slice(0, tok.start) + withholdMarker(tok, v) + out.slice(tok.end);
    withheld.unshift({ raw: tok.raw.trim(), corpus: tok.corpus, number: tok.number, reason: v.reason, field });
  }
  return { text: out, withheld };
}

/** The shape the orchestrator applies. Structural typing keeps this module free of a TypedFinding import so
 *  it stays testable in isolation and cannot pull the engine graph into a unit test. */
export interface CitationGateable { citation?: string; requirement?: string; excerpt?: string }

/** Gate a finding set. Flag-OFF ⇒ the SAME array reference back, so byte-identity is structural rather than
 *  a property a test has to keep re-proving.
 *
 *  `excerpt` is deliberately NOT gated. It is already verbatim-grounded against the source, so any token
 *  inside it is present in the record by construction; rewriting it would corrupt the one field whose whole
 *  value is that it was not rewritten. */
export function gateFindingCitations<T extends CitationGateable>(
  findings: T[],
  source: string,
  opts?: { enabled?: boolean },
): { findings: T[]; withheld: CitationGateResult["withheld"]; touched: number } {
  const on = opts?.enabled ?? citationFidelityEnabled();
  if (!on || !findings?.length) return { findings, withheld: [], touched: 0 };

  const withheld: CitationGateResult["withheld"] = [];
  let touched = 0;
  const out = findings.map((f) => {
    const c = gateCitationsInText(f.citation ?? "", source, "citation");
    const r = gateCitationsInText(f.requirement ?? "", source, "requirement");
    if (!c.withheld.length && !r.withheld.length) return f;
    touched++;
    withheld.push(...c.withheld, ...r.withheld);
    const next: T = { ...f };
    if (c.withheld.length) (next as CitationGateable).citation = c.text;
    if (r.withheld.length) (next as CitationGateable).requirement = r.text;
    return next;
  });
  return { findings: out, withheld, touched };
}
