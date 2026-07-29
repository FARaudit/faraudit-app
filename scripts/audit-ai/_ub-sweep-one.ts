// U-B cohort sweep runner — faithful per-record flagEnv + U-A pinned ON both sides; U-B flags toggled.
import { readFileSync } from "fs";
const rec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const inputs = rec?.result?.inputs;
if (!inputs) { console.log(JSON.stringify({ f: process.argv[2], skip: 1 })); process.exit(0); }
for (const [k, v] of Object.entries((rec.meta?.flagEnv ?? {}) as Record<string, string>)) if (v !== undefined) process.env[k] = v;
process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "true";
(async () => {
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  process.env.AUDIT_RELEASE_LEDGER = "false"; process.env.AUDIT_CONSEQUENCE_CAPTURE = "false";
  const off = deriveVerdict(inputs);
  process.env.AUDIT_RELEASE_LEDGER = "true"; process.env.AUDIT_CONSEQUENCE_CAPTURE = "true";
  const on = deriveVerdict(inputs);
  console.log(JSON.stringify({ f: (process.argv[2].split("/").pop() ?? "").slice(0, 44), off: off.verdict, on: on.verdict }));
})();
