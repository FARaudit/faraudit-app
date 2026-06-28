// PRE-AUDIT GATE — runs the REAL agentic doc-build + MAP against a REAL local
// solicitation package, so "the agentic engine actually reads the docs" is PROVEN
// before any live (paid) audit. This is the gate that was missing when the live
// N4008526R0065 run had the MAP read 0/31 (code-review + unit tests passed; the
// engine still didn't read a single doc on real data).
//
// Stage A (default, FREE, no API): build the agentic docs from the real files and
//   print per-doc extracted-text length + method. Empty text = the doc never
//   reaches the model (pre-filtered as a read-failure). This localizes the 0/31.
// Stage B (--map, CHEAP, haiku): call the REAL mapDocument per doc and report
//   read/fail + the actual API error on any failure + token usage.
//
// Run:
//   npx tsx scripts/audit-ai/test-agentic-facts.ts "<package-dir>"
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/test-agentic-facts.ts "<package-dir>" --map
//
// <package-dir> defaults to the saved N4008526R0065 SAM package.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { buildAgenticDocs } from "../../src/lib/agentic-executor";
import { mapDocument } from "../../src/lib/agentic-map";
import { runAgenticMap } from "../../src/lib/agentic-orchestrator";
import { buildCompactMatrix, selectBindingExcerpts, runLenses } from "../../src/lib/agentic-lenses";
import { modelFor } from "../../src/lib/model-registry";

const DEFAULT_DIR =
  "/Users/josearodriguezjr./faraudit-app/ceo/Solicitation + Export Reviews/N4008526R0065/Naval Station Norfolk Custodial Services";

const args = process.argv.slice(2);
const runMap = args.includes("--map");
const runLensesMode = args.includes("--lenses");
const dumpArg = args.find((a) => a.startsWith("--dump="));
const dumpSubstr = dumpArg ? dumpArg.slice("--dump=".length).toLowerCase() : null;
const dir = args.find((a) => !a.startsWith("--")) ?? DEFAULT_DIR;

function listFiles(root: string): string[] {
  return readdirSync(root)
    .filter((n) => !n.startsWith(".") && statSync(path.join(root, n)).isFile())
    .map((n) => path.join(root, n))
    .sort();
}

const min = (s: string) => s.replace(/\s/g, "").length;

async function main() {
  const files = listFiles(dir);
  console.log(`\n=== PRE-AUDIT AGENTIC GATE ===\npackage: ${dir}\nfiles: ${files.length}\n`);

  // Mirror the live executor's input shape: primary = the Solicitation form,
  // attachments = everything else, each as { name, base64, buffer }. base64 is
  // the SAME field V1 reads (it read these fine live), so this faithfully
  // reproduces what buildAgenticDocs receives in the worker.
  const primaryPath =
    files.find((f) => /Solicitation - /i.test(path.basename(f))) ??
    files.find((f) => /Solicitation/i.test(path.basename(f))) ??
    files[0];
  const primaryBytes = readFileSync(primaryPath);
  const attachments = files
    .filter((f) => f !== primaryPath)
    .map((f) => {
      const buffer = readFileSync(f);
      return { name: path.basename(f), base64: buffer.toString("base64"), buffer };
    });

  // STAGE A — the real doc-builder (text extraction / OCR). No API.
  const docs = await buildAgenticDocs({
    primaryName: path.basename(primaryPath),
    primaryBytes,
    primaryText: null, // worker passes extractedText; null forces extractText() — the attachment path
    attachments,
  });

  let emptyCount = 0;
  console.log("STAGE A — per-doc extracted text (>=50 non-ws chars = mappable):");
  for (const d of docs) {
    const chars = min(d.text);
    const ok = chars >= 50;
    if (!ok) emptyCount++;
    console.log(`  ${ok ? "OK  " : "EMPTY"} ${String(chars).padStart(8)} chars · ${d.name}`);
  }
  console.log(
    `\nSTAGE A RESULT: ${docs.length - emptyCount}/${docs.length} docs have usable text · ${emptyCount} EMPTY (would be read-failures)\n`
  );

  // DUMP — full per-doc extract for ONE doc (root-causing 0-findings). Shows whether
  // workStatementText is populated (schema-fit gap: prose lands there but findingCount
  // excludes it) or empty (recall gap: the model pulled nothing).
  if (dumpSubstr) {
    const d = docs.find((x) => x.name.toLowerCase().includes(dumpSubstr));
    if (!d) { console.log(`\n--dump: no doc matching "${dumpSubstr}"\n`); return; }
    const model = process.env.AUDIT_MAP_MODEL ?? "claude-haiku-4-5";
    console.log(`\n=== DUMP · ${d.name} · text=${d.text.length} chars · model=${model} ===`);
    const ex = await mapDocument(d.name, d.text, model);
    console.log(`clauses=${ex.clauses.length} clins=${ex.clins.length} delivery=${ex.delivery.length} submissionRequirements=${ex.submissionRequirements.length} evaluationFactors=${ex.evaluationFactors.length} performanceRequirements=${ex.performanceRequirements.length} amendmentChanges=${ex.amendmentChanges.length}`);
    console.log(`workStatementText: ${ex.workStatementText ? `${ex.workStatementText.length} chars — "${ex.workStatementText.slice(0, 400)}…"` : "NULL"}`);
    if (ex.performanceRequirements.length) console.log(`performanceRequirements sample: ${JSON.stringify(ex.performanceRequirements.slice(0, 3), null, 2)}`);
    if (ex.amendmentChanges.length) console.log(`amendmentChanges sample: ${JSON.stringify(ex.amendmentChanges.slice(0, 3), null, 2)}`);
    console.log(`warnings (${ex.warnings.length}): ${JSON.stringify(ex.warnings, null, 2)}`);
    if (ex.submissionRequirements.length) console.log(`submissionRequirements sample: ${JSON.stringify(ex.submissionRequirements.slice(0, 3), null, 2)}`);
    console.log("");
    return;
  }

  // STAGE C — the REAL Stage-2 lenses over the compact matrix (proves calls 1–3 are
  // reborn: overview/compliance/risks + cross-doc produced from the matrix, no 925k).
  if (runLensesMode) {
    if (!process.env.ANTHROPIC_API_KEY) { console.log("STAGE C skipped — ANTHROPIC_API_KEY not set.\n"); return; }
    const sol = path.basename(path.dirname(dir)) || "N4008526R0065";
    console.log(`\n=== STAGE C — MAP → COMPACT MATRIX → LENSES (real API) ===`);
    console.log(`lens model = ${modelFor("lens")} · crossdoc model = ${modelFor("crossdoc")} · extractor = ${modelFor("extractor")}\n`);
    // 1) the real MAP over the whole package (the Stage-1 baseline ~$0.38).
    const mapResult = await runAgenticMap({ docs, scalars: { solicitorNumber: sol }, mapModel: process.env.AUDIT_MAP_MODEL });
    console.log(`MAP: ${mapResult.coverage.read.length} read · ${mapResult.coverage.readFailures.length} fail · ${mapResult.coverage.complete ? "COMPLETE" : "PARTIAL"}`);
    // 2) deterministic compact matrix (no API).
    const matrix = buildCompactMatrix(mapResult.facts, {
      provenance: mapResult.provenance,
      coverageStatement: mapResult.coverage.statement,
      warnings: mapResult.facts.extractionWarnings,
    });
    const matrixTokEst = Math.round(matrix.length / 3.5);
    console.log(`MATRIX: ${matrix.length.toLocaleString()} chars (~${matrixTokEst.toLocaleString()} tok) — vs the ~925k the legacy calls 1–3 stuffed`);
    const { text: bindingExcerpts, selected } = selectBindingExcerpts(docs.map((d) => ({ name: d.name, text: d.text })));
    console.log(`BINDING SUBSET (cross-doc): ${selected.length} docs, ${bindingExcerpts.length.toLocaleString()} chars — ${selected.slice(0, 6).join(", ")}${selected.length > 6 ? " …" : ""}`);
    // 3) the lenses (prime-then-parallel, matrix cached).
    const t0 = Date.now();
    const s = await runLenses({ matrix, bindingExcerpts });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n--- LENS SURFACES (produced in ${secs}s) ---`);
    console.log(`OVERVIEW : fit_score=${s.overview.fit_score} · summary=${s.overview.summary.length}ch · evalFactors=${s.overview.evaluation_factors_raw.length} · subReqs=${s.overview.submission_requirements_raw.length} · contract=${s.overview.contract_type || "—"}`);
    console.log(`           rationale: "${(s.overview.fit_score_rationale || "").slice(0, 120)}"`);
    console.log(`COMPLIANCE: far=${s.compliance.far_clauses.length} · dfars=${s.compliance.dfars_clauses.length} · certs=${s.compliance.required_certifications.length} · actions=${s.compliance.key_compliance_actions.length} · deadlines=${s.compliance.deadlines.length} · clins=${s.compliance.clins.length} · §L=${s.compliance.section_l_summary.length}ch · §M=${s.compliance.section_m_summary.length}ch`);
    const cats = s.risks.risk_findings.reduce((m: Record<string, number>, r) => ((m[r.category] = (m[r.category] || 0) + 1), m), {});
    console.log(`RISKS    : ${s.risks.risk_findings.length} findings · ${JSON.stringify(cats)}`);
    console.log(`CROSS-DOC: ${s.crossDoc.crossDocFindings.length} cross-doc findings · ${s.crossDoc.reconciliationNotes.length} reconciliation notes`);
    if (s.crossDoc.crossDocFindings[0]) console.log(`           e.g. "${s.crossDoc.crossDocFindings[0].title}" — ${(s.crossDoc.crossDocFindings[0].citation || "").slice(0, 80)}`);
    // non-empty surface assertions (the Stage-2 "same surfaces" done-criterion)
    const ok =
      s.overview.summary.length > 0 && typeof s.overview.fit_score === "number" &&
      s.compliance.far_clauses.length + s.compliance.dfars_clauses.length > 0 &&
      s.risks.risk_findings.length > 0;
    console.log(`\nSTAGE C RESULT: lenses produced ${ok ? "NON-EMPTY render surfaces ✅" : "an EMPTY surface ❌ — investigate"} · no 925k Opus call (matrix ~${matrixTokEst.toLocaleString()} tok)`);
    console.log(`Cost actualizes on the Anthropic Console; matrix-cached after the overview primes it.\n`);
    return;
  }

  if (!runMap) {
    console.log("(Stage B skipped — pass --map with ANTHROPIC_API_KEY to run the real haiku MAP.)\n");
    return;
  }

  // STAGE B — the real per-doc haiku MAP call, surfacing the actual API error.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("STAGE B skipped — ANTHROPIC_API_KEY not set in env.\n");
    return;
  }
  const model = process.env.AUDIT_MAP_MODEL ?? "claude-haiku-4-5";
  const full = args.includes("--full");
  const readable = docs.filter((d) => min(d.text) >= 50);
  const targets = full ? readable : readable.slice(0, 3); // --full = whole package; default = cheap 3
  console.log(`STAGE B — real MAP read per doc (model=${model}, ${full ? "FULL package" : "3-doc sample"}):`);
  if (targets.length === 0) {
    console.log("  (no readable docs to MAP — Stage A already shows the break)\n");
    return;
  }
  let read = 0;
  let failed = 0;
  let totalFindings = 0;
  let totalPerfReqs = 0;
  let docsWithPerfReqs = 0;
  let inputChars = 0;
  // Bounded concurrency mirrors runAgenticMap (4) so timing/throughput is representative.
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const settled = await Promise.allSettled(
      batch.map((d) => mapDocument(d.name, d.text, model).then((ex) => ({ d, ex })))
    );
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled") {
        const { d, ex } = r.value;
        const findings = ex.clauses.length + ex.clins.length + ex.delivery.length + ex.submissionRequirements.length + ex.evaluationFactors.length + ex.performanceRequirements.length + ex.amendmentChanges.length;
        read++; totalFindings += findings; inputChars += d.text.length;
        totalPerfReqs += ex.performanceRequirements.length;
        if (ex.performanceRequirements.length > 0) docsWithPerfReqs++;
        console.log(`  READ ${String(findings).padStart(4)} findings (${String(ex.performanceRequirements.length).padStart(3)} perfReq) · ${batch[j].name}`);
      } else {
        failed++;
        console.log(`  FAIL ${batch[j].name} · ${r.reason instanceof Error ? r.reason.message : r.reason}`);
      }
    }
  }
  // Cost estimate from FACTS (input char counts → ~tokens at chars/3.5; Haiku 4.5
  // input ≈ $1/1M). Output is small structured JSON. Shown as arithmetic, not an
  // actual — the real per-audit cost still actualizes on the CSV delta of a live run.
  const estInTokens = Math.round(inputChars / 3.5);
  const estInCost = (estInTokens / 1_000_000) * 1.0;
  console.log(`\nSTAGE B RESULT: ${read} read · ${failed} failed (of ${targets.length}) · ${totalFindings} total findings · ${totalPerfReqs} performanceRequirements across ${docsWithPerfReqs} doc(s)`);
  console.log(`AGENTIC READ COST (est, input-side): ~${estInTokens.toLocaleString()} Haiku input tokens ≈ $${estInCost.toFixed(3)} (vs V1's ~$5.78 for one 925k Opus cache-write). Output adds a little; confirm on a live CSV delta.\n`);
}

main().catch((e) => {
  console.error("harness error:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
