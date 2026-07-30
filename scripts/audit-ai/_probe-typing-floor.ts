import * as fs from "fs";
import { applyClauseKeyedTypingFloor } from "../../src/lib/audit-decide";
const rec = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const findings = rec.result.findings;
const before = findings.filter((f:any)=>f.kind==="eligibility_bar" && f.controllability==="bidder_cannot_move" && (!f.requiredAttribute||f.curableInWindow===undefined));
const after = applyClauseKeyedTypingFloor(findings, { enabled: true });
for (const b of before) {
  const a = after.find((x:any)=>x.id===b.id);
  console.log(`${b.id} "${String(b.citation).slice(0,40)}": ${b.controllability}/cur=${b.curableInWindow} → ${a.controllability}/cur=${a.curableInWindow}${a.controllability!==b.controllability?"  ✅TYPED":"  (unchanged)"}`);
}
// flag-off byte-identical
const off = applyClauseKeyedTypingFloor(findings, { enabled: false });
console.log("flag-OFF identical:", JSON.stringify(off)===JSON.stringify(findings));
