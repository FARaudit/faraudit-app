// $0. ENGINE AUDIT, pass 1 — WHERE IS THE SAME DECISION MADE TWICE?
//
// CEO queue #4, first mechanical sweep. The class is not hypothetical: this session shipped a blocking defect of
// exactly this shape. Primary-document resolution lived in TWO copies — docRegionsOf (audit-tools, private, feeds the
// lens enumeration) and docRegions (audit-orchestrator, exported, feeds documentsCovered / absence-reconcile /
// executor-v3). Lens discovery updated one. The halves then disagreed about which document was the solicitation:
// one announced a wage determination to the lenses while the other exempted it from the coverage ledger as the
// primary. Both were internally consistent. Nothing was red. Only reading them side by side showed it.
//
// So the question this asks is not "is there duplicated code" — a linter answers that. It is: WHERE DOES THE ENGINE
// DECIDE THE SAME THING IN MORE THAN ONE PLACE, such that the two can disagree? Three detectable signatures:
//
//   (A) FLAG READ IN MULTIPLE MODULES. Every extra site is a place the same capability can be half-armed. The
//       primary-resolution bug WAS this: `ATTACHMENT_COVERAGE_ENABLED ? resolvePrimary(...) : 0` written twice.
//   (B) THE SAME PREDICATE EXPRESSION, verbatim, in more than one file — a rule copied rather than called.
//   (C) A REGEX LITERAL repeated across files — the recognizer class, where one copy gets tightened and the other
//       does not (this engine has already been bitten by \bmandatory\b matching inside NON-MANDATORY).
//
// This does NOT rank or judge. It produces the list a human then reads, because "two sites" is only a defect when the
// two can actually diverge, and no sweep can tell you that.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LIB = join(process.cwd(), "src", "lib");
const files = readdirSync(LIB).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const src = new Map<string, string>(files.map((f) => [f, readFileSync(join(LIB, f), "utf8")]));

/** Strip comments so a rule DESCRIBED in prose is never counted as a rule IMPLEMENTED in code. Without this the
 *  sweep's loudest hits are its own explanatory comments — which is how a sweep reports a problem it invented. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const codeOf = new Map<string, string>([...src].map(([f, s]) => [f, code(s)]));

const hits = <T>(m: Map<string, T[]>) => [...m].filter(([, v]) => v.length > 1);

// ── (A) flags read in more than one module ────────────────────────────────────────────────────────────────────────
const flagSites = new Map<string, string[]>();
for (const [f, s] of codeOf) {
  for (const m of s.matchAll(/process\.env\.(AUDIT_[A-Z0-9_]+)/g)) {
    const k = m[1];
    if (!flagSites.has(k)) flagSites.set(k, []);
    if (!flagSites.get(k)!.includes(f)) flagSites.get(k)!.push(f);
  }
}
// A flag re-exported as a const and imported elsewhere is ONE decision site, not many — that is the correct shape.
// Only a raw process.env read in a second module is a second decision.
const multiFlag = hits(flagSites).sort((a, b) => b[1].length - a[1].length);

// ── (B) the same predicate expression written twice ───────────────────────────────────────────────────────────────
const predSites = new Map<string, string[]>();
for (const [f, s] of codeOf) {
  // conditional expressions that gate on a capability and pick between two behaviours
  for (const m of s.matchAll(/([A-Z][A-Z0-9_]{6,}(?:_ENABLED|_ON)?)\s*\?\s*([A-Za-z][A-Za-z0-9_.]{3,}\([^)]{0,60}\)(?:\.[A-Za-z0-9_]+)*)\s*:\s*([^;,\n]{1,30})/g)) {
    const key = `${m[1]} ? ${m[2].slice(0, 40)} : ${m[3].trim().slice(0, 20)}`;
    if (!predSites.has(key)) predSites.set(key, []);
    if (!predSites.get(key)!.includes(f)) predSites.get(key)!.push(f);
  }
}
const multiPred = hits(predSites);

// ── (C) regex literals repeated across files ──────────────────────────────────────────────────────────────────────
/** Extract regex LITERALS from a source string. Written as a scanner, not one clever pattern: the first attempt at
 *  this was a single regex carrying a typo (`ose{12,}`) that could match nothing, and it duly reported ZERO repeated
 *  regexes across 112 modules — a perfectly believable clean from an instrument that was incapable of a hit. The
 *  SELF-TEST below is the fix for that class, not the rewrite: a sweep that cannot demonstrate a positive is not
 *  evidence of absence. */
function regexLiterals(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "/") continue;
    if (s[i + 1] === "/" || s[i + 1] === "*") continue;
    const prev = s.slice(0, i).trimEnd().slice(-1);
    if (prev && !"(,=:[!&|?{;+".includes(prev) && !/\breturn$|\bcase$|\btest$/.test(s.slice(0, i).trimEnd().slice(-7))) continue;
    let j = i + 1, cls = false, body = "";
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === "\\") { body += c + s[j + 1]; j++; continue; }
      if (c === "\n") { body = ""; break; }
      if (c === "[") cls = true;
      else if (c === "]") cls = false;
      else if (c === "/" && !cls) break;
      body += c;
    }
    if (body.length >= 12) out.push(body);
    i = j;
  }
  return out;
}
const reSites = new Map<string, string[]>();
for (const [f, s] of codeOf) {
  for (const body of regexLiterals(s)) {
    if (!reSites.has(body)) reSites.set(body, []);
    if (!reSites.get(body)!.includes(f)) reSites.get(body)!.push(f);
  }
}
const multiRe = hits(reSites).sort((a, b) => b[1].length - a[1].length);

// ── SELF-TEST — prove each recognizer CAN fire before believing a zero ────────────────────────────────────────────
const PLANT_RE = `const A = /\\bmandatory\\s+site\\s+visit\\b/i; const B = /\\bmandatory\\s+site\\s+visit\\b/i;`;
const PLANT_FLAG = `if (process.env.AUDIT_PLANTED_CONTROL === "true") {}`;
const PLANT_PRED = `const x = ATTACHMENT_COVERAGE_ENABLED ? resolvePrimary(regions).index : 0;`;
const selfTests: Array<[string, boolean]> = [
  ["(C) finds a regex literal at all", regexLiterals(PLANT_RE).length >= 2],
  ["(C) finds the SAME literal twice", new Set(regexLiterals(PLANT_RE)).size === 1],
  ["(C) ignores a short literal", regexLiterals("const s = /ab/;").length === 0],
  ["(A) finds a planted flag read", /process\.env\.(AUDIT_[A-Z0-9_]+)/.test(PLANT_FLAG)],
  ["(B) finds the PRE-FIX shape of the bug this sweep exists for",
    /([A-Z][A-Z0-9_]{6,}(?:_ENABLED|_ON)?)\s*\?\s*([A-Za-z][A-Za-z0-9_.]{3,}\([^)]{0,60}\)(?:\.[A-Za-z0-9_]+)*)\s*:\s*([^;,\n]{1,30})/.test(PLANT_PRED)],
];
const stFail = selfTests.filter(([, ok]) => !ok);
console.log("── SELF-TEST (a zero from an instrument that cannot fire is not a clean) ──");
for (const [l, ok] of selfTests) console.log(`  ${ok ? "✓" : "✗"} ${l}`);
if (stFail.length) { console.log(`\n⛔ ${stFail.length} recognizer(s) cannot produce a positive — RUN DISCARDED.`); process.exit(1); }
console.log("");

console.log(`ENGINE AUDIT pass 1 — ${files.length} modules under src/lib\n`);

console.log(`── (A) FLAGS READ RAW IN MORE THAN ONE MODULE — ${multiFlag.length} ──`);
console.log("   Each extra site is a place the capability can be half-armed. This is the shape of the bug found in #413/#415.\n");
for (const [flag, fs] of multiFlag) console.log(`   ${flag}  (${fs.length})\n      ${fs.join("\n      ")}`);

console.log(`\n── (B) THE SAME CAPABILITY-GATED EXPRESSION IN MORE THAN ONE FILE — ${multiPred.length} ──\n`);
for (const [p, fs] of multiPred) console.log(`   ${p}\n      ${fs.join(", ")}`);
if (!multiPred.length) console.log("   none");

console.log(`\n── (C) REGEX LITERALS REPEATED ACROSS FILES — ${multiRe.length} ──`);
console.log("   One copy gets tightened, the other does not. This engine has already been bitten by exactly that.\n");
for (const [r, fs] of multiRe.slice(0, 20)) console.log(`   /${r.slice(0, 84)}/\n      ${fs.join(", ")}`);

console.log("\nThis sweep RANKS NOTHING. Two sites is a defect only when the two can actually disagree, and only reading them says whether they can.");
