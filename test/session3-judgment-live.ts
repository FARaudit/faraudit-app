// Session 3 — Live judgment call test (Component 5)
//
// Exercises the structured-outputs LLM judgment against real extracted facts.
// Verifies: (a) call completes, (b) schema parses, (c) no silent {} on truncation.
// This is the Brain Condition 2 live verification.
//
// Run: npx dotenv -e .env.local -- tsx test/session3-judgment-live.ts

import * as fs from "node:fs";
import { extractText } from "../src/lib/pdf-text-extractor";
import { detectSections } from "../src/lib/section-boundary-detector";
import { extractAllFacts } from "../src/lib/section-extractors";
import { runJudgment, type AuditJudgment } from "../src/lib/audit-judgment";

async function main() {
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  SESSION 3 — LIVE JUDGMENT CALL · Component 5 · Condition 2 verification");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("");

  // Use F1 (FA301626Q0068) as the test target: rich extraction (32 clauses,
  // 6 traps, 18 reqs) gives the judgment call real material to chew on.
  const testPdf = "Solicitation+-+FA301626Q0068.pdf";
  console.log(`Test PDF: ${testPdf}`);

  const buf = fs.readFileSync(testPdf);
  const doc = await extractText(buf);
  const bag = detectSections(doc);
  const facts = extractAllFacts(bag.sections);

  console.log(`Extracted facts:`);
  console.log(`  CLINs: ${facts.clins.length}  ·  clauses: ${facts.clauses.length} (${facts.clauses.filter((c) => c.isTrap).length} traps)`);
  console.log(`  submission reqs: ${facts.submissionRequirements.length}  ·  eval factors: ${facts.evaluationFactors.length}`);
  console.log(`  NAICS: ${facts.naicsCode}  ·  set-aside: ${facts.setAside}  ·  due: ${facts.offerDueDate}`);
  console.log("");
  console.log(`Calling runJudgment() with Structured Outputs (anthropic-beta: structured-outputs-2025-11-13)...`);
  console.log("");

  const t0 = Date.now();
  let judgment: AuditJudgment;
  try {
    judgment = await runJudgment(facts);
  } catch (err) {
    console.error(`✗ JUDGMENT CALL FAILED: ${(err as Error).message}`);
    console.error(`  Brain Condition 2 verification BLOCKED — investigate before merge.`);
    process.exit(1);
  }
  const elapsedMs = Date.now() - t0;

  // Condition 2 sanity check: schema must be populated, not empty {}
  if (!judgment.documentClassification || !judgment.risks || !judgment.verdict) {
    console.error(`✗ CONDITION 2 FAILED — schema returned empty/incomplete object`);
    console.error(`  documentClassification: ${!!judgment.documentClassification}`);
    console.error(`  risks: ${!!judgment.risks}`);
    console.error(`  verdict: ${!!judgment.verdict}`);
    process.exit(1);
  }

  console.log(`✓ JUDGMENT CALL SUCCEEDED · ${elapsedMs} ms`);
  console.log("");
  console.log("─── Document classification ─────────────────────────────────────────────────");
  console.log(`  type: ${judgment.documentClassification.type} (${judgment.documentClassification.confidence})`);
  console.log(`  evidence: ${judgment.documentClassification.evidence.slice(0, 200)}`);
  console.log(`  bid strategy: ${judgment.documentClassification.bidStrategy.slice(0, 200)}`);
  console.log("");
  console.log("─── Verdict ─────────────────────────────────────────────────────────────────");
  console.log(`  ${judgment.verdict.goNoGoRecommendation.toUpperCase()} · urgency ${judgment.verdict.urgencyScore}/100 · status: ${judgment.verdict.complianceStatus}`);
  console.log(`  bottom line: ${judgment.verdict.bottomLine}`);
  console.log(`  key risks: ${judgment.verdict.keyRisks.join(" · ")}`);
  console.log("");
  console.log("─── Risk list ───────────────────────────────────────────────────────────────");
  console.log(`  ${judgment.risks.length} total · ${judgment.risks.filter((r) => r.severity === "P0").length} P0 · ${judgment.risks.filter((r) => r.severity === "P1").length} P1 · ${judgment.risks.filter((r) => r.severity === "P2").length} P2`);
  for (const r of judgment.risks) {
    const trap = r.isDfarsTrap ? " ⚠ DFARS" : "";
    console.log(`    [${r.severity}] ${r.title}${trap}`);
  }
  console.log("");
  console.log("─── L02 catches ─────────────────────────────────────────────────────────────");
  if (judgment.l02Catches.length === 0) {
    console.log("  (none)");
  } else {
    for (const c of judgment.l02Catches) console.log(`  - ${c}`);
  }
  console.log("");
  if (judgment.confidenceNotes.length > 0) {
    console.log("─── Confidence notes ────────────────────────────────────────────────────────");
    for (const n of judgment.confidenceNotes) console.log(`  - ${n}`);
    console.log("");
  }

  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  ✓ CONDITION 2 VERIFIED: structured output parsed, no silent {} failure");
  console.log("  ✓ Component 5 wired end-to-end with extraction → facts → judgment");
  console.log("═════════════════════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("LIVE CALL FATAL:", e);
  process.exit(1);
});
