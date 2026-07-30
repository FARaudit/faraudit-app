import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
for (const k of ["AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_SEVERITY_HONEST","AUDIT_V5_SEAL"]) process.env[k]="true";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const v5 = renderV5ReportFromRow(row);
// strip tags, find coverage context
const txt = v5.replace(/<[^>]+>/g," ").replace(/&[a-z]+;/g," ").replace(/\s+/g," ");
const idxs=[...txt.matchAll(/coverage/gi)].slice(0,6);
for (const m of idxs) console.log("  v5 coverage ctx: ..."+txt.slice(m.index, m.index+55).trim()+"...");
