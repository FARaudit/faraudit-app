// $0 pre-merge gate for T2-1 (worker boot-log deploy-honesty).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier2-bootlog.ts
//
// The boot self-verification log printed "(V1 extraction + V2 judgment)" — a lie:
// the live engine is agentic V3 (sole engine; V1/V2 deleted). This gate is the
// deterministic pre-check; the REAL /verify is the live Railway boot log after deploy
// (railway logs --service audit-worker → the ENGINE MODEL line must show the V3 truth).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(resolve(HERE, "../../agents/audit-worker/worker.ts"), "utf8");

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

// Isolate the boot ENGINE MODEL console.log line.
const bootLine = WORKER.split("\n").find((l) => l.includes("ENGINE MODEL =") && l.includes("console.log")) ?? "";

ok("T2-1 R1: the boot ENGINE MODEL log line exists", bootLine.length > 0);
ok("T2-1 R2: it NO LONGER prints the retired '(V1 extraction + V2 judgment)' lie", !bootLine.includes("V1 extraction + V2 judgment"));
ok("T2-1 R3: it now prints the live agentic-V3 truth", /agentic V3 — sole engine, V1\/V2 deleted/.test(bootLine));
ok("T2-1 R4: no other line in the worker still prints the old V1/V2 tag", !/\(V1 extraction \+ V2 judgment\)/.test(WORKER));

console.log(`\nTier2 boot-log (T2-1) pre-merge gate: ${pass}/${pass + fails.length} PASS`);
console.log("→ RUNTIME /verify (post-deploy): railway logs --service audit-worker | grep 'ENGINE MODEL'  → must show (agentic V3 — sole engine, V1/V2 deleted)");
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
