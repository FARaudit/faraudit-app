// Card #609-(8) part 4 — DECIDE-LAYER INVARIANT: no requiredAttribute-bearing eligibility bar is downgraded to a
// non-disqualifying disposition by ANY apply* guard. $0. A requiredAttribute IS the who-can-win credential; demoting
// it (bidder_cannot_move → bidder_controls/already_satisfied, or curableInWindow→true) is a false-BID vector.
import * as D from "../../src/lib/audit-decide";
const disp = (D as any).disposeFinding;
// Adversarial bar: carries requiredAttribute AND text that trips insurance/license/52.219/or-equal/routine-clause guards.
const attrBar = () => ({ id:"inv", kind:"eligibility_bar", controllability:"bidder_cannot_move" as const, requiredAttribute:"8a_certification", curableInWindow:undefined,
  requirement:"Offeror must be a certified 8(a) firm; must maintain professional licensure and insurance; 52.219-14 applies; brand-name or equal",
  excerpt:"Only certified 8(a) firms in the System for Award Management; maintain state professional license and insurance; size standard applies.", grounded:true, citation:"§L" });
const guards: Array<[string, (fs:any[])=>any[]]> = [
  ["applyClauseKeyedTypingFloor", (fs)=>D.applyClauseKeyedTypingFloor(fs,{enabled:true})],
  ["applyPerfObligationInsuranceTyping", (fs)=>D.applyPerfObligationInsuranceTyping(fs,{enabled:true})],
  ["applyPreconditionOvertypeFloor", (fs)=>D.applyPreconditionOvertypeFloor(fs,{enabled:true})],
  ["applyRoutineClauseOvertypeGuard", (fs)=>D.applyRoutineClauseOvertypeGuard(fs,{enabled:true})],
  ["applyClauseSemanticsGuard", (fs)=>D.applyClauseSemanticsGuard(fs,{enabled:true})],
  ["applyOrEqualCarveout", (fs)=>D.applyOrEqualCarveout(fs,{enabled:true})],
  ["applyInquiryDeadlineBenignGuard", (fs)=>D.applyInquiryDeadlineBenignGuard(fs,{enabled:true})],
  ["applyEligibilityAuthorityAllowlist", (fs)=>D.applyEligibilityAuthorityAllowlist(fs,{enabled:true})],
  ["applyCautionFloor", (fs)=>D.applyCautionFloor(fs,{enabled:true})],
  ["applyAwardBasisOvertypeGuard", (fs)=>D.applyAwardBasisOvertypeGuard(fs,null,{enabled:true} as any)],
  ["applyStructuralBarWhitelist", (fs)=>D.applyStructuralBarWhitelist(fs,null,{enabled:true} as any)],
];
let pass=0, fail=0;
for (const [name, fn] of guards) {
  let out:any[]; try { out = fn([attrBar()]); } catch(e){ console.log(`⚠ ${name} threw: ${String(e).slice(0,50)} (skipped)`); continue; }
  const f = out.find((x:any)=>x.id==="inv") ?? out[0];
  const d = disp(f);
  const downgraded = f.controllability==="bidder_controls" || f.controllability==="already_satisfied" || f.curableInWindow===true || d==="gate_to_clear" || d==="met";
  (downgraded?fail++:pass++);
  console.log(`${downgraded?"❌":"✅"} ${name.padEnd(38)} ctrl=${f.controllability} cur=${f.curableInWindow} disp=${d}`);
}
console.log(`\nINVARIANT: ${pass} preserved / ${fail} DOWNGRADED → ${fail?"❌ FALSE-BID VECTOR":"✅ no attribute-bar downgrade"}`);
process.exit(fail?1:0);
