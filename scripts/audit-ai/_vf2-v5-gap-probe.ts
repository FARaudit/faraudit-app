import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";
for (const k of ["AUDIT_SEVERITY_HONEST","AUDIT_SETASIDE_HEADER_RECONCILE","AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_MASTHEAD_OFFICE_LEAF","AUDIT_NHR_NARRATIVE_TRUE_CAUSE","AUDIT_COVERAGE_COUNTER_SPLIT","AUDIT_V5_SEAL"]) process.env[k]="true";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const v5 = renderV5ReportFromRow(row);
const v4 = renderV4ReportFromRow(row);
const findCov = (html:string, re:RegExp) => { const m=html.match(re); return m?m[0]:"(not found)"; };
// v5 coverage masthead — does F-5 (100%->Incomplete) reach it?
console.log("=== F-5 coverage masthead — SERVED v5 vs certified v4 ===");
console.log(" v5 (served) coverage readout:", findCov(v5, /Coverage[^%A-Za-z]{0,6}(100%|Incomplete|[0-9]+%)/i));
console.log(" v4 (certified) coverage readout:", findCov(v4, /Coverage[^%A-Za-z]{0,6}(100%|Incomplete|[0-9]+%)/i));
// F-2 dedup shared? one-proposal count
console.log("=== F-2 dedup (shared build-data) — one-proposal rows ===");
console.log(" v5:", (v5.match(/submit only one proposal for the project/gi)||[]).length, "| v4:", (v4.match(/submit only one proposal for the project/gi)||[]).length);
// F-3 shared?
console.log("=== F-3 set-aside — 'None confirmed' present ===");
console.log(" v5:", /None confirmed/.test(v5), "| v4:", /None confirmed/.test(v4));
// F-2 unrated group render in v5?
console.log("=== F-2 UNRATED group ===");
console.log(" v5 has 'Unrated':", /Unrated/i.test(v5), "| v4 has 'Unrated':", /Unrated/i.test(v4));
