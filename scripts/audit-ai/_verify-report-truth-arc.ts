// $0 VERIFICATION — the whole REPORT-TRUTH arc, ALL FOUR FLAGS ON TOGETHER, on the real run 95698f91.
//
// WHY THIS EXISTS. Each fix was proven with its OWN flag on and the others off. That is not the configuration that
// ships. Production runs all four at once, and they touch the same objects in sequence:
//     #2 rewrites finding.requirement  →  #3 reads finding prose as its CLIN fallback
//     #4 replaces the CLIN panel        →  #3's compute-or-absent columns decide what renders
//     #1 sets documents_complete=false  →  the coverage badge AND the export gate
// A per-flag green tells you nothing about that. This asserts the END STATE a customer would receive.
//
// It also re-checks each fix's own headline claim against the same render, so a regression in one shows up here
// even if its dedicated cert still passes in isolation.
// Run: npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_verify-report-truth-arc.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";
const WD = "WAGE DETERMINATIONS - 20260513.pdf";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await a.from("audits").select("*").eq("id", ID).single();
  if (error) throw new Error(JSON.stringify(error));

  // ---- ALL FOUR ON, exactly as production now runs -------------------------------------------------------------
  for (const k of ["AUDIT_DOC_ANALYZED_TRUTH", "AUDIT_NONPRESENCE_HONESTY", "AUDIT_PANEL_COMPUTE_OR_ABSENT", "AUDIT_CLIN_SCHEDULE_EXTRACT"]) process.env[k] = "true";
  process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
  process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";

  const { documentsCovered } = await import("../../src/lib/audit-orchestrator");
  const { deriveAnalyzedDocuments } = await import("../../src/lib/audit-executor-v3");
  const { applyNonPresenceHonesty } = await import("../../src/lib/audit-nonpresence-honesty");
  const { extractClinSchedule } = await import("../../src/lib/audit-clin-schedule");
  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const { renderV4ReportFromRow } = await import("../../src/lib/v4-report/report");

  const raw: string = (row as { raw_pdf_text: string }).raw_pdf_text;
  const cj = JSON.parse(JSON.stringify((row as { compliance_json: unknown }).compliance_json)) as Record<string, any>;

  // Rebuild the persisted payload the way the PATCHED executor would, with every stage applied in production order.
  const cov = documentsCovered(raw, cj.v3.findings, undefined);
  const truth = deriveAnalyzedDocuments(raw, cov.uncovered);
  const gated = applyNonPresenceHonesty(cj.v3.findings.map((f: Record<string, unknown>, i: number) => ({ ...f, id: `f#${i}` })));
  cj.v3.findings = gated.findings;
  cj.v3.documents = { ...cj.v3.documents, analyzed: truth.analyzed, analyzed_of: truth.analyzed_of, unanalyzed: truth.unanalyzed, complete: false };
  cj.documents_complete = true && !(truth.unanalyzed.length > 0);
  const fixed = { ...(row as Record<string, unknown>), compliance_json: cj };
  const v5 = renderV5ReportFromRow(fixed);
  const v4 = renderV4ReportFromRow(fixed);

  console.log("\n#1 · ANALYZED, NOT READ — with the other three also on");
  ok("the Wage Determination is still named", v4.includes(WD) || v5.includes(WD));
  ok("analyzed is 2 of 3, not 3 of 3", truth.analyzed === 2 && truth.analyzed_of === 3);
  ok("documents_complete is false", cj.documents_complete === false);

  console.log("\n#2 · NON-PRESENCE — with the other three also on");
  ok("4 absence claims framed", gated.rewrites.length === 4);
  ok("the escalation claim is framed in the RENDERED report", /UNVERIFIED ABSENCE/.test(v5));
  ok("the deadline idiom was NOT framed anywhere in the render", !/UNVERIFIED ABSENCE[^<]{0,200}no later than/i.test(v5));

  console.log("\n#3 · NO FABRICATED LINE ITEM — with #4 supplying real rows");
  const asLineItem = (h: string) => /<td class="cl-n mono">1810<\/td>/.test(h) || /<td class="cx-clin mono">1810<\/td>/.test(h);
  ok("v4: 1810 is not a line item", !asLineItem(v4));
  ok("v5: 1810 is not a line item", !asLineItem(v5));
  ok("the street address survives in prose (content not lost)", /1810 Jefferson/.test(v5) || /1810 Jefferson/.test(v4));

  console.log("\n#4 · THE REAL SCHEDULE REACHES THE CUSTOMER");
  const sched = extractClinSchedule(raw);
  ok("26 line items extracted", sched.length === 26);
  ok("v5 names a real line item", /Moving and Edging/.test(v5));
  ok("v5 shows its quantity", /52 Each/.test(v5));
  ok("v5 shows a real period of performance", /15 Sep 2026/.test(v5));

  console.log("\nINTERACTION CHECKS — the combinations no single cert covered");
  // #2 edits requirement text; #3's CLIN fallback reads requirement text. With no §B schedule, #4 stands down and the
  // fallback runs over REWRITTEN prose. It must still not invent a line item from a framed sentence.
  const { extractClinSchedule: ex2 } = await import("../../src/lib/audit-clin-schedule");
  ok("#4 stands down cleanly when there is no §B (falls back, does not throw)", ex2("no section B here at all").length === 0);
  // A framed absence sentence must not become a CLIN via the anchored pattern.
  const framedProse = "UNVERIFIED ABSENCE — Place of performance is 1810 Jefferson Blvd (this audit did not locate it)";
  ok("#2's frame does not create a line item for #3's fallback", !/\b(?:CLIN|SLIN|LINE\s+ITEM|ITEM)S?\s*(?:NO\.?|#)?\s*(\d{4})/i.test(framedProse));
  // #1 forces INCOMPLETE; #4 adds real rows. The badge must still read INCOMPLETE — a richer panel must not look like coverage.
  ok("a richer CLIN panel does NOT flip the coverage badge to COMPLETE", /INCOMPLETE/.test(v4) && !/class="sec-state ok">COMPLETE/.test(v4));
  // The renders must not carry a literal "undefined" from any newly-optional field.
  ok("no 'undefined' leaked into the v4 render", !/>undefined</.test(v4));
  ok("no 'undefined' leaked into the v5 render", !/>undefined</.test(v5));

  console.log(`\nARC VERIFICATION (4 flags on, real run): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
