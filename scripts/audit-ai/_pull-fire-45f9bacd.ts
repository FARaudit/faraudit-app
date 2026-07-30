import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, error } = await sb.storage.from("run-records").download("12318726Q0165/45f9bacd-c728-4b83-8aef-b245f15ac2a8.json");
  if (error || !data) { console.log("download err:", error?.message); return; }
  const txt = await data.text();
  writeFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json", txt);
  const r = JSON.parse(txt); const res = r.result ?? {};
  const cov2 = (res.inputs?.coverageV2) ?? {};
  console.log("=== #582 CAPTURE CHECK ===");
  console.log("meta.flagEnv present:", !!r.meta?.flagEnv, "· keys:", r.meta?.flagEnv ? Object.keys(r.meta.flagEnv).length : 0);
  const fe = r.meta?.flagEnv ?? {};
  for (const f of ["AUDIT_FABRICATION_INVARIANT","AUDIT_PERFORMANCE_UPKEEP_CAVEAT","AUDIT_BENIGN_RECITAL_COVERED","AUDIT_CREDENTIAL_CONDITIONAL_REASON"]) console.log(`   ${f}=${fe[f]}`);
  console.log("result.diagnostics present:", !!res.diagnostics, res.diagnostics ? `· stageCounts=${JSON.stringify(res.diagnostics.stageCounts)}` : "");
  console.log("\n=== VERDICT + DRIVER ===");
  console.log("verdict:", res.verdict, "· reason:", (res.reason||"").slice(0,220));
  console.log("coverageV2 buckets: benignCoveredRecital=", (cov2.benignCoveredRecital??[]).length,
    "caveatRecital=", (cov2.caveatRecital??[]).length,
    "disqualifierUncovered=", (cov2.disqualifierUncovered??[]).length,
    "ungroundedNonBarSignal=", (cov2.ungroundedNonBarSignal??[]).length);
  console.log("\n=== the disqualifierUncovered drivers (why NHR) ===");
  for (const d of (cov2.disqualifierUncovered??[]).slice(0,6)) console.log(`   [${d.section}] ${(d.obligation||"").slice(0,150)}`);
})();
