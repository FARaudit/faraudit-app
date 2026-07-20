import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "40fd02ce-e123-4fcf-b308-b85a6884d958";
(async () => {
  const { data, error } = await sb.storage.from("run-records").download(`12318726Q0165/${ID}.json`);
  if (error || !data) { console.log("download err:", error?.message); return; }
  const txt = await data.text();
  mkdirSync("scripts/audit-ai/run-records", { recursive: true });
  writeFileSync(`scripts/audit-ai/run-records/_refire-40fd02ce.json`, txt);
  const r = JSON.parse(txt); const res = r.result ?? {};
  console.log("=== FLAG ENV (did arc flags apply in-run?) ===");
  const fe = r.meta?.flagEnv ?? {};
  console.log("flagEnv keys:", Object.keys(fe).length);
  for (const f of ["AUDIT_SELF_CLEARABLE_PACKAGE","AUDIT_FABRICATION_INVARIANT","AUDIT_RECITAL_LINEWRAP_BRIDGE","AUDIT_BOND_PAPER_NONBAR","AUDIT_PERFORMANCE_UPKEEP_CAVEAT","AUDIT_BENIGN_RECITAL_COVERED","AUDIT_CREDENTIAL_CONDITIONAL_REASON"]) console.log(`   ${f}=${fe[f]}`);
  console.log("\n=== VERDICT + VERIFIER ===");
  console.log("verdict:", res.verdict, "· pole:", res.pole);
  console.log("reason:", (res.reason||"").slice(0,300));
  const v = res.verifier ?? res.verification ?? res.skeptic ?? {};
  console.log("verifierSound:", v.sound ?? v.verifierSound ?? res.verifierSound);
  console.log("verifier keys:", Object.keys(v).join(", "));
  console.log("verifier detail:", JSON.stringify(v).slice(0, 900));
  console.log("\n=== DIAGNOSTICS (#582) ===");
  const d = res.diagnostics ?? {};
  console.log("stageCounts:", JSON.stringify(d.stageCounts));
  console.log("diag keys:", Object.keys(d).join(", "));
  const cov2 = res.inputs?.coverageV2 ?? res.coverageV2 ?? {};
  console.log("\n=== coverageV2 buckets ===");
  console.log("benignCoveredRecital=", (cov2.benignCoveredRecital??[]).length,
    "· caveatRecital=", (cov2.caveatRecital??[]).length,
    "· disqualifierUncovered=", (cov2.disqualifierUncovered??[]).length,
    "· ungroundedNonBarSignal=", (cov2.ungroundedNonBarSignal??[]).length);
  console.log("\n=== top-level result keys ===");
  console.log(Object.keys(res).join(", "));
})();
