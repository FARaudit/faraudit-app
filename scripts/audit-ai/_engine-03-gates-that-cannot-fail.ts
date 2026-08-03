// $0. ENGINE AUDIT, pass 3 — WHICH GATES CANNOT GO RED?
//
// This class has cost this codebase twice in one day. `fort-knox-scan.sh` printed "REAL SECRET FOUND" and exited 0:
// no `exit` statement anywhere, and the one flag it set was never read. And pass 1's own regex sweep reported ZERO
// duplicated recognizers across 112 modules from a pattern carrying a typo — a clean it was structurally incapable of
// not producing. Both looked green for as long as anyone cared to look.
//
// A gate that cannot fail is worse than no gate: no gate leaves you looking, a placebo gate stops you looking.
//
// FOUR SIGNATURES, each an observed instance rather than a theory:
//
//   (1) SET-BUT-NEVER-READ — a `let failed = false` … `failed = true` where nothing ever reads `failed`. Fort Knox.
//   (2) FAIL-OPEN CATCH — a `catch` that returns the PASSING value, so any exception silently becomes a pass. The
//       engine's own doctrine (Rule 61) says a failed dependency must produce a visible failure, never a plausible
//       answer, and a catch returning `true`/`[]`/`"ok"` is that rule inverted.
//   (3) DISCARDED VERDICT — a call to something named like a check (validate*/assert*/verify*/check*/ensure*) whose
//       boolean result is thrown away on a bare expression statement.
//   (4) CONSTANT CONDITION — `if (true)`, `if (1)`, `if (!false)`, and comparisons of a literal to itself.
//
// Every recognizer is SELF-TESTED against a planted positive before the sweep reports anything, and the run is
// DISCARDED if any cannot fire. That guard is not ceremony here — it is the entire subject of the pass.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/lib", "src/app", "scripts/audit-ai", "agents"];
const walk = (d: string, out: string[] = []): string[] => {
  let ents: string[]; try { ents = readdirSync(d); } catch { return out; }
  for (const e of ents) {
    if (e === "node_modules" || e === ".next" || e === "run-records" || e === ".run-record-cache" || e === "gold-sets") continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
};
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

// ── the four recognizers, each a pure function of source text so the self-test can drive them ────────────────────
function setNeverRead(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*boolean\s*)?=\s*(?:false|true)\s*;/g)) {
    const name = m[1];
    if (!/fail|err|bad|dirty|found|leak|violat|broke|red|invalid/i.test(name)) continue;
    const assigns = [...src.matchAll(new RegExp(`\\b${name}\\s*=\\s*(?:true|false)`, "g"))].length;
    if (assigns < 2) continue;                       // never re-assigned ⇒ not a latch at all
    // a READ is any other mention: in a condition, returned, interpolated, passed as an argument
    const mentions = [...src.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
    // EVERY mention is an assignment ⇒ nothing ever reads it. The `+ 1` this used to carry was wrong and the
    // NEGATIVE control caught it: the declaration `let failed = false` is itself both a mention AND an assignment,
    // so a latch that IS read scores mentions = assigns + 1 and was being flagged. A recognizer tested only against
    // positives would have shipped that — which is the whole thesis of this pass.
    if (mentions <= assigns) out.push(name);
  }
  return out;
}
function failOpenCatch(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([^{}]{0,160})\}/g)) {
    const body = m[1].trim();
    if (/^return\s+(true|\[\]|""|'')\s*;?$/.test(body)) out.push(body.slice(0, 70));
  }
  return out;
}
function discardedVerdict(src: string): string[] {
  const out: string[] = [];
  // `[^;\n]` not `[^;]`: the character class must exclude NEWLINES. With them allowed the match ran past the end of
  // its own line and flagged `checkFailedAuth(sb),` sitting inside a Promise.all array — a call whose result IS used.
  // Second false-positive source, fixed here too: a void-returning validator that THROWS (the correct assertion
  // shape, e.g. validateUniversalDefectProducerConfig) has nothing to discard, so `: void` declarations are excluded.
  const voidValidators = new Set(
    [...src.matchAll(/function\s+((?:validate|assert|verify|check|ensure)[A-Z]\w*)\s*\([^)]*\)\s*:\s*void\b/g)].map((m) => m[1])
  );
  for (const m of src.matchAll(/^[ \t]*((?:await\s+)?(?:validate|assert|verify|check|ensure)[A-Z]\w*)\s*\([^;\n]{0,120}\)\s*;[ \t]*$/gm)) {
    const name = m[1].replace(/^await\s+/, "");
    if (!voidValidators.has(name)) out.push(m[1]);
  }
  return out;
}
function constantCondition(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bif\s*\(\s*(true|1|!false|!0)\s*\)/g)) out.push(m[1]);
  return out;
}

// ── SELF-TEST — a zero from a recognizer that cannot fire is not a clean ──────────────────────────────────────────
const P1 = `let failed = false;\nif (x) { failed = true; }\nconsole.log("done");\n`;          // Fort Knox's exact shape
const P1neg = `let failed = false;\nif (x) { failed = true; }\nif (failed) process.exit(1);\n`;
const P2 = `try { risky(); } catch { return true; }`;
const P2neg = `try { risky(); } catch { return false; }`;
const P3 = `  validateDigest(input);\n`;
const P3neg = `  const ok = validateDigest(input);\n`;
const P4 = `if (true) { doThing(); }`;
const tests: Array<[string, boolean]> = [
  ["(1) catches a set-but-never-read latch", setNeverRead(P1).includes("failed")],
  ["(1) does NOT flag one that IS read", !setNeverRead(P1neg).includes("failed")],
  ["(2) catches a fail-open catch", failOpenCatch(P2).length === 1],
  ["(2) does NOT flag a catch returning the failing value", failOpenCatch(P2neg).length === 0],
  ["(3) catches a discarded verdict call", discardedVerdict(P3).length === 1],
  ["(3) does NOT flag one whose result is bound", discardedVerdict(P3neg).length === 0],
  ["(3) does NOT flag a call inside an array (newline overrun)", discardedVerdict("Promise.all([\n  checkFailedAuth(sb),\n  other(),\n]);").length === 0],
  ["(3) does NOT flag a void validator that THROWS", discardedVerdict("function validateThing(e: Env): void { throw new Error('x'); }\n  validateThing(env);\n").length === 0],
  ["(4) catches a constant condition", constantCondition(P4).length === 1],
];
const bad = tests.filter(([, ok]) => !ok);
console.log("── SELF-TEST ──");
for (const [l, ok] of tests) console.log(`  ${ok ? "✓" : "✗"} ${l}`);
if (bad.length) { console.log(`\n⛔ ${bad.length} recognizer(s) cannot tell a positive from a negative — RUN DISCARDED.`); process.exit(1); }

// ── THE SWEEP ─────────────────────────────────────────────────────────────────────────────────────────────────────
const files = ROOTS.flatMap((r) => walk(r));
type Hit = { file: string; kind: string; detail: string };
const hits: Hit[] = [];
for (const f of files) {
  if (f.endsWith("_engine-03-gates-that-cannot-fail.ts")) continue;  // its own planted fixtures are not findings
  const s = strip(readFileSync(f, "utf8"));
  for (const n of setNeverRead(s)) hits.push({ file: f, kind: "SET-BUT-NEVER-READ", detail: `\`${n}\` is assigned but nothing reads it` });
  for (const b of failOpenCatch(s)) hits.push({ file: f, kind: "FAIL-OPEN CATCH", detail: `catch { ${b} }` });
  for (const c of discardedVerdict(s)) hits.push({ file: f, kind: "DISCARDED VERDICT", detail: `${c}(...) result unused` });
  for (const c of constantCondition(s)) hits.push({ file: f, kind: "CONSTANT CONDITION", detail: `if (${c})` });
}

console.log(`\nENGINE AUDIT pass 3 — ${files.length} files swept\n`);
for (const kind of ["SET-BUT-NEVER-READ", "FAIL-OPEN CATCH", "DISCARDED VERDICT", "CONSTANT CONDITION"]) {
  const g = hits.filter((h) => h.kind === kind);
  console.log(`── ${kind} — ${g.length} ──`);
  for (const h of g) console.log(`   ${h.file}\n      ${h.detail}`);
  if (!g.length) console.log("   none");
  console.log("");
}
console.log("A hit is a CANDIDATE. Whether a gate can fail is decided by reading it and, where it matters, by planting a positive and watching it go red.");
