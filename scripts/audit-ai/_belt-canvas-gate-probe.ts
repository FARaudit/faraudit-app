// Pruned-file-set probe for the BELT canvas gate in pdf-text-extractor (2026-07-29).
//
// Defect being fixed: the stub guard keyed on `typeof DOMMatrix === "undefined"`, which is
// ALWAYS true in Node before pdfjs loads @napi-rs/canvas — so the stub pre-empted pdfjs's
// real-canvas polyfill in every environment (prod lambda logged the stub warning while canvas
// was installed and traced). The fix gates the stub on a try-require of @napi-rs/canvas.
//
// Run this ONCE PER PROCESS (polyfills are global), bundled via esbuild with pdf-parse and
// @napi-rs/canvas external, inside a sandbox containing ONLY the traced packages:
//   node probe.cjs <fixture.pdf> canvas     — sandbox HAS @napi-rs/canvas: expect NO stub,
//                                             NO stub warning, extraction succeeds
//   node probe.cjs <fixture.pdf> nocanvas   — sandbox LACKS it: expect stub fires, warning
//                                             present, extraction STILL succeeds (the belt)
// The driver compares meaningful counts across the two runs — they must match.
import { readFileSync } from "node:fs";
import { extractText, meaningfulCharCount } from "../../src/lib/pdf-text-extractor";

async function main() {
  const [pdfPath, mode] = process.argv.slice(2);
  if (!pdfPath || (mode !== "canvas" && mode !== "nocanvas")) {
    console.error("usage: probe <fixture.pdf> canvas|nocanvas");
    process.exit(2);
  }

  const g = globalThis as Record<string, unknown>;
  const domBefore = typeof g.DOMMatrix;
  const doc = await extractText(readFileSync(pdfPath));
  const domAfter = g.DOMMatrix as { name?: string } | undefined;
  const stubbed = domAfter?.name === "DOMMatrixStub";
  const stubWarning = doc.warnings.some((w) => w.includes("DOMMatrix stubbed"));
  const meaningful = meaningfulCharCount(doc.rawText);

  const result = {
    mode,
    domBefore,
    domAfterName: domAfter?.name ?? null,
    stubbed,
    stubWarning,
    warnings: doc.warnings,
    extractionMethod: doc.extractionMethod,
    pageCount: doc.pageCount,
    meaningful,
  };
  console.log(JSON.stringify(result));

  const failures: string[] = [];
  if (domBefore !== "undefined") failures.push(`DOMMatrix pre-existed (${domBefore}) — probe process is contaminated, result void`);
  if (meaningful < 200) failures.push(`extraction yielded only ${meaningful} meaningful chars`);
  if (mode === "canvas") {
    if (stubbed) failures.push("stub installed despite canvas being loadable");
    if (stubWarning) failures.push("stub warning pushed despite canvas being loadable");
  } else {
    if (!stubbed) failures.push("stub did NOT install with canvas absent");
    if (!stubWarning) failures.push("stub warning missing with canvas absent");
  }
  if (failures.length) {
    console.error(`PROBE RED (${mode}): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.error(`PROBE GREEN (${mode}): meaningful=${meaningful} method=${doc.extractionMethod}`);
}

main().catch((err) => {
  console.error(`PROBE RED: extractText threw — ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
  process.exit(1);
});
