// ─────────────────────────────────────────────────────────────────────────────
// DEFENSE SPENDING · THEME-FLIP GATE — the unwired page, flipped light/dark.
//
// THE DEFECT. `public/dsb-app.js` threw on EVERY theme change in production:
//
//     TypeError: Cannot set properties of null (setting 'innerHTML')
//         at renderLegend (dsb-app.js:109)
//         at Object.onThemeChange (dsb-app.js:552)
//         at MutationObserver.<anonymous> (defense-spending-live.js:76)
//
// `#geoLegend` is NOT missing from the markup — it is served, and it survives both
// injectors. It is missing from the DOM. `renderUnavailable()` removes every child
// of `.body` except `.page-header` when the feed reports `unwired`, and the legend
// lives inside one of the children it removes. `init()`, `renderAll()` and
// `renderStatic()` each check `dsbHasData()` first; `onThemeChange()` did not, so
// it called `renderLegend()` into a DOM that no longer had the element.
//
// WHY THE FIX IS A CALLER GUARD AND NOT A NULL CHECK IN renderLegend. A null check
// inside the renderer would be fail-open: it would also swallow a genuine markup
// regression — the container renamed, or an injector eating it — on the WIRED page,
// where the legend does belong. R1/R2 assert the container really is served, and R3
// asserts it really is gone in the unwired state, so the skip is a precondition that
// was measured, not an assumption.
//
// WHY THERE IS NO BROWSER HERE. CI runs `npm ci` only; a chromium download is not
// guaranteed, and a gate that silently skips on a missing browser gates nothing. So
// the page's real bytes run in a `vm` sandbox against a DOM shim whose element set
// is DERIVED FROM THE COMPOSED HTML — not from a fixture someone typed. R5 proves
// the shim is faithful by planting the original defect back into a copy of the
// source and requiring the exact production TypeError.
//
//   R1  THE CONTAINER IS SERVED — #geoLegend survives injectRail + injectDefenseTabs.
//   R2  EVERY LOOKUP RESOLVES — every id dsb-app.js reads via $() exists in the
//       composed markup, so an id/markup fork fails here instead of at runtime.
//   R3  PRECONDITION — in the unwired state init() really does remove the data
//       region: #geoLegend absent, the notice present. A guard whose precondition
//       does not hold is a finding, not a pass.
//   R4  THE LIVE DEFECT — onThemeChange() in the unwired state does not throw.
//   R5  PLANTED POSITIVE — with the guard removed, R4's harness must throw the
//       production TypeError. An instrument that cannot go red is not evidence.
//
// Run: npx tsx test/public/_defense-spending-theme-flip.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { injectRail } from "../../src/lib/nav/rail";
import { injectDefenseTabs } from "../../src/lib/nav/defense-intel";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUB = path.join(process.cwd(), "public");
const APP_SRC = readFileSync(path.join(PUB, "dsb-app.js"), "utf8");
const DATA_SRC = readFileSync(path.join(PUB, "dsb-data.js"), "utf8");

// The page exactly as src/app/defense-spending/route.ts serves it.
const COMPOSED = injectDefenseTabs(
  injectRail(readFileSync(path.join(PUB, "defense-spending.html"), "utf8"), "defense-spending"),
  "spending"
);

// ── R1 ────────────────────────────────────────────────────────────────────────
console.log("\nR1  THE CONTAINER IS SERVED");
ok(COMPOSED.includes('id="geoLegend"'), "#geoLegend present in the composed page");

// ── R2 ────────────────────────────────────────────────────────────────────────
console.log("\nR2  EVERY LOOKUP RESOLVES");
const lookedUp = [...new Set([...APP_SRC.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))].sort();
ok(lookedUp.length > 20, "id census is non-empty", `${lookedUp.length} ids read via $()`);
const unresolved = lookedUp.filter((id) => !COMPOSED.includes(`id="${id}"`));
ok(unresolved.length === 0, "every $() target exists in the markup",
  unresolved.length ? `unresolved: ${unresolved.join(", ")}` : `${lookedUp.length}/${lookedUp.length} resolve`);

// ─────────────────────────────────────────────────────────────────────────────
// DOM SHIM. Models only what this page's unwired path touches, and its element set
// comes from COMPOSED — the ids are the real ids and the `.body` child partition is
// the real one, scanned from the markup rather than typed into a fixture.
// ─────────────────────────────────────────────────────────────────────────────

type Kid = { isHeader: boolean; ids: string[] };

/** Index-walking tag scanner. Deliberately not regex-driven: it has to respect
 *  quoted attribute values and skip the raw-text bodies of <script>/<style>. */
function scanBodyChildren(html: string): Kid[] | null {
  const OPEN = '<div class="body">';
  const start = html.indexOf(OPEN);
  if (start === -1) return null;

  const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "col", "area", "base", "embed", "track", "wbr"]);
  const kids: Kid[] = [];
  let depth = 0;
  let cur: Kid | null = null;
  let i = start + OPEN.length;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    // Walk to the tag's closing '>', honouring quoted attribute values.
    let j = lt + 1, quote = "";
    while (j < html.length) {
      const ch = html[j];
      if (quote) { if (ch === quote) quote = ""; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    if (j >= html.length) break;

    const raw = html.slice(lt + 1, j);          // tag body, no angle brackets
    i = j + 1;

    if (raw.startsWith("!")) continue;          // comment / doctype
    const isClose = raw.startsWith("/");
    const nameEnd = (() => {
      const s = isClose ? 1 : 0;
      let k = s;
      while (k < raw.length && /[a-zA-Z0-9-]/.test(raw[k])) k++;
      return k;
    })();
    const name = raw.slice(isClose ? 1 : 0, nameEnd).toLowerCase();
    if (!name) continue;
    const attrs = raw.slice(nameEnd);

    if (!isClose && (name === "script" || name === "style")) {
      const close = html.indexOf(`</${name}`, i);
      i = close === -1 ? html.length : close;
      continue;
    }

    const selfClosing = attrs.trimEnd().endsWith("/") || VOID.has(name);

    if (isClose) {
      if (depth === 0) break;                   // the </div> that closes .body
      depth--;
      if (depth === 0 && cur) { kids.push(cur); cur = null; }
      continue;
    }

    if (depth === 0) {
      if (selfClosing) continue;                // a void element as a direct child
      cur = { isHeader: attrs.includes("page-header"), ids: [] };
      depth = 1;
    } else if (!selfClosing) depth++;

    if (cur) {
      const at = attrs.indexOf(' id="');
      if (at !== -1) {
        const vs = at + 5;
        const ve = attrs.indexOf('"', vs);
        if (ve !== -1) cur.ids.push(attrs.slice(vs, ve));
      }
    }
  }
  return kids;
}

const bodyKids = scanBodyChildren(COMPOSED);

class Node {
  id: string | null;
  className: string;
  tag: string;
  children: Node[] = [];
  parent: Node | null = null;
  style: Record<string, string> = {};
  textContent = "";
  innerHTML = "";
  constructor(tag: string, id: string | null = null, className = "") {
    this.tag = tag; this.id = id; this.className = className;
  }
  appendChild(n: Node) { n.parent = this; this.children.push(n); return n; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  setAttribute(k: string, v: string) { if (k === "class") this.className = v; else if (k === "id") this.id = v; }
  getAttribute() { return null; }
  querySelector(sel: string): Node | null {
    const want = sel.replace(/^\./, "");
    for (const c of this.children) {
      if (c.className.split(/\s+/).includes(want)) return c;
      const d = c.querySelector(sel);
      if (d) return d;
    }
    return null;
  }
  querySelectorAll(): Node[] { return []; }
  addEventListener() {}
}

function buildDom() {
  const root = new Node("html");
  const docBody = new Node("body");
  root.appendChild(docBody);
  const bodyEl = new Node("div", null, "body");
  docBody.appendChild(bodyEl);

  const byId = new Map<string, Node>();
  for (const kid of bodyKids ?? []) {
    const k = new Node("div", null, kid.isHeader ? "page-header" : "panel");
    bodyEl.appendChild(k);
    for (const id of kid.ids) byId.set(id, k.appendChild(new Node("div", id)));
  }
  // Ids outside .body (rail, topbar) still resolve — nothing removes them.
  for (const m of COMPOSED.matchAll(/\bid="([^"]+)"/g)) {
    if (!byId.has(m[1])) byId.set(m[1], docBody.appendChild(new Node("div", m[1])));
  }

  /** A detached element resolves to null — precisely the production condition
   *  renderUnavailable() creates when it removes the data region. */
  const attached = (n: Node) => {
    let p: Node | null = n;
    while (p) { if (p === root) return true; p = p.parent; }
    return false;
  };

  const document = {
    documentElement: root,
    body: docBody,
    readyState: "complete",
    getElementById: (id: string) => { const n = byId.get(id); return n && attached(n) ? n : null; },
    querySelector: (sel: string) =>
      sel === ".body" ? (attached(bodyEl) ? bodyEl : null) : docBody.querySelector(sel),
    querySelectorAll: () => [],
    createElement: (t: string) => new Node(t),
    addEventListener: () => {},
  };

  return { document, bodyEl };
}

type RunResult = {
  loadError: Error | null;
  themeError: Error | null;
  legendAfterInit: boolean;
  noticeAfterInit: boolean;
};

/** Runs the real dsb-data.js + a (possibly patched) dsb-app.js, then a theme flip. */
function run(appSrc: string): RunResult {
  const { document, bodyEl } = buildDom();
  const out: RunResult = { loadError: null, themeError: null, legendAfterInit: false, noticeAfterInit: false };

  const win: Record<string, unknown> = { addEventListener: () => {} };
  const sandbox: Record<string, unknown> = {
    window: win,
    document,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    // init() fetches the state atlas; a never-settling promise keeps that async
    // branch out of this synchronous measurement without pretending it resolved.
    fetch: () => new Promise(() => {}),
    setTimeout: () => 0,
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  try {
    vm.runInContext(DATA_SRC, ctx, { filename: "dsb-data.js" });
    vm.runInContext(appSrc, ctx, { filename: "dsb-app.js" });
  } catch (e) { out.loadError = e as Error; }

  out.legendAfterInit = document.getElementById("geoLegend") !== null;
  out.noticeAfterInit = bodyEl.querySelector(".dsb-unavailable") !== null;

  const app = win.DSB_APP as { onThemeChange?: () => void } | undefined;
  try { app?.onThemeChange?.(); } catch (e) { out.themeError = e as Error; }
  return out;
}

const describe = (e: Error | null) => (e ? `${e.constructor.name}: ${e.message}` : "");

// ── R3 ────────────────────────────────────────────────────────────────────────
console.log("\nR3  PRECONDITION — the unwired state really removes the data region");
ok(bodyKids !== null && bodyKids.length > 1, ".body children scanned from the markup",
  bodyKids ? `${bodyKids.length} direct children, ${bodyKids.filter((k) => k.isHeader).length} page-header`
           : "scan failed — .body not found");
ok(DATA_SRC.includes("window.DSB.STATUS = { state: 'unwired'"),
  "dsb-data.js seeds STATUS unwired — the state this gate measures");

const fixed = run(APP_SRC);
ok(fixed.loadError === null, "the page's scripts load and init() completes", describe(fixed.loadError));
ok(fixed.noticeAfterInit, "renderUnavailable() painted the notice",
  fixed.noticeAfterInit ? "" : "no .dsb-unavailable — the unwired path did not run");
ok(!fixed.legendAfterInit, "#geoLegend is gone after init in the unwired state",
  fixed.legendAfterInit ? "still present — the guard's premise does not hold" : "removed with the data region");

// ── R4 ────────────────────────────────────────────────────────────────────────
console.log("\nR4  THE LIVE DEFECT — a theme flip must not throw");
ok(fixed.themeError === null, "onThemeChange() does not throw in the unwired state", describe(fixed.themeError));

// ── R5 ────────────────────────────────────────────────────────────────────────
console.log("\nR5  PLANTED POSITIVE — remove the guard, the harness must go red");
const GUARD = "if (!dsbHasData()) return;\n    renderLegend();";
const guardFound = APP_SRC.includes(GUARD);
ok(guardFound, "the guard is where the plant expects it",
  guardFound ? "" : "guard text moved — R5 would be inert; update the plant");
const planted = run(APP_SRC.replace(GUARD, "renderLegend();"));
const plantedMsg = describe(planted.themeError);
ok(planted.themeError !== null, "the unguarded source throws on a theme flip",
  plantedMsg || "NO THROW — the shim is inert and R4 proves nothing");
ok(/Cannot set propert(y|ies) of null/.test(plantedMsg), "and it is the production TypeError", plantedMsg);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
