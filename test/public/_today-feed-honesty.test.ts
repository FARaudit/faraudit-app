// Today (/today + /command-center) must not print a MEASURED-LOOKING ZERO for a
// SAM read that never answered.
// Run: npx tsx test/public/_today-feed-honesty.test.ts
//
// Written RED against the pre-fix files (2026-08-12). Driving the real page on the
// offline harness with the real feed-down payload, four components on ONE screen
// disagreed about the same fact:
//
//   rail pill      "Feed down"                                        ← correct
//   Week Ahead     "Deadlines unavailable"                            ← correct
//   KPI tile       "0"  ·  "matching your NAICS on SAM.gov"           ← a zero nobody measured
//   insight bar    "No live SAM.gov notices match your NAICS in the
//                   current window. Open the feed to widen it."       ← told the customer to
//                                                                       widen a window that
//                                                                       was never read
//
// Cause: every notice count is derived by filtering `opportunities`, which is []
// both for an empty window and for a failed read; and liveCount/deadlineSoon fell
// back to homeStats fields that count pending_audits rows — structurally zero since
// that queue froze. Rule 61 class: a failed dependency yields a visible failure
// state, never a success-shaped number.
//
// Part A EXECUTES the shipped cc-app.js in a vm against a DOM shim — the render
// decisions are checked by running them, not by matching prose near them.
// Part C plants the pre-fix expressions and asserts this suite goes RED, so a
// vacuous pass is impossible.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const PUBLIC = join(import.meta.dirname ?? __dirname, "..", "..", "public");
const SRC = join(import.meta.dirname ?? __dirname, "..", "..", "src");
const read = (p: string) => readFileSync(p, "utf8");

/* ── A minimal DOM, enough for cc-app.js's render pass to run end to end.
   Not a browser: every node records what was written to it, so the assertions read
   the bytes the page would have produced rather than a description of them. */
type Node = {
  id: string;
  innerHTML: string;
  textContent: string;
  className: string;
  style: Record<string, string>;
  children: Node[];
  hidden: boolean;
  querySelector: (s: string) => Node | null;
  querySelectorAll: (s: string) => Node[];
  appendChild: (n: Node) => Node;
  insertBefore: (n: Node, r: Node | null) => Node;
  remove: () => void;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  classList: { toggle: () => void; contains: () => boolean; add: () => void; remove: () => void };
  addEventListener: () => void;
  onclick: unknown;
  dataset: Record<string, string>;
};

function makeNode(id = ""): Node {
  const attrs: Record<string, string> = {};
  const n: Node = {
    id,
    innerHTML: "",
    textContent: "",
    className: "",
    style: {},
    children: [],
    hidden: false,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild(c) { n.children.push(c); return c; },
    insertBefore(c) { n.children.push(c); return c; },
    remove() {},
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k] ?? null; },
    classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} },
    addEventListener() {},
    onclick: null,
    dataset: {},
  };
  return n;
}

type Rendered = { kpis: Node; insight: Node; nodes: Map<string, Node> };

/** Runs public/cc-app.js with `live` as window.CC.LIVE and returns what it wrote. */
function render(ccAppSrc: string, live: unknown, extra?: Record<string, unknown>): Rendered {
  const nodes = new Map<string, Node>();
  const byId = (id: string): Node => {
    if (!nodes.has(id)) nodes.set(id, makeNode(id));
    return nodes.get(id)!;
  };
  const documentStub = {
    readyState: "complete",
    documentElement: makeNode("html"),
    getElementById: (id: string) => byId(id),
    querySelector: () => null,
    querySelectorAll: () => [] as Node[],
    createElement: () => makeNode(),
    addEventListener: () => {},
  };
  const sandbox: Record<string, unknown> = {
    document: documentStub,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    MutationObserver: class { observe() {} disconnect() {} },
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runInNewContext(ccAppSrc, sandbox, { filename: "cc-app.js" });

  const CC = sandbox.CC as Record<string, unknown>;
  CC.LIVE = live;
  if (extra) Object.assign(CC, extra);
  (sandbox.CC_APP as { render: () => void }).render();

  return { kpis: byId("kpiStrip"), insight: byId("insightBar"), nodes };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part A · the SHIPPED cc-app.js, executed ──");

const ccApp = read(join(PUBLIC, "cc-app.js"));

// The state that shipped the defect: the fetch succeeded, so LIVE exists, but the
// upstream SAM read did not answer, so every notice count is unknown.
const FEED_DOWN = {
  user: { firstName: "T", fullName: "T U", initials: "TU" },
  feedAvailable: false,
  liveCount: null,
  deadlineSoon: null,
  auditsThisMonth: 48,
  pipelineAvailable: true,
  pipelineTotal: 2,
  pipelineWeightedValue: null,
  auditTotal: 77,
  pipelineAtRisk: 0,
  agencyCount: null,
  nextDeadlineDays: null,
  feedNaics: null,
};
const CC_EXTRA = { FEED_ERROR: false, WEEK_SOURCED: false, WEEK_DROPPED: 0 };

const down = render(ccApp, FEED_DOWN, CC_EXTRA);
const downKpis = down.kpis.innerHTML;
const downInsight = down.insight.innerHTML;
const valsOf = (html: string) => [...html.matchAll(/<div class="kpi-val">([^<]*)</g)].map((m) => m[1].trim());

const tileVals = valsOf(downKpis);
check(
  "feed down · the two SAM-derived tiles show an em dash, not 0",
  tileVals.length >= 2 && tileVals[0] === "—" && tileVals[1] === "—",
  `tile values were ${JSON.stringify(tileVals)}`
);
// Defence in depth: even if a future route regression re-sends 0 alongside
// feedAvailable:false, the client must still refuse to print it. The client is the
// last place that can tell the customer the truth.
const downZero = render(ccApp, { ...FEED_DOWN, liveCount: 0, deadlineSoon: 0 }, CC_EXTRA);
const zeroVals = valsOf(downZero.kpis.innerHTML);
check(
  "feed down · a 0 arriving from the route is still rendered as an em dash",
  zeroVals[0] === "—" && zeroVals[1] === "—",
  `tile values were ${JSON.stringify(zeroVals)}`
);

check(
  "feed down · no tile foot claims a NAICS match",
  !downKpis.includes("matching your NAICS on SAM.gov"),
  "a tile still claims the count matched the customer's NAICS"
);
check(
  "feed down · a tile foot states the feed did not answer",
  downKpis.includes("did not answer"),
  "no tile says why its number is missing"
);
check(
  "feed down · the insight bar does not assert that nothing matched",
  !/No live SAM\.gov notices match/i.test(downInsight),
  "insight bar asserts a measured zero"
);
check(
  "feed down · the insight bar does not tell the customer to widen the window",
  !/widen it/i.test(downInsight),
  "insight bar instructs an action based on a read that never happened"
);
check(
  "feed down · the insight bar states the feed did not answer",
  /did not answer/i.test(downInsight),
  "insight bar does not name the outage"
);

// The answered case must be untouched: real numbers still render.
const FEED_UP = { ...FEED_DOWN, feedAvailable: true, liveCount: 166, deadlineSoon: 59, agencyCount: 10 };
const up = render(ccApp, FEED_UP, { FEED_ERROR: false, WEEK_SOURCED: true, WEEK_DROPPED: 0 });
const upVals = valsOf(up.kpis.innerHTML);
check(
  "feed answered · the same tiles still print their real counts",
  upVals[0] === "166" && upVals[1] === "59",
  `tile values were ${JSON.stringify(upVals)}`
);
check(
  "feed answered · the insight bar still names the live count",
  /166 live notice/.test(up.insight.innerHTML),
  "the answered branch regressed"
);

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part B · the route may not launder an outage into a zero ──");

const routeSrc = read(join(SRC, "app/api/command-center-data/route.ts"));

check(
  "route ships feedAvailable so the client can tell an outage from an empty window",
  /\bfeedAvailable\b/.test(routeSrc),
  "the client has no way to distinguish the two"
);
check(
  "liveCount has no homeStats fallback (live_sam_gov counts a frozen queue)",
  !/liveCount:[^\n]*homeStats/.test(routeSrc),
  "a failed read still falls back to a structural zero"
);
check(
  "deadlineSoon has no homeStats fallback (expiring_7d counts the same frozen queue)",
  !/deadlineSoon:[^\n]*homeStats/.test(routeSrc),
  "a failed read still falls back to a structural zero"
);

// The client mapper copies one field at a time, so a payload field with no mapper
// line is invisible however correct the route is.
const liveJs = read(join(PUBLIC, "command-center-live.js"));
check(
  "command-center-live.js maps feedAvailable onto window.CC.LIVE",
  /feedAvailable\s*:/.test(liveJs),
  "the route computes it and the page never receives it"
);

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part C · positive control — the pre-fix render must go RED ──");

// The exact expressions that shipped, restored. If this suite cannot fail on them
// it is not testing anything.
const PRE_FIX = ccApp
  .replace(
    "val: feedVal(L, L && L.liveCount),    unit: '',  foot: feedFoot(L, 'matching your NAICS on SAM.gov')",
    "val: L ? String(num(L.liveCount) ?? DASH) : DASH,    unit: '',  foot: L ? 'matching your NAICS on SAM.gov' : 'feed not loaded'"
  )
  .replace(/\} else if \(L\.feedAvailable === false\) \{[\s\S]*?\} else \{/, "} else {");

const controlChanged = PRE_FIX !== ccApp;
check("positive control actually restored the pre-fix code", controlChanged, "the replacement matched nothing — control is inert");

let controlRed = false;
if (controlChanged) {
  const preDown = render(PRE_FIX, { ...FEED_DOWN, liveCount: 0, deadlineSoon: 0 }, CC_EXTRA);
  const preVals = valsOf(preDown.kpis.innerHTML);
  controlRed =
    preVals[0] === "0" &&
    preDown.kpis.innerHTML.includes("matching your NAICS on SAM.gov") &&
    /No live SAM\.gov notices match/i.test(preDown.insight.innerHTML);
}
check(
  "positive control · the pre-fix render reproduces the zero AND the false claim",
  controlRed,
  "the shipped defect no longer reproduces — this suite would pass vacuously"
);

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
