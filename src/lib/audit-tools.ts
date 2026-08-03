// ── AGENTIC VERIFICATION ENGINE · Layer-1 substrate: the EXPERT TOOL SURFACE ─────────────────────────
// Code discovery (Brain card 43): the engine had structured outputs but ZERO tool infrastructure — the
// "experts" were single structured-output calls with no tools and no loop. THIS is the layer that was
// missing. These are the client-side, deterministic, $0 tools an agentic expert calls IN A LOOP to GROUND
// every claim in the actual document (Anthropic's gather → act-with-tools → verify → iterate). No more
// single stuffed call. The tools read the already-extracted source (no network, no model) — so grounding
// is a fact the harness can verify, not something the model asserts.

import { detectSections, type FormatType } from "./section-boundary-detector";
import { extractLaborStandardsBlocks, makeClauseSourceChecker } from "./agentic-sections";
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
  // B3 (Brain card 421 Fork-3) — the raw SAM notice-body text (solicitation.description), threaded from the executor
  // so the notice-body eligibility floor scans it directly, delimiter-independent (a single-doc package drops the
  // "==== DOCUMENT ====" delimiter, so a synopsis-only notice is otherwise unfindable by name). Absent ⇒ the floor
  // falls back to the named region in fullSource, and (flag-OFF) is never read at all → byte-identical.
  noticeBodyText?: string;
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

// UNIT 2.1 fix (ii), V3-engine instance (cards #548/#549) — same-class emission blindness via the read-cap:
// on dccce793 the routed §C slice was 63,785 chars with the embedded wage determination in its TAIL — beyond
// every lens's SECTION_READ_CAP view, so the pricing lens honestly reported the fringe rate "not stated in the
// provided text" while it sat in the unseen tail. Rescue: when the truncated tail carries labor-standards
// content (shape anchors — WD headers / 52.222-41 family / H&W rate lines), append those blocks to the lens
// view under an explicit marker. Additive-only over-provision (benign by ruling); `truncated` stays true (the
// read is still partial); the completeness proof is unaffected (it reads sectionFullText, uncapped).
// Flag OFF ⇒ byte-identical.
const SECTION_RESCUE_CAP = 12000; // rescued content bound — the lens view at most doubles, never unbounded
export const SECTION_RESCUE_MARKER = "[CONTENT-CLASS RESCUE — labor-standards content beyond the read cap]";
/** Tool — read a UCF section's text. The expert reads only what it needs (just-in-time), never a stuffed dump.
 *  `truncated` = the full section exceeds the lens read-cap (the expert saw only the first SECTION_READ_CAP chars). */
export function readSection(ctx: AuditToolContext, key: string): { key: string; present: boolean; text: string; truncated: boolean } {
  const s = sectionsOf(ctx)[(key || "").toUpperCase()] ?? "";
  let text = s.slice(0, SECTION_READ_CAP);
  const truncated = s.length > SECTION_READ_CAP;
  if (truncated && isEnvOn(process.env.AUDIT_LENS_EMISSION_INTEGRITY)) {
    const tail = s.slice(SECTION_READ_CAP);
    const { blocks, droppedForCap } = extractLaborStandardsBlocks(tail);
    if (blocks.length) {
      const joined = blocks.map((b) => b.text).join("\n\n");
      const cut = joined.length > SECTION_RESCUE_CAP;
      // R1-F6 (no-silent-caps): a mid-block cut and any dropped blocks are MARKED — the lens is told the
      // rescue is partial, never handed a silently-dissected table.
      const capNote = cut || droppedForCap > 0
        ? `\n[rescue truncated at cap${droppedForCap > 0 ? `; ${droppedForCap} additional block(s) not included` : ""} — content continues in the full section]`
        : "";
      text += `\n\n${SECTION_RESCUE_MARKER}\n${joined.slice(0, SECTION_RESCUE_CAP)}${capNote}`;
      if (cut || droppedForCap > 0) console.warn(`[read-rescue] §${(key || "").toUpperCase()}: labor-standards rescue partial (cut=${cut}, droppedBlocks=${droppedForCap})`);
    }
  }
  return { key: (key || "").toUpperCase(), present: !!s, text, truncated };
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

/** PRESENCE-ONLY counterpart to findInSource, for callers testing MANY phrases against ONE source.
 *  findInSource builds normWithMap(src) on EVERY call — a per-character loop plus a number[] the length of the
 *  source — because it must map hits back to original offsets to slice an excerpt. A caller that only needs
 *  yes/no pays that O(n) rebuild per phrase for an index it never reads; on a multi-megabyte package inside the
 *  parallel expert phase that is real blocking CPU on a paid path with a wall-clock budget.
 *  Normalize the source ONCE with normalizeForSearch, then test each phrase with phrasePresentInNormalized.
 *  Same normalization and the same >=3-char floor as findInSource's hit test, so the answer is identical —
 *  asserted in src/lib/audit-expert-grounding-telemetry.test.ts rather than assumed. */
export const normalizeForSearch = (s: string): string => norm(s);
export function phrasePresentInNormalized(normedSource: string, phrase: string): boolean {
  const p = norm(phrase);
  return p.length >= 3 && normedSource.includes(p);
}

// ── ATTACHMENT COVERAGE (Brain #347 — read_document, flag AUDIT_ATTACHMENT_COVERAGE) ────────────────────────
// ROOT (card #347): the lens toolset had NO read path to a binding document that isn't a UCF section — read_section
// reads A–M only, so a standalone binding ATTACHMENT (Security Requirements, RFI answers, a standalone SOW, a wage
// determination) was unreachable → 0 grounded findings in it → uncovered → false-ish INCOMPLETE. read_document gives
// the lens that path. Flag-gated: the tool is exposed ONLY when the flag is on ⇒ flag-OFF tool list is byte-identical.
export const ATTACHMENT_COVERAGE_ENABLED = isEnvOn(process.env.AUDIT_ATTACHMENT_COVERAGE);

// ── LENS DISCOVERY (flag AUDIT_LENS_DISCOVERY) ──────────────────────────────────────────────────────────────
// ROOT: the base toolset cannot ENUMERATE. read_section reads UCF A-M; lookup_clause needs a clause number;
// find_in_source searches the whole package but only for a phrase the lens already thought of. So a lens can REACH an
// attachment's text and still never learn the attachment exists. listBindingDocuments() is the enumerator, it is $0,
// and it is not a tool -- its single call site is gated to ONE lens behind ATTACHMENT_COVERAGE. Nine of ten lenses are
// therefore blind by construction, which is why "wage" appears in no lens prompt and the wage determination produced
// zero findings on four of four measured runs. Measured over 111 banked packages, 105 carry at least one binding
// attachment the other nine lenses were never told about (`scripts/audit-ai/_lens-02-discovery-live-inertness.ts`).
//
// SEPARATE FLAG, deliberately (CEO ruling 2026-08-03). Folding this into AUDIT_ATTACHMENT_COVERAGE would mean one arm
// ships two independent bets: this one (tell every lens what is in the package) and the coverage sweep (seeded
// full-text read + mandatory read-or-attest + the attestations schema property). They fail in different ways and
// deserve to be armed and reverted independently.
//
// Read at CALL time, not module load, so the two states are reachable in one process and the behaviour is testable
// without a subprocess -- the shape strictFindingsToolEnabled already uses.
export const lensDiscoveryEnabled = () => isEnvOn(process.env.AUDIT_LENS_DISCOVERY);

// parseDocRegions + resolvePrimary moved VERBATIM to primary-doc-resolve.ts (root-b U1, 2026-07-29) so the
// section detector can consult the SAME Card #370 election without an import cycle. Re-exported here so every
// existing consumer's import path is unchanged.
export { parseDocRegions, resolvePrimary } from "./primary-doc-resolve";
import { parseDocRegions, resolvePrimary } from "./primary-doc-resolve";

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
  // Identity-based primary pick under EITHER capability. Write-order `i === 0` is not merely imprecise here, it is
  // silently destructive in both directions: if the solicitation is not written first, the doc that IS first gets
  // mistaken for the primary and drops off listBindingDocuments entirely (unreachable by read_document too, since it
  // filters the same set), while the real solicitation is announced to every lens as an attachment. A wage
  // determination vanishing from the enumeration is precisely the failure lens discovery exists to fix, so the
  // feature cannot inherit a primary rule that can cause it.
  const primaryIdx = (ATTACHMENT_COVERAGE_ENABLED || lensDiscoveryEnabled()) ? resolvePrimary(regions).index : 0;
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
export function readDocument(ctx: AuditToolContext, name: string): { name: string; present: boolean; text: string; truncated: boolean; ambiguous?: boolean; candidates?: string[] } {
  const q = (name || "").toLowerCase().replace(/\s+/g, " ").trim();
  const regions = docRegionsOf(ctx).filter((r) => !r.isPrimary);
  // Match on exact, or substring EITHER direction but only for a query of real length (a 1–3 char query must not
  // fuzzy-match every doc → wrong-doc read). Exact match always wins if present.
  const exact = regions.find((r) => r.name.toLowerCase() === q);
  if (exact) return { name: exact.name, present: true, text: exact.text.slice(0, DOC_READ_CAP), truncated: exact.text.length > DOC_READ_CAP };
  const fuzzy = q.length >= 4 ? regions.filter((r) => { const n = r.name.toLowerCase(); return n.includes(q) || q.includes(n); }) : [];
  // AMBIGUITY IS NOT A TIE TO BREAK (review of #413). This used to `.find()` — take the FIRST fuzzy match and say
  // nothing — which turns a name the model could not have known was ambiguous into a confidently wrong read. The
  // announced names are truncated to 120 chars by the caller, so two attachments sharing a long prefix ("… Wage
  // Determination … Part 1 of 2" / "Part 2 of 2") render as the SAME label; a lens asking for the second silently got
  // the first, and because the excerpt genuinely is in fullSource the Rule 64 grounding backstop passes it. Return the
  // candidates instead and let the lens re-ask: honest-fail (Rule 61) applies to a tool result exactly as it applies
  // to a verdict. An EXACT name still wins above, so the coverage path's seeded reads are unaffected.
  if (fuzzy.length > 1) return { name, present: false, text: "", truncated: false, ambiguous: true, candidates: fuzzy.map((r) => r.name) };
  const hit = fuzzy[0];
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

/** The tool list for a lens run — base tools, plus read_document when EITHER attachment coverage or lens discovery is
 *  enabled. Discovery hands every lens the attachment NAME LIST, so it must also hand them the tool that opens one:
 *  naming a document a lens cannot then read is a worse prompt than saying nothing. BOTH flags OFF ⇒ returns
 *  AUDIT_TOOLS by identity (byte-for-byte, same prompt-cache prefix), so prod is unchanged until one is armed. */
export function auditToolsFor(
  enabled: boolean = ATTACHMENT_COVERAGE_ENABLED,
  discovery: boolean = lensDiscoveryEnabled(),
): ReadonlyArray<typeof AUDIT_TOOLS[number] | typeof READ_DOCUMENT_TOOL> {
  return (enabled || discovery) ? [...AUDIT_TOOLS, READ_DOCUMENT_TOOL] : AUDIT_TOOLS;
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
