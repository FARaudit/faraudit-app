import { readFileSync } from "fs";
import { verifyRecitalInSource, recitalTailVeto, classifyPerformanceUpkeepRecital } from "../../src/lib/audit-gate-v2";
const r = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
const src = r.input.fullSource;
const dq = (r.result.inputs?.coverageV2?.disqualifierUncovered)??[];
console.log(`fullSource length: ${src.length}`);
for (const d of dq.slice(0,3)) {
  const ob = d.obligation||"";
  const ver = verifyRecitalInSource(src, ob);
  console.log(`\n[§${d.section}] ob="${ob.slice(0,80)}..."`);
  console.log(`   verifyRecitalInSource → ${ver ? `present, continuation="${(ver.continuation||"").slice(0,120)}"` : "NULL (not source-verified → escalate)"}`);
  if (ver) {
    console.log(`   recitalTailVeto(continuation)=${recitalTailVeto(ver.continuation)}`);
    console.log(`   classifyPerformanceUpkeepRecital(ob, continuation)=${JSON.stringify(classifyPerformanceUpkeepRecital(ob, ver.continuation))}`);
  }
}
// Does the raw source even contain "during the performance period" near this recital?
const idx = src.toLowerCase().indexOf("maintain licensing");
if (idx>=0) console.log(`\nRAW SOURCE around "maintain licensing" [${idx}]:\n"${src.slice(idx, idx+260).replace(/\n/g," ")}"`);
