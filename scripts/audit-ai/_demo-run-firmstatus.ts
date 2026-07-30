// $0 — recompute firmStatus for the armed demo run's eligibility findings, under the RECORD's
// own flag env + profile (faithful replay of the decide-layer inputs).
import * as fs from "node:fs";
import { firmStatus } from "../../src/lib/audit-decide";

const rec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
for (const [k, v] of Object.entries(rec.meta.flagEnv ?? {})) process.env[k] = v as string;
const profile = rec.result.inputs.bidderProfile;
const src = rec.input.fullSource as string;
const elig = (rec.result.findings as any[]).filter((f) => f.requiredAttribute);
console.log(`eligibility findings: ${elig.length} · profile: ${JSON.stringify(profile.satisfiedAttributes)}`);
for (const f of elig) {
  const st = firmStatus(f, profile, src);
  console.log(`  ${String(f.requiredAttribute).slice(0, 60).padEnd(60)} → ${st}`);
}
