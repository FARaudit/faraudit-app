import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
const conflictSteps = (html:string) => {
  const txt=html.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  return (txt.match(/findings conflict and the engine will not adjudicate/gi)||[]).length;
};
process.env.AUDIT_REPORT_V5="true"; process.env.AUDIT_V5_SEAL="true";
// SERVED config (flag ABSENT):
delete process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE;
const served = renderV5ReportFromRow(row);
console.log("SERVED (flag ABSENT, what customers get): conflict-cause step =", conflictSteps(served));
// FIX config (flag ON):
process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE="true";
const fixed = renderV5ReportFromRow(row);
console.log("FIXED  (flag ON): conflict-cause step =", conflictSteps(fixed));
// what does the fixed one say instead? find the walkthrough cause step
const ftxt=fixed.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
const i=ftxt.toLowerCase().indexOf("findings reconciled"); if(i>=0) console.log("FIXED walkthrough @that step:", ftxt.slice(i,i+160));
const stxt=served.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
const j=stxt.toLowerCase().indexOf("findings reconciled"); if(j>=0) console.log("SERVED walkthrough @that step:", stxt.slice(j,j+160));
