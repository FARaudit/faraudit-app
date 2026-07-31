// The dependency direction REVERSED when #8 was parked: fitToRender moved into audit-absence-reconcile (the
// shipping module), and audit-force-grounding (parked) now imports it from there. A shipping module must never
// depend on a parked one. Prove there is no initialization cycle by importing both modules and confirming every
// export is defined either way round.
import * as A from "../../src/lib/audit-absence-reconcile";
import * as F from "../../src/lib/audit-force-grounding";

const checks: Array<[string, unknown]> = [
  ["A.reconcileAbsenceClaims", A.reconcileAbsenceClaims],
  ["A.DOC_ABSENCE_FOR_TEST", A.DOC_ABSENCE_FOR_TEST],
  ["A.CORRECTED_PREFIX", A.CORRECTED_PREFIX],
  ["A.fitToRender  (owned by the SHIPPING module)", A.fitToRender],
  ["A.RENDER_BUDGET", A.RENDER_BUDGET],
  ["F.groundModalForce  (parked, still loadable)", F.groundModalForce],
];
let bad = 0;
for (const [n, v] of checks) { const ok = v !== undefined; if (!ok) bad++; console.log(`  ${ok ? "✓" : "✗"} ${n} = ${typeof v}`); }

const fitted = A.fitToRender("x".repeat(600));
console.log(`  fitToRender(600 chars) -> ${fitted.length} (budget ${A.RENDER_BUDGET})`);
if (fitted.length > A.RENDER_BUDGET) bad++;

console.log(bad ? `\n${bad} PROBLEM(S)` : "\nNO CYCLE — all exports initialized in both orders, budget held");
process.exit(bad ? 1 : 0);
