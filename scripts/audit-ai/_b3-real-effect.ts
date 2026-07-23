// B3 · MEASURED EFFECT ON REAL BANKED RECORDS (rebuilt instrument). Shows, per record with a non-empty
// disqualifierUncovered bucket, WHICH obligation the banner quotes with ranking OFF vs ON — the customer-facing
// delta. A flag whose measured effect on live substrate is zero is a flag that ships nothing.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { gateV2Outcome } = await import("../../src/lib/audit-gate-v2");
  const led = await rebuildLedger();
  const w = <T,>(v: string, fn: () => T): T => { const p = process.env.AUDIT_BANNER_BAR_RANKING; process.env.AUDIT_BANNER_BAR_RANKING = v;
    try { return fn(); } finally { if (p === undefined) delete process.env.AUDIT_BANNER_BAR_RANKING; else process.env.AUDIT_BANNER_BAR_RANKING = p; } };
  let changed = 0, capChanged = 0, examined = 0;
  for (const r of led) {
    if (r.measurable === "NOT MEASURABLE") continue;
    const cov = r.inputs.coverageV2;
    if (!cov?.disqualifierUncovered?.length) continue;
    examined++;
    const findings = r.inputs.findings ?? [];
    const off = w("false", () => gateV2Outcome(cov, { findings }));
    const on  = w("true",  () => gateV2Outcome(cov, { findings }));
    if (off.cap !== on.cap) { capChanged++; console.log(`  ‼ CAP CHANGED on ${r.id} — B3 MUST be cap-invariant`); }
    if (off.reason !== on.reason) {
      changed++;
      console.log(`\n▸ ${r.id}   (bucket=${cov.disqualifierUncovered.length}, cap ${String(off.cap)} → ${String(on.cap)})`);
      console.log(`   OFF: ${off.reason.slice(0, 175)}`);
      console.log(`   ON : ${on.reason.slice(0, 175)}`);
    }
  }
  console.log(`\n${"─".repeat(100)}`);
  console.log(`records with a non-empty bucket: ${examined} · banner text CHANGED by ranking: ${changed} · CAP changed: ${capChanged}`);
  console.log(capChanged === 0 ? "✅ CAP-INVARIANT on every real record (B3's core safety property, measured not asserted)"
                               : "❌ CAP CHANGED — B3 violates its invariant on live substrate");
  process.exit(capChanged === 0 ? 0 : 1);
})();
