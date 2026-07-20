import { applyClauseKeyedTypingFloor, disposeFinding } from "../../src/lib/audit-decide";
const mk = (id:string, x:any) => ({ id, kind:"eligibility_bar", controllability:"bidder_cannot_move", grounded:true, ...x });
// Part 1: attribute-BEARING real eligibility bars (must stay bars — requiredAttribute exempts)
const attr = [
  mk("8a", { requiredAttribute:"8a_certification", requirement:"Offeror must be a certified 8(a) participant registered in the System for Award Management", excerpt:"Only 8(a) certified firms registered in SAM may submit." }),
  mk("hubzone",{ requiredAttribute:"hubzone", requirement:"Offeror must be a certified HUBZone small business", excerpt:"HUBZone set-aside; size standard applies." }),
  mk("size",{ requiredAttribute:"small_business", requirement:"Offeror must be small under the size standard NAICS 236220", excerpt:"Small business size standard $45M; large businesses ineligible." }),
];
// Part 2: attribute-LESS bars that mention the topic (must stay bars — shape regex must NOT match bare topic)
const noattr = [
  mk("8a-in-sam",{ requirement:"Offeror must be a certified 8(a) firm listed in the System for Award Management", excerpt:"Only 8(a) certified firms may submit; they appear in the System for Award Management." }),
  mk("size-std",{ requirement:"Offeror must be small under the size standard", excerpt:"Firms exceeding the size standard are ineligible." }),
  mk("hubzone-2",{ requirement:"Must be HUBZone certified", excerpt:"HUBZone set-aside." }),
];
const run = (label:string, bars:any[]) => {
  const after = applyClauseKeyedTypingFloor(bars as any, { enabled:true });
  let bad=0;
  for (const b of bars){ const a:any=after.find((x:any)=>x.id===b.id); const disp=disposeFinding(a); const isBad=a.controllability==="bidder_controls"; if(isBad)bad++; console.log(`  ${label} ${b.id.padEnd(11)} →${a.controllability} disp=${disp} ${isBad?"❌ DEMOTED":"✅ bar"}`); }
  return bad;
};
const b1 = run("[p1]", attr);
const b2 = run("[p2]", noattr);
console.log(`\nDEMOTED: part1=${b1}/3 part2=${b2}/3 → ${b1+b2===0?"✅ FALSE-BID VECTOR CLOSED":"❌ STILL OPEN"}`);
process.exit(b1+b2===0?0:1);
