// ─────────────────────────────────────────────────────────────────────────────
// DEFENSE SPENDING · FEED LIFECYCLE GATE — loading → ok → failure, and a theme
// flip in each state.
//
// WHAT THIS GUARDS. `renderUnavailable()` removes every child of `.body` except
// `.page-header`, and there is no path that puts them back. Two defects live in
// that one fact, and this gate holds both closed:
//
//   (1) A THEME FLIP INTO A STRIPPED DOM. `onThemeChange()` re-runs every
//       renderer so each re-reads its colours; against a removed `#geoLegend`
//       that dereferenced null on every flip.
//
//   (2) A SUCCESSFUL RESPONSE ARRIVING AT A STRIPPED DOM. When the pre-fetch
//       status was seeded `unwired`, the strip ran at DOMContentLoaded — before
//       the feed had answered. The first `ok` payload then rendered into panels
//       that no longer existed. Measured, not predicted: stubbing the route to
//       `{state:"ok"}` threw `TypeError: Cannot read properties of null
//       (reading 'clientWidth')`. The page was therefore pre-broken against its
//       own success path, which no test could see while the feed never answered.
//
// THE INVARIANT, stated once: the data region is removed ONLY for a SETTLED
// failure. The pre-fetch state draws nothing and removes nothing, so a success
// always has a DOM to fill.
//
// WHY THERE IS NO BROWSER HERE. CI runs `npm ci` only; a chromium download is
// not guaranteed, and a gate that silently skips on a missing browser gates
// nothing. So the page's real bytes run in a `vm` sandbox against a DOM shim
// whose element set is DERIVED FROM THE COMPOSED HTML — not from a fixture
// someone typed. R7 proves the shim is faithful by planting each defect back
// into a copy of the source and requiring the failure to reappear.
//
//   R1  THE CONTAINER IS SERVED — #geoLegend survives injectRail + injectDefenseTabs.
//   R2  EVERY LOOKUP RESOLVES — every id dsb-app.js reads via $() exists in the
//       composed markup, so an id/markup fork fails here instead of at runtime.
//   R3  THE PRE-FETCH STATE IS INERT — nothing removed, no notice painted.
//   R4  A SUCCESSFUL PAYLOAD RENDERS — defect (2). render() completes and the
//       panels are still attached afterwards.
//   R5  A SETTLED FAILURE STILL STRIPS — the honest-fail path is not weakened.
//   R6  THEME FLIPS DO NOT THROW — defect (1), in all three states.
//   R7  PLANTED POSITIVES — re-seed 'unwired' and the success path must break;
//       remove the theme guard and the flip must throw. An instrument that
//       cannot go red is not evidence.
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
ok(lookedUp.length > 15, "id census is non-empty", `${lookedUp.length} ids read via $()`);
/* ⛔ /who-to-call NO LONGER MOUNTS THIS SCRIPT. It renders one document through wtc-app.js, so the
   three panels that used to live there — Primes who owe a subcontracting plan, Room left on
   contracts already awarded, and Recompete Radar — have no host on any page. Their renderers are
   RETAINED in dsb-app.js and each returns early on a missing host, so nothing throws.

   The set is ENUMERATED rather than tolerated by a rule. A blanket "ignore anything unresolved"
   would swallow the next genuine typo, which is what this assertion exists to catch. Every id below
   is checked BOTH ways: it must be absent from the markup (a host that reappears means a panel was
   remounted and this list is stale) and it must still be read by the script (an id that stops being
   read means the renderer went and the entry is dead). */
const WTC = injectRail(readFileSync(path.join(PUB, "who-to-call.html"), "utf8"), "who-to-call");
const MOUNTED = COMPOSED + "\n" + WTC;

/* Primes and Ceilings are mounted again on /who-to-call; only the Recompete Radar WIDGET stays
   unmounted, because the same RECOMPETES array is now rendered as sections 01-03 of the document
   there. Its renderer is retained, so both halves below still have a subject. */
const UNMOUNTED = ["bigN", "bigSay", "footL", "footR", "lede", "rcList", "whSub"];

const remounted = UNMOUNTED.filter((id) => MOUNTED.includes(`id="${id}"`));
ok(remounted.length === 0, "the unmounted panel hosts are still absent from every page",
  remounted.length ? `back in the markup, update this list: ${remounted.join(", ")}`
    : `${UNMOUNTED.length} ids accounted for`);

const staleEntries = UNMOUNTED.filter((id) => !lookedUp.includes(id));
ok(staleEntries.length === 0, "…and every one of them is still read by the script",
  staleEntries.length ? `no longer read, drop from this list: ${staleEntries.join(", ")}`
    : "no dead entries");

const unresolved = lookedUp.filter(
  (id) => !MOUNTED.includes(`id="${id}"`) && !UNMOUNTED.includes(id));
ok(unresolved.length === 0, "every other $() target exists on a page that mounts this script",
  unresolved.length ? `unresolved: ${unresolved.join(", ")}`
    : `${lookedUp.length - UNMOUNTED.length} of ${lookedUp.length} resolve, ${UNMOUNTED.length} unmounted`);

// ─────────────────────────────────────────────────────────────────────────────
// DOM SHIM. Models only what this page touches, and its element set comes from
// COMPOSED — the ids are the real ids and the `.body` child partition is the
// real one, scanned from the markup rather than typed into a fixture.
// ─────────────────────────────────────────────────────────────────────────────

type Kid = { isHeader: boolean; ids: Array<{ id: string; tag: string }> };

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

    /* ⛔ A COMMENT IS NOT A TAG, and treating it as one is how this scanner
       lied. It stepped to the first ">" and then quote-tracked what it found,
       so a single apostrophe inside a comment — "the panel's header" — opened a
       quote that ran past the "-->" and swallowed the markup after it. The scan
       returned 3 of the page's 8 body children, R2 still printed a tick because
       it only checks the count is above one, and R5/R7 went on asserting things
       about a DOM missing most of the page. A comment ends at "-->", full stop. */
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }

    let j = lt + 1, quote = "";
    while (j < html.length) {
      const ch = html[j];
      if (quote) { if (ch === quote) quote = ""; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    if (j >= html.length) break;

    const raw = html.slice(lt + 1, j);
    i = j + 1;

    if (raw.startsWith("!")) continue;
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
      if (depth === 0) break;
      depth--;
      if (depth === 0 && cur) { kids.push(cur); cur = null; }
      continue;
    }

    if (depth === 0) {
      if (selfClosing) continue;
      cur = { isHeader: attrs.includes("page-header"), ids: [] };
      depth = 1;
    } else if (!selfClosing) depth++;

    if (cur) {
      const at = attrs.indexOf(' id="');
      if (at !== -1) {
        const vs = at + 5;
        const ve = attrs.indexOf('"', vs);
        // The TAG matters, not just the id: setHTML() keys its table context off
        // tagName, so a shim that made every node a <div> could never exercise
        // the path a <tbody> takes.
        if (ve !== -1) cur.ids.push({ id: attrs.slice(vs, ve), tag: name });
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
  dataset: Record<string, string> = {};
  textContent = "";
  constructor(tag: string, id: string | null = null, className = "") {
    this.tag = tag; this.id = id; this.className = className;
  }
  get childNodes() { return this.children.slice(); }
  /** Real elements expose an UPPERCASE tagName, and setHTML() keys its table
   *  context off it. A shim without it leaves that lookup undefined, which
   *  silently sends every insertion down the no-context path. */
  get tagName() { return this.tag.toUpperCase(); }
  get classList() {
    const self = this;
    const parts = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add: (c: string) => { if (!parts().includes(c)) self.className = (self.className + " " + c).trim(); },
      remove: (c: string) => { self.className = parts().filter((p) => p !== c).join(" "); },
      toggle: (c: string, on?: boolean) => { if (on) self.classList.add(c); else self.classList.remove(c); },
      contains: (c: string) => parts().includes(c)
    };
  }
  appendChild(n: Node) { n.parent = this; this.children.push(n); return n; }
  replaceChildren(...nodes: Node[]) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    for (const n of nodes) this.appendChild(n);
  }
  replaceWith(n: Node) {
    if (!this.parent) return;
    const idx = this.parent.children.indexOf(this);
    n.parent = this.parent;
    this.parent.children.splice(idx, 1, n);
    this.parent = null;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  setAttribute(k: string, v: string) { if (k === "class") this.className = v; else if (k === "id") this.id = v; }
  getAttribute() { return null; }
  querySelector(sel: string): Node | null {
    const byClass = sel.startsWith(".");
    const want = sel.replace(/^\./, "");
    for (const c of this.children) {
      if (byClass ? c.className.split(/\s+/).includes(want) : c.tag === want) return c;
      const d = c.querySelector(sel);
      if (d) return d;
    }
    return null;
  }
  querySelectorAll(): Node[] { return []; }
  addEventListener() {}
}

/** A chainable stand-in for d3. Every property is itself callable and returns
 *  the same object, and it coerces to 1 so arithmetic on a scale's output stays
 *  finite. It measures nothing — this gate is about which nodes exist when, not
 *  about pixels. */
function makeChain(): unknown {
  const target = function () { /* callable */ } as unknown as Record<string | symbol, unknown>;
  const proxy: unknown = new Proxy(target, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => 1;
      if (k === "valueOf") return () => 1;
      if (k === "toString") return () => "1";
      if (k === "then") return undefined;     // never mistake this for a promise
      return proxy;
    },
    apply() { return proxy; }
  });
  return proxy;
}

type RunResult = {
  loadError: Error | null;
  renderError: Error | null;
  themeError: Error | null;
  legendAttached: boolean;
  noticePainted: boolean;
  recipientRows: number;
  /** renderAll() passes counted AFTER the theme flip — 0 means the guard held. */
  passesAfterFlip: number;
};

/** A minimal but SHAPED payload: three fiscal years, one tracked code, one
 *  state, one agency, one recipient, one recompete. Every field the renderers
 *  read is present, so a render that throws here throws on shape, not on a
 *  field this fixture forgot. */
const OK_PAYLOAD = {
  FYS: ["FY2024", "FY2025", "FY2026"],
  BY_FY: Object.fromEntries(["FY2024", "FY2025", "FY2026"].map((fy) => [fy, {
    kpis: [{ label: "Obligated", val: "8.37", unit: "B", sub: "1 tracked code", delta: "+4.0%", tone: "accent", spark: [1, 2, 3] }],
    states: { "48": { abbr: "TX", name: "Texas", val: 3946.6, yoy: 12.4 } },
    agencies: [{ key: "department-of-defense", short: "DoD", name: "Department of Defense", val: 19573.4, naics: { "336412": 19573.4 } }],
    // TWO recipients, not one. With a single row the count cannot tell a filled
    // tbody from a tbody holding one discarded-and-rewrapped table node.
    incumbents: [
      { name: "GENERAL ELECTRIC COMPANY", val: 1059.48, naics: "336412", sb: false },
      { name: "RTX CORPORATION", val: 664.83, naics: "336412", sb: false }
    ]
  }])),
  MARKET_TREND: { labels: ["FY2024", "FY2025", "FY2026"], series: { "336412": [8370, 12020, 2560] } },
  RECOMPETES: [{ agency: "U.S. Coast Guard", amount: 15261, award_id: "70Z03826PF0000296", end_date: "2026-08-19", recipient: "TECHNETICS GROUP LLC", naics: "336412", expired: true }],
  AGENCY_FILTERS: [{ key: "all", label: "All" }, { key: "department-of-defense", label: "DoD" }],
  coverage: { requested: ["332710", "336412", "336611"], tracked: ["336412"], untracked: ["332710", "336611"], top_n: 10 },
  as_of: "2026-05-20T05:36:32.881704+00:00",
  unsupported: [
    { panel: "opportunity-matrix", needs: "the number of firms competing per segment" },
    { panel: "budget-trajectory", needs: "the enacted DoD topline by year" },
    { panel: "pricing", needs: "award-level contract values" },
    { panel: "ndaa", needs: "the NDAA provision text" }
  ]
};

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
    for (const { id, tag } of kid.ids) byId.set(id, k.appendChild(new Node(tag, id)));
  }
  // Ids outside .body (rail, topbar) still resolve — nothing removes them.
  for (const m of COMPOSED.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*\bid="([^"]+)"/g)) {
    if (!byId.has(m[2])) byId.set(m[2], docBody.appendChild(new Node(m[1].toLowerCase(), m[2])));
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

  return { document, bodyEl, attached, byId };
}

/** Loads the real dsb-data.js + a (possibly patched) dsb-app.js, optionally
 *  settles the feed to `settle`, then flips the theme. */
function run(appSrc: string, settle: "none" | "ok" | "unwired", dataSrc = DATA_SRC): RunResult {
  const { document, bodyEl, attached, byId } = buildDom();
  const out: RunResult = { loadError: null, renderError: null, themeError: null, legendAttached: false, noticePainted: false, recipientRows: 0, passesAfterFlip: 0 };

  const win: Record<string, unknown> = { addEventListener: () => {}, innerWidth: 1440 };
  /** Models ONE rule of the real HTML parser, because that rule caused a real
   *  defect: a `<tr>` at the top level of a parsed fragment is DISCARDED — it
   *  survives only inside a table. A shim that returned a node for every input
   *  reported a populated recipients table while production rendered an empty
   *  one, which is a probe agreeing with something other than the thing it
   *  names. Everything else parses to one node per top-level tag; this gate is
   *  about which nodes exist, not about markup fidelity. */
  class DOMParserShim {
    parseFromString(raw: string) {
      const body = new Node("body");
      // setHTML() hands us a full document string; the fragment it cares about
      // is what sits inside <body>.
      const html = raw.replace(/^\s*<body>/i, "").replace(/<\/body>\s*$/i, "");
      const first = (html.match(/<([a-zA-Z][a-zA-Z0-9]*)/) || [])[1]?.toLowerCase();
      const rows = (html.match(/<tr\b/gi) || []).length;
      if (first === "table") {
        const tbody = body.appendChild(new Node("table")).appendChild(new Node("tbody"));
        for (let i = 0; i < rows; i++) tbody.appendChild(new Node("tr"));
      } else {
        const kept = html.replace(/<tr\b[\s\S]*?<\/tr>/gi, "");   // the discarded rows
        const n = (kept.match(/<[a-zA-Z]/g) || []).length;
        for (let i = 0; i < n; i++) body.appendChild(new Node("span"));
      }
      return { body, querySelector: (sel: string) => body.querySelector(sel) };
    }
  }
  const sandbox: Record<string, unknown> = {
    window: win,
    document,
    DOMParser: DOMParserShim,
    d3: makeChain(),
    topojson: makeChain(),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    // The state atlas fetch never settles: that async branch stays out of this
    // synchronous measurement rather than being pretended to have resolved.
    fetch: () => new Promise(() => {}),
    setTimeout: () => 0,
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  try {
    vm.runInContext(dataSrc, ctx, { filename: "dsb-data.js" });
    vm.runInContext(appSrc, ctx, { filename: "dsb-app.js" });
  } catch (e) { out.loadError = e as Error; }

  const DSB = win.DSB as Record<string, unknown> | undefined;
  const app = win.DSB_APP as { render?: () => void; onThemeChange?: () => void } | undefined;

  if (settle !== "none" && DSB) {
    if (settle === "ok") {
      Object.assign(DSB, OK_PAYLOAD);
      DSB.STATUS = { state: "ok", reason: "" };
    } else {
      DSB.STATUS = { state: "unwired", reason: "no source" };
    }
    try { app?.render?.(); } catch (e) { out.renderError = e as Error; }
  }

  const legend = byId.get("geoLegend");
  out.legendAttached = !!legend && attached(legend);
  out.noticePainted = bodyEl.querySelector(".dsb-unavailable") !== null;
  const tbody = byId.get("iiBody");
  out.recipientRows = tbody && attached(tbody) ? tbody.children.length : 0;

  // Zeroed FIRST so only passes caused by the flip are counted — render() above
  // legitimately runs one, and counting it would make every case look unguarded.
  win.__passes = 0;
  try { app?.onThemeChange?.(); } catch (e) { out.themeError = e as Error; }
  out.passesAfterFlip = Number(win.__passes) || 0;
  return out;
}

const describe = (e: Error | null) => (e ? `${e.constructor.name}: ${e.message}` : "");

/* ⛔ A COUNT ABOVE ONE IS NOT A COMPLETE SCAN. This assertion used to be
   `length > 1`, and it printed a tick while the scanner was stopping a third of
   the way down the page — every check below it was then reasoning about a DOM
   that was missing five of eight panels. The scan is complete only if every id
   inside the .body markup came back with it. */
const BODY_REGION = (() => {
  const a = COMPOSED.indexOf('<div class="body">');
  const b = COMPOSED.indexOf("</main>", a);
  return a === -1 || b === -1 ? "" : COMPOSED.slice(a, b);
})();
const bodyIds = [...new Set([...BODY_REGION.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
const scannedIds = new Set((bodyKids ?? []).flatMap((k) => k.ids.map((x) => x.id)));
const dropped = bodyIds.filter((id) => !scannedIds.has(id));
ok(bodyIds.length > 5, "the .body markup carries a real set of ids", `${bodyIds.length}`);
ok(dropped.length === 0, "the scan reached EVERY id in the .body markup",
  dropped.length ? `stopped early — never registered: ${dropped.join(", ")}` : `${bodyIds.length} ids`);
ok(bodyKids !== null && bodyKids.length > 1, ".body children scanned from the markup",
  bodyKids ? `${bodyKids.length} direct children, ${bodyKids.filter((k) => k.isHeader).length} page-header`
           : "scan failed — .body not found");

// ── R3 ────────────────────────────────────────────────────────────────────────
console.log("\nR3  THE PRE-FETCH STATE IS INERT");
ok(DATA_SRC.includes("state: 'loading'"),
  "dsb-data.js seeds STATUS 'loading' — not a verdict the feed has not delivered");
const pending = run(APP_SRC, "none");
ok(pending.loadError === null, "the page's scripts load", describe(pending.loadError));
ok(pending.legendAttached, "#geoLegend is STILL ATTACHED before the feed answers",
  pending.legendAttached ? "" : "removed pre-fetch — a success would have nothing to render into");
ok(!pending.noticePainted, "no failure notice is painted before the feed answers");

// ── R4 ────────────────────────────────────────────────────────────────────────
console.log("\nR4  A SUCCESSFUL PAYLOAD RENDERS — the pre-broken success path");
const settled = run(APP_SRC, "ok");
ok(settled.loadError === null, "scripts load", describe(settled.loadError));
ok(settled.renderError === null, "render() completes on a state:'ok' payload", describe(settled.renderError));
ok(settled.legendAttached, "#geoLegend survives the successful render");
ok(!settled.noticePainted, "no failure notice on the success path");
// The recipients panel is a <tbody>, and a <tr> parsed outside a table is
// DISCARDED — so a renderer that ignores the table context fills nothing while
// every other panel looks fine.
ok(settled.recipientRows === OK_PAYLOAD.BY_FY.FY2026.incumbents.length,
  "the recipients <tbody> receives one row per recipient",
  `${settled.recipientRows} row(s) for ${OK_PAYLOAD.BY_FY.FY2026.incumbents.length} recipient(s)`);

// ── R5 ────────────────────────────────────────────────────────────────────────
console.log("\nR5  A SETTLED FAILURE STILL STRIPS — honest-fail is not weakened");
const failed = run(APP_SRC, "unwired");
ok(failed.renderError === null, "render() completes on a failure payload", describe(failed.renderError));
ok(failed.noticePainted, "renderUnavailable() painted the notice",
  failed.noticePainted ? "" : "no .dsb-unavailable — the failure path did not run");
ok(!failed.legendAttached, "#geoLegend is gone with the data region");

// ── R6 ────────────────────────────────────────────────────────────────────────
console.log("\nR6  THEME FLIPS DO NOT THROW");
ok(pending.themeError === null, "flip before the feed answers", describe(pending.themeError));
ok(settled.themeError === null, "flip after a successful render", describe(settled.themeError));
ok(failed.themeError === null, "flip after a settled failure", describe(failed.themeError));

// ── R7 ────────────────────────────────────────────────────────────────────────
console.log("\nR7  PLANTED POSITIVES — each defect put back must reappear");

// (2) Re-seed the pre-fetch status to 'unwired', which is what made the strip run
//     before the feed answered. The success path must then break.
const REGRESSED_DATA = DATA_SRC.replace("state: 'loading'", "state: 'unwired'");
ok(REGRESSED_DATA !== DATA_SRC, "the seed plant applied",
  REGRESSED_DATA === DATA_SRC ? "seed text moved — this plant is inert" : "");
const preStripped = run(APP_SRC, "ok", REGRESSED_DATA);
ok(preStripped.renderError !== null || !preStripped.legendAttached,
  "seeding 'unwired' breaks the success path — the harness can see defect (2)",
  preStripped.renderError ? describe(preStripped.renderError)
    : (preStripped.legendAttached ? "NO BREAK — R4 proves nothing" : "panels stripped before the payload arrived"));

// (1) Remove the theme guard. A flip into the stripped DOM must RUN THE RENDERERS.
//
// ⛔ THIS ASSERTED A THROW, AND THE THROW IS GONE ON PURPOSE. Every renderer now
// returns when its host is absent, because dsb-app.js mounts on more than one page
// and a page carrying only some hosts must get only those panels rather than a
// stack trace. That made the page robust and this plant inert — it would have gone
// on "passing" by asserting an exception that can no longer happen.
//
// The INVARIANT never was about exceptions: after honest-fail has replaced the data
// region, a theme flip must not re-run the renderers, because re-running them is
// what repaints a dead page. So the plant asserts the thing that actually goes
// wrong — the guarded source performs NO render pass on a flip into a stripped DOM,
// and the unguarded one performs one.
const GUARD = "if (dsbState() !== 'ok' || !built) return;";
const guardFound = APP_SRC.includes(GUARD);
ok(guardFound, "the theme guard is where the plant expects it",
  guardFound ? "" : "guard text moved — this plant is inert; update it");
const COUNT_MARK = "function renderAll() {";
ok(APP_SRC.includes(COUNT_MARK), "renderAll() is where the counter splices in");
const counted = (src: string) =>
  src.replace(COUNT_MARK, COUNT_MARK + " window.__passes = (window.__passes || 0) + 1;");
const guardedPasses = run(counted(APP_SRC), "unwired").passesAfterFlip;
const unguardedPasses = run(counted(APP_SRC.replace(GUARD, "")), "unwired").passesAfterFlip;
ok(guardedPasses === 0,
  "the GUARDED source runs NO render pass on a flip into a stripped DOM", `${guardedPasses} pass(es)`);
ok(unguardedPasses > 0, "the unguarded source DOES run one — the guard is load-bearing",
  unguardedPasses > 0 ? `${unguardedPasses} pass(es)` : "NO PASS — the plant is inert and R6 proves nothing");

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
