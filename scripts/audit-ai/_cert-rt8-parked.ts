// CERT — REPORT-TRUTH #8 is PARKED, and the park is REAL. A flag set to false is one edit from live; a deleted seam
// is not. This asserts the seam is gone from the executor rather than merely gated, so setting AUDIT_FORCE_GROUNDING
// cannot change engine behaviour. Static on the executor + EXECUTED on the module.
import fs from "fs";
import { groundModalForce } from "../../src/lib/audit-force-grounding";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

const ex = fs.readFileSync("src/lib/audit-executor-v3.ts", "utf8");
ok("executor no longer reads AUDIT_FORCE_GROUNDING", !/process\.env\.AUDIT_FORCE_GROUNDING/.test(ex));
ok("executor no longer calls groundModalForce", !/groundModalForce\s*\(/.test(ex));
ok("executor no longer imports the parked module", !/from "\.\/audit-force-grounding"/.test(ex));
ok("the park is documented at the seam", /PARKED 2026-07-31/.test(ex));

const mod = fs.readFileSync("src/lib/audit-force-grounding.ts", "utf8");
ok("module carries the PARKED banner", /PARKED 2026-07-31/.test(mod));
ok("module does not import the executor (no revival path)", !/audit-executor-v3/.test(mod));

// The shipping module must not depend on a parked one.
const abs = fs.readFileSync("src/lib/audit-absence-reconcile.ts", "utf8");
ok("shipping #7 does NOT import the parked #8", !/from "\.\/audit-force-grounding"/.test(abs));
ok("#7 owns fitToRender itself", /export function fitToRender/.test(abs));

// Executed: setting the flag changes nothing, because nothing reads it.
process.env.AUDIT_FORCE_GROUNDING = "true";
const findings = [{ id: "a", requirement: "Mandatory site visit.", excerpt: "Site visit will be held 13 Aug." }];
const direct = groundModalForce(findings, "Site visit will be held 13 Aug.");
ok("the module itself still works when called directly (kept as a record, not deleted)", direct.corrected.length === 1);
console.log(`\nCERT RT8-PARKED: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
