import * as fs from "fs";
import { applyClauseKeyedTypingFloor, deriveShadowVerdict } from "../../src/lib/audit-decide";
process.env.AUDIT_POSITIVE_VERDICT_POLE = "true";
const cab = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const inp0 = cab.result.inputs;
const bar1 = inp0.findings.find((f:any)=>f.id==="panel:source_selection_evaluator:G6");
const others = inp0.findings.filter((f:any)=>f.id!==bar1.id);
const EX = bar1.excerpt; // shared verbatim excerpt (contains "proof of insurance ... at time of award")
const mkBar = (id:string, requirement:string, extra:any={}) => ({ id, kind:"eligibility_bar", controllability:"bidder_cannot_move", requirement, excerpt:EX, citation:"§L, Insurance/Bonding", grounded:true, ...extra });
const run = (label:string, constituents:any[]) => {
  const inp = { ...inp0, findings: applyClauseKeyedTypingFloor([...others, ...constituents], { enabled:true }) };
  const sv = deriveShadowVerdict(inp, { naics:"561320" });
  // report each constituent's post-floor type
  const typed = applyClauseKeyedTypingFloor(constituents, { enabled:true });
  console.log(`\n── ${label} → shadow=${sv.verdict}`);
  for (const t of typed) console.log(`    ${t.id.padEnd(16)} ${t.controllability}/cur=${t.curableInWindow}${t.controllability!=="bidder_cannot_move"?"  ✅typed":""}`);
  console.log(`    reason: ${sv.reason.slice(0,80)}`);
};
// Variant B: SPLIT, shared excerpt, mis-typed bidder_cannot_move (minimal split)
run("B split(shared-excerpt, mis-typed)", [
  mkBar("c-licensing","Maintain licensing requirements"),
  mkBar("c-certification","Maintain professional certification"),
  mkBar("c-accreditation","Maintain accreditation"),
  mkBar("c-insurance","Maintain insurance $1M/$3M; proof of insurance at time of award"),
]);
// Variant C: SPLIT, CLEAN per-constituent excerpt (possession isolated to insurance)
const CLEAN = "Maintain licensing requirements/certification/accreditation during the entire performance period";
run("C split(clean-excerpt, mis-typed)", [
  mkBar("c-licensing","Maintain licensing requirements",{excerpt:CLEAN}),
  mkBar("c-certification","Maintain professional certification",{excerpt:CLEAN}),
  mkBar("c-accreditation","Maintain accreditation",{excerpt:CLEAN}),
  mkBar("c-insurance","Maintain insurance $1M/$3M; proof of insurance at time of award",{excerpt:EX}),
]);
// Variant D: as 40fd02ce's LENS emitted — bidder_controls + curable (clean emission)
run("D clean-emission(lens-typed bidder_controls+curable, as 40fd)", [
  mkBar("c-licensing","Maintain licensing requirements",{controllability:"bidder_controls",curableInWindow:true,requiredAttribute:"business_license_maintenance"}),
  mkBar("c-certification","Maintain professional certification",{controllability:"bidder_controls",curableInWindow:true,requiredAttribute:"professional_certification"}),
  mkBar("c-accreditation","Maintain accreditation",{controllability:"bidder_controls",curableInWindow:true,requiredAttribute:"accreditation"}),
  mkBar("c-insurance","Maintain insurance $1M/$3M; proof at award",{controllability:"bidder_controls",curableInWindow:true,requiredAttribute:"insurance_maintenance"}),
]);
