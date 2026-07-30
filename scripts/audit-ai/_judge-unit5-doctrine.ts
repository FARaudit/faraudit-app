import { detectQuantityAmbiguities, applyQuantityAmbiguityFidelity } from "../../src/lib/audit-decide";
let pass=0, fail=0; const ok=(c:boolean,m:string)=>{c?pass++:fail++;console.log(c?"  PASS":"  FAIL",m);};

// Doctrine: NO bar-vocab blocklist. Fire on a NOVEL unit never in any bar vocab (positive-shape allowlist).
ok(detectQuantityAmbiguities("Is the delivery 12 pallets or 30 pallets?").length===0, "novel unit 'pallets' NOT in QA_UNIT_RE -> silent (allowlist, not blocklist)");
ok(detectQuantityAmbiguities("Is the order 12 copies or 30 copies?").length===1, "enumerated unit 'copies' fires (positive shape)");

// flag-OFF byte-identical on a source that WOULD fire
const src="Is the total requirement 520 hours or 1,040 hours?";
const fs=[{id:"a",requirement:"x",kind:"other",controllability:"bidder_controls",grounded:true} as any];
const off=applyQuantityAmbiguityFidelity(fs,src,{enabled:false});
ok(off===fs, "flag-OFF returns SAME ref (byte-identical)");
const offNoOpts=applyQuantityAmbiguityFidelity(fs,src);
ok(offNoOpts===fs, "no opts (default) returns SAME ref (default-OFF)");

// ReDoS sanity — pathological inputs, must return quickly
const big="Is the total requirement "+"5".repeat(50000)+" hours or 1,040 hours?";
const t0=Date.now(); detectQuantityAmbiguities(big); const dt=Date.now()-t0;
ok(dt<200, `ReDoS: 50k-digit input in ${dt}ms (<200)`);
const spaces="Is the "+" ".repeat(50000)+"total 520 hours or 1,040 hours?";
const t1=Date.now(); detectQuantityAmbiguities(spaces); const dt1=Date.now()-t1;
ok(dt1<200, `ReDoS: 50k-space input in ${dt1}ms (<200)`);

console.log(`\n=== JUDGE doctrine: ${pass} pass / ${fail} fail ===`);
process.exit(fail?1:0);
