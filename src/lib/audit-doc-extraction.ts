// ── COVERAGE-ONLY PER-DOCUMENT EXTRACTION (flag `AUDIT_DOC_EXTRACTION`, default OFF) ──────────────────
//
// WHY THIS EXISTS. Measured 2026-08-17 on the banked corpus: 48 of 52 binding documents on
// W911SG27BA002 carry obligations and each needs a grounded finding to be covered, while the engine
// produces 40 findings for the WHOLE package. Documents stay uncovered because no lens opens them —
// the discovery notice says "read the ones whose subject matter your lens owns; ignore the rest",
// which is an OFFER, and nobody owns the residue. This reads every readable binding document in its
// OWN small context, which is the one shape that does not collide with the 2,098,225-char routing
// failure or an 8-turn budget.
//
// ⛔ COVERAGE-ONLY — CEO ruling 2026-08-17. What this pass produces may CREDIT DOCUMENT COVERAGE and
// may NEVER reach the verdict. It emits `ExtractedSpan[]`, not `TypedFinding[]`, deliberately: a span
// has no `kind`, no `controllability`, no `requiredAttribute`, no `curableInWindow`, so there is no
// field a verdict path could read even if one were wired to it by mistake. Widening this to advisory
// or first-class findings is a SEPARATE ruling — see ENGINE-BATCHED-EXTRACTION-2026-08-17.md §2.
//
// ⛔ ITS OWN FLAG, NEVER `AUDIT_ATTACHMENT_COVERAGE`. That flag reads FALSE on the live worker, and
// `attCoverageOpts` (audit-orchestrator.ts) is `undefined` unless it is on — so anything inheriting it
// ships INERT while passing its own tests. That is exactly how the readability split was caught on
// 2026-08-17 before it was built; the neighbouring comment at audit-orchestrator.ts:858 names the same
// trap. This module is armed by its own flag or not at all.
//
// SELF-VERIFYING BY CONSTRUCTION. A span credits a document ONLY if it is verbatim-present in that
// document's region and absent from the primary — the same test `documentsCovered` already applies to
// findings. So the model is never trusted: if it paraphrases, the span simply does not match and no
// credit is given. Nothing here loosens a guard; the honesty machinery does the work unchanged.

import type { DocExtract } from "./agentic-map";

/** A verbatim span offered as evidence that a document was actually read. NOT a finding, and
 *  structurally incapable of becoming one — see the coverage-only note above. */
export interface ExtractedSpan {
  /** the document region this span was extracted from (exact region name) */
  doc: string;
  /** verbatim text, as emitted by the extractor — validated against the region before it credits */
  excerpt: string;
}

export const DOC_EXTRACTION_ENABLED = (): boolean => process.env.AUDIT_DOC_EXTRACTION === "true";

/** Minimum NORMALIZED length for a span to credit a document.
 *
 *  The findings path accepts any excerpt with `length > 0` because findings arrive already
 *  adversarially verified. Extraction spans have no such upstream, so a bare "shall" or a page header
 *  would otherwise credit a 400,000-char specification as READ. 40 normalized characters is roughly a
 *  clause of real prose and is short enough to keep a genuine one-line submission requirement.
 *  Tunable, deliberately NOT env-tunable: a knob here silently changes what "covered" means. */
export const MIN_SPAN_CHARS = 40;

/** The same normalization `documentsCovered` applies before comparing (whitespace-collapsed,
 *  lowercased). Kept identical on purpose — a span that passes here must pass there. */
export const normSpan = (s: string): string => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Pull candidate verbatim spans out of one document's extract.
 *
 *  ONLY the fields the schema asks the extractor to quote are used: submission requirements,
 *  performance requirements and amendment changes carry prose lifted from the document. CLIN
 *  descriptions and clause titles are DELIBERATELY EXCLUDED — those are summaries and labels, they
 *  routinely differ from the source wording, and a near-miss there would look like extractor failure
 *  rather than what it is (the wrong field). Pure, $0. */
export function candidateSpans(extract: DocExtract): string[] {
  const out: string[] = [];
  for (const s of extract.submissionRequirements ?? []) if (s?.text) out.push(s.text);
  for (const p of extract.performanceRequirements ?? []) if (p?.text) out.push(p.text);
  for (const a of extract.amendmentChanges ?? []) if (a?.change) out.push(a.change);
  return out;
}

/** Keep only the spans that are VERBATIM in this document's region and long enough to mean something.
 *
 *  `regionText` is the document's own region from the assembled source — the full text, NOT a
 *  `readDocument` slice, so `DOC_READ_CAP` never applies here. A span from a truncated extract is
 *  still valid evidence for the part that WAS read; `extract.truncated` is carried separately by the
 *  caller so completeness is never claimed from a partial read.
 *
 *  Pure, deterministic, $0 — this is the function the gate exercises. */
export function verifySpans(extract: DocExtract, regionText: string): ExtractedSpan[] {
  const nRegion = normSpan(regionText);
  const seen = new Set<string>();
  const kept: ExtractedSpan[] = [];
  for (const raw of candidateSpans(extract)) {
    const ex = normSpan(raw);
    if (ex.length < MIN_SPAN_CHARS) continue;      // too short to prove a read
    if (!nRegion.includes(ex)) continue;            // not verbatim in THIS document ⇒ no credit
    if (seen.has(ex)) continue;
    seen.add(ex);
    kept.push({ doc: extract.docName, excerpt: raw });
  }
  return kept;
}

/** Which documents this pass should read.
 *
 *  Takes regions rather than importing `docRegions` so this module has no dependency on
 *  `audit-orchestrator` (which imports THIS one — the cycle would be silent and load-order dependent).
 *
 *  Selection mirrors the coverage denominator exactly: non-primary, binding, and READABLE. An
 *  unreadable document is not an extraction target — it is an honest INCOMPLETE, and sending it to a
 *  model would spend money to produce nothing. Pure, $0. */
export function selectExtractionTargets(
  regions: Array<{ name: string; text: string; isPrimary: boolean }>,
  isBinding: (name: string) => boolean,
  isReadable: (text: string) => boolean,
  // NARROW THE TARGET SET (ruling R1's second axis). Absent ⇒ every readable binding document, exactly as
  // before. Supplied ⇒ only the documents it admits — the caller passes the SPEC-BULK predicate so the
  // homogeneous specification pile goes to extraction while ownership routes the heterogeneous remainder
  // to lenses. The two axes are complementary: neither one alone gets the busiest lane inside budget.
  restrictTo?: (name: string) => boolean,
): Array<{ name: string; text: string }> {
  return regions
    .filter((r) => !r.isPrimary && isBinding(r.name) && isReadable(r.text) && (restrictTo ? restrictTo(r.name) : true))
    .map((r) => ({ name: r.name, text: r.text }));
}

/** Read every target in its OWN context and return the spans that survive verification.
 *
 *  `mapOne` is INJECTED rather than imported so this module never reaches back into
 *  `audit-orchestrator` (which imports this one — the cycle would be silent and load-order dependent).
 *  The caller supplies `mapDocument` from `agentic-map`, which already owns the schema, the chunking
 *  and the content-hashed extract cache.
 *
 *  FAILURE DIRECTION IS TOWARD UNCOVERED. A document whose extraction throws, times out, or returns
 *  nothing contributes NO spans, so it stays uncovered and the package stays honest. An extraction
 *  failure must never be able to certify a document — the catch below is the whole reason this is a
 *  loop and not a `Promise.all` that rejects. */
export async function runCoverageExtraction(
  targets: Array<{ name: string; text: string }>,
  mapOne: (name: string, text: string) => Promise<DocExtract>,
  // BOUNDED CONCURRENCY. Default 1 ⇒ the original serial loop, byte-identical. The serial shape is what
  // made this unusable at real package sizes: 28 spec documents on the flagship, one model call each,
  // strictly sequential, against a wall-clock budget the whole audit shares. Concurrency changes ONLY the
  // schedule — never the result: `spans` is assembled by INDEX below, so the output is identical at any
  // width. That property is asserted in the gate rather than assumed, because a concurrent rewrite whose
  // output depended on completion order would be a reproducibility bug that only shows up under load.
  opts?: { concurrency?: number },
): Promise<{ spans: ExtractedSpan[]; read: number; failed: Array<{ doc: string; error: string }> }> {
  const width = Math.max(1, Math.floor(opts?.concurrency ?? 1));
  const perTarget: Array<ExtractedSpan[] | null> = new Array(targets.length).fill(null);
  const failedAt: Array<{ doc: string; error: string } | null> = new Array(targets.length).fill(null);
  let next = 0;

  // FAILURE DIRECTION IS UNCHANGED AND IS THE WHOLE POINT: each target is caught individually, so one
  // document that throws or times out contributes no spans and stays uncovered. Never Promise.all over
  // the raw promises — a single rejection would discard the coverage every other document earned.
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const t = targets[i];
      try {
        const extract = await mapOne(t.name, t.text);
        perTarget[i] = verifySpans(extract, t.text);
      } catch (e) {
        failedAt[i] = { doc: t.name, error: String((e as Error)?.message ?? e).slice(0, 200) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, Math.max(1, targets.length)) }, () => worker()));

  const spans: ExtractedSpan[] = [];
  const failed: Array<{ doc: string; error: string }> = [];
  let read = 0;
  for (let i = 0; i < targets.length; i++) {
    if (perTarget[i]) { read++; spans.push(...perTarget[i]!); }
    if (failedAt[i]) failed.push(failedAt[i]!);
  }
  return { spans, read, failed };
}
