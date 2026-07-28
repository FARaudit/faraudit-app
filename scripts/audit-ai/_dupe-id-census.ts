export {};
import * as fs from "fs"; import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL"); }) as never;
const DIR = path.join(__dirname, "run-records");
(async () => {
  let recs = 0, withDupes = 0; const byPrefix: Record<string, number> = {};
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith(".json"))) {
    let rec: any; try { rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
    const src = rec?.result?.inputs?.source, seed = rec?.result?.findings;
    if (typeof src !== "string" || src.length < 5000 || !Array.isArray(seed) || !seed.length) continue;
    for (const k of Object.keys(process.env).filter(k => k.startsWith("AUDIT_"))) delete process.env[k];
    for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
    const ctx: AuditToolContext = { fullSource: src, groundingSource: src } as AuditToolContext;
    let r: any; try {
      r = await runAgenticAudit({ ctx, experts: [], callModel, seedFindings: seed,
        bidderProfile: rec.result.inputs.bidderProfile ?? null, manifestComplete: rec.result.inputs.manifestComplete } as never);
    } catch { continue; }
    recs++;
    const seen = new Map<string, number>();
    for (const fi of r.findings ?? []) if (fi.id) seen.set(fi.id, (seen.get(fi.id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    if (dupes.length) { withDupes++; for (const [id] of dupes) byPrefix[id.split("#")[0]] = (byPrefix[id.split("#")[0]] ?? 0) + 1; }
  }
  console.log(`\nrecords run ${recs} · records with DUPLICATE finding ids: ${withDupes}`);
  console.log("duplicate ids by emitter:", JSON.stringify(byPrefix, null, 0));
  console.log(withDupes === 0 ? "✅ ids unique on every record" : "❌ the class is NOT closed by the keyfact fix alone");
})();
