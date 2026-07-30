// $0 CERT — REPORT-TRUTH #1 on the REAL live run. Pulls the persisted audit 95698f91 (W9123826QA032, the run the
// Gauntlet graded F / NO-STAMP) and pushes its OWN stored fullSource + findings through the production pair:
//   documentsCovered(...)  →  deriveAnalyzedDocuments(...)
// and asserts the customer-facing documents card now tells the truth it told wrong on 2026-07-30.
//
// SHIPPED (what the customer was told):  {read:3, analyzed:3, complete:true, missing:[]}
// TRUTH   (what the engine already knew): uncovered = ["WAGE DETERMINATIONS - 20260513.pdf"]
//
// Real stored artifacts, production functions, no re-fire, no model call. Run:
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cert-rt1-analyzed-truth.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT_ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";
// The LIVE worker flag state for the coverage inputs (railway variables --service audit-worker --kv, 2026-07-30).
process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await admin.from("audits").select("compliance_json,raw_pdf_text,solicitation_number").eq("id", AUDIT_ID).single();
  if (error) throw new Error(JSON.stringify(error));
  const cj = (row as { compliance_json: Record<string, unknown> }).compliance_json as Record<string, any>;
  const fullSource: string = (row as { raw_pdf_text: string }).raw_pdf_text;
  const findings = cj.v3.findings as unknown[];

  console.log(`\naudit ${AUDIT_ID.slice(0, 8)} · ${(row as { solicitation_number: string }).solicitation_number} · source ${fullSource.length} chars · ${findings.length} findings`);
  console.log(`SHIPPED documents card: ${JSON.stringify(cj.v3.documents)}\n`);

  const { documentsCovered } = await import("../../src/lib/audit-orchestrator");
  const { deriveAnalyzedDocuments } = await import("../../src/lib/audit-executor-v3");

  // Stage 1 — the engine's own coverage answer, on the stored artifacts, at the live flag state.
  const cov = documentsCovered(fullSource, findings as never, undefined);
  console.log("STAGE 1 · documentsCovered");
  ok("the engine ALREADY knew the package was incomplete", cov.complete === false);
  ok("and it already NAMED the Wage Determination", cov.uncovered.includes("WAGE DETERMINATIONS - 20260513.pdf"));
  ok("and nothing else — the gap is precise, not a blanket fail", cov.uncovered.length === 1);

  // Stage 2 — the display figure derived from that same answer (the fix).
  const truth = deriveAnalyzedDocuments(fullSource, cov.uncovered);
  console.log("\nSTAGE 2 · deriveAnalyzedDocuments (the fix)");
  console.log(`  → analyzed ${truth.analyzed} of ${truth.analyzed_of} · unanalyzed: ${JSON.stringify(truth.unanalyzed.map((u) => u.name))}`);
  ok("analyzed is 2 of 3 — NOT the 3 of 3 that shipped", truth.analyzed === 2 && truth.analyzed_of === 3);
  ok("the WD is named to the customer", truth.unanalyzed.some((u) => u.name === "WAGE DETERMINATIONS - 20260513.pdf"));
  ok("shipped card said analyzed:3 — the fix disagrees with it", cj.v3.documents.analyzed === 3 && truth.analyzed !== cj.v3.documents.analyzed);
  ok("shipped card said complete:true — the fix forces complete:false", cj.v3.documents.complete === true && truth.unanalyzed.length > 0);

  // Stage 3 — the content the report called "unknown" is provably IN the document it never analyzed.
  console.log("\nSTAGE 3 · the consequence (why this is a customer defect, not a display nit)");
  const wdRegion = (await import("../../src/lib/audit-orchestrator")).docRegions(fullSource).find((r) => r.name === "WAGE DETERMINATIONS - 20260513.pdf");
  ok("the WD region is present in the source the engine read", !!wdRegion && wdRegion.text.length > 20000);
  for (const [label, re] of [["WD number 2015-5631", /2015-5631/], ["Gardener rate 27.19", /27\.19/], ["H&W 5.55", /5\.55/]] as Array<[string, RegExp]>) {
    ok(`${label} is verbatim in that region`, re.test(wdRegion?.text ?? ""));
  }
  const unknownClaim = (findings as Array<Record<string, unknown>>).find((f) => /wage rates and fringe benefits are unknown/i.test(String(f.requirement ?? "")));
  ok("the shipped report nonetheless claimed those rates were UNKNOWN", !!unknownClaim);

  console.log(`\nCERT RT1 · analyzed-not-read: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
