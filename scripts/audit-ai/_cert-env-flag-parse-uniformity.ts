// CERT — EVERY env flag parses through the single source (src/lib/env-flags.ts).
//
// WHY THIS EXISTS. env-flags.ts carried the comment "Single source so every flag parses identically
// (no per-flag drift)" while 201 read sites compared process.env directly against "true"/"false" and
// never called it. The comment was not a description, it was an aspiration — and nothing measured the
// gap. Live impact was zero only by luck: of 130 AUDIT_* vars on audit-worker exactly one was not
// lowercase (AUDIT_AGENTIC_PRIMARY=True) and nothing read it.
//
// THE HAZARD IS TWO-DIRECTIONAL, which is why the detector covers both literals:
//   `x === "true"`  — a dashboard-set "True"/"1"/"on" reads OFF. A feature you armed never runs.
//   `x !== "false"` — a dashboard-set "False"/"0"/"off" reads ON.  A feature you disarmed keeps running.
// Testing only the first would have left the second unguarded, and the second is the worse failure:
// it is the one where a kill-switch does not kill.
//
// POPULATION is a filesystem walk of src/ and agents/, NOT `git ls-files` — an untracked new file is
// precisely the regression vector this gate exists to catch, and ls-files cannot see it. Control C
// plants a real file to prove the walk reaches one.
//
// The specimens below are literal on purpose (a specimen you cannot read is a specimen you cannot
// check). They are safe because the population is src/ + agents/ and this file is in scripts/. Widening
// the population to scripts/ would require building them by concatenation instead.
export {};
import { readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const ROOTS = ["src", "agents"];

// Any process.env-derived value compared against a truthy/falsy token, in either operand order, with
// either equality operator, at any case. `isEnvOn(process.env.X)` has no comparison and is not matched.
const ENV_EXPR = String.raw`(?:process\.env\.[A-Za-z_][A-Za-z_0-9]*|process\.env\[[^\]\n]+\]|(?<![.\w])env\.[A-Z_][A-Z_0-9]*)`;
const TOKEN = String.raw`["'](?:true|false|1|0|yes|no|on|off)["']`;
const DETECT = new RegExp(
  String.raw`(?:${ENV_EXPR}\s*[!=]==?\s*${TOKEN}|${TOKEN}\s*[!=]==?\s*${ENV_EXPR})`,
  "i",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "dist" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Scan the real population. Returns "file:line: source" for every raw comparison found. */
function scan(): string[] {
  const hits: string[] = [];
  for (const root of ROOTS) {
    for (const f of walk(join(ROOT, root))) {
      const lines = execFileSync("cat", [f], { encoding: "utf8" }).split("\n");
      lines.forEach((ln, i) => {
        if (DETECT.test(ln)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${ln.trim()}`);
      });
    }
  }
  return hits;
}

let controlFailed = 0;
const ctl = (ok: boolean, label: string) => {
  if (!ok) controlFailed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
};

// ── CONTROL A · KNOWN-POSITIVES. Each shape the defect actually took, plus the ones a paraphrase
//    would take. A detector that misses any of these cannot certify the population is clean. ──
console.log("CONTROL A — known-positive shapes (each MUST be detected):");
const POSITIVE: Array<[string, string]> = [
  ["static key, === true",      `if (process.env.EXAMPLE_FLAG === "true") run();`],
  ["static key, !== true",      `if (process.env.EXAMPLE_FLAG !== "true") return null;`],
  ["default-ON, !== false",     `const on = process.env.EXAMPLE_FLAG !== "false";`],
  ["=== false",                 `const off = process.env.EXAMPLE_FLAG === "false";`],
  // The shape a literal `env.AUDIT_*` grep missed entirely — found only by hunting dynamic indexing.
  ["DYNAMIC key",               `return process.env[EXCERPT_HEAD_REGROUND_FLAG] === "true";`],
  ["ProcessEnv param alias",    `const enabled = env.AUDIT_AWARDBASIS_OVERTYPE_GUARD !== "false";`],
  ["mis-cased literal",         `if (process.env.EXAMPLE_FLAG === "True") run();`],
  ["loose equality",            `if (process.env.EXAMPLE_FLAG == "true") run();`],
  ["yoda order",                `if ("true" === process.env.EXAMPLE_FLAG) run();`],
  ["single quotes",             `if (process.env.EXAMPLE_FLAG === 'true') run();`],
  ["numeric truthy token",      `if (process.env.EXAMPLE_FLAG === "1") run();`],
  ["off token",                 `if (process.env.EXAMPLE_FLAG === "off") skip();`],
];
for (const [name, specimen] of POSITIVE) ctl(DETECT.test(specimen), `${name.padEnd(24)} ${specimen}`);

// ── CONTROL B · KNOWN-NEGATIVES. A detector that flags these is unusable — it would be narrowed
//    until it passed, and a detector narrowed to pass is a placebo. ──
console.log("\nCONTROL B — known-negative shapes (each MUST NOT be detected):");
const NEGATIVE: Array<[string, string]> = [
  ["routed through isEnvOn",    `if (isEnvOn(process.env.EXAMPLE_FLAG)) run();`],
  ["routed through isEnvOff",   `const on = !isEnvOff(process.env.EXAMPLE_FLAG);`],
  ["NODE_ENV (not a flag)",     `if (process.env.NODE_ENV !== "production") warn();`],
  ["presence check",            `if (process.env.DRY_RUN === undefined) run();`],
  ["non-env identifier",        `if (row.verified === "true") keep();`],
  ["env assignment in a test",  `process.env.EXAMPLE_FLAG = "true";`],
];
for (const [name, specimen] of NEGATIVE) ctl(!DETECT.test(specimen), `${name.padEnd(24)} ${specimen}`);

// ── CONTROL C · FILE PLANT. Controls A/B only prove the REGEX. This proves the POPULATION: a file
//    that exists on disk but is untracked must still be scanned. Without this leg the gate could walk
//    an empty set and print all-clear forever — an enforcement loop that iterates zero times. ──
console.log("\nCONTROL C — planted file (proves the walk reaches a NEW, untracked file):");
const PLANT = join(ROOT, "src", "lib", "__parse-uniformity-plant.ts");
let plantSeen = false, plantHit = "";
try {
  writeFileSync(PLANT, `export const planted = process.env.EXAMPLE_PLANTED_FLAG === "true";\n`);
  const withPlant = scan();
  plantHit = withPlant.find((h) => h.includes("__parse-uniformity-plant")) ?? "";
  plantSeen = Boolean(plantHit);
} finally {
  rmSync(PLANT, { force: true });
}
ctl(plantSeen, plantSeen ? `planted violation was found → ${plantHit}` : "PLANTED VIOLATION NOT FOUND — the scan does not reach new files");
ctl(!scan().some((h) => h.includes("__parse-uniformity-plant")), "plant removed cleanly after the run");

// ── THE REACH CHECK. Routing a flag through the single source is only safe where the single source can
//    actually be REACHED. Every agents/<svc> with its own package.json is a separate deployable: qa-ai,
//    sam-ingest, prospector-ai and email-ai-v3 have no `@/` alias, so `import ... from "@/lib/env-flags"`
//    type-checks from the repo ROOT (whose tsconfig supplies the alias and whose `include` covers agents/)
//    and then fails in the service — at boot for the tsx ones, at BUILD for email-ai-v3.
//    The first pass of this very change added that import to all four. Root `tsc --noEmit` passed.
//    Those packages carry a documented local copy instead; this check keeps the import from coming back. ──
console.log("\nREACH — no standalone package may import the single source it cannot resolve:");
const badImports: string[] = [];
for (const svc of readdirSync(join(ROOT, "agents"))) {
  const dir = join(ROOT, "agents", svc);
  if (!statSync(dir).isDirectory()) continue;
  let hasAlias = false;
  try { hasAlias = /"@\/\*"/.test(execFileSync("cat", [join(dir, "tsconfig.json")], { encoding: "utf8" })); } catch { hasAlias = false; }
  if (hasAlias) continue;
  for (const f of walk(dir)) {
    execFileSync("cat", [f], { encoding: "utf8" }).split("\n").forEach((ln, i) => {
      if (/^\s*import\s.*from\s+["']@\/lib\/env-flags["']/.test(ln)) badImports.push(`${relative(ROOT, f)}:${i + 1}`);
    });
  }
}
if (badImports.length) {
  console.log(`\n❌ ${badImports.length} unreachable import(s) — these type-check from the repo root and fail in the service:\n`);
  for (const b of badImports) console.log(`  ${b}`);
  console.log(`\nFIX: copy the parser into the package with a comment naming src/lib/env-flags.ts as canonical.`);
  process.exit(1);
}
console.log(`  ✓ no aliased env-flags import in a package that cannot resolve it`);

// ── A failed control DISCARDS the run. Reporting the population clean on a broken instrument is the
//    exact failure this file is built to prevent, so it must never fall through to the verdict. ──
if (controlFailed) {
  console.log(`\n❌ ${controlFailed} CONTROL(S) FAILED — run DISCARDED. The scan result below is not trustworthy and is not reported.`);
  process.exit(1);
}

// ── THE ACTUAL CHECK ──
const hits = scan();
console.log(`\nSCAN — ${ROOTS.map((r) => `${r}/`).join(" + ")} · all .ts/.tsx`);
if (hits.length) {
  console.log(`\n❌ ${hits.length} raw env comparison(s) bypass src/lib/env-flags.ts:\n`);
  for (const h of hits) console.log(`  ${h}`);
  console.log(`\nFIX: import { isEnvOn, isEnvOff } from "@/lib/env-flags" (or "./env-flags" inside src/lib/).`);
  console.log(`  x === "true"  → isEnvOn(x)        x !== "true"  → !isEnvOn(x)`);
  console.log(`  x === "false" → isEnvOff(x)       x !== "false" → !isEnvOff(x)   ← default-ON: unset must stay ON`);
  process.exit(1);
}
console.log(`\n✅ CLEAN — every env flag in src/ and agents/ parses through isEnvOn/isEnvOff.`);
console.log(`   Controls: ${POSITIVE.length} positive shapes detected · ${NEGATIVE.length} negatives ignored · planted file caught by the walk.`);
process.exit(0);
