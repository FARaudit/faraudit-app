export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const RAW = fs.readFileSync(path.join(__dirname, "run-records/_new-653570ea.json"), "utf8");
const rec = JSON.parse(RAW);
const src = rec.result.inputs.source;
const before = JSON.stringify(rec.result.findings);
(async () => {
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
  const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
  await runAgenticAudit({ ctx, experts: [], callModel, seedFindings: rec.result.findings,
    bidderProfile: rec.result.inputs.bidderProfile ?? null, manifestComplete: rec.result.inputs.manifestComplete } as never);
  const after = JSON.stringify(rec.result.findings);
  if (before === after) { console.log("✅ CALLER'S seedFindings UNCHANGED — the rail does not mutate its input"); return; }
  const b = JSON.parse(before), a = JSON.parse(after);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    for (const k of new Set([...Object.keys(b[i]), ...Object.keys(a[i] ?? {})])) {
      if (JSON.stringify(b[i][k]) !== JSON.stringify((a[i] ?? {})[k])) {
        if (n < 6) console.log(`  [${i}] ${b[i].lens}/${b[i].id ?? "-"} .${k}\n      before: ${JSON.stringify(b[i][k]).slice(0,110)}\n      after : ${JSON.stringify((a[i]??{})[k]).slice(0,110)}`);
        n++;
      }
    }
  }
  console.log(`❌ THE RAIL MUTATED THE CALLER'S INPUT — ${n} field change(s) across ${b.length} seed findings`);
})();
