// $0 PROOF for RULES 5, 6, 7, 8 and the forbidden-vocabulary half of RULE 54.
// Run: npx tsx src/lib/external-vocabulary.test.ts
//
// Scans the REAL external surfaces — public/ (served verbatim, no bundler), content/ (authored copy),
// src/app + src/components (rendered pages). `ceo/` is out of scope on purpose: it is local-only doctrine
// that must be free to quote every forbidden term in order to forbid it.
//
// Section 2 is the point. A vocabulary gate is trivially easy to write and trivially easy to get wrong in
// BOTH directions, so every term is planted to prove it goes red, and every real-world innocent case that a
// naive sweep flagged before this file existed is kept as a green control.
//
// This file names forbidden terms in its own test vectors. That is why it is NOT in the scanned surface set —
// src/lib is excluded by scope, not by a special case. Verified by an assertion below.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { scanExternalVocabulary, FORBIDDEN, type ScanFile } from "./external-vocabulary";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ROOT = process.cwd();
const TEXT = /\.(html|js|jsx|ts|tsx|md|json|txt|css)$/;
const SKIP = /(^|\/)(node_modules|\.next|\.git|run-records|\.run-record-cache|gold-sets|\.verify-tmp)(\/|$)/;

function walk(dir: string, out: ScanFile[] = []): ScanFile[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e), rel = relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (TEXT.test(e) && st.size < 2_000_000) {
      try { out.push({ path: rel, content: readFileSync(p, "utf8") }); } catch { /* skip */ }
    }
  }
  return out;
}

console.log("── 1. THE REAL EXTERNAL SURFACES ────────────────────────────────────────");
const surfaces = [
  ...walk(join(ROOT, "public")),
  ...walk(join(ROOT, "content")),
  ...walk(join(ROOT, "src", "app")),
  ...walk(join(ROOT, "src", "components")),
];
assert(surfaces.length > 50, `scanned ${surfaces.length} external file(s) — a near-empty scan is a broken scan, not a clean one`);
assert(!surfaces.some((f) => f.path.startsWith("ceo/")), "ceo/ is NOT scanned — doctrine must be free to quote what it forbids");
assert(!surfaces.some((f) => f.path.includes("external-vocabulary")), "this suite and its module are outside the scanned scope");

{
  const v = scanExternalVocabulary(surfaces);
  for (const x of v) console.log(`   ${x.file}:${x.line} — RULE ${x.rule}: ${x.text}`);
  assert(v.length === 0, `no forbidden vocabulary on any external surface (${v.length} finding(s))`);
}

console.log("\n── 2a. EVERY TERM PROVEN RED ────────────────────────────────────────────");
for (const t of FORBIDDEN) {
  const sample = t.label === "SaaS" ? "FARaudit is a SaaS for contractors."
    : t.label === "cheaper than Deltek/GovWin" ? "It is cheaper than Deltek."
    : `Our ${t.label} helps you win.`;
  const v = scanExternalVocabulary([{ path: "planted.md", content: sample }]);
  assert(v.some((x) => x.rule === t.rule), `RULE ${t.rule} goes RED on "${t.label}"`);
}
{
  const v = scanExternalVocabulary([{ path: "planted.md", content: "Signed, Jose Antonio Rodriguez Jr." }]);
  assert(v.some((x) => x.rule === 8), "RULE 8 goes RED on a period after Jr");
  const ok = scanExternalVocabulary([{ path: "planted.md", content: "Signed, Jose Antonio Rodriguez Jr" }]);
  assert(ok.length === 0, "RULE 8 stays green on the correct legal name");
}
for (const noun of ["parser", "checker", "scanner"]) {
  const v = scanExternalVocabulary([{ path: "planted.md", content: `FARaudit is a ${noun} for solicitations.` }]);
  assert(v.some((x) => x.term === noun), `RULE 54 goes RED on "is a ${noun}" as a self-descriptor`);
}

console.log("\n── 2b. THE INNOCENT CASES — every one is REAL, found before this existed ─");
// A draft's own compliance checklist. A naive sweep reported all three as violations.
for (const [label, line] of [
  ["markdown checklist", `- [x] No reference to "SaaS" (use "operating system")`],
  ["checklist, two terms", `- [x] No reference to "AI-powered" or "AI-based"`],
  ["JSON metadata key", `    "no_saas_term": true,`],
] as Array<[string, string]>) {
  assert(scanExternalVocabulary([{ path: "content/x.md", content: line }]).length === 0,
    `green: ${label} — naming the term it avoided is not using it`);
}
// Rule 54 lists these as APPROVED vocabulary. Flagging them would make the gate contradict its own rule.
for (const line of [
  "FARaudit is not a parser.",
  "It is not a checker and not a tool.",
  "We never say AI-powered.",
  "Avoid AI tool framing entirely.",
  "Use operating system instead of SaaS.",
]) {
  assert(scanExternalVocabulary([{ path: "content/x.md", content: line }]).length === 0,
    `green (approved/negated): ${JSON.stringify(line.slice(0, 46))}`);
}
// Ordinary technical use must not trip the descriptor rule.
for (const line of [
  "The PDF parser reads the content stream.",
  "A checker function validates the payload.",
  "const scanner = buildScanner();",
]) {
  assert(scanExternalVocabulary([{ path: "src/app/x.tsx", content: line }]).length === 0,
    `green (technical use): ${JSON.stringify(line.slice(0, 44))}`);
}

console.log("\n── 3. SCOPE IS HONEST ABOUT WHAT IT CANNOT CHECK ────────────────────────");
// Written as an explicit length check, not `!Object.keys(...).length` — the latter passes for any object at
// all and would have held even if the scanner returned nonsense. A documentation assertion still has to be
// able to fail.
assert(scanExternalVocabulary([{ path: "x.md", content: "This piece names no pillars at all." }]).length === 0,
  "the four-pillar half of Rule 54 is NOT asserted here — judging an argument is a reading task, not a sweep");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
