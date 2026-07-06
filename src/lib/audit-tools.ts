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
    const i = norm(ctx.fullSource).indexOf(norm(clause));
    if (i >= 0) excerpt = ctx.fullSource.slice(Math.max(0, i - 80), i + 240).replace(/\s+/g, " ").trim();
  }
  return { clause, present, excerpt };
}

/** Tool — find verbatim source spans containing a phrase (grounding). Returns up to `limit` excerpts; an
 *  empty list means the phrase is NOT in the document — so a claim resting on it is ungrounded. */
export function findInSource(ctx: AuditToolContext, phrase: string, limit = 3): { phrase: string; hits: string[] } {
  const src = ctx.fullSource, nSrc = norm(src), nPhrase = norm(phrase);
  const hits: string[] = [];
  if (nPhrase.length >= 3) {
    let from = 0;
    while (hits.length < limit) {
      const i = nSrc.indexOf(nPhrase, from);
      if (i < 0) break;
      hits.push(src.slice(Math.max(0, i - 60), i + nPhrase.length + 120).replace(/\s+/g, " ").trim());
      from = i + nPhrase.length;
    }
  }
  return { phrase, hits };
}

/** The tool DEFINITIONS the agentic expert is given (Anthropic tool-use schema). The expert calls these
 *  in its react loop; the harness executes them deterministically via runAuditTool. */
export const AUDIT_TOOLS = [
  { name: "read_section", description: "Read the text of a UCF section (A–M) of this solicitation. Use to inspect §C specs, §L instructions, §M evaluation, §I clauses, §B pricing, etc. before asserting any requirement.", input_schema: { type: "object", additionalProperties: false, required: ["key"], properties: { key: { type: "string", description: "UCF section letter, e.g. C, L, M, I, B" } } } },
  { name: "lookup_clause", description: "Check whether a FAR/DFARS clause number is LITERALLY present in this solicitation's source, and get a grounding excerpt. NEVER cite a clause this reports absent.", input_schema: { type: "object", additionalProperties: false, required: ["clause"], properties: { clause: { type: "string", description: "Clause number, e.g. 52.219-6 or 252.225-7001" } } } },
  { name: "find_in_source", description: "Find verbatim spans of the document containing a phrase, to GROUND a finding in the exact source text. An empty result means the phrase is not in the document.", input_schema: { type: "object", additionalProperties: false, required: ["phrase"], properties: { phrase: { type: "string", description: "The exact phrase to locate in the source" } } } },
] as const;

/** Dispatch a tool call from the expert loop to its deterministic executor. Pure, $0. */
export function runAuditTool(ctx: AuditToolContext, name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "read_section": return readSection(ctx, String(input.key ?? ""));
    case "lookup_clause": return lookupClause(ctx, String(input.clause ?? ""));
    case "find_in_source": return findInSource(ctx, String(input.phrase ?? ""));
    default: return { error: `unknown tool: ${name}` };
  }
}

export { CLAUSE_RE };
