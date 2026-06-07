// Session 1 — Cycle 2 document-extraction GO/NO-GO probe
//
// Runs Components 1 (pdf-text-extractor) + 2 (section-boundary-detector)
// against every solicitation PDF available in the repo, plus SPRRA126Q0034
// fetched live from SAM (the canonical Cycle-2 test fixture).
//
// Reports per-file: format detected, overall confidence, per-section
// confidence map, missing-critical-section warnings.
//
// Run: npx dotenv -e .env.local -- tsx test/session1-probe.ts
//
// GO criteria (per Brain Condition 1):
//   - overall confidence >= 70 on at least one format
//   - critical sections (B, C, F, I, L, M) detected for that format
//   - extractor returns text (not fallback placeholder)
// NO-GO triggers report-and-stop.

import * as fs from "node:fs";
import * as path from "node:path";
import { extractText, type ExtractedDocument } from "../src/lib/pdf-text-extractor";
import { detectSections, type SectionBag } from "../src/lib/section-boundary-detector";
import { fetchSolicitationByNoticeId } from "../src/lib/sam";
import { fetchPdfFromSamUrl } from "../src/lib/sam-pdf";

interface ProbeResult {
  label: string;
  source: string;
  pdfBytes: number;
  pageCount: number;
  textChars: number;
  extractionMethod: ExtractedDocument["extractionMethod"];
  formatDetected: SectionBag["formatDetected"];
  formatConfidence: SectionBag["formatConfidence"];
  overallConfidence: number;
  sectionCount: number;
  sections: Record<string, { confidence: string; chars: number; pages: string }>;
  missingSections: string[];
  warnings: string[];
  go: boolean;
  noGoReason?: string;
}

async function probeOne(label: string, source: string, pdfBuffer: Buffer): Promise<ProbeResult> {
  const extracted = await extractText(pdfBuffer);
  const bag = detectSections(extracted);

  const sections: ProbeResult["sections"] = {};
  for (const [k, s] of Object.entries(bag.sections)) {
    sections[k] = {
      confidence: s.confidence,
      chars: s.text.length,
      pages: `p${s.startPage}–p${s.endPage}`,
    };
  }

  const criticalMissing = bag.missingSections.filter((k) => ["B", "C", "F", "I", "L", "M"].includes(k));
  const go = bag.overallConfidence >= 70 && criticalMissing.length === 0 && extracted.extractionMethod !== "fallback";
  const noGoReason = !go
    ? extracted.extractionMethod === "fallback"
      ? "PDF extraction fell back to placeholder"
      : criticalMissing.length > 0
        ? `Critical sections missing: ${criticalMissing.join(", ")}`
        : `Overall confidence ${bag.overallConfidence}/100 < 70`
    : undefined;

  return {
    label, source,
    pdfBytes: pdfBuffer.length,
    pageCount: extracted.pageCount,
    textChars: extracted.rawText.length,
    extractionMethod: extracted.extractionMethod,
    formatDetected: bag.formatDetected,
    formatConfidence: bag.formatConfidence,
    overallConfidence: bag.overallConfidence,
    sectionCount: bag.sectionCount,
    sections,
    missingSections: bag.missingSections,
    warnings: bag.warnings,
    go,
    noGoReason,
  };
}

function reportOne(r: ProbeResult): void {
  console.log("");
  console.log("─────────────────────────────────────────────────────────────────────────────");
  console.log(`  ${r.label}  ·  ${r.source}`);
  console.log("─────────────────────────────────────────────────────────────────────────────");
  console.log(`  PDF                  ${r.pdfBytes} bytes · ${r.pageCount} pages · ${r.textChars} text chars`);
  console.log(`  extraction method    ${r.extractionMethod}`);
  console.log(`  format detected      ${r.formatDetected}  (${r.formatConfidence} confidence)`);
  console.log(`  overall confidence   ${r.overallConfidence}/100  ·  sections found: ${r.sectionCount}`);
  if (r.missingSections.length > 0) {
    console.log(`  missing sections     ${r.missingSections.join(", ")}`);
  }
  console.log("");
  console.log("  Per-section confidence map:");
  const orderedKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
  for (const k of orderedKeys) {
    const s = r.sections[k];
    if (s) {
      const conf = s.confidence.padEnd(6);
      const chars = String(s.chars).padStart(6);
      const pages = s.pages.padEnd(10);
      console.log(`    §${k}  ${conf}  ${chars} chars  ${pages}`);
    } else {
      const tag = ["B", "C", "F", "I", "L", "M"].includes(k) ? "MISSING ‼" : "missing";
      console.log(`    §${k}  ${tag}`);
    }
  }
  if (r.warnings.length > 0) {
    console.log("");
    console.log("  Warnings:");
    for (const w of r.warnings) console.log(`    ⚠ ${w}`);
  }
  console.log("");
  console.log(`  VERDICT: ${r.go ? "✓ GO" : "✗ NO-GO"}${r.noGoReason ? "  " + r.noGoReason : ""}`);
}

async function main() {
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  SESSION 1 — GO/NO-GO PROBE · Components 1+2 · cycle-2 document-extraction");
  console.log("═════════════════════════════════════════════════════════════════════════════");

  const results: ProbeResult[] = [];

  // Local PDFs (UCF / SF-1449 formats from prior CEO uploads)
  const localCandidates: Array<{ label: string; path: string }> = [
    { label: "F1 · FA301626Q0068", path: path.join(process.cwd(), "Solicitation+-+FA301626Q0068.pdf") },
    { label: "F2 · FA251726Q0024", path: path.join(process.cwd(), "Solicitation+-+FA251726Q0024.pdf") },
    { label: "F3 · N0017426Q1021", path: path.join(process.cwd(), "Solicitation+-+N0017426Q1021.pdf") },
  ];

  for (const cand of localCandidates) {
    if (!fs.existsSync(cand.path)) {
      console.log(`\n  skip ${cand.label}: not found at ${cand.path}`);
      continue;
    }
    const buf = fs.readFileSync(cand.path);
    const r = await probeOne(cand.label, cand.path, buf);
    results.push(r);
    reportOne(r);
  }

  // SAM-fetched SPRRA126Q0034 — the canonical Cycle-2 fixture
  console.log("\n  Fetching SPRRA126Q0034 from SAM for canonical-fixture probe...");
  try {
    const sol = await fetchSolicitationByNoticeId("SPRRA126Q0034");
    if (sol && sol.resourceLinks[0]) {
      const doc = await fetchPdfFromSamUrl(sol.resourceLinks[0]);
      if (doc.kind === "pdf" && doc.base64) {
        const buf = Buffer.from(doc.base64, "base64");
        // Stash local for resumability across sessions
        const stash = path.join(process.cwd(), "test", "pdfs");
        if (!fs.existsSync(stash)) fs.mkdirSync(stash, { recursive: true });
        const stashPath = path.join(stash, "SPRRA126Q0034.pdf");
        fs.writeFileSync(stashPath, buf);
        const r = await probeOne("F4 · SPRRA126Q0034 (canonical)", `SAM live → ${stashPath}`, buf);
        results.push(r);
        reportOne(r);
      } else {
        console.log(`  SPRRA fetch: PDF unavailable (kind=${doc.kind})`);
      }
    } else {
      console.log("  SPRRA fetch: SAM record or resourceLink missing");
    }
  } catch (e: any) {
    console.log(`  SPRRA fetch error: ${e.message}`);
  }

  // ─── Session 1 verdict ─────────────────────────────────────────────────────
  console.log("");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  SESSION 1 SUMMARY");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("  " + "label".padEnd(36) + "format".padEnd(18) + "conf".padStart(5) + "  sec  " + "verdict");
  console.log("  " + "-".repeat(36) + "-".repeat(18) + "-----  ---  -------");
  for (const r of results) {
    const lbl = r.label.padEnd(36);
    const fmt = r.formatDetected.padEnd(18);
    const cf = String(r.overallConfidence).padStart(5);
    const sec = String(r.sectionCount).padStart(3);
    const verdict = r.go ? "✓ GO" : "✗ " + (r.noGoReason ?? "no-go");
    console.log(`  ${lbl}${fmt}${cf}  ${sec}  ${verdict}`);
  }

  const anyGo = results.some((r) => r.go);
  console.log("");
  if (anyGo) {
    console.log("  ✓✓✓ SESSION 1 GO — extraction pipeline stands. At least one format passes critical-sections gate.");
    console.log("      Next: Brain reviews per-format confidence map · approves Sessions 2-3.");
  } else {
    console.log("  ✗✗✗ SESSION 1 NO-GO — no format passed critical-sections gate.");
    console.log("      Stop. Report patterns observed; Brain decides whether to broaden detector or escalate.");
  }
  console.log("");
}

main().catch((e) => {
  console.error("PROBE FATAL:", e);
  process.exit(1);
});
