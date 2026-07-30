import { readFileSync } from "fs";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
const inp = rec.result.inputs;
console.log("NHR-relevant inputs (with coverageComplete=true, what still drives NHR):");
console.log("  detectedUnverifiableEligibilityGate:", inp.detectedUnverifiableEligibilityGate);
console.log("  setAsideConflict:", inp.setAsideConflict, "· conflict:", inp.conflict);
console.log("  primaryIndeterminate:", inp.primaryIndeterminate, "· noticeBodyBarUngrounded:", inp.noticeBodyBarUngrounded);
console.log("  siteVisitSeverityFloor:", inp.siteVisitSeverityFloor, "· coverageGap:", inp.coverageGap);
const fs = inp.findings||[];
console.log("\nfindings by controllability:");
const cc:Record<string,number>={}; for(const f of fs) cc[f.controllability]=(cc[f.controllability]||0)+1;
console.log(" ", JSON.stringify(cc));
console.log("\nbar-class / cannot-move findings (potential NHR drivers):");
for (const f of fs.filter((f:any)=>f.controllability==="bidder_cannot_move"||f.controllability==="no_one_can_move"||f.kind==="eligibility_bar"||f.requiredAttribute)) {
  console.log(`  [${f.kind}/${f.controllability}${f.requiredAttribute?"/attr:"+f.requiredAttribute:""}${f.firmStatus?"/fs:"+f.firmStatus:""}] "${(f.requirement||"").slice(0,90)}"`);
}
