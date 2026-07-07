// $0 gate for T2-2 (phantom safety nets removed).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier2-phantoms.ts
//
// Deleted three retired-engine phantoms (advertised-but-absent guards):
//   • assertMinimumAuditShape — asserted the retired V1/V2 overview/compliance/risks
//     shape the live V3 engine never produces; zero real callers.
//   • ATTACHMENT_SET_MAX — a degrade ceiling const with zero callers.
//   • AuditPersistError — caught in route.ts but NEVER thrown (dead catch removed).
//   • DegradedRunError — orphaned (its only thrower was assertMinimumAuditShape).
// The live anti-false-COMPLETE net is V3's honest_fail + documents_complete + Tier-0.
// This gate proves the symbols are gone AND that worker failure-routing still works.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { decideRunFailureMode, TransientInputError } from "../../agents/audit-worker/worker";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, p), "utf8");
const EXEC = read("../../src/lib/audit-executor.ts");
const ROUTE = read("../../src/app/api/audit/route.ts");
const WORKER = read("../../agents/audit-worker/worker.ts");

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const eq = (label: string, got: unknown, exp: unknown) => { JSON.stringify(got) === JSON.stringify(exp) ? pass++ : fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };
// a "declaration" = the symbol used as code, not inside a // comment line
const declared = (src: string, sym: string) => src.split("\n").some((l) => !l.trim().startsWith("//") && new RegExp(`\\b${sym}\\b`).test(l));

// ── the phantoms are GONE as code (comments referencing the removal are fine) ──
ok("T2-2 R1: assertMinimumAuditShape no longer declared/exported", !declared(EXEC, "assertMinimumAuditShape"));
ok("T2-2 R2: ATTACHMENT_SET_MAX removed", !declared(EXEC, "ATTACHMENT_SET_MAX"));
ok("T2-2 R3: AuditPersistError class removed from executor", !declared(EXEC, "class AuditPersistError"));
ok("T2-2 R4: DegradedRunError class removed from executor", !declared(EXEC, "class DegradedRunError"));
ok("T2-2 R5: route.ts no longer imports/catches AuditPersistError", !declared(ROUTE, "AuditPersistError"));
ok("T2-2 R6: worker.ts no longer imports/references DegradedRunError", !declared(WORKER, "DegradedRunError"));

// ── worker failure routing STILL works (drive the real exported fn) ──
eq("T2-2 R7: TransientInputError still routes → release (T1-1 path intact)", decideRunFailureMode(new TransientInputError("blip")), "release");
eq("T2-2 R8: a generic error still routes → fail", decideRunFailureMode(new Error("missing audit_id")), "fail");
eq("T2-2 R9: a SAM 404 still routes → fail", decideRunFailureMode(new Error("SAM fetch failed: 404")), "fail");

console.log(`\nTier2 phantoms (T2-2): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
