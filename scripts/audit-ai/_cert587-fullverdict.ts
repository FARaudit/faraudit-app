// ACCEPTANCE (card #587 arc) — replay the REAL banked LBJ 45f9bacd through the full post-coverage chain and confirm the
// verdict FLIPS NHR → BID_WITH_CAUTION with a named finite caveat, flag-ON; byte-identical NHR flag-OFF.
import { readFileSync } from "fs";
import { deriveVerdict, emitPerformanceUpkeepCaveats } from "../../src/lib/audit-decide";
import { gradeCoverageV2, verifyRecitalInSource } from "../../src/lib/audit-gate-v2";
import { locateObligationContext } from "../../src/lib/audit-orchestrator";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
const src = rec.input.fullSource, atts = rec.result.coverage.attestations;
const FIRE = { AUDIT_GATE_V2:"true", AUDIT_AMBIGUOUS_SIGNAL_DEMOTION:"true", AUDIT_PERFORMANCE_UPKEEP_CAVEAT:"true",
  AUDIT_BENIGN_RECITAL_COVERED:"true", AUDIT_CREDENTIAL_CONDITIONAL_REASON:"true", AUDIT_FABRICATION_INVARIANT:"true" };
function run(bridge:boolean, bondpaper:boolean){
  Object.entries(FIRE).forEach(([k,v])=>process.env[k]=v);
  process.env.AUDIT_RECITAL_LINEWRAP_BRIDGE = bridge?"true":""; process.env.AUDIT_BOND_PAPER_NONBAR = bondpaper?"true":"";
  const cov2 = gradeCoverageV2(atts, { locate:(o:string)=>locateObligationContext(src,o), verifyRecitalPresence:(o:string)=>verifyRecitalInSource(src,o) });
  let findings = rec.result.inputs.findings;
  if (cov2.caveatRecital?.length) findings = emitPerformanceUpkeepCaveats(findings, cov2.caveatRecital);
  const d = deriveVerdict({ ...rec.result.inputs, findings, coverageV2: cov2 });
  const cav = findings.filter((f:any)=>f.lens==="performance-upkeep-caveat");
  return { verdict:d.verdict, disq:(cov2.disqualifierUncovered??[]).length, caveat:(cov2.caveatRecital??[]).length, caveatText: cav[0]?.requirement?.slice(0,120) };
}
let fail=0; const ok=(c:boolean,m:string)=>{console.log(`${c?"✅":"❌"} ${m}`); if(!c)fail++;};
console.log("── recorded (as-run, all fire flags but bridge/bondpaper OFF) → NHR ──");
const off = run(false,false);
console.log(`   verdict=${off.verdict} disqualifierUncovered=${off.disq} caveatRecital=${off.caveat}`);
ok(off.verdict==="NEEDS_HUMAN_REVIEW","flag-OFF (bridge+bondpaper): still NHR — byte-identical to the live fire");
console.log("\n── ALL fixes ON (bridge + bond-paper) → the acceptance ──");
const on = run(true,true);
console.log(`   verdict=${on.verdict} disqualifierUncovered=${on.disq} caveatRecital=${on.caveat}`);
console.log(`   caveat: "${on.caveatText}"`);
ok(on.verdict==="BID_WITH_CAUTION","45f9bacd now renders BID_WITH_CAUTION (the useful verdict)");
ok(on.disq===0,"all NHR drivers cleared (disqualifierUncovered=0)");
ok(/insurance|licens/i.test(on.caveatText||""),"named finite caveat present (maintain insurance/licensing during performance)");
["AUDIT_GATE_V2","AUDIT_AMBIGUOUS_SIGNAL_DEMOTION","AUDIT_PERFORMANCE_UPKEEP_CAVEAT","AUDIT_BENIGN_RECITAL_COVERED","AUDIT_CREDENTIAL_CONDITIONAL_REASON","AUDIT_FABRICATION_INVARIANT","AUDIT_RECITAL_LINEWRAP_BRIDGE","AUDIT_BOND_PAPER_NONBAR"].forEach(k=>delete process.env[k]);
console.log(`\n${fail===0?"🟢 ACCEPTANCE MET — LBJ 45f9bacd: NHR → BID_WITH_CAUTION":`❌ ${fail} FAIL`}`);
process.exit(fail===0?0:1);
