import { readFileSync } from "node:fs";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";
const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json","utf8"));
process.env.AUDIT_SEVERITY_HONEST = "true";
const on = renderV4ReportFromRow(row);
// split by top-level section ids to locate matches
const re = /submit only one proposal for the project/gi;
let m; const positions:number[]=[];
while((m=re.exec(on))) positions.push(m.index);
console.log("total matches:", positions.length);
for (const p of positions){
  // find nearest preceding id="..." to label the section
  const before = on.slice(0, p);
  const secId = [...before.matchAll(/id="([^"]+)"/g)].pop()?.[1] ?? "?";
  const cls = [...before.matchAll(/class="(fgroup[^"]*|[a-z]*matrix[^"]*|sl-[^"]*|find[^"]*)"/g)].pop()?.[1] ?? "?";
  console.log(`  @${p} · section=${secId} · nearestClass=${cls} · ctx=...${on.slice(p-40,p+30).replace(/\s+/g,' ')}...`);
}
