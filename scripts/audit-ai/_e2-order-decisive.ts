export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const RAW = fs.readFileSync(path.join(__dirname, "run-records/_new-653570ea.json"), "utf8");
const shared = JSON.parse(RAW);          // reused across runs (what the probes did)
const src = shared.result.inputs.source;
const go = async (flag: boolean, seedFrom: any) => {
  for (const k of Object.keys(process.env).filter(k => k.startsWith("AUDIT_"))) delete process.env[k];
  for (const [k, v] of Object.entries(shared.meta?.flagEnv ?? {})) process.env[k] = v as string;
  delete process.env.AUDIT_CITATION_FIDELITY; delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  if (flag) process.env.AUDIT_CITATION_FIDELITY = "true";
  const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
  const r: any = await runAgenticAudit({ ctx, experts: [], callModel, seedFindings: seedFrom.result.findings,
    bidderProfile: seedFrom.result.inputs.bidderProfile ?? null, manifestComplete: seedFrom.result.inputs.manifestComplete } as never);
  const k0 = (r.findings ?? []).find((f: any) => f.id === "keyfact_detector#0");
  return String(k0?.excerpt ?? "(absent)").slice(0, 52);
};
(async () => {
  console.log("A) SHARED seed, ON first then OFF:");
  console.log("   ON :", await go(true,  shared));
  console.log("   OFF:", await go(false, shared));
  console.log("\nB) FRESH seed each run, OFF then ON:");
  console.log("   OFF:", await go(false, JSON.parse(RAW)));
  console.log("   ON :", await go(true,  JSON.parse(RAW)));
  console.log("\nC) FRESH seed, OFF twice (control):");
  console.log("   OFF:", await go(false, JSON.parse(RAW)));
  console.log("   OFF:", await go(false, JSON.parse(RAW)));
})();
