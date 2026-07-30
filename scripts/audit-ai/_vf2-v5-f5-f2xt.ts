import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
for (const k of ["AUDIT_SEVERITY_HONEST","AUDIT_SETASIDE_HEADER_RECONCILE","AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_MASTHEAD_OFFICE_LEAF"]) delete process.env[k];
process.env.AUDIT_V5_SEAL="true";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const v5 = renderV5ReportFromRow(row);
// where is 100% in v5?
const idx = v5.indexOf("100%");
console.log("=== v5 '100%' context (F-5) ===");
if (idx>=0) { const seg=v5.slice(Math.max(0,idx-120),idx+20).replace(/<[^>]+>/g," ").replace(/\s+/g," "); console.log("  ..."+seg+"..."); }
else console.log("  no '100%'");
// F-2 cross-tier: BOA bar count on v5 baseline (dup across tiers?)
console.log("=== F-2 cross-tier — BOA bar rows on v5 baseline ===");
console.log("  BOA excerpt rows:", (v5.match(/ONLY AVAILABLE TO CURRENT BOA HOLDERS/gi)||[]).length);
// now with F2 ON — does cross-tier reduce it on v5 (shared build-data)?
for (const k of ["AUDIT_SEVERITY_HONEST"]) process.env[k]="true";
const v5on = renderV5ReportFromRow(row);
console.log("  BOA excerpt rows (F2 ON):", (v5on.match(/ONLY AVAILABLE TO CURRENT BOA HOLDERS/gi)||[]).length);
console.log("  one-proposal rows (F2 ON):", (v5on.match(/submit only one proposal for the project/gi)||[]).length, "(baseline was 7)");
