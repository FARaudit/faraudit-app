// SERVED-SCRIPT UNDECLARED-NAME GATE — every name a served script reads must exist somewhere.
//
// WHY THIS EXISTS. A panel trim deleted the map from `public/dsb-app.js`, and with it the constant
// `GEO_RAMP`. One line outside the map still read that constant — the concentration bar's colour, a bare
// name inside a template literal:
//
//     background:${css(GEO_RAMP[Math.max(1, 5 - i)])}
//
// It is not a syntax error, so `_inline-script-syntax` was green. The function that reads it is still
// called from `renderAll()`, so `_render-callers-resolve` was green. Every id it writes into still
// exists in the markup, so `_defense-spending-wiring` was green. It threw a ReferenceError on the first
// row that had leaders, `renderAll()` has no per-panel isolation, and the honest-fail path replaced the
// WHOLE TAB with a failure notice. **54 of 54 public gates passed while the page was blank.**
//
// The render gate that should have caught it could not: its fixture's CONCENTRATION array is empty, so
// the only renderer that touches the constant returned at its `if (!rows.length)` guard and the line
// never executed. A fixture certifies its author's imagination. This gate does not run the code at all
// — it asks a question the fixture cannot dodge: does this name exist anywhere?
//
// WHAT IT CHECKS, EXACTLY. Scope-INSENSITIVE reachability: a referenced name must be declared SOMEWHERE
// in its own file, or be a top-level declaration of another served script (they share one page), or be
// a browser/library global on the list below. It deliberately does NOT model scope, so it will not
// catch a name used outside the function that declares it. That is the honest limit and it is the right
// trade: the defect class this exists for is a declaration DELETED OUTRIGHT, and a scope-insensitive
// check has no false positives — a gate that cries wolf on real code gets switched off.
//
// Run: npx tsx test/public/_served-script-globals.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUBLIC_DIR = join(process.cwd(), "public");

// Globals a browser page really provides, plus the two vendor libraries these scripts load by <script>
// tag (d3, topojson). Kept as a list rather than inferred: an inferred allowlist would grow to include
// the very typo it exists to catch.
const BROWSER_GLOBALS = new Set([
  "window", "document", "console", "navigator", "location", "history", "screen", "self", "top", "parent",
  "localStorage", "sessionStorage", "globalThis", "undefined", "NaN", "Infinity", "arguments",
  "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Math", "JSON", "Date", "RegExp",
  "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "Promise", "Map", "Set", "WeakMap",
  "WeakSet", "Proxy", "Reflect", "Intl", "URL", "URLSearchParams", "AbortController", "TextDecoder",
  "TextEncoder", "structuredClone", "queueMicrotask", "performance", "crypto",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "fetch", "XMLHttpRequest", "FormData", "Blob", "File", "FileReader", "Image",
  "WebSocket", "EventSource", "atob", "btoa", "isNaN", "isFinite", "parseInt", "parseFloat",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "alert", "confirm", "prompt",
  "getComputedStyle", "matchMedia", "IntersectionObserver", "ResizeObserver", "MutationObserver",
  "DOMParser", "XMLSerializer", "Node", "Element", "HTMLElement", "SVGElement", "Event", "CustomEvent",
  "MouseEvent", "KeyboardEvent", "PointerEvent", "CSS", "Notification", "ClipboardItem", "Option",
  // Vendor libraries loaded by <script> tag, not by any module system.
  "d3", "topojson",
]);

function servedScripts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "vendor") continue;   // third-party bytes; not ours to hold to this
      out.push(...servedScripts(p));
    } else if (entry.endsWith(".js")) out.push(p);
  }
  return out;
}

interface Census { declared: Set<string>; referenced: Map<string, number>; topLevel: Set<string> }

/** Walks a parsed JS file and separates names DECLARED from names READ. The
 *  positional exclusions below are the whole correctness surface: `a.b` reads
 *  `a` and not `b`, `{b: 1}` reads neither, `{b}` reads `b`. */
function census(src: string, filename: string): Census {
  const sf = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declared = new Set<string>();
  const topLevel = new Set<string>();
  const referenced = new Map<string, number>();

  /** Every identifier bound by a declaration name or binding pattern. */
  const bindNames = (name: ts.Node, into: Set<string>) => {
    if (ts.isIdentifier(name)) { into.add(name.text); return; }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) bindNames(el.name, into);
      }
    }
  };

  const isDeclarationName = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if (!p) return false;
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === id) return true;
    if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)
      || ts.isClassExpression(p)) && p.name === id) return true;
    return false;
  };

  /** Positions where an identifier is a NAME, not a read of a binding. */
  const isNonReference = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if (!p) return true;
    // a.b — `b` is a property, not a binding.
    if (ts.isPropertyAccessExpression(p) && p.name === id) return true;
    if (ts.isQualifiedName(p) && p.right === id) return true;
    // { b: expr } — `b` is a key. { b } (shorthand) IS a read and is not matched here.
    if (ts.isPropertyAssignment(p) && p.name === id) return true;
    if (ts.isMethodDeclaration(p) && p.name === id) return true;
    if (ts.isPropertyDeclaration(p) && p.name === id) return true;
    if ((ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === id) return true;
    // { a: localName } destructuring — `a` names the source property.
    if (ts.isBindingElement(p) && p.propertyName === id) return true;
    // loop: / break loop
    if (ts.isLabeledStatement(p) && p.label === id) return true;
    if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) return true;
    if (ts.isMetaProperty(p)) return true;
    return false;
  };

  /** True until the walk descends into a function or class body. A `const` or a
   *  `var` inside one is not reachable from another script on the page, so it
   *  must not be handed out as a cross-file global — that would make the whole
   *  check fail open for every IIFE-wrapped file, which is most of them. */
  const opensScope = (n: ts.Node) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
    || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)
    || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
    || ts.isClassDeclaration(n) || ts.isClassExpression(n);

  const walk = (node: ts.Node, top: boolean) => {
    // `window.NAME = …` publishes a global every other script on the page reads bare.
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)
      && (node.left.expression.text === "window" || node.left.expression.text === "globalThis")) {
      topLevel.add(node.left.name.text);
    }
    if (ts.isVariableDeclaration(node)) {
      bindNames(node.name, declared);
      if (top) bindNames(node.name, topLevel);
    } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      if (node.name) { declared.add(node.name.text); if (top) topLevel.add(node.name.text); }
    } else if (ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
      if (node.name) declared.add(node.name.text);
    } else if (ts.isParameter(node)) {
      bindNames(node.name, declared);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      bindNames(node.variableDeclaration.name, declared);
    } else if (ts.isImportSpecifier(node) || ts.isImportClause(node)) {
      if ("name" in node && node.name && ts.isIdentifier(node.name)) declared.add(node.name.text);
    }

    if (ts.isIdentifier(node) && !isDeclarationName(node) && !isNonReference(node)) {
      referenced.set(node.text, (referenced.get(node.text) || 0) + 1);
    }
    node.forEachChild((c) => walk(c, top && !opensScope(node)));
  };
  walk(sf, true);
  return { declared, referenced, topLevel };
}

/** Inline `<script>` bodies of a served page. They run in the SAME global scope
 *  as the page's external scripts, so a name declared in one is readable from
 *  the other — `defense-news.html` declares ten that `defense-news-live.js`
 *  reads. A sweep that only read .js files would report every one as missing. */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || "";
    if (/\bsrc=/i.test(attrs)) continue;                      // external: swept as its own file
    if (/\btype=/i.test(attrs) && !/type=["']?(text\/javascript|module)/i.test(attrs)) continue;
    if (m[2].trim()) out.push(m[2]);
  }
  return out;
}

// ── R1 · THE SWEEP REACHED REAL FILES ────────────────────────────────────────
console.log("\nR1  THE SWEEP READ THE REAL SERVED TREE");
const files = servedScripts(PUBLIC_DIR);
ok(files.length > 5, "served scripts enumerated", `${files.length} file(s) under public/`);

const censuses = new Map<string, Census>();
for (const f of files) censuses.set(f, census(readFileSync(f, "utf8"), f));

// Cross-script globals: these files share one page, so a top-level name in any of them is reachable
// from all of them — including the inline <script> blocks of the pages that load them.
const crossFile = new Set<string>();
for (const c of censuses.values()) for (const n of c.topLevel) crossFile.add(n);

const htmlFiles = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".html"));
let inlineBlocks = 0;
for (const h of htmlFiles) {
  for (const body of inlineScripts(readFileSync(join(PUBLIC_DIR, h), "utf8"))) {
    inlineBlocks++;
    for (const n of census(body, h).topLevel) crossFile.add(n);
  }
}
ok(inlineBlocks > 5, "inline <script> blocks contribute their globals",
  `${inlineBlocks} block(s) across ${htmlFiles.length} page(s)`);

const totalRefs = [...censuses.values()].reduce((n, c) => n + c.referenced.size, 0);
const totalDecls = [...censuses.values()].reduce((n, c) => n + c.declared.size, 0);
// An analyzer that returned nothing would report a clean sweep. Both sides must be non-trivial.
ok(totalRefs > 200, "the reference census is non-empty", `${totalRefs} distinct names read`);
ok(totalDecls > 200, "the declaration census is non-empty", `${totalDecls} distinct names declared`);

function unresolved(c: Census): string[] {
  return [...c.referenced.keys()]
    .filter((n) => !c.declared.has(n) && !crossFile.has(n) && !BROWSER_GLOBALS.has(n))
    .sort();
}

// ── R2 · THE REAL TREE IS CLEAN ──────────────────────────────────────────────
console.log("\nR2  EVERY NAME A SERVED SCRIPT READS EXISTS");
let dirty = 0;
for (const [f, c] of censuses) {
  const bad = unresolved(c);
  if (bad.length) {
    dirty++;
    console.log(`  ❌ ${f.replace(PUBLIC_DIR + "/", "public/")} — undeclared: ${bad.join(", ")}`);
  }
}
ok(dirty === 0, "no served script reads a name that does not exist",
  dirty ? `${dirty} file(s) with undeclared names` : `${files.length} file(s) clean`);

// ── R3 · PLANTED POSITIVES — the gate must go red ────────────────────────────
// A gate that cannot fail is not evidence. Each case below deletes a real declaration from a real file
// and requires the analyzer to name it.
console.log("\nR3  PLANTED POSITIVES — a deleted declaration is caught");
const APP = join(PUBLIC_DIR, "dsb-app.js");
const APP_SRC = readFileSync(APP, "utf8");

function stillResolves(src: string): string[] {
  const c = census(src, "planted.js");
  // Cross-file names are recomputed WITHOUT the patched file's own top level, so deleting a top-level
  // declaration cannot be rescued by the unpatched copy of itself.
  const cross = new Set<string>();
  for (const [f, cc] of censuses) if (f !== APP) for (const n of cc.topLevel) cross.add(n);
  return [...c.referenced.keys()]
    .filter((n) => !c.declared.has(n) && !cross.has(n) && !BROWSER_GLOBALS.has(n)).sort();
}

// (1) The historical defect, reproduced exactly: remove the concentration bar's colour ramp and leave
//     its one reader in place.
const rampDecl = /^\s*const CONC_RAMP = \[[^\]]*\];\s*$/m;
ok(rampDecl.test(APP_SRC), "CONC_RAMP is declared in the real file (the fixture is anchored to reality)");
const cutRamp = APP_SRC.replace(rampDecl, "");
ok(stillResolves(cutRamp).includes("CONC_RAMP"),
  "deleting CONC_RAMP is reported", `found: ${stillResolves(cutRamp).join(", ") || "(nothing)"}`);

// (2) The map's own ramp — the constant the trim actually deleted.
const geoDecl = /^\s*const GEO_RAMP = \[[^\]]*\];\s*$/m;
ok(geoDecl.test(APP_SRC), "GEO_RAMP is declared in the real file");
ok(stillResolves(APP_SRC.replace(geoDecl, "")).includes("GEO_RAMP"),
  "deleting GEO_RAMP is reported — the exact cut that blanked the tab");

// (3) A whole function removed while a caller survives.
const fnDecl = /^\s*function renderGeoTotal\(\) \{[\s\S]*?\n  \}\n/m;
ok(fnDecl.test(APP_SRC), "renderGeoTotal is declared in the real file");
ok(stillResolves(APP_SRC.replace(fnDecl, "")).includes("renderGeoTotal"),
  "deleting a called function is reported");

// ── R4 · PLANTED NEGATIVES — the shapes that must NOT fire ───────────────────
// Each of these would make the gate noisy enough to be switched off, which is how the leak gate's
// marker regex had to be narrowed. They are checked against handwritten sources, not the real tree.
console.log("\nR4  PLANTED NEGATIVES — legitimate shapes stay silent");
const NEG: [string, string][] = [
  ["a property read is not a global", "const o = {}; console.log(o.GEO_RAMP);"],
  ["an object KEY is not a read", "const o = { GEO_RAMP: 1 }; console.log(o);"],
  ["a function parameter is declared", "function f(GEO_RAMP) { return GEO_RAMP; } f(1);"],
  ["a catch binding is declared", "try { null; } catch (GEO_RAMP) { console.log(GEO_RAMP); }"],
  ["destructuring binds the local name", "const { a: GEO_RAMP } = { a: 1 }; console.log(GEO_RAMP);"],
  ["array destructuring binds", "const [GEO_RAMP] = [1]; console.log(GEO_RAMP);"],
  ["a label is not a read", "GEO_RAMP: for (;;) { break GEO_RAMP; }"],
  ["an arrow parameter is declared", "const f = (GEO_RAMP) => GEO_RAMP; f(1);"],
  ["a class method name is not a read", "class C { GEO_RAMP() { return 1; } } new C();"],
];
for (const [label, src] of NEG) {
  const c = census(src, "neg.js");
  const bad = [...c.referenced.keys()].filter((n) => !c.declared.has(n) && !BROWSER_GLOBALS.has(n));
  ok(!bad.includes("GEO_RAMP"), `NEGATIVE: ${label}`, bad.length ? `flagged: ${bad.join(", ")}` : "");
}
// Shorthand IS a read — the mirror of the object-key case, so the exclusion above cannot be a blanket
// "any identifier under an object literal is a key".
const shorthand = census("const o = { GEO_RAMP }; console.log(o);", "sh.js");
ok(!shorthand.declared.has("GEO_RAMP") && shorthand.referenced.has("GEO_RAMP"),
  "POSITIVE: shorthand `{ GEO_RAMP }` still counts as a read");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
