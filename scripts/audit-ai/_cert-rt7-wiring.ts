// $0 CERT — prove the #7 seam is REACHABLE and NOT INERT in the executor, and that the set-aside arm gets a real
// value. The first wiring read `input.setAside`, which does not exist — the arm would have been a silent placebo.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import fs from "fs";
let pass=0, fail=0;
const ok=(l:string,c:boolean)=>{ if(c){pass++;console.log(`  ✓ ${l}`);} else {fail++;console.log(`  ✗ ${l}`);} };
(async()=>{
  const src = fs.readFileSync("src/lib/audit-executor-v3.ts","utf8");
  // Accepts either spelling — the raw `=== "true"` was routed through env-flags.isEnvOn on 2026-08-04.
  ok("seam is flag-gated", /isEnvOn\(process\.env\.AUDIT_ABSENCE_RECONCILE\)|AUDIT_ABSENCE_RECONCILE === "true"/.test(src));
  ok("seam feeds the PAYLOAD (reportFindings), not a dead local",
     /reportFindings = rec\.findings/.test(src) && /buildV3Payload\(res\.decision, res\.coverage, reportFindings/.test(src));
  ok("set-aside comes from the SAM solicitation, not a non-existent input field",
     /reconcileAbsenceClaims\([^)]*solicitation\?\.typeOfSetAside/.test(src.replace(/\n/g," ")));
  ok("NOT sourced from input.setAside (the placebo the first wiring had)", !/\(input as \{ setAside/.test(src));
  ok("provenance set excludes ungrounded", /!== "\(ungrounded\)"/.test(src));
  // Order must be measured on the GUARD, never on the flag name. `indexOf("AUDIT_ABSENCE_RECONCILE")` finds the
  // COMMENT above the seam (executor:745) rather than the seam (executor:749), so both orderings below were being
  // satisfied by comment position — they held only because the comments happen to sit in the same order as the
  // code they describe. Move one without the other and the assertion would have gone on passing while lying.
  // Either spelling, but still CODE-only: `isEnvOn(process.env.X)` and `process.env.X === "true"` both appear
  // only at the seam, never in the prose above it — which is the property this locator depends on.
  const guard = (f: string) => src.search(new RegExp(`isEnvOn\\(process\\.env\\.${f}\\)|process\\.env\\.${f} === "true"`));
  const seam = guard("AUDIT_ABSENCE_RECONCILE"), np = guard("AUDIT_NONPRESENCE_HONESTY");
  ok("both seams located as CODE, not as a comment mentioning the flag", seam > 0 && np > 0);
  ok("#7 runs AFTER #2 (it corrects #2's output)", np > 0 && seam > np);
  // Carried over from _cert-rt8-wiring.ts, deleted 2026-08-04: that cert asserted the PARKED #8 seam was wired,
  // so 4 of its checks were red by design and 2 more passed off the comment describing the seam's absence.
  // _cert-rt8-parked.ts owns the #8 question now; this was its one assertion still worth keeping, re-aimed at #7.
  ok("#7 sits BEFORE buildV3Payload (otherwise it corrects nothing the customer reads)",
     seam > 0 && seam < src.indexOf("const payload = buildV3Payload"));
  console.log(`\nCERT RT7-WIRING: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
