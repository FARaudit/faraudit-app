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
import { isEnvOn } from "./env-flags";
import { runAgenticAudit, runAgenticMap, type ScalarFacts, type AgenticAuditResult, type AgenticMapResult, type AgenticDoc } from "./agentic-orchestrator";

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
  attachments: Array<{ name: string; base64: string }> | null;
}): Promise<AgenticDoc[]> {
  // Prefer text we ALREADY have (the live executor extracted the primary) — only
  // extract when it's missing/too-short. Avoids a second full parse+OCR pass of a
  // doc whose text the caller already holds. On failure, fall back to the existing
  // text, else empty (coverage flags empty as a read-failure — never fabricated).
  const textOf = async (bytes: Buffer, existing: string | null): Promise<string> => {
    if (existing && existing.replace(/\s/g, "").length >= 50) return existing;
    try {
      const { rawText } = await extractText(bytes);
      if (rawText && rawText.replace(/\s/g, "").length >= 50) return rawText;
    } catch {
      /* fall through to existing/empty */
    }
    return existing ?? "";
  };

  const docs: AgenticDoc[] = [];
  if (opts.primaryBytes) {
    docs.push({ name: opts.primaryName, bytes: opts.primaryBytes, text: await textOf(opts.primaryBytes, opts.primaryText) });
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
        return { name: a.name, bytes, text: await textOf(bytes, null) };
      })
    );
    docs.push(...built);
  }
  return docs;
}

/** Run the agentic engine as a non-fatal shadow. Returns the result, or null on
 *  any error (logged, never thrown) so it can never affect the live audit. */
export async function runAgenticShadow(params: {
  auditId: string;
  solicitation: SolScalarSource | null | undefined;
  agency?: string | null;
  primaryName: string;
  primaryBytes: Buffer | null;
  primaryText: string | null;
  attachments: Array<{ name: string; base64: string }> | null;
}, signal?: AbortSignal): Promise<AgenticAuditResult | null> {
  try {
    const docs = await buildAgenticDocs({
      primaryName: params.primaryName,
      primaryBytes: params.primaryBytes,
      primaryText: params.primaryText,
      attachments: params.attachments,
    });
    if (docs.length === 0) {
      console.warn(`[AGENTIC-SHADOW] ${params.auditId}: no docs assembled — skipping`);
      return null;
    }
    const scalars = scalarsFromSolicitation(params.solicitation, params.agency);
    const result = await runAgenticAudit({
      docs,
      scalars,
      mapModel: process.env.AUDIT_MAP_MODEL,
      judgeModel: process.env.AUDIT_MODEL,
      signal, // abort the shadow MAP on budget timeout (parity with the primary path)
    });
    console.log(
      `[AGENTIC-SHADOW] ${params.auditId}: ${result.coverage.complete ? "COMPLETE" : "PARTIAL"} · ` +
      `${result.coverage.read.length} read · ${result.coverage.superseded.length} superseded · ` +
      `${result.coverage.unresolvedVersionGroups} unresolved-version-groups · ${result.coverage.readFailures.length} read-failures`
    );
    console.log(`[AGENTIC-SHADOW] ${params.auditId}: ${result.coverage.statement}`);
    return result;
  } catch (e) {
    console.error(`[AGENTIC-SHADOW] ${params.auditId} failed (non-fatal):`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Build the agentic FACTS (+ coverage) for the graduate-to-primary path — the MAP
 *  only, NO judgment (the V2 pipeline judges these facts via runAuditV2's
 *  factsOverride). Non-fatal: returns null on any error so the caller falls back to
 *  the V2 single-pass extractor — the agentic path can never break a paid audit. */
export async function buildAgenticFacts(params: {
  auditId: string;
  solicitation: SolScalarSource | null | undefined;
  agency?: string | null;
  primaryName: string;
  primaryBytes: Buffer | null;
  primaryText: string | null;
  attachments: Array<{ name: string; base64: string }> | null;
}, signal?: AbortSignal): Promise<AgenticMapResult | null> {
  try {
    const docs = await buildAgenticDocs({
      primaryName: params.primaryName,
      primaryBytes: params.primaryBytes,
      primaryText: params.primaryText,
      attachments: params.attachments,
    });
    if (docs.length === 0) {
      console.warn(`[AGENTIC-PRIMARY] ${params.auditId}: no docs assembled — V2 extractor fallback`);
      return null;
    }
    const scalars = scalarsFromSolicitation(params.solicitation, params.agency);
    const result = await runAgenticMap({ docs, scalars, mapModel: process.env.AUDIT_MAP_MODEL, signal });
    console.log(`[AGENTIC-PRIMARY] ${params.auditId}: ${result.coverage.statement}`);
    // Vacuous-facts guard: returning empty facts as factsOverride makes runAuditV2
    // SKIP its own extractor and render an EMPTY report stamped from those facts. Fall
    // back to V2's single-pass extraction (which can still read doc.rawText) when the
    // MAP read ZERO docs (all per-doc calls failed) OR read docs but extracted nothing
    // usable (readable-but-noise OCR text the map can't pull facts from).
    const f = result.facts;
    const mapEmpty =
      f.clauses.length === 0 && f.clins.length === 0 && f.delivery.length === 0 &&
      f.submissionRequirements.length === 0 && f.evaluationFactors.length === 0 && !f.workStatementText;
    // Coverage-ratio floor: a MAP that read only a small fraction of the operative
    // docs (e.g. 2 of 31) still produces SOME facts, so mapEmpty is false — but using
    // those thin facts as factsOverride would render a near-empty report the banner
    // could present as authoritative. Below the floor, fall back to V2's single-pass
    // extractor (reads every doc's text) rather than ship a thin partial as primary.
    const readN = result.coverage.read.length;
    const failN = result.coverage.readFailures.length;
    const total = readN + failN;
    const coverageRatio = total > 0 ? readN / total : 0;
    const MIN_COVERAGE_RATIO = 0.5;
    if (readN === 0 || mapEmpty || coverageRatio < MIN_COVERAGE_RATIO) {
      console.warn(
        `[AGENTIC-PRIMARY] ${params.auditId}: MAP coverage too thin for primary ` +
        `(read ${readN}/${total} = ${(coverageRatio * 100).toFixed(0)}%, empty=${mapEmpty}) — V2 extractor fallback`
      );
      return null;
    }
    return result;
  } catch (e) {
    console.error(`[AGENTIC-PRIMARY] ${params.auditId} facts build failed (non-fatal, V2 fallback):`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Flag-gate — agentic shadow runs only when explicitly enabled. */
export const AGENTIC_SHADOW_ENABLED = isEnvOn(process.env.AUDIT_AGENTIC);
/** Flag-gate — agentic PRIMARY (facts feed the rendered V2 report) when enabled. */
export const AGENTIC_PRIMARY_ENABLED = isEnvOn(process.env.AUDIT_AGENTIC_PRIMARY);
