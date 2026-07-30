// $0 CERT — prove the #7 seam is REACHABLE and NOT INERT in the executor, and that the set-aside arm gets a real
// value. The first wiring read `input.setAside`, which does not exist — the arm would have been a silent placebo.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import fs from "fs";
let pass=0, fail=0;
const ok=(l:string,c:boolean)=>{ if(c){pass++;console.log(`  ✓ ${l}`);} else {fail++;console.log(`  ✗ ${l}`);} };
(async()=>{
  const src = fs.readFileSync("src/lib/audit-executor-v3.ts","utf8");
  ok("seam is flag-gated", /AUDIT_ABSENCE_RECONCILE === "true"/.test(src));
  ok("seam feeds the PAYLOAD (reportFindings), not a dead local",
     /reportFindings = rec\.findings/.test(src) && /buildV3Payload\(res\.decision, res\.coverage, reportFindings/.test(src));
  ok("set-aside comes from the SAM solicitation, not a non-existent input field",
     /reconcileAbsenceClaims\([^)]*solicitation\?\.typeOfSetAside/.test(src.replace(/\n/g," ")));
  ok("NOT sourced from input.setAside (the placebo the first wiring had)", !/\(input as \{ setAside/.test(src));
  ok("provenance set excludes ungrounded", /!== "\(ungrounded\)"/.test(src));
  const seam = src.indexOf("AUDIT_ABSENCE_RECONCILE"), np = src.indexOf("AUDIT_NONPRESENCE_HONESTY");
  ok("#7 runs AFTER #2 (it corrects #2's output)", np > 0 && seam > np);
  console.log(`\nCERT RT7-WIRING: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
