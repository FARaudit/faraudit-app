// $0 CERT-3 COST + WALL-CLOCK PROJECTION (card #612-(3)b, CEO ruling 2026-07-21). Run:
//   npx tsx scripts/audit-ai/_cert3-cost-projection.ts
//
// The E133 (HTC711-26-R-E133) re-fire question: can the 14-doc / 1.0M-char package clear BOTH standing pre-fire
// gates — ≤$2.50 cost AND ≥20% wall-clock headroom vs the 360s budget? This feeds the run's REAL measured
// per-stage usage (the armed stopwatch flushed it even on the stall) through the SHIPPED pricing, then tests
// whether any CODE-surface lever (concurrency raise for wall-clock) can rescue it — with NO verdict-logic change.
import { summarizePanelUsage, formatPanelInstrumentation, PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

const BUDGET_MS = Number(process.env.AGENTIC_V3_PRIMARY_BUDGET_MS) || 360_000;
const HEADROOM = 0.20;

// E133 measured per-stage usage (from the 2026-07-21 stall stopwatch flush; model set so pricing matches the
// $5.58 Anthropic credit delta / the per-model usage screenshot: sonnet 1.24M · opus 128k · haiku 176k tok).
const S = "claude-sonnet-4-6", O = "claude-opus-4-8", H = "claude-haiku-4-5";
const mk = (label: string, model: string, ms: number, i: number, o: number, cr: number, cw: number): StructuredUsage =>
  ({ label, model, input_tokens: i, output_tokens: o, cache_read: cr, cache_write: cw, ms });
const E133: StructuredUsage[] = [
  mk("panel:capture_strategist#1", S, 89300, 18074, 45296, 0, 220332),   // 14 chunk-passes (1M/60k budget) — folded
  mk("panel:pricing_contracts_risk", S, 60300, 3942, 6574, 0, 43737),
  mk("panel:source_selection_evaluator", O, 37200, 1877, 3195, 0, 23218), // Opus lens
  mk("panel:proposal_compliance", S, 69800, 3810, 10516, 0, 41866),
  mk("panel:smallbiz_eligibility_counsel", H, 60300, 13963, 33920, 43884, 84240),
  mk("panel:verifier#1/4", O, 57700, 77164, 19245, 0, 0),                 // Opus verifier — 259 claims
  mk("panel:gatekeeper", S, 200, 3355, 9, 0, 0),
];
const PRODUCER_WALL_MS = 358200;         // measured
const PREPANEL_MS = 24907 + 17695 + 41836; // retrieval + ingest + expert-phase (measured [timing] lines)

const rows = summarizePanelUsage(E133);
const cost = rows.reduce((a, r) => a + r.costUsd, 0);
const opusCost = rows.filter((r) => ["source_selection_evaluator", "verifier"].some((k) => r.stage.includes(k))).reduce((a, r) => a + r.costUsd, 0);
const totalWallMs = PREPANEL_MS + PRODUCER_WALL_MS;

console.log("=== E133 (HTC711-26-R-E133) — measured cert-3 stall ===");
console.log(formatPanelInstrumentation(rows, PRODUCER_WALL_MS));
console.log(`\n  prepanel (retrieval+ingest+expert) = ${(PREPANEL_MS/1000).toFixed(1)}s · producer = ${(PRODUCER_WALL_MS/1000).toFixed(1)}s · TOTAL ≈ ${(totalWallMs/1000).toFixed(1)}s`);

console.log(`\n=== GATE 1 — COST ≤ $${PANEL_COST_GATE_USD} ===`);
console.log(`  measured panel $${cost.toFixed(2)}  →  ${cost <= PANEL_COST_GATE_USD ? "PASS" : `FAIL (${(cost/PANEL_COST_GATE_USD).toFixed(1)}× over)`}`);
console.log(`  Opus tier alone = $${opusCost.toFixed(2)} (${Math.round(opusCost/cost*100)}% of spend) — the adversarial verifier + eligibility lens are VERDICT-CRITICAL, so this is NOT reducible in Code's surface without a verdict-logic change (⇒ Brain card, not this envelope).`);

console.log(`\n=== GATE 2 — WALL-CLOCK ≥${HEADROOM*100}% headroom vs ${BUDGET_MS/1000}s ===`);
const headroom = 1 - totalWallMs / BUDGET_MS;
console.log(`  measured total ≈ ${(totalWallMs/1000).toFixed(1)}s  →  headroom ${(headroom*100).toFixed(0)}%  →  ${headroom >= HEADROOM ? "PASS" : "FAIL (over budget — engine stalled)"}`);

console.log(`\n=== CODE-SURFACE RESCUE ATTEMPT (wall-clock only; cost is unaffected by concurrency) ===`);
// The only non-verdict Code lever for wall-clock is concurrency: the lens+verifier calls serial-Σ / effective
// concurrency ≈ producer wall. Even at INFINITE concurrency the wall floor = the single slowest call (parallel-max).
const serialSumMs = rows.reduce((a, r) => a + r.wallMsSum, 0);
const parallelMaxMs = rows.reduce((a, r) => Math.max(a, r.wallMsMax), 0);
const idealProducerMs = parallelMaxMs; // best case: every call truly parallel
const idealTotalMs = PREPANEL_MS + idealProducerMs + 57700; // +verifier serial after lenses (can't overlap the lens fan-out it consumes)
console.log(`  producer serial-Σ=${(serialSumMs/1000).toFixed(0)}s at ~${(serialSumMs/PRODUCER_WALL_MS).toFixed(1)}× effective concurrency today.`);
console.log(`  BEST-CASE (infinite concurrency, verifier still serial-after-lenses) total ≈ ${(idealTotalMs/1000).toFixed(0)}s → headroom ${((1-idealTotalMs/BUDGET_MS)*100).toFixed(0)}%.`);
console.log(`  → wall-clock is arguably rescuable by concurrency, BUT cost ($${cost.toFixed(2)}) is INVARIANT to concurrency and stays ${(cost/PANEL_COST_GATE_USD).toFixed(1)}× over the $${PANEL_COST_GATE_USD} gate.`);

console.log(`\n=== VERDICT ===`);
const pass = cost <= PANEL_COST_GATE_USD && headroom >= HEADROOM;
console.log(`  E133 gate result: ${pass ? "PASS" : "FAIL"} — cost gate is the binding, IRREDUCIBLE (in Code) constraint.`);
console.log(`  A 1.0M-char / 14-doc package intrinsically bills ~1.55M tokens (~$5.58). No Code-surface change reaches`);
console.log(`  $${PANEL_COST_GATE_USD} without cutting the verdict-critical Opus verifier ⇒ this is a PRICING / PACKAGE-SIZE decision (CEO),`);
console.log(`  per the 2026-07-21 ruling. Re-firing E133 as-is would re-spend ~$5.58 to re-fail the cost gate.`);
process.exit(pass ? 0 : 1);
