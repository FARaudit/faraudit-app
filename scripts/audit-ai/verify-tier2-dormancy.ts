// $0 gate for T2-3 (judgment-first dormancy honesty).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier2-dormancy.ts
//
// The judgment-first path is a PARKED prototype: AUDIT_JUDGMENT_FIRST gates nothing
// on the live customer audit path. T2-3 makes that explicit in the code so it can't
// be mistaken for a live safety net. This gate proves the honesty claim is TRUE —
// judgmentFirstEnabled has ZERO callers in src/+agents/, and runJudgmentFirstAudit
// is invoked only by offline harnesses — so if anyone wires it later, this FAILS and
// forces them to update the dormancy banner. (Runtime /verify = SKIP: comment-only,
// the flag is inert so there is no runtime behavior to observe.)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const JF = readFileSync(join(ROOT, "src/lib/audit-judgment-first.ts"), "utf8");

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

// Walk a dir tree collecting .ts files (excludes the module's own file + tests-of-the-module).
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...tsFiles(p));
    else if (e.endsWith(".ts")) out.push(p);
  }
  return out;
}
const liveFiles = [...tsFiles(join(ROOT, "src")), ...tsFiles(join(ROOT, "agents"))]
  .filter((p) => !p.endsWith("audit-judgment-first.ts") && !p.endsWith("audit-package.ts")); // helper's own file + the harness entry
const callsFlagHelper = liveFiles.filter((p) => /\bjudgmentFirstEnabled\s*\(/.test(readFileSync(p, "utf8")));

// ── the honesty claim is TRUE ──
ok("T2-3 R1: judgmentFirstEnabled() has ZERO callers in the live path (flag is inert in prod)", callsFlagHelper.length === 0);
if (callsFlagHelper.length) fails.push("  (wired in: " + callsFlagHelper.map((p) => p.replace(ROOT + "/", "")).join(", ") + " — update the DORMANT banner!)");

// runJudgmentFirstAudit must not be called from the deployed surfaces (src/app, agents/)
const deployed = liveFiles.filter((p) => /src\/app\/|agents\//.test(p) && /runJudgmentFirstAudit\s*\(/.test(readFileSync(p, "utf8")));
ok("T2-3 R2: runJudgmentFirstAudit is NOT invoked from any deployed surface (src/app or agents/)", deployed.length === 0);

// ── the banner now says so, prominently ──
ok("T2-3 R3: the module carries the PARKED/DORMANT — NOT A LIVE SAFETY NET banner", /PARKED \/ DORMANT PROTOTYPE — NOT A LIVE SAFETY NET/.test(JF));
ok("T2-3 R4: the banner states the flag is INERT in production", /flag is INERT in production/.test(JF));
ok("T2-3 R5: judgmentFirstEnabled carries a DORMANT note", /DORMANT \(T2-3\): this helper has ZERO callers/.test(JF));

console.log(`\nTier2 dormancy (T2-3): ${pass}/${pass + fails.length} PASS  ·  live-path callers of the flag helper = ${callsFlagHelper.length}`);
console.log("→ RUNTIME /verify: SKIP — comment-only change; the flag gates nothing live, so there is no runtime behavior to observe.");
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
