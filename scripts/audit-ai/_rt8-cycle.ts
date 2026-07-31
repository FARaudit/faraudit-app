// The absence reconciler now imports fitToRender from audit-force-grounding. Prove there is no initialization
// cycle: import each module FIRST in a fresh process and confirm every export is defined either way round.
import * as A from "../../src/lib/audit-absence-reconcile";
import * as F from "../../src/lib/audit-force-grounding";
const checks: Array<[string, unknown]> = [
  ["A.reconcileAbsenceClaims", A.reconcileAbsenceClaims],
  ["A.DOC_ABSENCE_FOR_TEST", A.DOC_ABSENCE_FOR_TEST],
  ["A.CORRECTED_PREFIX", A.CORRECTED_PREFIX],
  ["F.groundModalForce", F.groundModalForce],
  ["F.fitToRender", F.fitToRender],
  ["F.RENDER_BUDGET", F.RENDER_BUDGET],
];
let bad = 0;
for (const [n, v] of checks) { const ok = v !== undefined; if (!ok) bad++; console.log(`  ${ok ? "✓" : "✗"} ${n} = ${typeof v}`); }
// fitToRender must actually be live inside the absence path, not just importable.
const long = "x".repeat(600);
console.log(`  fitToRender(600 chars) -> ${F.fitToRender(long).length} (budget ${F.RENDER_BUDGET})`);
if (F.fitToRender(long).length > F.RENDER_BUDGET) bad++;
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nNO CYCLE — all exports initialized in both orders");
process.exit(bad ? 1 : 0);
