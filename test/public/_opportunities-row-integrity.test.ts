// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITIES ROW INTEGRITY GATE — the two defects that shipped because a
// pole was added in one file and its rendering lived in another.
//
// D2 · `.pcard.stage-notice` had no rail rule. `notice` and `UNKNOWN` were added
// to STAGE_META in dso-data.js so the stage classifier could fail closed; the
// four `border-left-color` rules in opportunities.html were not updated, so those
// rows fell back to the default `--line` while every other type was colour-coded.
// Silent, because a missing colour is still a valid border.
//
// D3 · all three sorts were INVALID, not inert. `last(v) = v == null ? -Infinity
// : v`, then `last(b.ceiling) - last(a.ceiling)`. SAM publishes no ceiling for
// open solicitations, so every term was `-Infinity - -Infinity` = NaN. A
// comparator returning NaN is non-transitive; Array#sort then leaves the group in
// an implementation-defined order that can differ between engines and between
// calls on the same data. `fit` and `deadline` hit the same path whenever two
// rows both lacked the key (`Infinity - Infinity`).
//
// It asserts:
//   S1  the comparator is TOTAL — never NaN, over a matrix that includes the
//       both-missing pair that produced the bug.
//   S2  the comparator is ANTISYMMETRIC and TRANSITIVE — the two properties
//       Array#sort requires and NaN destroys.
//   S3  missing values park at the END, so a row with no stated value never
//       reads as "cheapest".
//   S4  every pole STAGE_META can emit has a rail rule, and its colour MATCHES
//       STAGE_META — the duplication that caused D2 is asserted, not trusted.
//   S5  PLANTED POSITIVES — the pre-fix comparators and a stripped rail rule are
//       run through the same assertions and MUST be caught.
//
// Run: npx tsx test/public/_opportunities-row-integrity.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const P = (f: string) => path.join(process.cwd(), "public", f);
const DSO_JS = readFileSync(P("dso-app.js"), "utf8");
const DATA_JS = readFileSync(P("dso-data.js"), "utf8");
const HTML = readFileSync(P("opportunities.html"), "utf8");

function extractFn(src: string, name: string, file: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in ${file}`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}

type Cmp = (x: number | null, y: number | null, dir: number) => number;
let cmpMissingLast: Cmp;
let sortRows: (data: any[], key: string) => any[];
try {
  const sandbox: any = { __out: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(
    extractFn(DSO_JS, "cmpMissingLast", "dso-app.js") + "\n" +
    extractFn(DSO_JS, "sortRows", "dso-app.js"),
    sandbox
  );
  cmpMissingLast = sandbox.__out.cmpMissingLast;
  sortRows = sandbox.__out.sortRows;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — cannot load the sort seam: ${e.message}`);
  console.log(`    The comparators must be a top-level cmpMissingLast(x,y,dir) + sortRows(data,key)`);
  console.log(`    in public/dso-app.js. Comparators written inline in .sort() calls are unreachable`);
  console.log(`    to any gate, which is how three invalid sorts shipped.\n`);
  process.exit(1);
}

// ═══ S1 · totality ═══════════════════════════════════════════════════════════
console.log("\nS1 · the comparator is total — never NaN");
const VALUES: (number | null)[] = [null, 0, 1, 42, -3, 1e9];
let nanPairs = 0;
for (const dir of [1, -1]) for (const x of VALUES) for (const y of VALUES) {
  if (Number.isNaN(cmpMissingLast(x, y, dir))) nanPairs++;
}
ok(nanPairs === 0, `no NaN over ${VALUES.length ** 2 * 2} pairs incl. (null, null)`, nanPairs ? `${nanPairs} NaN` : "");

// ═══ S2 · antisymmetry + transitivity ════════════════════════════════════════
console.log("\nS2 · antisymmetric and transitive — what Array#sort requires");
function orderFailures(cmp: Cmp): string[] {
  const bad: string[] = [];
  const sgn = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : Number.isNaN(n) ? NaN : 0);
  for (const dir of [1, -1]) {
    for (const x of VALUES) for (const y of VALUES) {
      if (sgn(cmp(x, y, dir)) !== -sgn(cmp(y, x, dir)) && !(cmp(x, y, dir) === 0 && cmp(y, x, dir) === 0))
        bad.push(`antisymmetry broken at (${x},${y},dir=${dir}): ${cmp(x, y, dir)} vs ${cmp(y, x, dir)}`);
    }
    for (const a of VALUES) for (const b of VALUES) for (const c of VALUES) {
      const ab = sgn(cmp(a, b, dir)), bc = sgn(cmp(b, c, dir)), ac = sgn(cmp(a, c, dir));
      if (ab <= 0 && bc <= 0 && ac > 0) bad.push(`transitivity broken at (${a},${b},${c},dir=${dir})`);
      if (Number.isNaN(ab)) bad.push(`NaN comparison at (${a},${b},dir=${dir})`);
    }
  }
  return bad;
}
const s2 = orderFailures(cmpMissingLast);
ok(s2.length === 0, `order axioms hold in both directions`, s2.slice(0, 2).join(" | "));

// ═══ S3 · missing parks last, and the real sorts are deterministic ═══════════
console.log("\nS3 · missing values park at the end; the shipped sorts are stable");
const row = (id: string, fit: number | null, days: number | null, ceiling: number | null) => ({ id, fit, days, ceiling });
// The live shape: every ceiling null (SAM publishes none for open solicitations),
// every fit null (nothing audited), some rows with no deadline at all.
const LIVE_SHAPE = [
  row("a", null, 12, null), row("b", null, null, null), row("c", null, 3, null),
  row("d", null, 40, null), row("e", null, null, null),
];
const MIXED = [
  row("p", 90, 5, null), row("q", null, 2, 1.5), row("r", 70, null, 0.2),
  row("s", null, null, null), row("t", 85, 9, 12),
];
for (const key of ["fit", "deadline", "value"]) {
  const missKey = key === "fit" ? "fit" : key === "deadline" ? "days" : "ceiling";
  const out = sortRows(MIXED.slice(), key) as any[];
  const idx = out.map(r => r[missKey] == null);
  const firstMissing = idx.indexOf(true);
  const lastPresent = idx.lastIndexOf(false);
  ok(firstMissing === -1 || lastPresent < firstMissing,
     `${key}: rows missing "${missKey}" park after every row that has it`,
     out.map(r => `${r.id}:${r[missKey] ?? "—"}`).join(" "));
}
// Determinism: the same input must produce the same output on repeated calls.
// A NaN comparator is free to differ between calls on identical data.
for (const key of ["fit", "deadline", "value"]) {
  const a = sortRows(LIVE_SHAPE.slice(), key).map((r: any) => r.id).join("");
  const b = sortRows(LIVE_SHAPE.slice(), key).map((r: any) => r.id).join("");
  const c = sortRows(LIVE_SHAPE.slice().reverse(), key).map((r: any) => r.id).join("");
  ok(a === b, `${key}: repeated sorts of identical input agree`, `${a} / ${b}`);
  // Permutation-invariance is NOT the property to assert: rows that compare
  // equal keep their input order under a stable sort, so the two undated rows
  // legitimately swap when the input is reversed. The property that a NaN
  // comparator destroys is that the ORDERABLE rows land in the same sequence
  // whatever order they arrived in.
  if (key === "deadline") {
    const dated = (ids: string) => [...ids].filter(id => LIVE_SHAPE.find(r => r.id === id)!.days != null).join("");
    ok(dated(a) === dated(c), `${key}: rows that can be ordered land in one sequence whatever the input order`, `${dated(a)} vs ${dated(c)}`);
  }
}

// ═══ S4 · every stage pole has a rail rule, matching STAGE_META ══════════════
console.log("\nS4 · stage rail coverage — every pole is colour-coded");
const STYLE = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");
const stageMeta: Record<string, string> = (() => {
  const block = DATA_JS.match(/STAGE_META\s*=\s*\{([\s\S]*?)\n\s*\};/);
  if (!block) throw new Error("STAGE_META not found in dso-data.js");
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/([\w$]+)\s*:\s*\{[^}]*color:\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
})();
function railFailures(css: string): string[] {
  const bad: string[] = [];
  for (const [pole, color] of Object.entries(stageMeta)) {
    const m = css.match(new RegExp(`\\.pcard\\.stage-${pole.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\{([^}]*)\\}`));
    if (!m) { bad.push(`no .pcard.stage-${pole} rule`); continue; }
    const c = m[1].match(/border-left-color:\s*([^;}]+)/);
    if (!c) { bad.push(`.pcard.stage-${pole} sets no border-left-color`); continue; }
    if (c[1].trim().toLowerCase() !== color.toLowerCase())
      bad.push(`.pcard.stage-${pole} is ${c[1].trim()} but STAGE_META says ${color}`);
  }
  return bad;
}
ok(Object.keys(stageMeta).length >= 6, `STAGE_META poles read from dso-data.js`, Object.keys(stageMeta).join(", "));
const s4 = railFailures(STYLE);
ok(s4.length === 0, `every STAGE_META pole has a rail rule at its own colour`, s4.join(" | "));

// ═══ S5 · planted positives ══════════════════════════════════════════════════
console.log("\nS5 · planted positives — this gate must be able to fail");
// P1 · the pre-fix comparator, verbatim.
const LEGACY_CMP: Cmp = (x, y, dir) => { const last = (v: any) => v == null ? -Infinity : v; return dir * (last(x) - last(y)); };
const p1 = orderFailures(LEGACY_CMP);
ok(p1.some(f => f.includes("NaN")), `P1 the pre-fix comparator's NaN path is caught`, `${p1.length} findings`);
let legacyNaN = 0;
for (const dir of [1, -1]) for (const x of VALUES) for (const y of VALUES) if (Number.isNaN(LEGACY_CMP(x, y, dir))) legacyNaN++;
ok(legacyNaN > 0, `P1b the pre-fix comparator returns NaN on (null, null)`, `${legacyNaN} pairs`);

// P2 · the stylesheet as it shipped, with the notice rail absent.
const P2_CSS = STYLE.replace(/\.pcard\.stage-notice\{[^}]*\}/, "");
ok(railFailures(P2_CSS).some(f => f.includes("no .pcard.stage-notice rule")), `P2 a missing rail rule is caught`);

// P3 · a rail whose colour drifts from STAGE_META.
const P3_CSS = STYLE.replace(/\.pcard\.stage-rfp\{[^}]*\}/, ".pcard.stage-rfp{border-left-color:#ff00ff}");
ok(railFailures(P3_CSS).some(f => f.includes("STAGE_META says")), `P3 a rail colour drifting from STAGE_META is caught`);

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
