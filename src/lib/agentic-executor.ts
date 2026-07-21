// Agentic executor adapter (flag-gated OFF) — wires the executor's inputs into
// the agentic engine and runs it as a NON-FATAL SHADOW (mirrors the V2 shadow
// pattern). When AUDIT_AGENTIC=true, the agentic path runs ALONGSIDE the live
// engine, logs its coverage line, and never affects the prod result. This is how
// the agentic engine earns its way to primary: shadow → preview → default, each
// step behind the review gate.
//
// Scalars (NAICS/set-aside/deadline) come from SAM here — facts-vs-analysis law —
// never from the model. Doc text is extracted with the SAME extractor the live
// engine uses (native text first; OCR for image-only).

import { extractText } from "./pdf-text-extractor";
import { type ScalarFacts, type AgenticDoc } from "./agentic-orchestrator";
import { auditPackage } from "./audit-package";
import { isBindingDoc } from "./sam-attachments";

/** The engine's "this is a real doc, not an empty read" floor: ≥ this many non-whitespace chars.
 *  Below it, coverage treats the read as a failure (never fabricated text). */
const MIN_DOC_TEXT_CHARS = 50;
const meaningfulLen = (s: string): number => s.replace(/\s/g, "").length;

/** L1 origin label for the ingested SAM notice-body doc — single source of truth so the executor's
 *  provenance tag, the buildAgenticDocs default, and the posted-file count exclusion never diverge. */
export const NOTICE_BODY_DOC_NAME = "SAM Notice Body";

/** Structural view of the SAM solicitation fields we need — kept minimal so any
 *  solicitation object satisfies it without coupling to the full type. */
interface SolScalarSource {
  naicsCode?: string | null;
  typeOfSetAside?: string | null;
  solicitationNumber?: string | null;
  responseDeadLine?: string | null;
  fullParentPathName?: string | null;
}

/** Deterministic SAM facts → ScalarFacts. Pure; no model. */
export function scalarsFromSolicitation(sol: SolScalarSource | null | undefined, agency?: string | null): ScalarFacts {
  const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    setAside: clean(sol?.typeOfSetAside),
    naicsCode: clean(sol?.naicsCode),
    solicitorNumber: clean(sol?.solicitationNumber),
    offerDueDate: clean(sol?.responseDeadLine),
    issuingOffice: clean(agency) ?? clean(sol?.fullParentPathName),
    contractType: null,       // not a SAM fact — left to the analysis layer
    periodOfPerformance: null, // not a SAM fact — left to the analysis layer
  };
}

/** Build the agentic doc set from the executor's primary + attachments. Bytes
 *  power content-hash dedup; text powers the MAP. Async (text extraction / OCR);
 *  no model calls. */
export async function buildAgenticDocs(opts: {
  primaryName: string;
  primaryBytes: Buffer | null;
  primaryText: string | null;
  // `text`, when present, is the extraction the SAM/upload assembler ALREADY produced
  // (pdf-parse / OCR) for this exact buffer — reused as `existing` so a scanned doc is
  // not OCR'd a SECOND time here (Brain #624-1 double-extraction fix). Absent/empty ⇒
  // extracted below exactly as before (byte-identical). Only carried for NON-truncated
  // buffers, so the reused text always corresponds to the delivered bytes.
  attachments: Array<{ name: string; base64: string; text?: string | null }> | null;
  // L1 (Brain card 264 Ruling 1) — the SAM-published notice body. For a combined-synopsis
  // buy the §L/§M/clauses/set-aside live ONLY here; it was resolved by FA-148 into
  // solicitation.description but never read into fullSource (the notice-body-blind
  // false-COMPLETE root). Ingested as a FIRST-CLASS doc (own hash / NOTICE_BODY origin),
  // placed after the primary form but ahead of attachments — see the placement note below.
  // Absent on uploads / fetch-failed (never fabricated).
  noticeBody?: { text: string; name?: string } | null;
}): Promise<AgenticDoc[]> {
  // Prefer text we ALREADY have (the live executor extracted the primary) — only
  // extract when it's missing/too-short. Avoids a second full parse+OCR pass of a
  // doc whose text the caller already holds. On failure, fall back to the existing
  // text, else empty (coverage flags empty as a read-failure — never fabricated).
  const textOf = async (bytes: Buffer, existing: string | null): Promise<string> => {
    if (existing && meaningfulLen(existing) >= MIN_DOC_TEXT_CHARS) return existing;
    try {
      const { rawText } = await extractText(bytes);
      if (rawText && meaningfulLen(rawText) >= MIN_DOC_TEXT_CHARS) return rawText;
    } catch {
      /* fall through to existing/empty */
    }
    return existing ?? "";
  };

  const docs: AgenticDoc[] = [];
  if (opts.primaryBytes) {
    docs.push({ name: opts.primaryName, bytes: opts.primaryBytes, text: await textOf(opts.primaryBytes, opts.primaryText) });
  }
  // L1 — insert the notice body AFTER the primary form but BEFORE the posted attachments.
  // Placement is load-bearing: the section-boundary detector treats [marker[0], marker[1])
  // (the text before the FIRST attachment delimiter) as the PRIMARY UCF region. Keeping a
  // posted form as docs[0] leaves that region the FORM — so a file-carried §L/§M is still
  // detected (the fully-read class does NOT regress to false-INCOMPLETE). When NO form was
  // posted the body IS docs[0] = the primary the engine reads (zero-attachment combined
  // synopsis). Either way the body now rides in fullSource (was orphaned in the description
  // field), so the lenses / Layer-3 finder can read the §L/§M that live there. Its own UTF-8
  // bytes give it its own content hash for the per-doc MAP extract cache + NOTICE_BODY origin
  // provenance. Skip a trivially-short body — coverage treats a near-empty read as a
  // read-failure, never fabricated text.
  const bodyText = opts.noticeBody?.text?.trim() ?? "";
  // DEDUP — when a combined synopsis is ALSO posted as a PDF, the primary's extracted text can
  // already CONTAIN the notice text; adding it again would double every §L/§M clause in fullSource
  // (doubled findInSource/lookupClause hits → verifier claim inflation). assembleFullSource does NOT
  // hash-dedup, so guard here: skip the body when the primary already subsumes it (normalized
  // containment, formatting-insensitive). Cheap and exact — never a fuzzy near-match that could drop
  // a genuinely distinct body.
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase().trim();
  const primaryNorm = docs.length ? norm(docs[0].text) : "";
  const bodyNorm = norm(bodyText);
  const subsumed = bodyNorm.length > 0 && primaryNorm.includes(bodyNorm);
  if (meaningfulLen(bodyText) >= MIN_DOC_TEXT_CHARS && !subsumed) {
    docs.push({ name: opts.noticeBody?.name ?? NOTICE_BODY_DOC_NAME, bytes: Buffer.from(bodyText, "utf8"), text: bodyText });
  }
  // Extract attachments with bounded concurrency (was a sequential await-per-doc
  // loop — minutes of serial OCR on a 33-doc package).
  const attachments = opts.attachments ?? [];
  const CONCURRENCY = 4;
  for (let i = 0; i < attachments.length; i += CONCURRENCY) {
    const batch = attachments.slice(i, i + CONCURRENCY);
    const built = await Promise.all(
      batch.map(async (a): Promise<AgenticDoc> => {
        const bytes = Buffer.from(a.base64, "base64");
        return { name: a.name, bytes, text: await textOf(bytes, a.text ?? null) };
      })
    );
    docs.push(...built);
  }
  return docs;
}

/** Run the agentic engine as a non-fatal shadow. Returns the result, or null on
 *  any error (logged, never thrown) so it can never affect the live audit. */
// [V1/shadow purged 2026-06-28 — A4] runAgenticShadow() removed — engine is 100% agentic (executeAgenticPrimary → auditPackage). See git history.

/** Build the agentic FACTS (+ coverage) for the graduate-to-primary path — the MAP
 *  only, NO judgment (the V2 pipeline judges these facts via runAuditV2's
 *  factsOverride). Non-fatal: returns null on any error so the caller falls back to
 *  the V2 single-pass extractor — the agentic path can never break a paid audit. */
// [V1/shadow purged 2026-06-28 — A4] buildAgenticFacts() removed — engine is 100% agentic (executeAgenticPrimary → auditPackage). See git history.

// ── V3 PROVEN-ENGINE SHADOW (auditPackage → deriveVerdict) ──────────────────
// The GRADUATED engine (6/6 gold, Brain-ratified) takes ONE fullSource string
// and emits a GATE verdict (BID / BID_WITH_CAUTION / NO_BID / INELIGIBLE /
// NEEDS_HUMAN_REVIEW / INCOMPLETE) with NO compliance score — a different shape
// than V1's recommendation/score. This shadow assembles fullSource from the
// live intake docs and runs the engine NON-FATALLY alongside V1, persisting a
// compact decision block for side-by-side comparison vs the live V1
// recommendation. It NEVER owns the customer verdict — that is a later gate,
// once the shadow is seen to agree with V1 on a real corpus.

/** GAP A — assemble the engine's single `fullSource` string from the doc set.
 *  Raw concatenation matches the gold `*-FULL-SOURCE.complete.txt` format the
 *  engine graduated on (pdftotext dump of every doc). The per-doc banner is
 *  plain text with NO "SECTION X" token, so it cannot perturb the UCF section
 *  boundary detector the engine reads. */
export function assembleFullSource(docs: AgenticDoc[]): string {
  return docs
    .map((d) => (docs.length > 1 ? `\n\n==== DOCUMENT: ${d.name} ====\n\n${d.text}` : d.text))
    .join("\n\n")
    .trim();
}

// Safety ceiling for the assembled engine source (limit N3). The proven gold set
// tops out ~946KB; this default sits comfortably above it (~350k tokens) while
// bounding a pathological multi-megabyte package's memory / boundary-scan /
// find_in_source cost. CONFIGURABLE via env so it can be tuned without a deploy.
export const MAX_FULLSOURCE_CHARS = Number(process.env.AGENTIC_MAX_FULLSOURCE_CHARS) || 1_400_000;

export interface AssembledSource {
  source: string;
  truncated: boolean;       // at least one WHOLE doc was dropped to fit the budget (never a mid-doc cut)
  keptDocs: number;
  droppedDocs: string[];    // named, never silent
}

/** Budgeted assembly (limit N3/N4). Keeps WHOLE docs in order until the next would
 *  exceed the char ceiling, then DROPS the remaining docs — a complete-but-fewer-docs
 *  DEGRADE, never a silent mid-document cut (the never-silent-trim doctrine). The
 *  `truncated` flag flows into documents_complete=false so an over-budget package is
 *  surfaced as honest-incomplete (export gated), never presented as a full read.
 *  The first doc is always kept (we never emit an empty source); a single doc larger than
 *  the ceiling is kept WHOLE and is NOT flagged truncated — nothing was dropped, it IS the
 *  complete content (a true multi-MB single giant is the chunk path's concern, separate).
 *  `truncated` therefore means strictly "≥1 whole doc was dropped", never "the source is big"
 *  (else a fully-read 1.4MB single solicitation would be a false honest-fail). */
export function assembleFullSourceBudgeted(docs: AgenticDoc[], maxChars: number = MAX_FULLSOURCE_CHARS): AssembledSource {
  const pieceLen = (d: AgenticDoc) => (docs.length > 1 ? `\n\n==== DOCUMENT: ${d.name} ====\n\n`.length + d.text.length : d.text.length);
  // R9 (Brain C.c) — BINDING-PRIORITY drop order. When the char budget forces WHOLE-doc drops, a NON-binding doc
  // (reps & certs / offeror-fill template) must be dropped BEFORE a binding one. Order is preserved (byte-identical)
  // when everything fits OR when there is nothing to reprioritize; the reorder engages ONLY on an over-budget
  // multi-doc package. docs[0] (the primary solicitation) is always highest priority. Any actual drop still sets
  // `truncated` ⇒ documents_complete=false (a binding drop can never read COMPLETE).
  let order = docs;
  const total = docs.reduce((n, d) => n + pieceLen(d), 0);
  if (docs.length > 1 && total > maxChars) {
    const rank = (d: AgenticDoc, i: number) => (i === 0 ? 0 : isBindingDoc({ role: "attachment", name: d.name }) ? 1 : 2);
    order = docs.map((d, i) => ({ d, i, r: rank(d, i) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.d);
  }
  const kept: AgenticDoc[] = [];
  const droppedDocs: string[] = [];
  let used = 0;
  for (const d of order) {
    const piece = docs.length > 1 ? `\n\n==== DOCUMENT: ${d.name} ====\n\n${d.text}` : d.text;
    if (kept.length > 0 && used + piece.length > maxChars) { droppedDocs.push(d.name); continue; }
    kept.push(d);
    used += piece.length;
  }
  const finalDocs = kept.length ? kept : docs.slice(0, 1);
  const source = assembleFullSource(finalDocs);
  const truncated = droppedDocs.length > 0;
  return { source, truncated, keptDocs: finalDocs.length, droppedDocs };
}

/** Compact, persistable summary of the proven engine's Decision — enough to
 *  compare vs V1 and eyeball the verdict pole, without dumping full findings. */
export interface V3ShadowResult {
  verdict: string;
  eligible: boolean;
  reason: string;
  showStoppers: number;
  coverageComplete: boolean;
  coverageMissing: string[];
  findings: number;
  conflict: boolean;
  sourceChars: number;
  docCount: number;
  engineMs: number;
}

/** GAP B+D — run the proven `auditPackage` engine as a NON-FATAL shadow. Returns
 *  a compact decision summary, or null on any error (logged, never thrown) so it
 *  can never affect the live audit. Honest-fail surfaces as INCOMPLETE /
 *  NEEDS_HUMAN_REVIEW in the persisted verdict, never a fabricated green. Note:
 *  `auditPackage` is itself hard-gated behind AUDIT_AGENTIC_V3=true (it throws
 *  otherwise) — so this shadow only does real work when BOTH that flag and
 *  AGENTIC_V3_SHADOW_ENABLED are set; otherwise it logs the throw and returns
 *  null (belt-and-suspenders against an accidental paid run). */
// [V1/shadow purged 2026-06-28 — A4] runDeriveVerdictShadow() removed — engine is 100% agentic (executeAgenticPrimary → auditPackage). See git history.

/** Hole-B fix — the honest coverage-complete signal the verdict safety-gate consults.
 *   • feature OFF              → null  (no agentic claim; the renderer behaves exactly as pre-agentic)
 *   • feature ON, MAP aborted  → false (MAP===null: full-coverage premise abandoned, V2 ran single-pass
 *                                       → the verdict MUST NOT render confidently)
 *   • feature ON, MAP ran      → the MAP's own coverage.complete (read-failures / truncation honest)
 *  Pure → gate-testable. Closes the silent fall-through where an aborted MAP read as "feature off". */
export function resolveAgenticCoverageComplete(
  primaryEnabled: boolean,
  agenticMap: { coverage: { complete: boolean } } | null,
): boolean | null {
  if (!primaryEnabled) return null;
  if (!agenticMap) return false;
  return agenticMap.coverage.complete;
}
