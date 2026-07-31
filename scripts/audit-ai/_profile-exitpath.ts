// Does a PERFECT profile even reach the eligibility mute? Compare the named exit cause per profile.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const asks = new Set<string>();
  for (const r of m) for (const f of r.inputs.findings ?? []) if (f.requiredAttribute) asks.add(f.requiredAttribute);
  const all = [...asks, "se:sdvosb"]; const asOf = "2026-07-31T00:00:00.000Z";
  const rich = { satisfiedAttributes: all, asOf, attributes: all.map((a) => ({ attr: a, source: "sam_api", verifiedAt: asOf })) };
  for (const [label, profile] of [["as banked", undefined], ["schema-V2 perfect", rich]] as Array<[string, any]>) {
    const causes = new Map<string, number>();
    for (const r of m) {
      const base = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
      const inp = profile === undefined ? base : { ...base, bidderProfile: profile };
      let d: any; try { d = deriveVerdict(inp); } catch { continue; }
      const k = `${d.verdict}${d.noVerdictCause ? " / " + d.noVerdictCause : ""}`;
      causes.set(k, (causes.get(k) ?? 0) + 1);
    }
    console.log(`\n${label}:`);
    for (const [k, n] of [...causes].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${k}`);
  }
})();
