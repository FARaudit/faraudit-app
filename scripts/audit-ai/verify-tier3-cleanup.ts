// $0 gate for Tier 3 (staleness/bloat cleanup — no behavior change).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier3-cleanup.ts
//
// Scoped to the PROVEN-dead subset of the plan's Tier-3 list (the rest were found
// still-live and left alone): removed dead V1_OVERALL_BUDGET_MS, the dead executor.ts
// markStage (V3 has its own), and the inert betaHeaders param; fixed two comment lies
// (executor.ts header + executor-v3 watcher note claimed a retired V1 pipeline). Guards
// that the LIVE neighbors (FACTS_SAM_BUDGET_MS, V3 markStage) were NOT collateral-deleted.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, p), "utf8");
const EXEC = read("../../src/lib/audit-executor.ts");
const EXECV3 = read("../../src/lib/audit-executor-v3.ts");
const EXPERT = read("../../src/lib/audit-expert.ts");
const declared = (src: string, re: RegExp) => src.split("\n").some((l) => !l.trim().startsWith("//") && re.test(l));

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

// ── dead code removed ──
ok("T3 R1: V1_OVERALL_BUDGET_MS const removed", !declared(EXEC, /\bV1_OVERALL_BUDGET_MS\b/));
ok("T3 R2: dead executor.ts markStage removed (no function/async markStage decl)", !declared(EXEC, /\b(async\s+)?function markStage\b/));
ok("T3 R3: inert betaHeaders param removed from makeAnthropicCallModel", !declared(EXPERT, /betaHeaders/));

// ── live neighbors NOT collateral-deleted ──
ok("T3 R4: live FACTS_SAM_BUDGET_MS still present", declared(EXEC, /const FACTS_SAM_BUDGET_MS/));
ok("T3 R5: the V3 engine's own markStage still present", declared(EXECV3, /\bfunction markStage\b/));

// ── comment lies fixed ──
ok("T3 R6: executor.ts header no longer claims a 'V1 3-call engine → persist → V2 shadow' pipeline",
  !/V1 3-call\s*\n?\/\/\s*engine → persist complete → V2 shadow/.test(EXEC) && !/IDENTICAL pipeline: V1 3-call/.test(EXEC));
ok("T3 R7: executor-v3 watcher note no longer claims the watcher runs the 'LEGACY V1 engine … → runAudit'",
  !/watcher AUTO-AUDIT currently runs the\s*\n?\/\/\s*LEGACY V1 engine \(watcher-tick\.ts → runAudit\), NOT this agentic path/.test(EXECV3));
ok("T3 R8: the corrected header/notes name the live agentic V3 engine", /AGENTIC V3 engine|agentic V3\b/.test(EXEC) && /agentic V3/.test(EXECV3));

console.log(`\nTier3 cleanup: ${pass}/${pass + fails.length} PASS`);
console.log("→ RUNTIME /verify: worker boots clean on the new sha (railway logs) + gate suite green = no behavior change.");
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
