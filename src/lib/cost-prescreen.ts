// SIZE-AWARE FAIL-FAST COST PRE-SCREEN (Brain ruling card #613/#614, 2026-07-21). The cost analog of the
// honest-fail guard: refuse BEFORE spend = refuse before fabrication. Given the package's machine-readable
// char count (known post-ingest/buildDocs), project the panel cost via the E133 anchor model and REFUSE before
// any lens fires when the projection exceeds the margin-adjusted cap. Gates on PROJECTED COST via the live
// model — never a frozen char constant, so waste removal (cards #614 Ch.1-3) raises the cap automatically.
// Flag-gated (AUDIT_COST_PRESCREEN); OFF ⇒ never refuses (byte-identical). Pure → $0 gate-testable.
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "./agentic-panel-runner";
import type { StructuredUsage } from "./anthropic-structured";

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

/** The customer-facing refusal record (SIZE_BOUNDARY terminal state — NOT a verdict; never BID/NO_BID/INELIGIBLE,
 *  never a verdict surface). Copy ratified by Brain (card #613 seam-b). */
export const SIZE_BOUNDARY_STATUS = "size_boundary" as const;
export function sizeBoundaryRecord(r: CostPrescreenResult) {
  return {
    status: SIZE_BOUNDARY_STATUS,
    message: "This solicitation's document set is larger than FARaudit currently audits in a single pass. Send it to us and we'll audit it for you.",
    contact: "support@faraudit.com",
    // re-checkable audit trail (card #614 calibration schedule + #615.1 canonical formula) — capUsd is the fixed
    // CAP, gateUsd is the EFFECTIVE line the projection was refused against (gate = CAP × (1 − margin_n)):
    projectedUsd: Number(r.projectedUsd.toFixed(2)), chars: r.chars, capUsd: Number(r.capUsd.toFixed(2)), gateUsd: Number(r.gateUsd.toFixed(2)), marginPct: r.marginPct, modelVersion: r.modelVersion,
  };
}
