// GAUNTLET (card #587) — line-wrap continuation bridge. ACCEPTANCE on the REAL banked LBJ record 45f9bacd (proof-shape
// doctrine: production specimen, not reconstructed). Run: npx tsx scripts/audit-ai/_cert587-linewrap.ts
import { readFileSync } from "fs";
import { replayCoverageStage, type RunRecord } from "../../src/lib/audit-run-record";
import { verifyRecitalInSource, classifyPerformanceUpkeepRecital, recitalTailVeto } from "../../src/lib/audit-gate-v2";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8")) as RunRecord;
let fail = 0; const ok=(c:boolean,m:string)=>{console.log(`${c?"✅":"❌"} ${m}`); if(!c)fail++;};
const set=(o:Record<string,string>)=>{for(const k in o)process.env[k]=o[k];};
const clr=(...k:string[])=>k.forEach(x=>delete process.env[x]);

console.log("\n── ACCEPTANCE · real banked LBJ 45f9bacd → BWC demotion flag-ON, byte-identical flag-OFF ──");
// flag-ON: #587 bridge + #576 caveat
set({AUDIT_GATE_V2:"true", AUDIT_PERFORMANCE_UPKEEP_CAVEAT:"true", AUDIT_RECITAL_LINEWRAP_BRIDGE:"true", AUDIT_AMBIGUOUS_SIGNAL_DEMOTION:"true"});
const on = replayCoverageStage(rec);
ok(on.caveatRecital >= 1, `flag-ON: insurance recital demotes to caveatRecital (=${on.caveatRecital}) — the #576 BWC caveat fires`);
// flag-OFF the bridge → back to NHR (no caveat)
set({AUDIT_RECITAL_LINEWRAP_BRIDGE:""});
const off = replayCoverageStage(rec);
ok(off.caveatRecital === 0, `bridge flag-OFF: caveatRecital=0 (byte-identical NHR — the fix is fully flag-gated)`);
ok(off.disqualifierUncovered > on.disqualifierUncovered, `bridge OFF escalates (disqUncovered ${off.disqualifierUncovered}) vs ON demotes (${on.disqualifierUncovered})`);

console.log("\n── the exact continuation recovered (real source) ──");
set({AUDIT_RECITAL_LINEWRAP_BRIDGE:"true"});
const dq = (rec.result.inputs as any).coverageV2.disqualifierUncovered;
const ob = dq[0].obligation;
const ver = verifyRecitalInSource(rec.input.fullSource, ob);
console.log(`   continuation="${(ver?.continuation||"").slice(0,140)}"`);
ok(/during the entire performance period/i.test(ver?.continuation||""), "bridged continuation contains 'during the entire performance period' (the recovered frame)");
ok(!/time of award/i.test(ver?.continuation||""), "bridge STOPPED before the separate pre-award 'Proof of insurance … at time of award' (no bleed)");
ok(!!classifyPerformanceUpkeepRecital(ob, ver?.continuation), "classifyPerformanceUpkeepRecital DEMOTES with the bridged continuation");

console.log("\n── RED-TEAM (over-fire): separate next-line obligations + long-lead must still ESCALATE ──");
// (a) pre-award separate obligation (capital-led) — must not bridge into the caveat
const preaward = "==== DOCUMENT: SAM Notice Body ====\nContractor shall submit a proposal\nProof of insurance is needed at time of award.";
const v1 = verifyRecitalInSource(preaward, "Contractor shall submit a proposal");
ok(!/time of award/i.test(v1?.continuation||""), "capital-led separate obligation ('Proof of insurance…') is NOT bridged");
// (b) long-lead credential wrapped onto the continuation — recitalTailVeto/long-lead must catch it
const longlead = "==== DOCUMENT: X ====\nThe contractor shall maintain the required insurance and a\nSecret facility clearance during the entire performance period.";
const v2 = verifyRecitalInSource(longlead, "The contractor shall maintain the required insurance and a");
const up2 = (v2 && !recitalTailVeto(v2.continuation)) ? classifyPerformanceUpkeepRecital("The contractor shall maintain the required insurance and a", v2.continuation) : null;
ok(up2 === null, "long-lead (Secret facility clearance) on the bridged tail → ESCALATE (tail-veto/long-lead catches it)");
// (c) benign wrap that IS ordinary-course still demotes (no false escalation)
ok(on.caveatRecital >= 1, "ordinary-course insurance upkeep still demotes (recall preserved)");

clr("AUDIT_GATE_V2","AUDIT_PERFORMANCE_UPKEEP_CAVEAT","AUDIT_RECITAL_LINEWRAP_BRIDGE","AUDIT_AMBIGUOUS_SIGNAL_DEMOTION");
console.log(`\n${fail===0?"🟢 DRY — card #587 line-wrap Gauntlet PASSES":`❌ ${fail} FAIL`}`);
process.exit(fail===0?0:1);
