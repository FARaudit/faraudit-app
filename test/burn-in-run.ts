// Burn-in runner — runs runAuditV2 across the 5 fetched solicitations.
// Captures: format · conf · CLINs · clauses(trap/ft/byref) · reqs · ws variant
//   · risks(P0/P1/P2) · l02_count · cn_count · verdict · elapsed_ms · schema_ok
// Persists V2 view-model to test/fixtures/burn-in/<sol>-vm.json per doc.
//
// 3 of the 5 docs have no PDF attachment (description-only); they exercise
// the C1 fail-loud path (extractor falls back, judgment receives empty facts,
// no fixture written). 2 of the 5 have real PDFs and run end-to-end.

import * as fs from "node:fs";
import * as path from "node:path";
import { extractText } from "../src/lib/pdf-text-extractor";
import { detectSections } from "../src/lib/section-boundary-detector";
import { extractAllFacts } from "../src/lib/section-extractors";
import { runJudgment } from "../src/lib/audit-judgment";
import { workStatement, matrixRollupReshape, submissionChecklistFiltered } from "../src/app/audit/[id]/_normalizers";

const SOLS = [
  "N0010426QBU16",
  "378229-RK",
  "N6833525R0392",
  "SPRHA4-26-R-0454",
  "SPE4A526T109C",
  "W58RGZ-25-B-0034",
];

interface Row {
  sol: string;
  status: string;
  source?: "pdf" | "txt";
  pages?: number;
  format?: string;
  conf?: number;
  critMiss?: string;
  clins?: number;
  traps?: number;
  ft?: number;
  ref?: number;
  reqs?: number;
  ws?: string;
  wsConf?: string;
  risks?: string;
  l02?: number;
  cn?: number;
  verdict?: string;
  ms?: number;
  schemaOK?: string;
  err?: string;
}

async function runOne(sol: string): Promise<Row> {
  const pdfPath = path.join(process.cwd(), `test/pdfs/burn-in/${sol}.pdf`);
  const txtPath = path.join(process.cwd(), `test/pdfs/burn-in/${sol}.txt`);
  let buf: Buffer | null = null;
  let source: "pdf" | "txt" = "pdf";
  if (fs.existsSync(pdfPath)) {
    buf = fs.readFileSync(pdfPath);
  } else if (fs.existsSync(txtPath)) {
    buf = Buffer.from(fs.readFileSync(txtPath, "utf8"));
    source = "txt";
  }
  if (!buf) return { sol, status: "NOT_FETCHED" };

  try {
    const doc = await extractText(buf);
    const bag = detectSections(doc);
    const facts = extractAllFacts(bag.sections);
    const critMiss = bag.missingSections.filter((k) => ["B", "C", "F", "I", "L", "M"].includes(k));

    // If extraction failed (fallback path or no critical sections), record a
    // FAIL-LOUD row WITHOUT making the live judgment call — saves API budget
    // and proves the C1 contract (no-PDF, no-text-yield → graceful fail).
    if (doc.extractionMethod === "fallback" || critMiss.length === 6) {
      return {
        sol,
        status: source === "txt" ? "FAIL_LOUD (no-PDF source)" : `FAIL_LOUD (extraction:${doc.extractionMethod})`,
        source,
        format: bag.formatDetected,
        conf: bag.overallConfidence,
        critMiss: critMiss.join(",") || "all",
      };
    }

    const t0 = Date.now();
    const j = await runJudgment(facts);
    const elapsed = Date.now() - t0;

    // Persist V2 VM (the renderV2Surfaces input shape)
    const ws = workStatement(j.documentClassification);
    const v2vm = {
      label: `${sol} burn-in`,
      work_statement: ws.work_statement,
      work_statement_unknown: ws.work_statement_unknown,
      matrix_rollup: matrixRollupReshape(facts.clauses),
      submission_checklist_filtered: submissionChecklistFiltered(facts),
      l02_catches: j.l02Catches.slice(1), // hero dedup
      confidence_notes: j.confidenceNotes,
      has_incumbent: false,
    };
    fs.writeFileSync(path.join(process.cwd(), `test/fixtures/burn-in/${sol}-vm.json`), JSON.stringify(v2vm, null, 2));

    // Validate schema shape
    const l02OK = Array.isArray(j.l02Catches) && j.l02Catches.every((x) => x && typeof x === "object" && "category" in x && "title" in x && "why_invisible" in x && "move" in x);
    const cnOK = Array.isArray(j.confidenceNotes) && j.confidenceNotes.every((x) => x && typeof x === "object" && "field" in x && "uncertain" in x && "assumption" in x && "resolve" in x);

    return {
      sol,
      status: critMiss.length ? `PARTIAL(miss:${critMiss.join(",")})` : "GO",
      source,
      pages: doc.pageCount,
      format: bag.formatDetected,
      conf: bag.overallConfidence,
      critMiss: critMiss.join(",") || "—",
      clins: facts.clins.length,
      traps: facts.clauses.filter((c) => c.isTrap).length,
      ft: facts.clauses.filter((c) => c.incorporated === "full_text" && !c.isTrap).length,
      ref: facts.clauses.filter((c) => c.incorporated === "by_reference" && !c.isTrap).length,
      reqs: facts.submissionRequirements.length,
      ws: j.documentClassification.type,
      wsConf: j.documentClassification.confidence,
      risks: `${j.risks.filter((r) => r.severity === "P0").length}/${j.risks.filter((r) => r.severity === "P1").length}/${j.risks.filter((r) => r.severity === "P2").length}`,
      l02: j.l02Catches.length,
      cn: j.confidenceNotes.length,
      verdict: j.verdict.goNoGoRecommendation,
      ms: elapsed,
      schemaOK: l02OK && cnOK ? "objs✓" : "SCHEMA-FAIL",
    };
  } catch (e) {
    return { sol, status: "CRASH", err: (e as Error).message.slice(0, 120) };
  }
}

async function main() {
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  CYCLE 2 v2 BURN-IN — runAuditV2 across 5 unseen solicitations");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("");
  const rows: Row[] = [];
  for (const sol of SOLS) {
    process.stdout.write(`  ${sol}... `);
    const r = await runOne(sol);
    rows.push(r);
    process.stdout.write(`${r.status} (${r.ms ? r.ms + "ms" : "no LLM"})\n`);
  }

  console.log("");
  console.log("─── BURN-IN MATRIX ──────────────────────────────────────────────────────────");
  const header = ["sol", "status", "src", "format", "conf", "clins", "traps/ft/ref", "reqs", "ws(conf)", "risks", "l02", "cn", "verdict", "ms", "schema"];
  console.log("  " + header.map((h) => h.padEnd(15)).join("|"));
  for (const r of rows) {
    const cells = [
      (r.sol || "").slice(0, 14),
      (r.status || "").slice(0, 14),
      r.source || "—",
      r.format || "—",
      r.conf != null ? String(r.conf) : "—",
      r.clins != null ? String(r.clins) : "—",
      r.traps != null ? `${r.traps}/${r.ft}/${r.ref}` : "—",
      r.reqs != null ? String(r.reqs) : "—",
      r.ws != null ? `${r.ws}(${r.wsConf})`.slice(0, 14) : "—",
      r.risks || "—",
      r.l02 != null ? String(r.l02) : "—",
      r.cn != null ? String(r.cn) : "—",
      r.verdict || "—",
      r.ms != null ? `${r.ms}` : "—",
      r.schemaOK || "—",
    ];
    console.log("  " + cells.map((c) => String(c).padEnd(15)).join("|"));
    if (r.err) console.log(`        ⚠ ${r.err}`);
  }

  console.log("");
  const goCount = rows.filter((r) => r.status === "GO").length;
  const partialCount = rows.filter((r) => r.status.startsWith("PARTIAL")).length;
  const failCount = rows.filter((r) => r.status.startsWith("FAIL_LOUD") || r.status === "CRASH" || r.status === "NOT_FETCHED").length;
  const schemaFails = rows.filter((r) => r.schemaOK === "SCHEMA-FAIL").length;
  console.log(`  Summary: ${goCount} GO · ${partialCount} PARTIAL · ${failCount} FAIL/SKIP · schema failures: ${schemaFails}`);
  console.log("");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
