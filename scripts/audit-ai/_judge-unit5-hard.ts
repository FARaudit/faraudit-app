import { detectQuantityAmbiguities } from "../../src/lib/audit-decide";
const fires=(s:string)=>detectQuantityAmbiguities(s).length>0;
// Try HARD for a realistic benign over-fire: natural elided-'that' content clauses a real KO/vendor would write.
const probes=[
  "Is it your understanding the base is 520 hours or 1,040 hours?",     // elided that, 'is' inflected -> caught?
  "Is the assumption we bill 520 hours or 1,040 hours correct?",        // trailing 'correct' -> not terminal
  "Can you confirm the estimate is 520 hours or 1,040 hours?",          // 'confirm' + 'is'
  "Is your read the PWS requires 520 hours or 1,040 hours?",            // 'requires' inflected
  "Is the belief offerors staff 520 positions or 1,040 positions?",     // elided that, 'staff' base, 'positions' 2nd-subj? no
  "Is the point the schedule shows 520 hours or 1,040 hours?",          // 'shows' inflected
  "Are we to assume 520 hours or 1,040 hours for pricing?",             // 'to assume' + trailing 'for pricing'
  "Is the question whether we bill 520 hours or 1,040 hours?",          // 'whether' complementizer
  "Is management aware crews log 520 hours or 1,040 hours?",            // 'crews'(-s subj) 'log' base
  "Is it the case staff work 520 hours or 1,040 hours?",               // 'it the case' extraposition
];
let over=0;
for (const p of probes){ const f=fires(p); if(f) over++; console.log(f?"  FIRES(over?):":"  silent:", JSON.stringify(p)); }
console.log(`\n${over} fired`);
