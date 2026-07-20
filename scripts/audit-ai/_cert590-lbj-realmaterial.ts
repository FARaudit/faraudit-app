// REAL-MATERIAL check (card #590) — the recognizer must be INERT on LBJ 45f9bacd as-is (untyped NMR + verifierSound=false),
// i.e. NOT falsely commit. Forcing verifierSound=true (to reach the recognizer), the untyped NMR must keep it inert → NHR.
import { readFileSync } from "fs";
import { deriveVerdict } from "../../src/lib/audit-decide";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
let fail=0; const ok=(c:boolean,m:string)=>{console.log(`${c?"✅":"❌"} ${m}`); if(!c)fail++;};
// verifierSound as-recorded (false) → NHR regardless (verifier sovereign)
const asRun = deriveVerdict({ ...rec.result.inputs });
ok(asRun.verdict==="NEEDS_HUMAN_REVIEW", `LBJ as-run (verifierSound=false) → NHR (verifier sovereign), got ${asRun.verdict}`);
// force verifierSound=true → recognizer reached; untyped NMR must keep it INERT → NHR (not a false BWC)
const forced = deriveVerdict({ ...rec.result.inputs, verifierSound:true });
ok(forced.verdict!=="BID_WITH_CAUTION", `LBJ w/ verifierSound=true: recognizer INERT (untyped NMR) → not a false commit, got ${forced.verdict}`);
console.log(`   reason: ${forced.reason.slice(0,110)}`);
console.log(`\n${fail===0?"🟢 real-material safety CONFIRMED — recognizer does not falsely fire on LBJ (needs a clean re-run)":`❌ ${fail} FAIL`}`);
process.exit(fail===0?0:1);
