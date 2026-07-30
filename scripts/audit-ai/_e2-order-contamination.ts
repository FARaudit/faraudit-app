export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const raw = fs.readFileSync(path.join(__dirname, "run-records/_new-653570ea.json"), "utf8");
const base = JSON.parse(raw);
const src = base.result.inputs.source;
// FRESH seed each run — no shared objects between runs.
const run = async (extra: Record<string,string>, fresh: boolean) => {
  const rec = fresh ? JSON.parse(raw) : base;
  for (const k of Object.keys(process.env).filter(k => k.startsWith("AUDIT_"))) delete process.env[k];
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
  delete process.env.AUDIT_CITATION_FIDELITY; delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
  const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
  const r: any = await runAgenticAudit({ ctx, experts: [], callModel, seedFindings: rec.result.findings,
    bidderProfile: rec.result.inputs.bidderProfile ?? null, manifestComplete: rec.result.inputs.manifestComplete } as never);
  const kf = (r.findings ?? []).filter((f: any) => f.lens === "keyfact_detector");
  return { n: (r.findings??[]).length, kf: kf.length, first: String(kf[0]?.excerpt ?? "").slice(0, 60) };
};
(async () => {
  console.log("--- SHARED seed object across runs (what the harness did) ---");
  const s1 = await run({}, false), s2 = await run({ AUDIT_CITATION_FIDELITY: "true" }, false), s3 = await run({}, false);
  console.log("OFF#1", JSON.stringify(s1)); console.log("ON  ", JSON.stringify(s2)); console.log("OFF#2", JSON.stringify(s3));
  console.log(s1.first === s3.first ? "→ OFF#1 == OFF#2 : the FLAG changed it" : "→ OFF#1 != OFF#2 : SEED MUTATION carried across runs");
  console.log("\n--- FRESH seed each run ---");
  const f1 = await run({}, true), f2 = await run({ AUDIT_CITATION_FIDELITY: "true" }, true);
  console.log("OFF ", JSON.stringify(f1)); console.log("ON  ", JSON.stringify(f2));
  console.log(f1.first === f2.first ? "→ identical with a fresh seed : the earlier delta was CONTAMINATION, not the flag" : "→ still differs : the flag really does change keyfact emission");
})();
