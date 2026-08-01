// $0 — the OBSERVED verdict distribution on every banked record, under the live stamped config.
// No ground truth needed: this measures what the engine DOES, not whether it was right.
// Grouping keys on meta.sol (the run's own solicitation), NOT the filename — five records are
// filenamed by arc label (_dl-, _fire-, _new-, _refire-) and are all the SAME solicitation.
export {};
import { readFileSync } from "node:fs";
import { applyStampedConfig, rebuildLedger, isCommittal } from "./_instrument";
const TEMPORAL = process.env.PROBE_TEMPORAL ?? "true";
applyStampedConfig("live");
process.env.AUDIT_TEMPORAL_VERDICT = TEMPORAL;
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const rows: Array<{ sol: string; v: string }> = [];
  const tally = new Map<string, number>();
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let v = "THREW"; try { v = String(deriveVerdict(inp).verdict); } catch {}
    let sol = r.id.split(".")[0];
    try { sol = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${r.file}`, "utf8"))?.meta?.sol || sol; } catch {}
    tally.set(v, (tally.get(v) ?? 0) + 1); rows.push({ sol, v });
  }
  console.log(`\nAUDIT_TEMPORAL_VERDICT=${TEMPORAL} · ledger ${led.length} · MEASURABLE ${m.length} · NOT MEASURABLE ${led.length - m.length}`);
  for (const [v, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${v}`);
  const c = rows.filter((r) => isCommittal(r.v)).length;
  console.log(`   → committal ${c}/${rows.length} (${(100 * c / rows.length).toFixed(1)}%) · declined ${rows.length - c}/${rows.length} (${(100 * (rows.length - c) / rows.length).toFixed(1)}%)`);
  // DE-DUPLICATED: one vote per solicitation. A solicitation counts as committal if ANY of its runs committed
  // (the most generous reading — it cannot understate the commit rate).
  const bySol = new Map<string, string[]>();
  for (const r of rows) { if (!bySol.has(r.sol)) bySol.set(r.sol, []); bySol.get(r.sol)!.push(r.v); }
  const solCommit = [...bySol.values()].filter((vs) => vs.some(isCommittal)).length;
  console.log(`   → per-SOLICITATION (any-run-committal): ${solCommit}/${bySol.size} commit · ${bySol.size - solCommit}/${bySol.size} never commit`);
  for (const [s, vs] of [...bySol].sort()) console.log(`      ${s.padEnd(20)} ${vs.length}× ${[...new Set(vs)].join(" | ")}`);
})();
