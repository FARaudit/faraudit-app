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

const DEFAULT_DIR =
  "/Users/josearodriguezjr./faraudit-app/ceo/Solicitation + Export Reviews/N4008526R0065/Naval Station Norfolk Custodial Services";

const args = process.argv.slice(2);
const runMap = args.includes("--map");
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
