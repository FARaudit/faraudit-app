import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
// served surface = v5. arm ALL F2 flags (they're armed in prod) to give v5 its best case.
for (const k of ["AUDIT_SEVERITY_HONEST","AUDIT_SETASIDE_HEADER_RECONCILE","AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_MASTHEAD_OFFICE_LEAF","AUDIT_NHR_NARRATIVE_TRUE_CAUSE","AUDIT_COVERAGE_COUNTER_SPLIT","AUDIT_V5_SEAL"]) process.env[k]="true";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const html = renderV5ReportFromRow(row);
const cnt = (re: RegExp) => (html.match(re)||[]).length;
console.log("v5 SERVED render bytes:", html.length);
console.log("  'Critical' label occurrences:", cnt(/Critical/g));
console.log("  one-proposal excerpt rows:", cnt(/submit only one proposal for the project/gi));
console.log("  'Set-aside' + 'SBA' co-present:", /SBA/.test(html));
console.log("  'None confirmed' (F-3 fix present?):", /None confirmed/.test(html));
console.log("  coverage '100%':", /100%/.test(html), "| 'Incomplete' masthead:", /Incomplete/.test(html));
