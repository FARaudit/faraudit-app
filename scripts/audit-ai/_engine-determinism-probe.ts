// Same record, same flags, twice. Any delta = the rail is non-deterministic.
export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const rec = JSON.parse(fs.readFileSync(path.join(__dirname, "run-records/_new-653570ea.json"), "utf8"));
const src = rec.result.inputs.source;
const run = () => {
  for (const k of Object.keys(process.env).filter(k => k.startsWith("AUDIT_"))) delete process.env[k];
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
  const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
  return runAgenticAudit({ ctx, experts: [], callModel, seedFindings: rec.result.findings,
    bidderProfile: rec.result.inputs.bidderProfile ?? null, manifestComplete: rec.result.inputs.manifestComplete } as never);
};
(async () => {
  const a: any = await run(); const b: any = await run();
  const ex = (r: any) => (r.findings ?? []).map((f: any) => `${f.id}|${f.excerpt}`);
  const A = ex(a), B = ex(b);
  let diff = 0;
  for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) { if (diff < 3) console.log(`DELTA @${i}\n  run1: ${String(A[i]).slice(0,150)}\n  run2: ${String(B[i]).slice(0,150)}`); diff++; }
  console.log(`\nfindings ${A.length} vs ${B.length} · excerpt deltas ${diff} · verdict ${a.decision.verdict}/${b.decision.verdict}`);
  console.log(diff === 0 ? "✅ DETERMINISTIC" : "❌ NON-DETERMINISTIC — same input, same flags, different output");
})();
