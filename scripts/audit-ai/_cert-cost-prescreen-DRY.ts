// $0 CERT — SIZE-AWARE FAIL-FAST COST PRE-SCREEN (Brain card #613/#614). Run:
//   npx tsx scripts/audit-ai/_cert-cost-prescreen-DRY.ts
// Proves BOTH directions: projected-under ⇒ pass (proceed, byte-identical); projected-over ⇒ refuse BEFORE any
// lens; the margin-by-n schedule; and the SIZE_BOUNDARY record (never a verdict). Calibrated on E133 (refuse) +
// the 36C24426Q0675 pre-screen size (pass).
import { costPrescreen, projectPanelCostUsd, marginForN, sizeBoundaryRecord, SIZE_BOUNDARY_STATUS, COST_PRESCREEN_MODEL_VERSION } from "../../src/lib/cost-prescreen";
import { PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

// ── margin-by-n schedule (card #614) ──
ok(marginForN(1) === 0.20 && marginForN(4) === 0.20, "margin n<5 = 20%");
ok(marginForN(5) === 0.15 && marginForN(9) === 0.15, "margin 5≤n<10 = 15%");
ok(marginForN(10) === 0.10 && marginForN(50) === 0.10, "margin n≥10 = 10%");

// ── projection monotonic + anchored ──
ok(projectPanelCostUsd(0) === 0, "0 chars ⇒ $0 projected");
ok(projectPanelCostUsd(500_000) < projectPanelCostUsd(995_368), "projection monotonic in size");
const e133 = projectPanelCostUsd(995_368);
ok(e133 >= 5.0 && e133 <= 6.2, `E133 anchor projects ≈ the measured $5.58 (got $${e133.toFixed(2)})`);

// ── REFUSE direction — E133-size (995k chars) exceeds the margin-adjusted cap ──
const big = costPrescreen(995_368, { n: 1 });
ok(!big.pass, `E133 995k chars REFUSES (projected $${big.projectedUsd.toFixed(2)} > cap $${big.capUsd.toFixed(2)})`);
ok(big.capUsd === PANEL_COST_GATE_USD * 0.8, "n=1 cap = $2.50 × (1−20%) = $2.00");
ok(big.modelVersion === COST_PRESCREEN_MODEL_VERSION, "refusal carries the model version (re-checkable)");

// ── PASS direction — 36C24426Q0675 pre-screen size (152,211 chars) is under the cap ──
const small = costPrescreen(152_211, { n: 1 });
ok(small.pass, `36C24426Q0675 152k chars PASSES (projected $${small.projectedUsd.toFixed(2)} ≤ cap $${small.capUsd.toFixed(2)})`);

// ── boundary: find the n=1 break-even and confirm the gate sits there ──
let lo = 0, hi = 995_368;
for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (costPrescreen(mid, { n: 1 }).pass) lo = mid; else hi = mid; }
ok(Math.abs(costPrescreen(lo, { n: 1 }).projectedUsd - big.capUsd) < 0.05, `break-even at ~${Math.round(lo/1000)}k chars (n=1, cap $${big.capUsd.toFixed(2)})`);
console.log(`   → n=1 supported size ≈ ${Math.round(lo/1000)}k chars · n≥10 (margin 10%) ≈ ${Math.round((()=>{let a=0,b=1_500_000;for(let i=0;i<40;i++){const m=(a+b)/2;if(costPrescreen(m,{n:10}).pass)a=m;else b=m;}return a;})()/1000)}k chars — cap RISES as margin shrinks + slope recalibrates.`);

// ── SIZE_BOUNDARY record — terminal, non-verdict, ratified copy ──
const rec = sizeBoundaryRecord(big);
ok(rec.status === SIZE_BOUNDARY_STATUS && !["BID","NO_BID","INELIGIBLE","NEEDS_HUMAN_REVIEW"].includes(rec.status.toUpperCase()), "SIZE_BOUNDARY is a terminal state, NOT a verdict");
ok(rec.message.includes("larger than FARaudit currently audits") && rec.message.includes("Send it to us and we'll audit it"), "refusal copy = Brain-ratified (CTA, no passive 'logged')");
ok(rec.contact === "support@faraudit.com", "contact CTA present");
ok(typeof rec.projectedUsd === "number" && typeof rec.chars === "number" && rec.modelVersion === COST_PRESCREEN_MODEL_VERSION, "refusal logs projected cost · chars · model version");

console.log(`\n${fail === 0 ? "✅ COST-PRESCREEN DRY: ALL PASS" : `❌ ${fail} FAILURE(S)`}`);
process.exit(fail === 0 ? 0 : 1);
