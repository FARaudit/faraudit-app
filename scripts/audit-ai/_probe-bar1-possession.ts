import * as fs from "fs";
import { hasPreAwardPossession, hasLongLeadCredential } from "../../src/lib/audit-gate-v2";
const rec = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const findings = rec.result.findings as any[];
const untyped = findings.filter(f => f.kind==="eligibility_bar" && f.controllability==="bidder_cannot_move" && (!f.requiredAttribute || f.curableInWindow===undefined));
for (const f of untyped) {
  const hay = `${f.requirement??""} ${f.excerpt??""} ${f.requiredAttribute??""} ${f.citation??""}`;
  console.log(`\nid=${f.id} citation="${String(f.citation).slice(0,60)}"`);
  console.log(`  requirement="${String(f.requirement).slice(0,90)}"`);
  console.log(`  hasPreAwardPossession=${hasPreAwardPossession(hay)} · hasLongLeadCredential=${hasLongLeadCredential(hay)}`);
}
