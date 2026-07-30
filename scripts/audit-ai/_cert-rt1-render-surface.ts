// $0 CERT — REPORT-TRUTH #1 reaches the CUSTOMER-FACING SURFACE, not just the payload. Renders the REAL audit
// 95698f91 through the production report path (`renderV4ReportFromRow`) twice: once with the row exactly as it
// shipped, once with the documents card the fix would have written. Asserts the shipped render is silent about the
// Wage Determination and the fixed render names it.
//
// This is the placebo control for the fix: an `analyzed` count that no renderer reads would be a payload-only change
// with zero customer effect, and would pass every unit test in audit-executor-v3-analyzed-truth.test.ts.
// Run: npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cert-rt1-render-surface.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT_ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";
const WD = "WAGE DETERMINATIONS - 20260513.pdf";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await admin.from("audits").select("*").eq("id", AUDIT_ID).single();
  if (error) throw new Error(JSON.stringify(error));

  const { renderV4ReportFromRow } = await import("../../src/lib/v4-report/report");
  const { deriveAnalyzedDocuments } = await import("../../src/lib/audit-executor-v3");
  const { documentsCovered } = await import("../../src/lib/audit-orchestrator");

  // ---- A. AS SHIPPED ------------------------------------------------------------------------------------------
  const shipped = renderV4ReportFromRow(row as Record<string, unknown>);
  console.log("A · AS SHIPPED (the report the customer received)");
  ok("does NOT name the Wage Determination as a gap", !/Read but not analyzed/.test(shipped));
  ok("legend carries no analyzed segment", !/>analyzed</.test(shipped) && !/\banalyzed ·/.test(shipped));
  ok("counts 3 documents read in full", /<b class="mono">3<\/b> read in full/.test(shipped));

  // ---- B. WITH THE FIX ----------------------------------------------------------------------------------------
  // Rebuild the documents card exactly as the patched executor would, from the engine's own coverage answer.
  process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
  process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";
  const cj = JSON.parse(JSON.stringify((row as Record<string, unknown>).compliance_json)) as Record<string, any>;
  const cov = documentsCovered((row as { raw_pdf_text: string }).raw_pdf_text, cj.v3.findings, undefined);
  const truth = deriveAnalyzedDocuments((row as { raw_pdf_text: string }).raw_pdf_text, cov.uncovered);
  cj.v3.documents = { ...cj.v3.documents, analyzed: truth.analyzed, analyzed_of: truth.analyzed_of, unanalyzed: truth.unanalyzed, complete: false };
  cj.documents_complete = false;
  const fixedRow = { ...(row as Record<string, unknown>), compliance_json: cj };
  const fixed = renderV4ReportFromRow(fixedRow);

  console.log("\nB · WITH THE FIX");
  ok("the report NAMES the Wage Determination", fixed.includes(WD));
  ok('under a "Read but not analyzed" heading', /Read but not analyzed \(1\)/.test(fixed));
  ok("with the reason stated (NOT analyzed, not 'not retrieved')", /content NOT analyzed/.test(fixed));
  ok("and an instruction the customer can act on", /read them yourself before relying on this audit/.test(fixed));
  ok("legend now shows 2 analyzed alongside 3 read", /<b class="mono">3<\/b> read in full · <b class="mono">2<\/b> analyzed/.test(fixed));
  ok("coverage state is INCOMPLETE, not COMPLETE", /class="sec-state part">INCOMPLETE/.test(fixed));
  ok("the WD is NOT mislabelled as a parse failure", !/Could not be parsed[\s\S]{0,400}WAGE DETERMINATIONS/.test(fixed));

  console.log("\nC · THE DIFF IS REAL");
  ok("shipped and fixed renders actually differ", shipped !== fixed);
  ok("the shipped render never mentioned the WD at all", !shipped.includes(WD));

  console.log(`\nCERT RT1-RENDER · surface reach: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
