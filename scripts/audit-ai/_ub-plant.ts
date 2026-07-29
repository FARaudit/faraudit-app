import { readFileSync } from "fs";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_ua-cohort/36C25626Q1137__150c3ab3-9252-40a4-9ed3-49e64547eb70.json", "utf8"));
for (const [k, v] of Object.entries((rec.meta.flagEnv ?? {}) as Record<string,string>)) if (v !== undefined) process.env[k] = v;
(async () => {
  const { replayCoverageStage } = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-run-record");
  process.env.AUDIT_CONSEQUENCE_CAPTURE = "false"; process.env.AUDIT_RELEASE_LEDGER = "false";
  const off = replayCoverageStage(rec).coverageV2;
  process.env.AUDIT_CONSEQUENCE_CAPTURE = "true"; process.env.AUDIT_RELEASE_LEDGER = "true";
  const on = replayCoverageStage(rec).coverageV2;
  console.log("OFF: disqualifierUncovered =", off.disqualifierUncovered.length, "· ledger key:", "releasedBoilerplate" in (off as object));
  console.log("ON : disqualifierUncovered =", on.disqualifierUncovered.length, "· ledger:", (on as {releasedBoilerplate?: unknown[]}).releasedBoilerplate?.length);
  const newOnes = on.disqualifierUncovered.filter((d: {obligation: string}) => !off.disqualifierUncovered.some((o: {obligation: string}) => o.obligation === d.obligation));
  for (const d of newOnes.slice(0, 5)) console.log("  CAPTURED:", (d.obligation as string).slice(0, 110));
})();
