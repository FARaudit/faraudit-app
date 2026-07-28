// FALSIFICATION PROBE — is the replay gate a LIVE detector, or does it return "reproduced"
// regardless? Find a record that currently reproduces, perturb a verdict-relevant input, and
// require the verdict to CHANGE. If it does not, the gate is inert and its 29% means nothing.
import * as fs from "fs"; import * as path from "path";
import { replayRunRecord, type RunRecord } from "../../src/lib/audit-run-record";
const CACHE = path.join(__dirname, ".run-record-cache");
const apply = (fe: Record<string,string>) => { const s: Record<string,string|undefined>={};
  for (const k of Object.keys(process.env).filter(k=>k.startsWith("AUDIT_"))) { s[k]=process.env[k]; delete process.env[k]; }
  for (const [k,v] of Object.entries(fe)) process.env[k]=v;
  return () => { for (const k of Object.keys(process.env).filter(k=>k.startsWith("AUDIT_"))) delete process.env[k];
    for (const [k,v] of Object.entries(s)) if (v!==undefined) process.env[k]=v; }; };
let tested=0, detected=0;
for (const f of fs.readdirSync(CACHE)) {
  const rec = JSON.parse(fs.readFileSync(path.join(CACHE,f),"utf8")) as RunRecord;
  const fe = rec.meta?.flagEnv; if (!fe || !Object.keys(fe).length) continue;
  let r1; const restore = apply(fe);
  try { r1 = replayRunRecord(rec); } catch { restore(); continue; }
  if (!r1.verdictReproduced) { restore(); continue; }
  const before = r1.replayVerdict;
  const ri = rec.result.inputs as Record<string, unknown>;
  ri.documentsComplete = !(ri.documentsComplete as boolean);
  ri.coverageComplete = !(ri.coverageComplete as boolean);
  const r2 = replayRunRecord(rec); restore();
  tested++;
  const moved = r2.replayVerdict !== before;
  if (moved) detected++;
  console.log(`  ${(rec.meta?.sol||f).slice(0,22).padEnd(22)} ${before} -> ${r2.replayVerdict}  ${moved?"DETECTED":"NO CHANGE"}`);
}
console.log(`\n  reproducing records perturbed: ${tested}`);
console.log(`  perturbation DETECTED        : ${detected}/${tested}`);
console.log(detected>0 ? "  ✅ GATE IS LIVE — it responds to a verdict-relevant input change."
                       : "  ❌ GATE IS INERT — 'reproduced' is unconditional; the 29% is meaningless.");
