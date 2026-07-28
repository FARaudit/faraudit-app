// FLAG-ENV INTEGRITY — does any banked record's flagEnv contain a setting mistake rather than a flag state?
//   npx tsx scripts/audit-ai/_flagenv-integrity.ts
// A variable name containing whitespace is one variable, not N. Every flag inside it was UNSET in that run,
// so any cert replaying "under the record's flag env" is faithfully reproducing a run whose flag state was
// NOT production's. Falsifiable by construction: it reports counts from the records themselves.
export {};
import * as fs from "fs"; import * as path from "path";
import { captureAuditFlagEnv } from "../../src/lib/audit-run-record";
const DIR = path.join(__dirname, "run-records");
let withEnv = 0, bad = 0; const hidden = new Set<string>();
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let d: any; try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
  const fe = d?.meta?.flagEnv; if (!fe || !Object.keys(fe).length) continue;
  withEnv++;
  const mal = Object.keys(fe).filter((k) => /\s/.test(k.trim()));
  if (!mal.length) continue;
  bad++;
  for (const k of mal) for (const t of k.trim().split(/\s+/)) if (t.startsWith("AUDIT_")) hidden.add(t);
  console.log(`❌ ${f}\n     ${mal.length} malformed name(s), ${mal.reduce((n, k) => n + k.trim().split(/\s+/).length, 0)} flags hidden`);
}
console.log(`\nrecords carrying a flagEnv: ${withEnv} · with a malformed name: ${bad}`);
console.log(`distinct flags that were UNSET despite looking set: ${hidden.size}`);
// prove the guard fires
const probe = captureAuditFlagEnv({ "AUDIT_A AUDIT_B": "true", AUDIT_REAL: "true" });
console.log(`\nguard self-check — capture kept ${Object.keys(probe).length} key(s) and warned above: ${"AUDIT_A AUDIT_B" in probe ? "faithful (mistake preserved, announced)" : "DROPPED — capture is no longer faithful"}`);
console.log(bad === 0 ? "✅ every banked flagEnv is well-formed" : "⚠️  replay-based certs on the affected records reproduce a NON-production flag state");
