// U-B end-to-end: RECOMPUTE coverage (capture ON/OFF) → thread into inputs.coverageV2 → deriveVerdict.
// The banked-inputs sweep is a placebo for capture (coverage precomputed) — this is the real composition.
import { readFileSync } from "fs";
const file = process.argv[2];
const rec = JSON.parse(readFileSync(file, "utf8"));
for (const [k, v] of Object.entries((rec.meta?.flagEnv ?? {}) as Record<string, string>)) if (v !== undefined) process.env[k] = v;
process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "true";
(async () => {
  const { replayCoverageStage } = await import("../../src/lib/audit-run-record");
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  const run = (on: boolean) => {
    process.env.AUDIT_RELEASE_LEDGER = on ? "true" : "false";
    process.env.AUDIT_CONSEQUENCE_CAPTURE = on ? "true" : "false";
    const cov = replayCoverageStage(rec).coverageV2;
    const d = deriveVerdict({ ...rec.result.inputs, coverageV2: cov });
    return { d, cov };
  };
  const off = run(false), on = run(true);
  console.log(`${(file.split("/").pop() ?? "").slice(0, 46)}`);
  console.log(`  OFF: ${off.d.verdict} · uncovered=${off.cov.disqualifierUncovered.length} :: ${(off.d.reason ?? "").slice(0, 120)}`);
  console.log(`  ON : ${on.d.verdict} · uncovered=${on.cov.disqualifierUncovered.length} · ledger=${(on.cov as { releasedBoilerplate?: unknown[] }).releasedBoilerplate?.length ?? "—"} :: ${(on.d.reason ?? "").slice(0, 160)}`);
})();
