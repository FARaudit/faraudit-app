/**
 * CERT — #525 whole-source fallback multiplier (Brain card #628-3, interim honesty patch).
 *
 * PROVES ($0):
 *   RETRO. N0016726Q1089 (audit c7e99592, the live fire) ACTUALLY ran under #525 whole-source fallback and cost
 *     $3.25 / 328s — vs the clean-routing pre-screen's $0.80 / 208s. With the fallback multiplier ON (fanout=5),
 *     the gate now PROJECTS ≥ the actuals and REFUSES → the gate is HONEST while #525 lives (Brain #628-3 acceptance).
 *   CLEAN. With fanout=1 (post-#525-fix, routing `fallback:none`), the same package projects back to ~$0.80 / 208s
 *     and PASSES → the patch self-corrects once #525 is fixed; it does not permanently condemn small packages.
 *   VECTORS. The 3 calibration anchors (LBJ/36C/E133) — all of which ran under #525 whole-source — REFUSE under the
 *     fallback (honest worst-case). Reported for transparency; LBJ's clean-routing PASS lives in _cert-buildC-624.ts.
 *
 * Run: npx tsx scripts/audit-ai/_cert-buildC-fallback-628.ts
 */
import { pipelinePrescreen, PANEL_LENS_FANOUT, type PackageCensus } from "@/lib/cost-prescreen";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};
const GATE = { budgetMs: 360_000, headroom: 0.20 };

// ── N0016726Q1089 — the live fire's REAL census (worker logs + usage_events) ──
//    138,876 chars extracted · 9 docs (8 ingested + notice body) · 0 scanned · 1.367MB · ACTUAL cost $3.25 / wall 328s.
const N16 = { name: "N0016726Q1089 (c7e99592)", actualUsd: 3.25, actualWall: 328,
  census: { docCount: 9, machineReadableChars: 139_417, scannedDocCount: 0, totalBytes: 1_367_348, imageBytes: 0 } as PackageCensus };

console.log(`── RETRO: N0016726Q1089 under #525 whole-source fallback (fanout=${PANEL_LENS_FANOUT}) must PREDICT the fire ──`);
const fb = pipelinePrescreen(N16.census, { ...GATE, wholeSourceFallback: true });
ok(`RETRO cost projection $${fb.cost.projectedUsd.toFixed(2)} ≥ actual $${N16.actualUsd}`, fb.cost.projectedUsd >= N16.actualUsd,
  `gate $${fb.cost.gateUsd.toFixed(2)}, fanout=${fb.lensFanout}`);
ok(`RETRO wall projection ${fb.wallClock.projectedSeconds.toFixed(0)}s ≥ actual ${N16.actualWall}s`, fb.wallClock.projectedSeconds >= N16.actualWall,
  `limit ${fb.wallClock.effectiveLimitSeconds.toFixed(0)}s`);
ok(`RETRO gate REFUSES (would have flagged the $3.25/328s overrun)`, !fb.pass, `refusedBy=${fb.refusedBy}`);

console.log(`\n── CLEAN: fanout=1 (post-#525-fix) self-corrects to the real per-slice footprint ──`);
const cl = pipelinePrescreen(N16.census, { ...GATE, wholeSourceFallback: false });
ok(`CLEAN cost ~$0.80 (≤ $1.20)`, cl.cost.projectedUsd <= 1.20, `$${cl.cost.projectedUsd.toFixed(2)}`);
ok(`CLEAN wall ~208s (≤ 250s)`, cl.wallClock.projectedSeconds <= 250, `${cl.wallClock.projectedSeconds.toFixed(0)}s`);
ok(`CLEAN gate PASSES (clean routing → small package proceeds once #525 is fixed)`, cl.pass, `refusedBy=${cl.refusedBy ?? "none"}`);

console.log(`\n── VECTORS: the 3 anchors (all ran under #525 whole-source) REFUSE under the fallback (honest worst-case) ──`);
const ANCHORS: Array<{ name: string; census: PackageCensus }> = [
  { name: "LBJ 40fd02ce", census: { docCount: 6, machineReadableChars: 149_035, scannedDocCount: 0, totalBytes: 1_100_000, imageBytes: 0 } },
  { name: "36C d7de0285", census: { docCount: 10, machineReadableChars: 266_883, scannedDocCount: 6, totalBytes: 31_000_000, imageBytes: 28_000_000 } },
  { name: "E133 48c57c21", census: { docCount: 14, machineReadableChars: 995_368, scannedDocCount: 0, totalBytes: 9_600_000, imageBytes: 0 } },
];
for (const a of ANCHORS) {
  const p = pipelinePrescreen(a.census, { ...GATE, wholeSourceFallback: true });
  ok(`VECTOR ${a.name} REFUSE under fallback`, !p.pass,
    `cost $${p.cost.projectedUsd.toFixed(2)} · wall ${p.wallClock.projectedSeconds.toFixed(0)}s · refusedBy=${p.refusedBy}`);
}

console.log(`\n${fails === 0 ? "✅ ALL PASS" : `❌ ${fails} FAIL`} — #525 fallback multiplier cert (Brain #628-3): the gate predicts the fire it missed, and self-corrects once #525 is fixed.`);
process.exit(fails === 0 ? 0 : 1);
