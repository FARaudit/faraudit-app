// FA-136 gate S-layer (standalone) — single-doc regression: RE-RENDER (not
// re-run) of stored audit 05b44783 (SPRTA1-26-R-0081 family; the demo-locked
// 41a2baa0 is off limits) must show NO ingestion banner. Zero LLM cost —
// split from the main suite so a rerun never repeats the paid evidence run.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" .env.local) && set +a && npx tsx test/verify-fa136-singledoc-regression.ts

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

async function main(): Promise<void> {
  const { buildViewModel } = await import("../src/app/audit/[id]/_view-model");
  const { renderAuditReportComplete } = await import("../src/app/audit/[id]/_render");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const template = readFileSync("src/app/audit/[id]/_template.html", "utf8");

  const { data: r0081 } = await supabase.from("audits").select("id").eq("solicitation_number", "SPRTA1-26-R-0081");
  const singleId = (r0081 ?? []).map((r) => r.id as string).find((i) => i.startsWith("05b44783"));
  check("S0 fixture 05b44783 located", !!singleId, `family rows: ${(r0081 ?? []).map((r) => String(r.id).slice(0, 8)).join(",")}`);
  if (!singleId) { console.log("\nFA-136 single-doc regression: FAILURE"); process.exit(1); }

  const { data: single } = await supabase.from("audits").select("*").eq("id", singleId).single();
  const svm = buildViewModel(single);
  check("S1 no ingestion flag on single-doc audit", svm.ingestion_incomplete === false && svm.ingestion_note === "");
  const shtml = renderAuditReportComplete(template, svm, single);
  check("S2 no ingestion banner in single-doc render", !/data-ingestion-incomplete/.test(shtml));
  check("S3 no call3 banner either (pre-FA-137 row, null telemetry)", !/data-call3-degraded/.test(shtml));

  console.log(failures === 0 ? "\nFA-136 single-doc regression: ALL PASS" : `\nFA-136 single-doc regression: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("crashed:", e.message); process.exit(2); });
