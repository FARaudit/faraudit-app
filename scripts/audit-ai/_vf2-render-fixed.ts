import { readFileSync, writeFileSync } from "node:fs";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";
for (const k of ["AUDIT_SEVERITY_HONEST","AUDIT_SETASIDE_HEADER_RECONCILE","AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_MASTHEAD_OFFICE_LEAF"]) process.env[k]="true";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
writeFileSync("/tmp/audit-496a9a21-F2FIXED.html", renderV4ReportFromRow(row));
console.log("fixed (F2 flags ON) render → /tmp/audit-496a9a21-F2FIXED.html");
