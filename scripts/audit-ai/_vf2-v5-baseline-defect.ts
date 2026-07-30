import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
// V5 BASELINE — all F2 flags OFF (the served surface as it was BEFORE F2). Question: did the F-2/F-5 defects exist here?
for (const k of ["AUDIT_SEVERITY_HONEST","AUDIT_SETASIDE_HEADER_RECONCILE","AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_MASTHEAD_OFFICE_LEAF"]) delete process.env[k];
process.env.AUDIT_V5_SEAL = "true"; // served config
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const v5 = renderV5ReportFromRow(row);
const txt = v5.replace(/<[^>]+>/g," ").replace(/&[a-z]+;/g," ").replace(/\s+/g," ");
console.log("=== F-2 defect (90 'Critical' labels) — existed on v5 baseline? ===");
console.log("  'Critical' as a severity chip:", (v5.match(/>Critical</g)||[]).length, "| any 'Critical' string:", (txt.match(/critical/gi)||[]).length);
console.log("  one-proposal excerpt rows (dup wall):", (v5.match(/submit only one proposal for the project/gi)||[]).length);
console.log("=== F-5 defect (masthead '100%' vs INCOMPLETE) — existed on v5 baseline? ===");
const covCtx=[...txt.matchAll(/coverage/gi)].slice(0,4).map(m=>txt.slice(m.index,m.index+50).trim());
covCtx.forEach(c=>console.log("  cov:", c));
console.log("  masthead '100%' present:", /100%/.test(v5));
console.log("=== F-3 defect (set-aside 'SBA' asserted) — existed on v5 baseline? ===");
console.log("  'Set-aside' + bare 'SBA' value:", /Set-aside/i.test(txt), "/ SBA in text:", /SBA/.test(v5));
