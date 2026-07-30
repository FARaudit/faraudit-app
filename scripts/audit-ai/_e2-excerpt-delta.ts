export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const rec = JSON.parse(fs.readFileSync(path.join(__dirname, "run-records/_new-653570ea.json"), "utf8"));
const src = rec.result.inputs.source;
const run = (extra: Record<string,string>) => {
  for (const k of Object.keys(process.env).filter(k => k.startsWith("AUDIT_"))) delete process.env[k];
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
  delete process.env.AUDIT_CITATION_FIDELITY; delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
  const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
  return runAgenticAudit({ ctx, experts: [], callModel, seedFindings: rec.result.findings,
    bidderProfile: rec.result.inputs.bidderProfile ?? null, manifestComplete: rec.result.inputs.manifestComplete } as never);
};
(async () => {
  const off: any = await run({});
  const on: any = await run({ AUDIT_CITATION_FIDELITY: "true" });
  const m = new Map((off.findings ?? []).map((f: any) => [f.id, f]));
  for (const f of on.findings ?? []) {
    const o: any = m.get(f.id);
    if (!o) { console.log(`NEW id ${f.id}`); continue; }
    if (o.excerpt !== f.excerpt) {
      console.log(`EXCERPT DELTA id=${f.id} lens=${f.lens}\n  OFF: ${JSON.stringify(String(o.excerpt).slice(0,220))}\n  ON : ${JSON.stringify(String(f.excerpt).slice(0,220))}`);
    }
    if (o.citation !== f.citation) console.log(`CITE DELTA id=${f.id}\n  OFF: ${o.citation}\n  ON : ${f.citation}`);
    if (o.requirement !== f.requirement) console.log(`REQ DELTA id=${f.id}\n  OFF: ${String(o.requirement).slice(0,160)}\n  ON : ${String(f.requirement).slice(0,160)}`);
  }
  console.log(`counts off=${(off.findings??[]).length} on=${(on.findings??[]).length} withheld=${(on.citationsWithheld??[]).length}`);
})();
