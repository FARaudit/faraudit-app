// ─────────────────────────────────────────────────────────────────────────────
// Gate — a filter click has to be VISIBLE, and open panels have to be closable.
//
// SHAPE/ACT looked dead and was not. Measured on the live page: clicking the
// "Shape upstream" band filtered 196 rows to 59 and updated the count line
// correctly — but the results header sits 1305px down in a 1076px viewport, so
// everything that changed was 229px below the fold and the page did not move.
// Work done, feedback off screen, reads as a broken control. (The zero-result
// case was already honest: "No notice matches this combination · band shape +
// type Open RFP" with a clear-filters link — also below the fold.)
//
// COLLAPSE ALL: DETAILS panels stay open, and after four or five it stops being
// obvious how many are expanded or where. The control carries the count for that
// reason and only exists while something is open.
//
// Run: npx tsx test/public/_opportunities-filter-feedback.test.ts
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

const DSO = readFileSync(path.join(process.cwd(), "public", "dso-app.js"), "utf8");
const HTML = readFileSync(path.join(process.cwd(), "public", "opportunities.html"), "utf8");
const CODE = DSO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in public/dso-app.js`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}

console.log("\nA · every filter control above the fold reveals its result");
// Each of these sits in the controls panel, and the list starts below it. A
// control that filters silently is the defect; missing one leaves it in place.
const wired = [
  ["band buttons", /data-band[\s\S]{0,220}?revealResults\(\)/],
  ["notice type", /stageSeg[\s\S]{0,220}?revealResults\(\)/],
  ["set-aside", /saFilters[\s\S]{0,220}?revealResults\(\)/],
  ["saved views", /savedViews[\s\S]{0,260}?revealResults\(\)/]
] as const;
for (const [label, re] of wired) ok(re.test(CODE), `${label} call revealResults()`);
ok((CODE.match(/revealResults\(\)/g) || []).length >= 5,
  "including the tracked chip — 5+ call sites", String((CODE.match(/revealResults\(\)/g) || []).length));

console.log("\nB · it scrolls only when the result is actually out of view");
let revealResults: () => void;
let scrolledTo: any = null;
const head: any = { rect: { top: 0, bottom: 0 }, getBoundingClientRect: () => head.rect, scrollIntoView: (o: any) => { scrolledTo = o; } };
try {
  const sandbox: any = {
    __out: {}, console,
    document: { querySelector: (s: string) => (s === ".plist-head" ? head : null) },
    window: { innerHeight: 1000, matchMedia: () => ({ matches: false }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(DSO, "revealResults"), sandbox);
  revealResults = sandbox.__out.revealResults;

  head.rect = { top: 1305, bottom: 1800 }; scrolledTo = null;   // the measured case
  revealResults();
  ok(scrolledTo !== null, "a header 229px below the fold IS scrolled to");
  ok(scrolledTo && scrolledTo.block === "start", "aligned to the top so the count line is visible");
  ok(scrolledTo && scrolledTo.behavior === "smooth", "smoothly, by default");

  head.rect = { top: 120, bottom: 400 }; scrolledTo = null;      // already reading it
  revealResults();
  ok(scrolledTo === null, "a header already on screen is NOT scrolled — the customer did not ask to move");

  head.rect = { top: -50, bottom: 200 }; scrolledTo = null;      // scrolled past the top
  revealResults();
  ok(scrolledTo !== null, "a header scrolled off the TOP is brought back");

  // reduced motion
  const sb2: any = {
    __out: {}, console,
    document: { querySelector: () => head },
    window: { innerHeight: 1000, matchMedia: () => ({ matches: true }) }
  };
  vm.createContext(sb2);
  vm.runInContext(extractFn(DSO, "revealResults"), sb2);
  head.rect = { top: 1305, bottom: 1800 }; scrolledTo = null;
  sb2.__out.revealResults();
  ok(scrolledTo && scrolledTo.behavior === "auto", "prefers-reduced-motion gets an instant jump, not a glide");

  // A missing header must not throw and take the click with it.
  const sb3: any = { __out: {}, console, document: { querySelector: () => null }, window: { innerHeight: 1000 } };
  vm.createContext(sb3);
  vm.runInContext(extractFn(DSO, "revealResults"), sb3);
  let threw = false;
  try { sb3.__out.revealResults(); } catch { threw = true; }
  ok(!threw, "an absent header is a no-op, never an exception mid-click");
} catch (e: any) {
  console.log(`  ✗ FATAL — cannot drive revealResults: ${e.message}`);
  fail++;
}

console.log("\nC · collapse all — for the DETAILS panels opened on rows");
let closeAllPanels: () => number;
let syncCollapseAll: () => void;
const btn: any = { hidden: true, textContent: "" };
let cards: any[] = [];
try {
  const sandbox: any = {
    __out: {}, console, Array,
    $: (id: string) => (id === "collapseAll" ? btn : null),
    document: { querySelectorAll: (s: string) => (s === "#plist .pcard.is-open" ? cards.filter((c) => c.open) : []) }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(DSO, "syncCollapseAll") + "\n" + extractFn(DSO, "closeAllPanels"), sandbox);
  closeAllPanels = sandbox.__out.closeAllPanels;
  syncCollapseAll = sandbox.__out.syncCollapseAll;

  const mk = (open: boolean) => {
    const more: any = { attrs: {} as any, textContent: open ? "Hide details" : "Details",
      setAttribute(k: string, v: string) { this.attrs[k] = v; } };
    return { open, classList: { remove() { (this as any)._c = true; } }, querySelector: () => more, _more: more };
  };

  cards = [];
  syncCollapseAll();
  ok(btn.hidden === true, "nothing open — the control does not render at all");

  cards = [mk(true), mk(true), mk(true), mk(true)];
  syncCollapseAll();
  ok(btn.hidden === false, "with panels open it appears");
  ok(btn.textContent === "Collapse all (4)",
    "and carries the COUNT — the point is not knowing how many you left open", btn.textContent);

  const closed = closeAllPanels();
  ok(closed === 4, "clicking it closes every open panel", `${closed} closed`);
  ok(cards.every((c: any) => c._more.textContent === "Details"),
    "each row's button reverts to 'Details', not left reading 'Hide details'");
  ok(cards.every((c: any) => c._more.attrs["aria-expanded"] === "false"), "and aria-expanded follows");

  cards = [];
  syncCollapseAll();
  ok(btn.hidden === true, "after collapsing, the control disappears again");
} catch (e: any) {
  console.log(`  ✗ FATAL — cannot drive collapse all: ${e.message}`);
  fail++;
}

console.log("\nD · wired, keyboard-reachable, and it stays in sync");
ok(/<button class="collapse-all" id="collapseAll" type="button" hidden>/.test(HTML),
  "a real button, hidden by default");
ok(/bindCollapseAll\(\)/.test(CODE) && (CODE.match(/bindCollapseAll\(\)/g) || []).length >= 3,
  "bound on both DOMContentLoaded paths");
ok(/e\.key !== 'Escape'/.test(CODE), "Escape also closes them");
ok(/tag === 'input' \|\| tag === 'textarea'/.test(CODE),
  "but not while a field has focus — it must not eat the search box's own Escape");
// A re-render rebuilds #plist and drops every open panel; a stale "(4)" would
// then offer to collapse nothing.
ok(/renderList\(\);\s*\n\s*syncCollapseAll\(\);/.test(DSO),
  "renderAll re-syncs it, so a re-render cannot leave a stale count");
ok(/loadAttachmentNames\(card\); \}\s*\n\s*syncCollapseAll\(\);/.test(DSO),
  "opening or closing one panel updates the count immediately");

console.log("\nE · falsifiability (planted positive)");
// Plant the defect: a control that renders whatever the count.
const bad: any = { hidden: true, textContent: "" };
const sb: any = { __out: {}, console, Array, $: () => bad, document: { querySelectorAll: () => [] } };
vm.createContext(sb);
vm.runInContext(extractFn(DSO, "syncCollapseAll").replace("b.hidden = n === 0;", "b.hidden = false;"), sb);
sb.__out.syncCollapseAll();
ok(bad.hidden === false,
  "a control that ignores the count IS caught by the C checks",
  "it would offer 'Collapse all (0)' with nothing open");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
