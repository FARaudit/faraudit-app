// Extraction Determinism Harness — Cycle 2 acceptance gate
//
// Verifies: same PDF input → byte-identical extraction output across 3
// consecutive replays. This is the property the entire Cycle 2 architecture
// is built on. LLM judgment CAN vary; extraction CANNOT.
//
// Run: npx dotenv -e .env.local -- tsx test/verify-extraction-determinism.ts
// Exit: 0 = all fixtures byte-stable · 1 = any variance detected

import * as fs from "node:fs";
import * as path from "node:path";
import { extractText } from "../src/lib/pdf-text-extractor";
import { detectSections, type SectionBag } from "../src/lib/section-boundary-detector";
import { extractAllFacts, type ExtractedFacts } from "../src/lib/section-extractors";

interface Snapshot {
  bag: SectionBag;
  facts: ExtractedFacts;
}

async function runOnce(pdfBuffer: Buffer): Promise<Snapshot> {
  const doc = await extractText(pdfBuffer);
  const bag = detectSections(doc);
  const facts = extractAllFacts(bag.sections);
  return { bag, facts };
}

// snapshotKey returns the stable shape we care about (excludes any
// non-deterministic internal fields like matchedPattern source strings that
// may carry RegExp toString variance across engine versions).
function snapshotKey(s: Snapshot): string {
  const stableSections: Record<string, { confidence: string; chars: number; startPage: number; endPage: number }> = {};
  for (const [k, sec] of Object.entries(s.bag.sections)) {
    stableSections[k] = {
      confidence: sec.confidence,
      chars: sec.text.length,
      startPage: sec.startPage,
      endPage: sec.endPage,
    };
  }
  return JSON.stringify({
    format: s.bag.formatDetected,
    formatConfidence: s.bag.formatConfidence,
    overallConfidence: s.bag.overallConfidence,
    sectionCount: s.bag.sectionCount,
    missingSections: [...s.bag.missingSections].sort(),
    sections: stableSections,
    facts: {
      clins: s.facts.clins.map((c) => ({ lineItem: c.lineItem, qty: c.quantity, unit: c.unit, ct: c.contractType, amb: c.ambiguityFlag, descLen: c.description.length })),
      delivery: s.facts.delivery.map((d) => ({ li: d.lineItem, fob: d.fobType, dodaac: d.dodaac, date: d.deliveryDate })),
      clauseNumbers: s.facts.clauses.map((c) => c.number).sort(),
      trapClauses: s.facts.clauses.filter((c) => c.isTrap).map((c) => c.number).sort(),
      submissionCount: s.facts.submissionRequirements.length,
      submissionBuckets: s.facts.submissionRequirements.map((r) => r.bucket).sort(),
      evalFactorCount: s.facts.evaluationFactors.length,
      contractType: s.facts.contractType,
      naics: s.facts.naicsCode,
      setAside: s.facts.setAside,
      solNum: s.facts.solicitorNumber,
      offerDue: s.facts.offerDueDate,
      warnings: [...s.facts.extractionWarnings].sort(),
    },
  });
}

interface TestResult {
  label: string;
  pass: boolean;
  detail: string;
  diff?: string;
}

async function testFixture(label: string, pdfPath: string): Promise<TestResult> {
  if (!fs.existsSync(pdfPath)) {
    return { label, pass: false, detail: `MISSING: ${pdfPath}` };
  }
  const buf = fs.readFileSync(pdfPath);

  const run1 = await runOnce(buf);
  const run2 = await runOnce(buf);
  const run3 = await runOnce(buf);

  const k1 = snapshotKey(run1);
  const k2 = snapshotKey(run2);
  const k3 = snapshotKey(run3);

  const summary = `format=${run1.bag.formatDetected} conf=${run1.bag.overallConfidence} sections=${run1.bag.sectionCount} CLINs=${run1.facts.clins.length} clauses=${run1.facts.clauses.length} reqs=${run1.facts.submissionRequirements.length}`;

  if (k1 === k2 && k2 === k3) {
    return { label, pass: true, detail: `✓ DETERMINISTIC (3/3 identical) · ${summary}` };
  }

  // Pinpoint where the variance is.
  const r1 = JSON.parse(k1);
  const r2 = JSON.parse(k2);
  const r3 = JSON.parse(k3);
  const diffs: string[] = [];
  for (const top of ["format", "formatConfidence", "overallConfidence", "sectionCount", "missingSections", "sections", "facts"]) {
    const s1 = JSON.stringify((r1 as Record<string, unknown>)[top]);
    const s2 = JSON.stringify((r2 as Record<string, unknown>)[top]);
    const s3 = JSON.stringify((r3 as Record<string, unknown>)[top]);
    if (s1 !== s2 || s2 !== s3) diffs.push(top);
  }
  return {
    label,
    pass: false,
    detail: `✗ NON-DETERMINISTIC · diff in: ${diffs.join(", ")}`,
    diff: `r1=${k1.slice(0, 200)}\nr2=${k2.slice(0, 200)}\nr3=${k3.slice(0, 200)}`,
  };
}

async function main() {
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  CYCLE 2 EXTRACTION DETERMINISM HARNESS — 3-replay test, baseline + burn-in");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("");

  const fixtures: Array<{ label: string; path: string }> = [
    { label: "F1 · FA301626Q0068 (USAF SF-1449)", path: "Solicitation+-+FA301626Q0068.pdf" },
    { label: "F2 · FA251726Q0024 (USAF SF-1449)", path: "Solicitation+-+FA251726Q0024.pdf" },
    { label: "F3 · N0017426Q1021 (Navy SF-18)",   path: "Solicitation+-+N0017426Q1021.pdf" },
    { label: "F4 · SPRRA126Q0034 (DLA SF-18)",    path: "test/pdfs/SPRRA126Q0034.pdf" },
  ];

  // Cycle 2 v2 burn-in: glob test/pdfs/burn-in/*.pdf and add them as
  // additional fixtures. Text-only burn-in docs (.txt) are skipped — the
  // extractor's fail-loud path emits the same placeholder every replay, so
  // they're trivially deterministic but uninformative for this harness.
  const burnInDir = path.join(process.cwd(), "test/pdfs/burn-in");
  if (fs.existsSync(burnInDir)) {
    for (const entry of fs.readdirSync(burnInDir).sort()) {
      if (!entry.endsWith(".pdf")) continue;
      const sol = entry.replace(/\.pdf$/, "");
      fixtures.push({
        label: `BI · ${sol} (burn-in)`,
        path: path.join(burnInDir, entry),
      });
    }
  }

  const results: TestResult[] = [];
  for (const f of fixtures) {
    const r = await testFixture(f.label, f.path);
    results.push(r);
    console.log(`  ${r.label}`);
    console.log(`    ${r.detail}`);
    if (r.diff) console.log(`    DIFF: ${r.diff}`);
    console.log("");
  }

  console.log("═════════════════════════════════════════════════════════════════════════════");
  const allPass = results.every((r) => r.pass);
  if (allPass) {
    console.log("  ✓✓✓ ALL EXTRACTION OUTPUTS BYTE-STABLE — Brain Q1 cleared on every fixture.");
    console.log("       Replay any of these PDFs and you get the same SectionBag + Facts every time.");
  } else {
    console.log("  ✗✗✗ EXTRACTION VARIANCE DETECTED — investigate before merge.");
  }
  console.log("═════════════════════════════════════════════════════════════════════════════");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS FATAL:", e);
  process.exit(1);
});
