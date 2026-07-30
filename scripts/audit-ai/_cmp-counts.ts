import * as fs from "fs";
const cab = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const d = cab.result.diagnostics || {};
console.log("cab687da (NO emission-split): findings=", cab.result.findings.length,
  "| stageCounts=", JSON.stringify(d.stageCounts || {}),
  "| preProcessingFindings=", (d.preProcessingFindings?.length ?? "n/a"));
console.log("2b5f95eb (emission-split ON): raw claims 147 → bounded 126 → verified-typed 92 (from worker log)");
