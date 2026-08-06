// ─────────────────────────────────────────────────────────────────────────────
// Gate — WHAT SAM SAYS must not be cut by character count.
//
// The panel used to render `description.slice(0, 600)`. On a real notice that
// ended "...IAW the Revolutionary FAR Overhaul (RFO). The applic" — mid-word,
// with nothing on screen saying more existed. What it removed is the part of a
// notice that carries the scope, on the surface where someone decides whether to
// spend $1.25–1.50 auditing it.
//
// The whole description is now in the DOM and clamped by LINE in CSS, so it is
// never cut mid-word and stays findable with the browser's own search. This gate
// holds that: no character slice, a real clamp, and a "show more" that only
// appears when something is actually hidden.
//
// Run: npx tsx test/public/_opportunities-notice-text.test.ts
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
// Comments legitimately describe the defect; only CODE is searched for it.
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

console.log("\nA · the description is never cut by character count");
// The exact regression: any slice/substr/substring applied to the description.
ok(!/\.slice\(\s*0\s*,\s*\d+\s*\)/.test(
  (CODE.match(/function loadDescription\([\s\S]*?\n\}/) || [""])[0]),
  "loadDescription applies no character slice");
ok(!/d\.description[^;]*\.(slice|substr|substring)\(/.test(CODE),
  "the description value itself is never sliced anywhere");
ok(/slot\.textContent = d\.description\.replace\(\/\\s\+\/g, ' '\)/.test(DSO),
  "the WHOLE description is written to the DOM (whitespace collapsed only)");

console.log("\nB · it is clamped by LINE, in CSS");
ok(/\.pd-desc\{[^}]*-webkit-line-clamp:\s*\d+/.test(HTML), "a line clamp is declared");
ok(/\.pd-desc\{[^}]*overflow:hidden/.test(HTML), "the clamp actually hides the overflow");
ok(/\.pd-desc\.is-full\{[^}]*overflow:visible/.test(HTML), "expanding it reveals the rest");
ok(DSO.includes('class="pd-desc" data-desc'), "the description slot carries the clamp class");

console.log("\nC · 'show more' appears only when something is hidden");
let revealDescToggle: (card: any) => void;
class El {
  className = "";
  hidden = false;
  scrollHeight = 0;
  clientHeight = 0;
  textContent = "";
  private attrs: Record<string, string> = {};
  private classes = new Set<string>();
  classList = {
    remove: (c: string) => this.classes.delete(c),
    add: (c: string) => this.classes.add(c),
    contains: (c: string) => this.classes.has(c)
  };
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
}
try {
  const sandbox: any = { __out: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(DSO, "revealDescToggle"), sandbox);
  revealDescToggle = sandbox.__out.revealDescToggle;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — revealDescToggle(card) must stay a top-level function: ${e.message}\n`);
  process.exit(1);
}

function card(scrollH: number, clientH: number) {
  const slot = new El(); slot.scrollHeight = scrollH; slot.clientHeight = clientH;
  const btn = new El(); btn.hidden = false; btn.textContent = "show less";
  btn.setAttribute("aria-expanded", "true");
  slot.classList.add("is-full");
  return {
    slot, btn,
    querySelector: (s: string) => (s === "[data-desc]" ? slot : s === "[data-desc-more]" ? btn : null)
  };
}

const overflowing = card(400, 90);
revealDescToggle(overflowing);
ok(overflowing.btn.hidden === false, "a long description offers 'show more'");
ok(overflowing.btn.textContent === "show more", "the label resets to 'show more'");
ok(overflowing.slot.classList.contains("is-full") === false,
  "reopening a card re-collapses the text rather than reusing a stale expanded state");
ok(overflowing.btn.getAttribute("aria-expanded") === "false", "aria-expanded resets with it");

const exact = card(90, 90);
revealDescToggle(exact);
ok(exact.btn.hidden === true, "a description that already fits offers nothing");

// Sub-pixel line-height rounding must not conjure a control that does nothing.
const rounding = card(91, 90);
revealDescToggle(rounding);
ok(rounding.btn.hidden === true, "a 1px rounding difference does NOT offer 'show more'");

const justOver = card(140, 90);
revealDescToggle(justOver);
ok(justOver.btn.hidden === false, "a genuinely clipped description still offers it");

console.log("\nD · the control is wired and reachable");
ok(/data-desc-more/.test(CODE), "the toggle is rendered");
ok(/closest\('\[data-desc-more\]'\)/.test(CODE), "a delegated handler listens for it");
ok(/<button type="button" class="desc-more" data-desc-more aria-expanded="false" hidden>/.test(DSO),
  "it is a real button, hidden by default, carrying aria-expanded");
ok(/revealDescToggle\(card\)/.test(CODE), "revealDescToggle is CALLED after the text lands");
ok(/\.desc-more\[hidden\]\{display:none\}/.test(HTML),
  "the hidden attribute actually hides it (display:block would otherwise win)");

console.log("\nE · gate falsifiability (planted positive)");
// Plant the exact defect: offer the control unconditionally.
const planted: any = { __out: {}, console };
vm.createContext(planted);
vm.runInContext(
  extractFn(DSO, "revealDescToggle").replace(
    /btn\.hidden = [^;]+;/,
    "btn.hidden = false;"
  ),
  planted
);
const fits = card(90, 90);
planted.__out.revealDescToggle(fits);
ok(fits.btn.hidden === false,
  "a toggle that ignores the measurement IS caught by the C checks",
  "it would offer 'show more' on text that already fits");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
