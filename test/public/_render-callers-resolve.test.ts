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

/** Names a WIRING SCRIPT can actually reach at global scope.
 *
 *  THE SECOND DEFECT, and the reason this is not the same list as "defined".
 *  defense-news-live.js guarded its call with `typeof renderIntel === 'function'`
 *  — and renderIntel lives inside an IIFE, so that guard was ALWAYS FALSE. The
 *  page exported it as `window.DN_INTEL` and nothing ever called that. The
 *  Coverage-by-Topic panel therefore rendered once, at DOMContentLoaded, against
 *  zero articles, and never again after eighteen arrived. A guard that can only
 *  be false is not optional dispatch; it is a disabled feature that reads as a
 *  deliberate one. */
function globallyReachable(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  for (const block of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    // BRACE DEPTH, not indentation and not "does the block open with an IIFE".
    // Both of those were tried and both were wrong: this page puts top-level
    // declarations and an IIFE in the SAME <script>, and the IIFE's own
    // functions are indented two spaces — so an indentation rule called
    // renderIntel global when it is not, and the gate passed on the very defect
    // it was written for.
    for (const d of declarationsAtTopLevel(block[1])) out.add(d);
  }
  return out;
}

/** `function NAME(` at brace depth 0 of a script body. Strings, template
 *  literals, regex-ish slashes and comments are blanked first so a brace inside
 *  one cannot move the depth. */
function declarationsAtTopLevel(body: string): string[] {
  let src = body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
  const names: string[] = [];
  let depth = 0;
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(|[{}]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[0] === "{") depth++;
    else if (m[0] === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && m[1]) names.push(m[1]);
  }
  return names;
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

// ── a guard that can only be false ──────────────────────────────────────────
console.log("\n── typeof guards in wiring scripts ──");
const deadGuards: string[] = [];
let guardsChecked = 0;
for (const page of pages) {
  const html = readFileSync(path.join(PUB, page), "utf8");
  const reachable = globallyReachable(html);
  for (const rel of siblingScripts(html)) {
    const p = path.join(PUB, path.basename(rel));
    if (!existsSync(p)) continue;
    const js = readFileSync(p, "utf8");
    for (const n of definedNames(js)) reachable.add(n);
    for (const m of js.matchAll(/typeof\s+(?:window\.)?([A-Za-z_$][\w$]*)\s*===?\s*['"]function['"]/g)) {
      const name = m[1];
      // A LOCAL binding is not a cross-script dispatch. `const v = TABLE[k];
      // typeof v === 'function' ? v() : v` is picking a value out of a table,
      // and flagging it would make this gate unreadable — which is how a gate
      // stops being run.
      if (new RegExp(`(?:var|let|const|function)\\s+${name}\\b|\\(\\s*${name}\\s*[,)]`).test(js)) continue;
      guardsChecked++;
      if (!reachable.has(name)) deadGuards.push(`${path.basename(rel)} → typeof ${name} (never reachable)`);
    }
  }
}
ok(guardsChecked > 0, "typeof-function guards were found to check", `${guardsChecked} guard(s)`);
ok(deadGuards.length === 0, "no guard tests a name that can never be reachable",
  deadGuards.length ? deadGuards.join(" · ") : "");

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

// The real shape: top-level declarations and an IIFE in the SAME script block,
// with the IIFE's own functions indented. This is what defeated two earlier
// versions of the reachability rule.
const IIFE_PAGE = `<script>
  function renderTopLevel(){}
  (function(){
    function renderIntel(){}
    window.DN_INTEL = renderIntel;
  })();
</script>`;
const reach = globallyReachable(IIFE_PAGE);
ok(!reach.has("renderIntel"), "P2 · a name declared INSIDE an IIFE is not globally reachable (the shipped defect)");
ok(reach.has("DN_INTEL"), "N4 · but its window export is");
ok(reach.has("renderTopLevel"), "N4b · and a sibling declaration outside the IIFE still is");
ok(globallyReachable(`<script>function renderTop(){}</script>`).has("renderTop"),
  "N5 · a top-level declaration in a non-IIFE block IS reachable");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
