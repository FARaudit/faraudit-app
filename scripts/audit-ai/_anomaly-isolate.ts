export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const RAW = fs.readFileSync(path.join(__dirname, "run-records/_new-653570ea.json"), "utf8");
const src = JSON.parse(RAW).result.inputs.source;
const go = async (label: string, flags: Record<string,string>) => {
  const rec = JSON.parse(RAW);
  for (const k of Object.keys(process.env).filter(k => k.startsWith("AUDIT_"))) delete process.env[k];
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
  delete process.env.AUDIT_CITATION_FIDELITY; delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  for (const [k, v] of Object.entries(flags)) process.env[k] = v;
  const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
  const r: any = await runAgenticAudit({ ctx, experts: [], callModel, seedFindings: rec.result.findings,
    bidderProfile: rec.result.inputs.bidderProfile ?? null, manifestComplete: rec.result.inputs.manifestComplete } as never);
  const kf = (r.findings ?? []).filter((f: any) => f.lens === "keyfact_detector")
    .map((f: any) => `${f.id}=${String(f.excerpt).slice(0,34).replace(/\s+/g," ")}`);
  console.log(`${label.padEnd(12)} total=${(r.findings??[]).length} keyfacts=${kf.length}`);
  for (const k of kf) console.log(`             ${k}`);
  return kf.join("||");
};
(async () => {
  const a = await go("1 OFF", {});
  const b = await go("2 OFF", {});                                   // identical flags — isolates run ORDER
  const c = await go("3 ON",  { AUDIT_CITATION_FIDELITY: "true" });
  console.log("\nrun1 vs run2 (SAME flags):", a === b ? "IDENTICAL" : "❌ DIFFER → run-order/process state, not the flag");
  console.log("run2 vs run3 (flag flip) :", b === c ? "IDENTICAL" : "❌ DIFFER → the flag");
})();
