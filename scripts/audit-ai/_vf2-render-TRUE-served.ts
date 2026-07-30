import { readFileSync, writeFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
// TRUE SERVED CONFIG (read from Vercel prod): AUDIT_REPORT_V5=true, AUDIT_V5_SEAL=true, ALL other render flags ABSENT.
for (const k of ["AUDIT_SEVERITY_HONEST","AUDIT_SETASIDE_HEADER_RECONCILE","AUDIT_COVERAGE_DISPLAY_COHERENT","AUDIT_MASTHEAD_OFFICE_LEAF","AUDIT_NHR_NARRATIVE_TRUE_CAUSE","AUDIT_COVERAGE_COUNTER_SPLIT"]) delete process.env[k];
process.env.AUDIT_REPORT_V5="true"; process.env.AUDIT_V5_SEAL="true";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const html = renderV5ReportFromRow(row);
writeFileSync("/tmp/audit-496a9a21-TRUE-SERVED-v5.html", html);
const txt = html.replace(/<[^>]+>/g," ").replace(/&[a-z]+;/g," ").replace(/\s+/g," ");
console.log("TRUE served v5 render →", html.length, "bytes");
// what customers actually see on the key surfaces:
const i=txt.toLowerCase().indexOf("human review"); console.log("HEADLINE:", i>=0?txt.slice(i,i+240):"(n/f)");
console.log("dup wall one-proposal rows:", (html.match(/submit only one proposal for the project/gi)||[]).length);
console.log("BOA rows:", (html.match(/ONLY AVAILABLE TO CURRENT BOA HOLDERS/gi)||[]).length);
console.log("Set-aside 'None confirmed':", /None confirmed/.test(html), "| bare SBA:", /SBA/.test(html));
console.log("conflict language:", ["conflict","contradict"].map(w=>w+":"+(txt.toLowerCase().split(w).length-1)).join(" "));
