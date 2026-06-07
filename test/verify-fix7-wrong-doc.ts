// Fix 7 verifier — calls runAuditV2 directly on W58RGZ-25-B-0034 (CDRL list)
// and asserts the WRONG_DOC short-circuit fires:
//   - judgment.documentClassification.type === "wrong_doc"
//   - judgment.verdict.goNoGoRecommendation === "wrong_doc"
//   - No extraction / no judgment LLM call
// Also runs SPRHA4-26-R-0454 as a control (real UCF solicitation) to confirm
// the detector does NOT false-positive on real solicitations.

import * as fs from "node:fs";
import * as path from "node:path";
import { runAuditV2 } from "../src/lib/audit-engine";

interface Probe {
  sol: string;
  expected: "wrong_doc" | "normal";
}

const PROBES: Probe[] = [
  { sol: "W58RGZ-25-B-0034", expected: "wrong_doc" },
  { sol: "SPRHA4-26-R-0454", expected: "normal" },
];

async function probe(p: Probe): Promise<{ pass: boolean; line: string }> {
  const pdfPath = path.join(process.cwd(), "test/pdfs/burn-in", `${p.sol}.pdf`);
  if (!fs.existsSync(pdfPath)) return { pass: false, line: `${p.sol}: PDF NOT FOUND at ${pdfPath}` };

  const buf = fs.readFileSync(pdfPath);
  const t0 = Date.now();
  const result = await runAuditV2(buf);
  const ms = Date.now() - t0;

  const dcType = result.judgment.documentClassification.type;
  const verdict = result.judgment.verdict.goNoGoRecommendation;
  const detectedForm = result.judgment.documentClassification.detected_form ?? "—";
  const piid = result.judgment.documentClassification.extracted_piid ?? "—";

  if (p.expected === "wrong_doc") {
    const pass = dcType === "wrong_doc" && verdict === "wrong_doc" && ms < 5000;
    return {
      pass,
      line: `${p.sol}: type=${dcType} verdict=${verdict} form=${detectedForm} piid=${piid} ms=${ms} → ${pass ? "PASS (short-circuit fired, <5s)" : "FAIL"}`,
    };
  }
  // normal control — must NOT short-circuit
  const pass = dcType !== "wrong_doc" && verdict !== "wrong_doc";
  return {
    pass,
    line: `${p.sol}: type=${dcType} verdict=${verdict} ms=${ms} → ${pass ? "PASS (normal pipeline)" : "FAIL (false positive)"}`,
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  Fix 7 verifier — runAuditV2 WRONG_DOC short-circuit");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  let allPass = true;
  for (const p of PROBES) {
    const r = await probe(p);
    console.log("  " + r.line);
    if (!r.pass) allPass = false;
  }
  console.log("");
  console.log(allPass ? "✓ Fix 7 verified — short-circuit fires on CDRL list, no false positive on UCF" : "✗ Fix 7 FAILED");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
