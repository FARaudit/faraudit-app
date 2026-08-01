// RE-MEASUREMENT under the ACTUAL worker flag set, not the stale stamp named "live".
// Every headline number from this session was taken under applyStampedConfig("live"), which the red-team
// proved differs from production in 31 flags (25 live-true-but-unset, 6 live-true-but-pinned-FALSE).
export {};
import { readFileSync } from "node:fs";
import { rebuildLedger, isCommittal } from "./_instrument";
const SNAP = process.env.WORKER_FLAGS!;
for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
for (const line of readFileSync(SNAP, "utf8").split("\n")) {
  const m = /^(AUDIT_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2] === "True" ? "true" : m[2];
}
console.log(`applied ${Object.keys(process.env).filter((k) => k.startsWith("AUDIT_")).length} AUDIT_* keys from the LIVE worker`);
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const verdicts = new Map<string, number>(), causes = new Map<string, number>();
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let d: any; try { d = deriveVerdict(inp); } catch { verdicts.set("THREW", (verdicts.get("THREW") ?? 0) + 1); continue; }
    verdicts.set(d.verdict, (verdicts.get(d.verdict) ?? 0) + 1);
    const k = `${d.verdict}${d.noVerdictCause ? " / " + d.noVerdictCause : ""}`;
    causes.set(k, (causes.get(k) ?? 0) + 1);
  }
  const n = m.length, c = [...verdicts].filter(([v]) => isCommittal(v)).reduce((a, [, k]) => a + k, 0);
  console.log(`\nMEASURABLE: ${n}`);
  for (const [v, k] of [...verdicts].sort((a, b) => b[1] - a[1])) console.log(`   ${String(k).padStart(3)}  ${v}`);
  console.log(`   → committal ${c}/${n} (${(100 * c / n).toFixed(1)}%) · declined ${n - c}/${n} (${(100 * (n - c) / n).toFixed(1)}%)`);
  console.log(`\nEXIT CAUSES:`);
  for (const [k, v] of [...causes].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`);
})();
