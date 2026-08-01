export {};
import { applyStampedConfig, rebuildLedger, isCommittal } from "./_instrument";
import { readFileSync } from "node:fs";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const bySol = new Map<string, string[]>();
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let v = "THREW"; try { v = String(deriveVerdict(inp).verdict); } catch {}
    let sol = r.id.split(".")[0];
    try { sol = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${r.file}`, "utf8"))?.meta?.sol || sol; } catch {}
    if (!bySol.has(sol)) bySol.set(sol, []); bySol.get(sol)!.push(v);
  }
  const recs = [...bySol.values()].flat();
  console.log(`   per-RECORD  : ${recs.filter(isCommittal).length}/${recs.length} commit (${(100*recs.filter(isCommittal).length/recs.length).toFixed(1)}%)`);
  const anyC = [...bySol.values()].filter((vs) => vs.some(isCommittal)).length;
  console.log(`   per-SOLICITATION (any run commits): ${anyC}/${bySol.size} (${(100*anyC/bySol.size).toFixed(1)}%)`);
  const big = [...bySol].sort((a,b)=>b[1].length-a[1].length)[0];
  console.log(`   largest single solicitation: ${big[0]} = ${big[1].length}/${recs.length} records (${(100*big[1].length/recs.length).toFixed(1)}% of the corpus)`);
})();
