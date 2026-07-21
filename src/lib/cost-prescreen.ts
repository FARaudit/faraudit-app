// SIZE-AWARE FAIL-FAST COST PRE-SCREEN (Brain ruling card #613/#614, 2026-07-21). The cost analog of the
// honest-fail guard: refuse BEFORE spend = refuse before fabrication. Given the package's machine-readable
// char count (known post-ingest/buildDocs), project the panel cost via the E133 anchor model and REFUSE before
// any lens fires when the projection exceeds the margin-adjusted cap. Gates on PROJECTED COST via the live
// model — never a frozen char constant, so waste removal (cards #614 Ch.1-3) raises the cap automatically.
// Flag-gated (AUDIT_COST_PRESCREEN); OFF ⇒ never refuses (byte-identical). Pure → $0 gate-testable.
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "./agentic-panel-runner";
import type { StructuredUsage } from "./anthropic-structured";
import { meaningfulCharCount } from "./pdf-text-extractor";

// n=1 calibration anchor — the E133 (HTC711-26-R-E133) measured per-stage token profile at 995,368 machine-
// readable chars → $5.58. UPPER BOUND on intrinsic cost (card #614 Ch.4); recalibrate + bump the version as
// completed rows land under the armed stopwatch. Every refusal logs this version so it is re-checkable.
export const COST_PRESCREEN_MODEL_VERSION = "e133-anchor-v1";
const E133_CHARS = 995_368;
const S = "claude-sonnet-4-6", O = "claude-opus-4-8", H = "claude-haiku-4-5";
const u = (model: string, i: number, o: number, cr: number, cw: number): StructuredUsage =>
  ({ label: "prescreen", model, input_tokens: i, output_tokens: o, cache_read: cr, cache_write: cw, ms: 0 });
const E133_PROFILE: StructuredUsage[] = [
  u(S, 18074, 45296, 0, 220332),   // capture (14 chunk-passes)
  u(S, 3942, 6574, 0, 43737),      // pricing
  u(O, 1877, 3195, 0, 23218),      // eligibility (opus)
  u(S, 3810, 10516, 0, 41866),     // proposal
  u(H, 13963, 33920, 43884, 84240),// smallbiz (haiku)
  u(O, 77164, 19245, 0, 0),        // verifier (opus, 259 claims)
  u(S, 3355, 9, 0, 0),             // judge
];

// ── CANONICAL COST FORMULA (Brain card #615.1 — ONE formula, ONE source, registry-declared) ──
//     CAP    = PANEL_COST_GATE_USD  ($2.50, the fixed standing pre-fire ceiling — CEO 2026-07-21). NEVER re-derived.
//     gate_n = CAP × (1 − margin_n)                      ← the EFFECTIVE refuse-above line
//     refuse ⇔ projectPanelCostUsd(chars) > gate_n
//  `margin_n` comes from marginForN (the SOLE margin source). Every break-even char figure in docs/tests MUST derive
//  from this same formula — no independently-stated numbers. The refusal record logs BOTH cap and effective gate so
//  each refusal shows the exact number it was refused against.
//  REGISTRY NOTE (Brain card #616.1): the margin schedule is DECLARED but DORMANT pending completed-row tracking —
//  the gate is fixed at the n=1 posture (20% margin / $2.00 effective gate). n=1 is the TRUE state of the calibration
//  data (one anchor), so this is the honest posture and it fails safe (refuses more, never less). Do NOT thread a
//  synthetic n; wire the schedule only when a real completed-row counter exists (future slope re-derivation cards).

/** Safety margin as a FUNCTION OF n (completed-row count) — n=1→20% · n≥5→15% · n≥10→10% (card #614, declared
 *  so the gate's movement is auditable). The SOLE margin source. Shrinks as the anchor gains real data. */
export function marginForN(n: number): number { return n >= 10 ? 0.10 : n >= 5 ? 0.15 : 0.20; }

/** Project the panel $ cost for a package of `machineReadableChars`, scaling the E133 anchor profile linearly
 *  and re-pricing via the shipped per-model model. (Linear is conservative — the anchor is an upper bound.) */
export function projectPanelCostUsd(machineReadableChars: number): number {
  const ratio = Math.max(0, machineReadableChars) / E133_CHARS;
  const scaled = E133_PROFILE.map((x) => ({ ...x, input_tokens: Math.round(x.input_tokens * ratio), output_tokens: Math.round(x.output_tokens * ratio), cache_read: Math.round(x.cache_read * ratio), cache_write: Math.round(x.cache_write * ratio) }));
  return summarizePanelUsage(scaled).reduce((a, r) => a + r.costUsd, 0);
}

export interface CostPrescreenResult {
  pass: boolean;              // true ⇒ projected ≤ effective gate ⇒ proceed to the producer
  projectedUsd: number;
  chars: number;
  capUsd: number;            // the FIXED cap ($2.50 = PANEL_COST_GATE_USD) — canonical vocab, card #615.1
  gateUsd: number;           // the EFFECTIVE refuse-above line = capUsd × (1 − margin_n); the number projected is refused against
  marginPct: number;
  modelVersion: string;      // logged on refusal for re-checkability when the model recalibrates
}

/** The gate. CANONICAL FORMULA (card #615.1): gate_n = CAP × (1 − margin_n), CAP fixed ($2.50 = PANEL_COST_GATE_USD),
 *  margin_n from marginForN. Refuse ⇔ projected > gate_n. `n` = completed-row count for the margin schedule (default
 *  1). `cap` overridable (default $2.50). Pure; caller applies AUDIT_COST_PRESCREEN + placement (completeness gate
 *  BEFORE this, per card #613 seam-c). */
export function costPrescreen(machineReadableChars: number, opts?: { n?: number; cap?: number }): CostPrescreenResult {
  const capUsd = opts?.cap ?? PANEL_COST_GATE_USD;   // FIXED cap ($2.50) — never re-derived
  const margin = marginForN(opts?.n ?? 1);
  const gateUsd = capUsd * (1 - margin);             // gate_n = CAP × (1 − margin_n) — the effective refuse-above line
  const projectedUsd = projectPanelCostUsd(machineReadableChars);
  return { pass: projectedUsd <= gateUsd, projectedUsd, chars: machineReadableChars, capUsd, gateUsd, marginPct: margin * 100, modelVersion: COST_PRESCREEN_MODEL_VERSION };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BUILD C — WHOLE-PIPELINE PROJECTION + PER-DOC CENSUS (Brain card #624-2, 2026-07-21)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The char-only $ gate above is structurally BLIND to the byte-and-scanned-document PRE-PANEL cost (SAM fetch +
// ingest + OCR) that actually stalled 36C24426Q0675 (66 claims — LOW panel load — yet >360s, driven by 31MB / 6
// image-only docs invisible to a char count). Build C adds:
//   (i)  a PER-DOC CENSUS that replaces the naive `rawText ≥ 200` machine-readable test with the SAME authoritative
//        signal ingest already computes (`has_text` = word-shape AND full-page-text AND not-OCR-suspect), so
//        "readable" means the BODY reads, not just a cover page — the census discrepancy named in card #624-0.
//   (ii) a WHOLE-PIPELINE WALL-CLOCK projection (fetch + ingest + OCR + panel + verifier) gated vs the engine budget
//        with ≥headroom, so a byte/scanned-heavy package is refused on TIME even when its char/claim load (and thus
//        its $ cost) is low. 36C is caught ONLY by this term ($1.71 < $2.50 cost gate); E133 by BOTH.
//
// RE-DERIVED PER-STAGE MODEL (card #624-3.ii, fit on 3 real runs — LBJ 233s pass · 36C 478s stall · E133 875s stall):
//   proj(s) = fetch(2.76·MB) + ingest(2.61·MB + 1.5·docs) + OCR(3.0·scannedDocs)
//           + panel(77.4 + 0.00060·chars) + verifier(11.3 + 0.45·claims)
// COEFFICIENT-PROVISIONAL / DIRECTIONAL-TRUSTED until n≥5 (5 coefficients on 1 anchor + 2 checks is underdetermined;
// bytes/scanned DOMINANCE is robust, the exact coefficients are not). Every fire feeds the fit. NOTE: the ingest
// coefficient was fit on runs that STILL had the double-extraction bug (card #624-1, since fixed) — so post-fix it
// OVER-projects the ingest term, which fails SAFE (refuses more, never less) until recalibrated. Do NOT lower it
// without new post-fix calibration runs.
export const WALLCLOCK_MODEL_VERSION = "rederive-3run-v1";
export const WALLCLOCK_COEF = {
  fetchPerMB: 2.76,
  ingestPerMB: 2.61,
  ingestPerDoc: 1.5,
  ocrPerScannedDoc: 3.0,
  panelConst: 77.4,
  panelPerChar: 0.00060,
  verifierConst: 11.3,
  verifierPerClaim: 0.45,
} as const;

// Verifier claims are unknown pre-panel — estimate from machine-readable chars. Anchors: E133 995,368 chars → 259
// claims (2.60e-4/char) · 36C ~267k → 66 (2.47e-4). Slope 2.7e-4 (slightly above both → never under-projects the
// verifier term, fail-safe). LBJ ran DENSER (149k chars → 89 claims, 6.0e-4) but its verifier term is never the
// binding constraint, so the estimate's under-count there does not flip its PASS. COEFFICIENT-PROVISIONAL.
export const CLAIMS_PER_CHAR = 2.7e-4;
export function estimateVerifierClaims(machineReadableChars: number): number {
  return Math.max(0, Math.round(machineReadableChars * CLAIMS_PER_CHAR));
}

/** Whole-pipeline projection inputs — a package census (per-doc bytes/scanned classified) + optional known claims. */
export interface PackageCensus {
  docCount: number;              // ingested docs the engine reads
  machineReadableChars: number;  // total extractable/OCR-recovered text the panel sees (drives panel+verifier+$)
  scannedDocCount: number;       // docs whose BODY is not machine-readable (ride as vision → drive OCR wall-clock)
  totalBytes: number;            // total ingested bytes (drives fetch+ingest wall-clock)
  imageBytes: number;            // bytes of the scanned/vision docs (diagnostic; subset of totalBytes)
}

/** Project the whole-pipeline wall-clock SECONDS for a package census. `claims` overrides the char-based estimate
 *  (used by the re-cert to reproduce the anchors exactly). Pure. */
export function projectWallClockSeconds(census: PackageCensus, claimsOverride?: number): number {
  const c = WALLCLOCK_COEF;
  const mb = Math.max(0, census.totalBytes) / 1_000_000;
  const claims = claimsOverride ?? estimateVerifierClaims(census.machineReadableChars);
  return (
    c.fetchPerMB * mb +
    c.ingestPerMB * mb + c.ingestPerDoc * census.docCount +
    c.ocrPerScannedDoc * census.scannedDocCount +
    c.panelConst + c.panelPerChar * census.machineReadableChars +
    c.verifierConst + c.verifierPerClaim * claims
  );
}

export interface WallClockPrescreenResult {
  pass: boolean;                 // true ⇒ projected ≤ effective budget line ⇒ proceed
  projectedSeconds: number;
  budgetSeconds: number;         // AGENTIC_V3_PRIMARY_BUDGET_MS / 1000
  effectiveLimitSeconds: number; // budget × (1 − headroom) — the refuse-above line
  headroomPct: number;
  scannedDocCount: number;
  totalBytesMB: number;
  modelVersion: string;
}

/** The WALL-CLOCK gate. Refuse ⇔ projected > budget × (1 − headroom). `budgetMs` should be the SAME budget the
 *  engine enforces (AGENTIC_V3_PRIMARY_BUDGET_MS or the caller's tighter override). Pure. */
export function wallClockPrescreen(
  census: PackageCensus,
  opts?: { budgetMs?: number; headroom?: number; claimsOverride?: number },
): WallClockPrescreenResult {
  const budgetMs = opts?.budgetMs ?? (Number(process.env.AGENTIC_V3_PRIMARY_BUDGET_MS) || 360_000);
  const headroom = opts?.headroom ?? 0.20;   // the HARD pre-fire line (Brain #611): ≥20% headroom
  const budgetSeconds = budgetMs / 1000;
  const effectiveLimitSeconds = budgetSeconds * (1 - headroom);
  const projectedSeconds = projectWallClockSeconds(census, opts?.claimsOverride);
  return {
    pass: projectedSeconds <= effectiveLimitSeconds,
    projectedSeconds, budgetSeconds, effectiveLimitSeconds, headroomPct: headroom * 100,
    scannedDocCount: census.scannedDocCount, totalBytesMB: census.totalBytes / 1_000_000,
    modelVersion: WALLCLOCK_MODEL_VERSION,
  };
}

// ── PER-DOC CENSUS CLASSIFIER (card #624-0/2.iii — "readable" means the BODY reads, not just a cover) ──
/** One document's ingest-time signals. `machineReadable`, when provided, is the AUTHORITATIVE `has_text` the
 *  assembler already computed (word-shape AND full-page-text AND not-OCR-suspect) — production callers pass it and
 *  the byte/page/ratio fallback never runs. Fallback (prescreen scripts, no ingest meta): classify from bytes +
 *  pages + text-page-ratio + word-shape. */
export interface DocCensus {
  bytes: number;
  text: string;
  machineReadable?: boolean;   // authoritative has_text from ingestion.files[] — preferred
  pages?: number;              // pageCount (fallback classifier)
  textPages?: number;          // # pages with meaningful text (fallback classifier)
}

/** Is this doc SCANNED (body not machine-readable → rides as vision → drives OCR wall-clock)?  Prefer the
 *  authoritative has_text; else a positive machine-readable test (word-shape AND either enough text-pages or dense
 *  enough chars-per-byte), scanned = its negation. Ambiguity ⇒ scanned (fail-safe: over-counts OCR, refuses more). */
export function isScannedDoc(d: DocCensus): boolean {
  if (typeof d.machineReadable === "boolean") return !d.machineReadable;
  const meaningful = meaningfulCharCount(d.text);
  const wordShaped = (d.text.match(/[A-Za-z]{2,}/g)?.length ?? 0) >= 8 && meaningful >= 200;
  if (!wordShaped) return true;
  // Word-shaped but check the BODY reads, not just a cover: majority of pages must carry text, OR (pages unknown)
  // the char density must be non-trivial for the byte size (a big-byte / low-char doc is an image scan).
  if (d.pages && d.pages > 0 && typeof d.textPages === "number") {
    return d.textPages / d.pages < 0.5;   // <½ pages have text ⇒ mixed cover+scanned body ⇒ scanned
  }
  if (d.bytes > 1_000_000) return meaningful / d.bytes < 0.02;
  return false;
}

/** Build the whole-package census from per-doc signals. Machine-readable chars sum the text of ALL docs the panel
 *  reads (OCR-recovered text included — it costs panel time and rides in fullSource); scannedDocCount + imageBytes
 *  drive the OCR/byte wall-clock terms. */
export function censusPackage(docs: DocCensus[]): PackageCensus {
  let machineReadableChars = 0, scannedDocCount = 0, totalBytes = 0, imageBytes = 0;
  for (const d of docs) {
    totalBytes += d.bytes;
    machineReadableChars += d.text.length;
    if (isScannedDoc(d)) { scannedDocCount++; imageBytes += d.bytes; }
  }
  return { docCount: docs.length, machineReadableChars, scannedDocCount, totalBytes, imageBytes };
}

export interface PipelinePrescreenResult {
  pass: boolean;                 // true ⇒ BOTH gates pass ⇒ proceed to the producer
  refusedBy: "cost" | "wallclock" | null;
  cost: CostPrescreenResult;
  wallClock: WallClockPrescreenResult;
  census: PackageCensus;
}

/** THE COMBINED WHOLE-PIPELINE GATE (Build C). Refuse ⇔ EITHER the $ cost gate OR the wall-clock gate fails.
 *  36C fails ONLY the wall-clock gate (low $); E133 fails BOTH. Pure; caller applies AUDIT_COST_PRESCREEN + the
 *  would-be-COMPLETE precondition + SIZE_BOUNDARY persistence, exactly as the char-only gate. */
export function pipelinePrescreen(
  census: PackageCensus,
  opts?: { n?: number; cap?: number; budgetMs?: number; headroom?: number; claimsOverride?: number },
): PipelinePrescreenResult {
  const cost = costPrescreen(census.machineReadableChars, { n: opts?.n, cap: opts?.cap });
  const wallClock = wallClockPrescreen(census, { budgetMs: opts?.budgetMs, headroom: opts?.headroom, claimsOverride: opts?.claimsOverride });
  const refusedBy = !cost.pass ? "cost" : !wallClock.pass ? "wallclock" : null;
  return { pass: cost.pass && wallClock.pass, refusedBy, cost, wallClock, census };
}

/** The customer-facing refusal record (SIZE_BOUNDARY terminal state — NOT a verdict; never BID/NO_BID/INELIGIBLE,
 *  never a verdict surface). Copy ratified by Brain (card #613 seam-b). */
export const SIZE_BOUNDARY_STATUS = "size_boundary" as const;
export const SIZE_BOUNDARY_MESSAGE =
  "This solicitation's document set is larger than FARaudit currently audits in a single pass. Send it to us and we'll audit it for you.";
export function sizeBoundaryRecord(r: CostPrescreenResult) {
  return {
    status: SIZE_BOUNDARY_STATUS,
    message: SIZE_BOUNDARY_MESSAGE,
    contact: "support@faraudit.com",
    // re-checkable audit trail (card #614 calibration schedule + #615.1 canonical formula) — capUsd is the fixed
    // CAP, gateUsd is the EFFECTIVE line the projection was refused against (gate = CAP × (1 − margin_n)):
    projectedUsd: Number(r.projectedUsd.toFixed(2)), chars: r.chars, capUsd: Number(r.capUsd.toFixed(2)), gateUsd: Number(r.gateUsd.toFixed(2)), marginPct: r.marginPct, modelVersion: r.modelVersion,
  };
}

/** SIZE_BOUNDARY record for the WHOLE-PIPELINE gate (Build C) — same customer copy, richer re-checkable trail:
 *  which gate refused (cost vs wall-clock) + the full census + both projections. */
export function pipelineBoundaryRecord(r: PipelinePrescreenResult) {
  return {
    status: SIZE_BOUNDARY_STATUS,
    message: SIZE_BOUNDARY_MESSAGE,
    contact: "support@faraudit.com",
    refused_by: r.refusedBy,   // "cost" | "wallclock" — which term was binding
    census: {
      doc_count: r.census.docCount,
      chars: r.census.machineReadableChars,
      scanned_docs: r.census.scannedDocCount,
      total_bytes_mb: Number((r.census.totalBytes / 1_000_000).toFixed(2)),
      image_bytes_mb: Number((r.census.imageBytes / 1_000_000).toFixed(2)),
    },
    cost: { projectedUsd: Number(r.cost.projectedUsd.toFixed(2)), capUsd: Number(r.cost.capUsd.toFixed(2)), gateUsd: Number(r.cost.gateUsd.toFixed(2)), marginPct: r.cost.marginPct, modelVersion: r.cost.modelVersion },
    wallclock: { projectedSeconds: Number(r.wallClock.projectedSeconds.toFixed(0)), budgetSeconds: r.wallClock.budgetSeconds, effectiveLimitSeconds: Number(r.wallClock.effectiveLimitSeconds.toFixed(0)), headroomPct: r.wallClock.headroomPct, modelVersion: r.wallClock.modelVersion },
  };
}
