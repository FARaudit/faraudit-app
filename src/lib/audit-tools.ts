// ── AGENTIC VERIFICATION ENGINE · Layer-1 substrate: the EXPERT TOOL SURFACE ─────────────────────────
// Code discovery (Brain card 43): the engine had structured outputs but ZERO tool infrastructure — the
// "experts" were single structured-output calls with no tools and no loop. THIS is the layer that was
// missing. These are the client-side, deterministic, $0 tools an agentic expert calls IN A LOOP to GROUND
// every claim in the actual document (Anthropic's gather → act-with-tools → verify → iterate). No more
// single stuffed call. The tools read the already-extracted source (no network, no model) — so grounding
// is a fact the harness can verify, not something the model asserts.

import { detectSections, type FormatType } from "./section-boundary-detector";
import { makeClauseSourceChecker } from "./agentic-sections";
import type { ConstructionManifest } from "./audit-construction-manifest";
import { isBindingDoc } from "./sam-attachments";
import { isEnvOn } from "./env-flags";

const asDoc = (text: string) => ({
  pages: [{ pageNum: 1, text, lines: text.split("\n").map((l) => l.trim()).filter(Boolean) }],
  rawText: text, pageCount: 1, extractionMethod: "fallback" as const, warnings: [],
});

export interface AuditToolContext {
  fullSource: string;                 // the assembled package source (every routed section + attachment)
  sections?: Record<string, string>;  // optional precomputed UCF section → text (else derived on demand)
  fetchedDocs?: string[];             // titles/filenames of the documents actually fetched+assembled (production
                                      // assembly populates this) — reconciled against the manifest so a small
                                      // material attachment going unfetched caps a no-bar verdict (Brain card-59)
  // Brain card 288 — SEALED construction (SF-1442 / Part-36) binding-content manifest, computed at ingest over each
  // doc's FULL text PRE-compression (audit-construction-manifest.sweepConstructionManifest). Present ONLY when
  // AUDIT_CONSTRUCTION_SWEEP is on. The part36 completeness carrier reads THIS (sealed full-text), never the digest.
  constructionManifest?: ConstructionManifest;
  // Brain card 291 — GROUNDING GUARDRAIL. The STORED FULL TEXT (pre-compression, all docs concatenated) used to
  // GROUND findings (Rule-64 offset match), while the model-facing `fullSource` may be the compressed digest —
  // "digest routes, source grounds". Present only on the per-doc-decomposition path (AUDIT_PERDOC_DECOMP); when
  // absent, grounding falls back to fullSource (byte-identical). Deterministic substring only — an 11MB corpus is fine.
  groundingSource?: string;
}

const sectionsOf = (ctx: AuditToolContext): Record<string, string> => {
  if (ctx.sections) return ctx.sections;
  const out: Record<string, string> = {};
  try { for (const [k, s] of Object.entries(detectSections(asDoc(ctx.fullSource)).sections)) if (s.text?.trim()) out[k] = s.text.trim(); } catch { /* ignore */ }
  return out;
};

/** Materialize the deterministic section map (the same map readSection/coreMissingFor read). L3 uses this to
 *  merge agentic-located sections over the deterministic base and pin the result onto ctx.sections so every
 *  downstream reader (experts · coverage · coreMissingFor) transparently sees the located §L/§M. */
export function materializeSections(ctx: AuditToolContext): Record<string, string> {
  return { ...sectionsOf(ctx) };
}

const CLAUSE_RE = /\b2?52\.\d{3}-\d{1,4}\b/;
const norm = (s: string) => s.replace(/[‐-―]/g, "-").replace(/\s+/g, " ").toLowerCase();

// T1-6 — the same normalization as `norm`, but carrying an index map so a match
// offset in the NORMALIZED string can be mapped back to the ORIGINAL string.
// `norm` collapses whitespace runs (\s+ → " "), which shifts every offset past
// the first collapsed run; slicing the original source at a normalized offset
// therefore drifts the grounding excerpt off the real match (worse on the
// whitespace-dense text PDFs produce). `map[k]` = original index of normalized
// char k; `map[normed.length]` = src.length (the end boundary).
function normWithMap(s: string): { normed: string; map: number[] } {
  let normed = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (/\s/.test(c)) {
      if (!prevSpace) { normed += " "; map.push(j); prevSpace = true; }
      continue;
    }
    prevSpace = false;
    const rep = /[‐-―]/.test(c) ? "-" : c.toLowerCase();
    for (const rc of rep) { normed += rc; map.push(j); }
  }
  map.push(s.length);
  return { normed, map };
}

/** The procurement FORMAT of the assembled package. Negotiated full-UCF mandates
 *  §C/§L/§M as SEPARATE sections; commercial (SF-1449) / simplified (SF-18) /
 *  combined-synopsis state specs + 52.212-1/-2 INLINE or by reference, so an absent
 *  separate section there is expected, not a gap. Used to avoid a false "core
 *  section not found" scare on commercial/simplified RFQs. */
export function detectFormat(ctx: AuditToolContext): FormatType {
  try { return detectSections(asDoc(ctx.fullSource)).formatDetected; } catch { return "unknown"; }
}

/** The procurement PART — the single deterministic format classification, derived OFF detectFormat (the one
 *  source; no parallel surface). Part-12 (commercial: SF-1449 / SF-18 / combined-synopsis) states instructions +
 *  evaluation via 52.212-1/-2 INLINE or by reference; Part-15 (UCF) mandates §C/§L/§M as SEPARATE sections.
 *  Brain card 135 Step 8 — coreMissing keys off THIS, extending fail-safe #10 (never a parallel format surface). */
export type ProcurementPart = "part12-commercial" | "part15-ucf" | "part36-construction" | "unknown";
export function procurementPart(ctx: AuditToolContext): ProcurementPart {
  // Brain card 288 — SINGLE-SOURCE construction classification off the sealed manifest (set at ingest from the
  // SF-1442 header + NAICS sector-23). Flag-gated: AUDIT_FORMAT_PART36 OFF or no manifest ⇒ falls through to the
  // UCF/commercial/unknown detection below (prod byte-identical). No parallel format surface — the manifest is the
  // one construction signal, computed over FULL doc text, so a stray "SF 1442" string in an attachment can't flip a
  // services buy (isConstruction requires the header OR NAICS-23 at sweep time).
  if (process.env.AUDIT_FORMAT_PART36 === "true" && ctx.constructionManifest?.isConstruction) return "part36-construction";
  switch (detectFormat(ctx)) {
    case "UCF": return "part15-ucf";
    case "SF-1449-RFQ":
    case "SF-18":
    case "combined-synopsis": return "part12-commercial"; // detectSections EMITS "combined-synopsis" for a BARE
                                                           // combined synopsis (FAR 12.603 boilerplate) under the
                                                           // AUDIT_PROCUREMENT_TYPE_SECTIONS flag (default-OFF ⇒ falls
                                                           // to `unknown`, prod byte-identical). A form-headed
                                                           // commercial doc still classifies via SF-1449/SF-18 above.
    default: return "unknown";
  }
}

// Layer-2 (Brain card 262) — does this SAM notice type require the proposal sections §L (instructions) and
// §M (evaluation)? A SOLICITATION-type buy does; market-research / notice-only types (Sources Sought, RFI,
// Presolicitation, Special Notice, Award) do NOT. FAIL-SAFE default: null/unknown/upload → TRUE (require them,
// so a SOW-only source whose §L/§M-bearing notice body was never ingested caps to INCOMPLETE, never false-COMPLETE).
const NON_SOLICITATION_TYPE_RE = /sources\s*sought|\brfi\b|request for information|presolicitation|pre-solicitation|special notice|award notice|\baward\b|justification|intent to|sole source notice/i;
export function requiresProposalSections(noticeType: string | null | undefined): boolean {
  const t = (noticeType ?? "").trim();
  if (!t) return true;                       // unknown / upload → fail-safe: require §L/§M
  return !NON_SOLICITATION_TYPE_RE.test(t);  // solicitation / combined synopsis / RFQ / RFP → require
}

// C-3 (Brain C.c) — the LENS read-cap. A read_section tool result is bounded to keep each expert turn within its
// token budget; `truncated` tells the expert (and the completeness proof) that it is seeing a SLICE, so a bar past
// the cap is not silently invisible. The COMPLETENESS proof does NOT read this capped view — it reads the FULL
// section (sectionFullText) so an obligation past the cap surfaces as ungrounded ⇒ INCOMPLETE, never a false COMPLETE.
export const SECTION_READ_CAP = 12000;

/** Tool — read a UCF section's text. The expert reads only what it needs (just-in-time), never a stuffed dump.
 *  `truncated` = the full section exceeds the lens read-cap (the expert saw only the first SECTION_READ_CAP chars). */
export function readSection(ctx: AuditToolContext, key: string): { key: string; present: boolean; text: string; truncated: boolean } {
  const s = sectionsOf(ctx)[(key || "").toUpperCase()] ?? "";
  return { key: (key || "").toUpperCase(), present: !!s, text: s.slice(0, SECTION_READ_CAP), truncated: s.length > SECTION_READ_CAP };
}

/** The FULL text of a section (uncapped) — used by the completeness proof so no obligation is invisible to it,
 *  even one past the lens read-cap. Not a lens tool (the lens stays budgeted via readSection). */
export function sectionFullText(ctx: AuditToolContext, key: string): string {
  return sectionsOf(ctx)[(key || "").toUpperCase()] ?? "";
}

/** Tool — is a FAR/DFARS clause literally in the source? Returns presence + a grounding excerpt around it.
 *  Deterministic (Rule 64) — the expert CANNOT cite a clause this says is absent. */
export function lookupClause(ctx: AuditToolContext, clause: string): { clause: string; present: boolean; excerpt: string } {
  const inSrc = makeClauseSourceChecker(ctx.fullSource);
  const present = inSrc(clause);
  let excerpt = "";
  if (present) {
    // T1-6 — map the normalized match offset back to the ORIGINAL source so the
    // grounding excerpt is aligned to the real clause, not drifted by collapsed
    // whitespace (this excerpt also backs T0-1's anti-false-present grounding).
    const { normed, map } = normWithMap(ctx.fullSource);
    const nClause = norm(clause);
    const i = normed.indexOf(nClause);
    if (i >= 0) {
      const origStart = map[i];
      const origEnd = map[Math.min(i + nClause.length, map.length - 1)];
      excerpt = ctx.fullSource.slice(Math.max(0, origStart - 80), origEnd + 240).replace(/\s+/g, " ").trim();
    }
  }
  return { clause, present, excerpt };
}

/** Tool — find verbatim source spans containing a phrase (grounding). Returns up to `limit` excerpts; an
 *  empty list means the phrase is NOT in the document — so a claim resting on it is ungrounded. */
export function findInSource(ctx: AuditToolContext, phrase: string, limit = 3): { phrase: string; hits: string[] } {
  const src = ctx.fullSource;
  // T1-6 — locate in the normalized string but map each hit back to ORIGINAL
  // offsets before slicing, so the excerpt is aligned to the real match instead
  // of drifting left by the collapsed-whitespace delta.
  const { normed: nSrc, map } = normWithMap(src);
  const nPhrase = norm(phrase);
  const hits: string[] = [];
  if (nPhrase.length >= 3) {
    let from = 0;
    while (hits.length < limit) {
      const i = nSrc.indexOf(nPhrase, from);
      if (i < 0) break;
      const origStart = map[i];
      const origEnd = map[Math.min(i + nPhrase.length, map.length - 1)];
      hits.push(src.slice(Math.max(0, origStart - 60), origEnd + 120).replace(/\s+/g, " ").trim());
      from = i + nPhrase.length;
    }
  }
  return { phrase, hits };
}

// ── ATTACHMENT COVERAGE (Brain #347 — read_document, flag AUDIT_ATTACHMENT_COVERAGE) ────────────────────────
// ROOT (card #347): the lens toolset had NO read path to a binding document that isn't a UCF section — read_section
// reads A–M only, so a standalone binding ATTACHMENT (Security Requirements, RFI answers, a standalone SOW, a wage
// determination) was unreachable → 0 grounded findings in it → uncovered → false-ish INCOMPLETE. read_document gives
// the lens that path. Flag-gated: the tool is exposed ONLY when the flag is on ⇒ flag-OFF tool list is byte-identical.
export const ATTACHMENT_COVERAGE_ENABLED = isEnvOn(process.env.AUDIT_ATTACHMENT_COVERAGE);

/** ReDoS-PROOF parse of the assembled source into DOCUMENT regions (Gauntlet #349 R3). The delimiter
 *  "==== DOCUMENT: name ====" is always written on its OWN line by assembleFullSource, so we scan LINE-BY-LINE with
 *  pure string ops (startsWith/endsWith/slice) — never a backtracking regex. The prior split regex (.+?)/([^=]{1,300}?)
 *  with \s+…\s+ around a whitespace-matching class was empirically quadratic (16k spaces ≈ 43s). A line that does NOT
 *  both start and end with "====" is rejected in O(1), so a pathological whitespace run can't blow up. Byte-identical
 *  regions to the old split on well-formed input. Exported + shared so audit-orchestrator.docRegions uses the same. */
const DOC_NAME_RE = /^DOCUMENT:\s*(.+)$/; // runs ONLY on the bounded inner slice between the ==== fences — linear, no overlap
export function parseDocRegions(src: string): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  let name: string | null = null;
  let buf: string[] = [];
  for (const line of (src ?? "").split("\n")) {
    const t = line.trim();
    let hitName: string | null = null;
    if (t.length >= 8 && t.startsWith("====") && t.endsWith("====")) {
      const inner = t.slice(4, -4).trim();
      const m = DOC_NAME_RE.exec(inner);
      if (m) hitName = m[1].trim();
    }
    if (hitName !== null) { if (name !== null) out.push({ name, text: buf.join("\n") }); name = hitName; buf = []; }
    else if (name !== null) buf.push(line);
  }
  if (name !== null) out.push({ name, text: buf.join("\n") });
  return out;
}

// PRIMARY-DOCUMENT IDENTITY (Gauntlet Card #370 RULING 1 — write-order primary detection is a defect, same failure
// class as amendment/supersession blindness: on an amended multi-doc buy assembleFullSource may write an amendment
// FIRST, so `i === 0` tags the amendment as the solicitation and the real solicitation as an attachment). resolvePrimary
// keys the primary off DOCUMENT IDENTITY, not write-order: a solicitation FORM (SF-1449/1442/33/18) or UCF section
// density scores a doc as the primary; an AMENDMENT marker (SF-30 / "AMENDMENT OF SOLICITATION" / am_/mod filename)
// DISQUALIFIES a doc from primary candidacy outright — even one that copies the base solicitation's form. Fail-toward:
// when no doc confidently qualifies (`confident=false`), the CALLER routes to a manifest/readability honest-fail (NHR),
// never a silent first-doc default. Head-scan only (forms/UCF headers live at the top) → linear, $0.
const SOLICITATION_FORM_RE = /\bSF ?1449\b|SOLICITATION\/CONTRACT\/ORDER FOR COMMERCIAL|STANDARD FORM 1449|\bSF ?1442\b|SOLICITATION,? OFFER,? AND AWARD|STANDARD FORM 1442|\bSF ?33\b|STANDARD FORM 33|\bSF ?18\b|REQUEST FOR QUOTATIONS?\b/i;
// SF-30 amendment IDENTITY — the SF-30 form TITLE ("AMENDMENT OF SOLICITATION/MODIFICATION OF CONTRACT") or the form
// number, in the doc HEAD only (the form title sits at the very top). Deliberately NOT a bare "AMENDMENT OF SOLICITATION"
// substring: that phrase appears in base-solicitation §L amendment-acknowledgment instructions (52.215-1/52.214-3, SF-1449
// block 14) and a loose match would FALSE-DISQUALIFY the real primary → spurious primaryIndeterminate/NHR (Card #370
// code-review finding). Named amendments (am_/amd/mod + digit) are caught by filename regardless; this body regex is the
// backstop for an UN-named SF-30. Blind-ultracode #372 fixes: (1) match the SF-30 form TITLE only (drop the bare
// "standard form 30" substring, which a CONFORMED base solicitation can carry in its amendment-acknowledgment block →
// false-disqualify); (2) scan the SAME 20000-char head window resolvePrimary uses — a 3000-char window let a cover-paged
// SF-30 (title past char 3000) evade disqualification while its "Request for Quotations" body still scored it as primary.
const AMENDMENT_DOC_RE = /amendment of solicitation[\s\/]{0,3}modification of contract\b/i;
const AMENDMENT_NAME_RE = /(?:^|[^a-z])(?:am|amd|amend(?:ment)?|mod(?:ification)?)[_\- .]?\d/i;
const isAmendmentRegion = (r: { name: string; text: string }) =>
  AMENDMENT_NAME_RE.test(r.name) || AMENDMENT_DOC_RE.test(r.text.slice(0, 20000));
/** Pick the primary solicitation region by IDENTITY (Card #370 R1). Returns the chosen index and whether the pick is
 *  CONFIDENT (a real solicitation form / strong UCF structure was found on a non-amendment doc). `confident=false` on a
 *  multi-doc package means no doc looks like the solicitation → the caller must fail-toward NHR. `index` is a best-effort
 *  non-amendment fallback purely so downstream region math stays total; it is NEVER trusted when confident=false. */
export function resolvePrimary(regions: Array<{ name: string; text: string }>): { index: number; confident: boolean } {
  if (regions.length === 0) return { index: -1, confident: false };
  if (regions.length === 1) return { index: 0, confident: true };
  let best = -1, bestScore = -1;
  regions.forEach((r, i) => {
    if (isAmendmentRegion(r)) return;                                   // amendment markers DISQUALIFY from primary
    const head = r.text.slice(0, 20000);
    // UCF density: LINE-ANCHORED "SECTION X" headers only (a real UCF solicitation prints them as headings), NOT inline
    // "see Section C" cross-references — else a compliance-matrix / flow-down attachment that merely cites UCF sections
    // could out-score the true solicitation and be confidently mis-picked as primary (Card #370 code-review finding).
    const ucf = Math.min((r.text.match(/^\s*SECTION [A-M]\b/gim) || []).length, 13);
    const score = (SOLICITATION_FORM_RE.test(head) ? 100 : 0) + ucf * 5;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  // CONFIDENT only when a real solicitation form OR strong UCF density (≥5 sections) was found on a non-amendment doc.
  if (best >= 0 && bestScore >= 25) return { index: best, confident: true };
  const firstNonAmend = regions.findIndex((r) => !isAmendmentRegion(r)); // best-effort fallback (NHR-routed, never trusted)
  return { index: firstNonAmend >= 0 ? firstNonAmend : 0, confident: false };
}

/** DOCUMENT regions with the isPrimary flag. Parses the "==== DOCUMENT: name ====" delimiter that ONLY fullSource
 *  carries (assembleFullSource writes one per doc when >1). groundingSource is the delimiter-less `docs.join` used for
 *  substring GROUNDING, so region-parsing it would collapse to a single primary and readDocument could never resolve a
 *  named attachment (the feature would be INERT). In the live LOSSLESS path fullSource IS the whole binding text.
 *  Single-doc / no-delimiter ⇒ the whole source is primary. (Gauntlet #350 R6 — reverts the R3 groundingSource
 *  preference; region parsing needs delimiters, not raw full text.) PRIMARY pick: identity-based (resolvePrimary,
 *  Card #370 R1) when the attachment-coverage flag is ON; write-order `i === 0` when OFF (flag-OFF byte-identical). */
function docRegionsOf(ctx: AuditToolContext): Array<{ name: string; text: string; isPrimary: boolean }> {
  const src = ctx.fullSource ?? "";
  const regions = parseDocRegions(src);
  if (regions.length === 0) return [{ name: "(primary solicitation)", text: src, isPrimary: true }];
  const primaryIdx = ATTACHMENT_COVERAGE_ENABLED ? resolvePrimary(regions).index : 0;
  return regions.map((r, i) => ({ ...r, isPrimary: i === primaryIdx }));
}

/** The BINDING attachments the coverage checklist (C) requires the panel to read — every non-primary document region
 *  that isBindingDoc accepts (a genuine binding attachment, not an offeror-fill/reference form). Pure, $0. */
export function listBindingDocuments(ctx: AuditToolContext): string[] {
  return docRegionsOf(ctx)
    .filter((r) => !r.isPrimary && isBindingDoc({ role: "attachment", name: r.name }))
    .map((r) => r.name);
}

// A binding attachment is read WHOLE on-demand (one doc per tool call), so it gets a larger cap than a UCF section
// slice — sized so a typical SOW / security-requirements / wage-determination attachment fits in one read and can be
// honestly attested. `truncated` stays honest for a genuine giant; the caller MUST treat a truncated read as NOT
// provably-read-whole (Gauntlet #349 blocker F1) so a no-obligation attestation over a partial view can't cover it.
export const DOC_READ_CAP = Number(process.env.AGENTIC_DOC_READ_CAP) || 40000;
/** Tool (A) — read a binding ATTACHMENT's text by name (fuzzy: case-insensitive substring, min 4 chars, either
 *  direction), so the lens can ground obligations that live outside the UCF sections read_section covers. `truncated`
 *  = the doc exceeds DOC_READ_CAP (a partial read — NOT provably-read-whole). Deterministic, $0. */
export function readDocument(ctx: AuditToolContext, name: string): { name: string; present: boolean; text: string; truncated: boolean } {
  const q = (name || "").toLowerCase().replace(/\s+/g, " ").trim();
  const regions = docRegionsOf(ctx).filter((r) => !r.isPrimary);
  // Match on exact, or substring EITHER direction but only for a query of real length (a 1–3 char query must not
  // fuzzy-match every doc → wrong-doc read). Exact match always wins if present.
  const hit = regions.find((r) => r.name.toLowerCase() === q)
    ?? (q.length >= 4 ? regions.find((r) => { const n = r.name.toLowerCase(); return n.includes(q) || q.includes(n); }) : undefined);
  if (!hit) return { name, present: false, text: "", truncated: false };
  return { name: hit.name, present: true, text: hit.text.slice(0, DOC_READ_CAP), truncated: hit.text.length > DOC_READ_CAP };
}

/** The base tool DEFINITIONS the agentic expert is given (Anthropic tool-use schema). The expert calls these
 *  in its react loop; the harness executes them deterministically via runAuditTool. */
export const AUDIT_TOOLS = [
  { name: "read_section", description: "Read the text of a UCF section (A–M) of this solicitation. Use to inspect §C specs, §L instructions, §M evaluation, §I clauses, §B pricing, etc. before asserting any requirement.", input_schema: { type: "object", additionalProperties: false, required: ["key"], properties: { key: { type: "string", description: "UCF section letter, e.g. C, L, M, I, B" } } } },
  { name: "lookup_clause", description: "Check whether a FAR/DFARS clause number is LITERALLY present in this solicitation's source, and get a grounding excerpt. NEVER cite a clause this reports absent.", input_schema: { type: "object", additionalProperties: false, required: ["clause"], properties: { clause: { type: "string", description: "Clause number, e.g. 52.219-6 or 252.225-7001" } } } },
  { name: "find_in_source", description: "Find verbatim spans of the document containing a phrase, to GROUND a finding in the exact source text. An empty result means the phrase is not in the document.", input_schema: { type: "object", additionalProperties: false, required: ["phrase"], properties: { phrase: { type: "string", description: "The exact phrase to locate in the source" } } } },
] as const;

/** The read_document tool (A) — appended to the tool list ONLY when AUDIT_ATTACHMENT_COVERAGE is on. */
export const READ_DOCUMENT_TOOL = { name: "read_document", description: "Read the full text of a named binding ATTACHMENT (e.g. a Statement of Work, Security Requirements, answered RFI, wage determination) that is NOT a UCF section. Use to ground obligations that live in attachments. An absent result means no such document is in the package.", input_schema: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string", description: "The attachment name or a distinctive substring of it" } } } } as const;

/** The tool list for a lens run — base tools, plus read_document when attachment coverage is enabled. Flag-OFF ⇒
 *  identical to AUDIT_TOOLS (byte-for-byte), so prod is unchanged until the capability is Gauntleted on. */
export function auditToolsFor(enabled: boolean = ATTACHMENT_COVERAGE_ENABLED): ReadonlyArray<typeof AUDIT_TOOLS[number] | typeof READ_DOCUMENT_TOOL> {
  return enabled ? [...AUDIT_TOOLS, READ_DOCUMENT_TOOL] : AUDIT_TOOLS;
}

/** Dispatch a tool call from the expert loop to its deterministic executor. Pure, $0. */
export function runAuditTool(ctx: AuditToolContext, name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "read_section": return readSection(ctx, String(input.key ?? ""));
    case "lookup_clause": return lookupClause(ctx, String(input.clause ?? ""));
    case "find_in_source": return findInSource(ctx, String(input.phrase ?? ""));
    case "read_document": return readDocument(ctx, String(input.name ?? ""));
    default: return { error: `unknown tool: ${name}` };
  }
}

export { CLAUSE_RE };
