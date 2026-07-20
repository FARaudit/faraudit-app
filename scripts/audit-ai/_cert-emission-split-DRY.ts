// Card #609 emission-split DRY — downstream decide-layer proofs ($0, no lens/model calls).
import * as fs from "fs";
import { applyClauseKeyedTypingFloor, deriveShadowVerdict } from "../../src/lib/audit-decide";
process.env.AUDIT_POSITIVE_VERDICT_POLE = "true";
const cab = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const inp0 = cab.result.inputs;
const others = inp0.findings.filter((f:any)=>f.id!=="panel:source_selection_evaluator:G6"); // drop the bundle
const CLEAN = "Maintain licensing requirements/certification/accreditation during the entire performance period";
const mk = (id:string, requirement:string, x:any={}) => ({ id, kind:"eligibility_bar", controllability:"bidder_cannot_move", requirement, excerpt:CLEAN, citation:"§L", grounded:true, ...x });
const bc = (id:string, requirement:string) => mk(id, requirement, { controllability:"bidder_controls", curableInWindow:true, requiredAttribute:"x" }); // lens-typed clean
const shadow = (constituents:any[]) => deriveShadowVerdict({ ...inp0, findings: applyClauseKeyedTypingFloor([...others, ...constituents], { enabled:true }) }, { naics:"561320" });
let pass=0, fail=0; const ok=(n:string,c:boolean,x="")=>{(c?pass++:fail++);console.log(`${c?"✅":"❌"} ${n}${x?" — "+x:""}`);};

// (ii) CLEAN split (as the gold-set lens emits) → BWC
const cleanSplit = [ bc("c-lic","Maintain licensing requirements"), bc("c-cert","Maintain professional certification"),
  bc("c-accr","Maintain accreditation"), bc("c-ins","Maintain insurance $1M/$3M; proof at award") ];
ok("(ii) clean split (lens-typed) → BWC", shadow(cleanSplit).verdict==="BID_WITH_CAUTION", shadow(cleanSplit).verdict);

// (2) ANTI-DILUTION red-team: a SCARCE constituent inside the split must STILL escalate (never BWC)
for (const [name, req] of [["clearance","Personnel must hold an active facility security clearance"],
  ["CMMC","Contractor must hold CMMC Level 2 certification at time of award"],
  ["bond","Contractor must furnish a performance bond / surety"],
  ["ITAR","Contractor must hold ITAR export authorization"]]) {
  const withScarce = [ bc("c-lic","Maintain licensing"), bc("c-ins","Maintain insurance; proof at award"),
    mk("c-scarce", req) ]; // scarce emitted as its own bidder_cannot_move gate
  const v = shadow(withScarce).verdict;
  ok(`(2a) scarce constituent [${name}] STILL escalates (never BWC)`, v!=="BID"&&v!=="BID_WITH_CAUTION", v);
}

// (2b) possession frame attaches to EVERY constituent: shared excerpt WITH possession ⇒ none type ⇒ NHR (no dilution)
const EXP = cab.result.findings.find((f:any)=>f.id==="panel:source_selection_evaluator:G6").excerpt; // has "proof ... at time of award"
const possAll = ["c-lic","c-cert","c-accr","c-ins"].map((id,i)=>mk(id,`obligation ${i}`,{excerpt:EXP}));
ok("(2b) possession in shared excerpt ⇒ every constituent held ⇒ NHR", shadow(possAll).verdict==="NEEDS_HUMAN_REVIEW", shadow(possAll).verdict);

// determinism
ok("determinism: clean split stable", JSON.stringify(shadow(cleanSplit))===JSON.stringify(shadow(cleanSplit)));
console.log(`\n=== CERT: ${pass} pass / ${fail} fail ===`);
process.exit(fail?1:0);
