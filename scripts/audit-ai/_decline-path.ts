// GAUNTLET GATE 1 ($0) — WHICH exit is each banked record actually taking? deriveVerdict stamps
// `noVerdictCause` on every NHR return, so the decline path is nameable without instrumenting the engine.
export {};
import { applyStampedConfig, rebuildLedger, isCommittal } from "./_instrument";
const SOL = process.env.PROBE_SOL ?? "";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs && (!SOL || r.id.startsWith(SOL)));
  const causes = new Map<string, number>();
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let d: any; try { d = deriveVerdict(inp); } catch (e) { console.log(`   THREW ${r.id}: ${e}`); continue; }
    const key = `${d.verdict}${d.noVerdictCause ? " / " + d.noVerdictCause : ""}`;
    causes.set(key, (causes.get(key) ?? 0) + 1);
    if (SOL) console.log(`   ${r.id.slice(0, 46).padEnd(46)} ${key}\n        ↳ ${String(d.reason).slice(0, 170)}`);
  }
  console.log(`\nEXIT PATHS TAKEN (${m.length} records${SOL ? `, ${SOL}` : ""}):`);
  for (const [k, n] of [...causes].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${isCommittal(k.split(" /")[0]) ? "COMMIT " : "decline"}  ${k}`);
})();
