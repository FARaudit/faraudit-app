// Session 2 — deterministic-pipeline check (Components 1+2+4+6, no LLM call)
//
// Runs extractor → boundary-detector → section-extractors → normalizers
// against all 4 fixtures. Verifies the full deterministic chain stands and
// produces sensible facts. The LLM judgment call (Component 5) is NOT
// invoked here — it's wired but exercised in Session 3.

import * as fs from "node:fs";
import * as path from "node:path";
import { extractText } from "../src/lib/pdf-text-extractor";
import { detectSections } from "../src/lib/section-boundary-detector";
import { extractAllFacts } from "../src/lib/section-extractors";
import {
  matrixRollup,
  submissionChecklistFiltered,
} from "../src/app/audit/[id]/_normalizers";

interface CheckResult {
  label: string;
  pdfPath: string;
  go: boolean;
  noGoReason?: string;
  format: string;
  confidence: number;
  pageCount: number;
  clinCount: number;
  clauseCount: number;
  trapCount: number;
  submissionReqCount: number;
  evalFactorCount: number;
  matrixRowCount: number;
  checklistBuckets: number;
  warnings: string[];
}

const FIXTURES: Array<{ label: string; relPath: string }> = [
  { label: "F1 · FA301626Q0068", relPath: "Solicitation+-+FA301626Q0068.pdf" },
  { label: "F2 · FA251726Q0024", relPath: "Solicitation+-+FA251726Q0024.pdf" },
  { label: "F3 · N0017426Q1021", relPath: "Solicitation+-+N0017426Q1021.pdf" },
  { label: "F4 · SPRRA126Q0034", relPath: "test/pdfs/SPRRA126Q0034.pdf" },
];

async function runOne(label: string, pdfPath: string): Promise<CheckResult> {
  const buf = fs.readFileSync(pdfPath);
  const doc = await extractText(buf);
  const bag = detectSections(doc);
  const facts = extractAllFacts(bag.sections);
  const matrix = matrixRollup(facts.clauses);
  const checklist = submissionChecklistFiltered(facts);

  const critMissing = bag.missingSections.filter((k) => ["B", "C", "F", "I", "L", "M"].includes(k));
  const go = critMissing.length === 0 && doc.extractionMethod !== "fallback";
  const noGoReason = !go
    ? doc.extractionMethod === "fallback"
      ? "PDF extraction fell back"
      : `Critical sections missing: ${critMissing.join(", ")}`
    : undefined;

  return {
    label,
    pdfPath,
    go,
    noGoReason,
    format: bag.formatDetected,
    confidence: bag.overallConfidence,
    pageCount: doc.pageCount,
    clinCount: facts.clins.length,
    clauseCount: facts.clauses.length,
    trapCount: facts.clauses.filter((c) => c.isTrap).length,
    submissionReqCount: facts.submissionRequirements.length,
    evalFactorCount: facts.evaluationFactors.length,
    matrixRowCount: matrix.length,
    checklistBuckets: checklist.length,
    warnings: facts.extractionWarnings,
  };
}

async function main() {
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  SESSION 2 — DETERMINISTIC PIPELINE CHECK (Components 1+2+4+6, no LLM)");
  console.log("═════════════════════════════════════════════════════════════════════════════");

  const results: CheckResult[] = [];
  for (const f of FIXTURES) {
    const abs = path.isAbsolute(f.relPath) ? f.relPath : path.join(process.cwd(), f.relPath);
    if (!fs.existsSync(abs)) {
      console.log(`\n  skip ${f.label}: not found at ${abs}`);
      continue;
    }
    const r = await runOne(f.label, abs);
    results.push(r);
    console.log("");
    console.log(`  ${r.label}  (${r.format}, conf ${r.confidence}/100, ${r.pageCount} pages)`);
    console.log(`    CLINs: ${r.clinCount}  ·  clauses: ${r.clauseCount} (${r.trapCount} traps)`);
    console.log(`    submission reqs: ${r.submissionReqCount}  ·  eval factors: ${r.evalFactorCount}`);
    console.log(`    matrix rows: ${r.matrixRowCount}  ·  checklist buckets: ${r.checklistBuckets}`);
    if (r.warnings.length > 0) {
      for (const w of r.warnings) console.log(`    ⚠ ${w}`);
    }
    console.log(`    verdict: ${r.go ? "✓ GO" : "✗ NO-GO — " + r.noGoReason}`);
  }

  console.log("");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  SESSION 2 SUMMARY");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("");
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log(`  ${pad("label", 24)}  ${pad("clins", 5)}  ${pad("clauses", 7)}  ${pad("traps", 5)}  ${pad("reqs", 4)}  ${pad("matrix", 6)}  ${pad("ckl", 3)}  verdict`);
  console.log(`  ${"-".repeat(24)}  -----  -------  -----  ----  ------  ---  -------`);
  for (const r of results) {
    const lbl = r.label.padEnd(24);
    const v = r.go ? "✓ GO" : "✗ NO-GO";
    console.log(`  ${lbl}  ${pad(r.clinCount, 5)}  ${pad(r.clauseCount, 7)}  ${pad(r.trapCount, 5)}  ${pad(r.submissionReqCount, 4)}  ${pad(r.matrixRowCount, 6)}  ${pad(r.checklistBuckets, 3)}  ${v}`);
  }
  console.log("");

  const allGo = results.every((r) => r.go);
  if (allGo) {
    console.log("  ✓✓✓ SESSION 2 DETERMINISTIC PIPELINE GO — every fixture extracts cleanly.");
    console.log("      Components 1+2+4+6 wire end-to-end. Component 5 (LLM judgment) is wired");
    console.log("      structurally; not exercised in this check (Session 3 scope).");
  } else {
    console.log("  ✗ SESSION 2 NO-GO — see per-fixture warnings.");
  }
  console.log("");
}

main().catch((e) => {
  console.error("CHECK FATAL:", e);
  process.exit(1);
});
