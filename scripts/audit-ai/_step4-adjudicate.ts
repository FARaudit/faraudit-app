export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { importanceOf, hasBarSignal } = await import("../../src/lib/audit-gate-v2");
  const led = await rebuildLedger();
  const r = led.find(x=>x.id.includes("SP3300-26-Q-0165.2026-07-02T02-24"))!;
  const cov = r.inputs.coverageV2;
  console.log("=== the 2 obligations the veto UNIQUELY catches (full text) ===");
  for (const d of cov.disqualifierUncovered) {
    console.log(`\n§${d.section}: "${d.obligation}"`);
    console.log(`   importanceOf=${importanceOf(d.obligation)}  hasBarSignal=${hasBarSignal(d.obligation)}`);
  }
  const bars = (r.inputs.findings as any[]).filter(f=>f.controllability==="bidder_cannot_move"||f.controllability==="no_one_can_move");
  console.log(`\n=== hard bars in this record: ${bars.length} ===`);
  for (const b of bars) console.log(`  ${b.kind} attr=${b.requiredAttribute??"-"} ${JSON.stringify((b.requirement||"").slice(0,110))}`);
  const elig = (r.inputs.findings as any[]).filter(f=>f.kind==="eligibility_bar");
  console.log(`\n=== eligibility_bar findings: ${elig.length} ===`);
  for (const b of elig) console.log(`  ctrl=${b.controllability} ${JSON.stringify((b.requirement||"").slice(0,110))}`);
})();
