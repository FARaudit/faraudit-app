// ─────────────────────────────────────────────────────────────────────────────
// EVERY render*() CALL RESOLVES — no served page may call a renderer that has
// been deleted.
//
// THE DEFECT THIS EXISTS FOR, found by reading the production console on a page
// that looked merely sparse. `public/defense-news.html` called
//
//     function renderIntel(){ renderKPIs(); renderVolume(); renderTopics(); }
//
// and `renderKPIs` had been DELETED — removed with the invented KPI figures it
// drew, while the call to it stayed. So `renderIntel()` threw
// `ReferenceError: renderKPIs is not defined` on its FIRST STATEMENT, at page
// start, and took `renderVolume()` and `renderTopics()` down with it. Both of
// those had correct honest-empty handling — "Per-day volume history is not
// collected." — that had never once run. Two panels sat blank on a live page,
// and the page that removed the fabrication is the page that broke them.
//
// WHY THE render* FAMILY AND NOT EVERY CALL. A general undefined-identifier
// check over inline scripts needs a scope analysis and would fire on browser
// globals, cross-script helpers and event handlers. This family is where the
// deletions happen — a panel is retired by deleting its renderer — and a
// renderer is always a top-level `function renderX()` in the page or in a
// sibling script that page loads. Narrow, and it catches the real class.
//
// Run: npx tsx test/public/_render-callers-resolve.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {};
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUB = path.join(process.cwd(), "public");

/** Every top-level function name declared in a source, in either shape. */
function definedNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) out.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b|\([^)]*\)\s*=>)/g)) out.add(m[1]);
  // `window.foo = foo` and object-literal exports (`window.APP = { render, … }`)
  for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  return out;
}

/** The render*() calls a source makes. A definition is not a call. */
function calledRenderers(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?<!function\s)\b(render[A-Z][\w$]*)\s*\(/g)) out.add(m[1]);
  return out;
}

/** Sibling scripts the page loads, so a renderer defined next door still counts. */
function siblingScripts(html: string): string[] {
  return [...html.matchAll(/<script[^>]+src="\/?([A-Za-z0-9._/-]+\.js)"/g)].map((m) => m[1]);
}

const pages = readdirSync(PUB).filter((f) => f.endsWith(".html"));
ok(pages.length > 0, "the served page set was enumerated", `${pages.length} html file(s)`);

let checked = 0;
const unresolved: string[] = [];
for (const page of pages) {
  const html = readFileSync(path.join(PUB, page), "utf8");
  const calls = calledRenderers(html);
  if (calls.size === 0) continue;
  checked++;

  const defined = definedNames(html);
  for (const rel of siblingScripts(html)) {
    const p = path.join(PUB, path.basename(rel));
    if (existsSync(p)) for (const n of definedNames(readFileSync(p, "utf8"))) defined.add(n);
  }
  // Calls guarded by a typeof check are deliberate optional dispatch — the page
  // asks whether the function exists before calling it, which is not this defect.
  for (const name of calls) {
    if (defined.has(name)) continue;
    if (new RegExp(`typeof\\s+${name}\\s*===?\\s*['"]function['"]`).test(html)) continue;
    unresolved.push(`${page} → ${name}()`);
  }
}

ok(checked > 0, "pages that call a renderer were found", `${checked} page(s) carry render*() calls`);
ok(unresolved.length === 0, "every render*() call resolves to a definition",
  unresolved.length ? unresolved.join(" · ") : "");

// ── PLANTED POSITIVES ────────────────────────────────────────────────────────
console.log("\n── planted positives ──");
const PLANT_BAD = `<script>function renderIntel(){ renderKPIs(); renderVolume(); } function renderVolume(){}</script>`;
const badDefs = definedNames(PLANT_BAD);
const badCalls = [...calledRenderers(PLANT_BAD)].filter((n) => !badDefs.has(n));
ok(badCalls.length === 1 && badCalls[0] === "renderKPIs",
  "P1 · the exact shipped defect is caught — renderKPIs() called, never defined");

const PLANT_OK = `<script>function renderIntel(){ renderVolume(); } function renderVolume(){}</script>`;
const okDefs = definedNames(PLANT_OK);
ok([...calledRenderers(PLANT_OK)].filter((n) => !okDefs.has(n)).length === 0,
  "N1 · a page whose renderers all exist is NOT flagged");

const PLANT_GUARDED = `<script>if (typeof renderMaybe === 'function') renderMaybe();</script>`;
const guardedCalls = [...calledRenderers(PLANT_GUARDED)].filter(
  (n) => !definedNames(PLANT_GUARDED).has(n) && !new RegExp(`typeof\\s+${n}\\s*===?\\s*['"]function['"]`).test(PLANT_GUARDED)
);
ok(guardedCalls.length === 0, "N2 · a typeof-guarded optional dispatch is NOT flagged");

const PLANT_SIBLING = definedNames(`function renderSide(){}`);
ok(PLANT_SIBLING.has("renderSide"), "N3 · a renderer defined in a sibling script counts as defined");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
