// $0 STRUCTURAL gate for the Recompete Radar port.
//
// It checks the CONTRACT between the shipped markup and the shipped renderer —
// every id the renderer writes to must exist in the page, and every trace of the
// panel it replaced must be gone. It deliberately does NOT stand up a DOM: this
// repo's CI installs no browser, and a hand-rolled DOM shim is how a gate here
// ends up agreeing with the wrong thing. The RENDERED output is proven in a real
// browser against the live page; this file guards the wiring that a refactor
// silently breaks.
//
// Run: npx tsx test/public/_recompete-radar-render.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const ROOT = process.cwd();
const html = readFileSync(path.join(ROOT, "public/defense-spending.html"), "utf8");
const app = readFileSync(path.join(ROOT, "public/dsb-app.js"), "utf8");
// Comments are stripped before searching so no assertion can pass by matching
// the paragraph that explains it.
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function main() {
  // ── every id the renderer writes to must exist in the markup ──────────────
  const written = new Set<string>();
  for (const m of appCode.matchAll(/\$\('([a-zA-Z0-9_]+)'\)/g)) {
    // only ids the recompete renderer touches
    written.add(m[1]);
  }
  const RC_IDS = ["rcList", "bigN", "bigSay", "viz", "cap", "lede", "footL", "footR", "whSub"];
  for (const id of RC_IDS) {
    assert(html.includes(`id="${id}"`), `markup carries #${id}`);
    assert(written.has(id), `the renderer writes to #${id}`);
  }
  assert(/querySelector\('\.rc-head2'\)|\.rc-head2/.test(appCode),
    "the renderer controls the .rc-head2 focal block");

  // ── the panel it DISPLACED is gone, all three layers ──────────────────────
  for (const dead of ["rcQuarters", "rc-quarters", "rc-timeline", "rc-qhead", "rc-card"]) {
    assert(!html.includes(dead), `markup/CSS no longer references ${dead}`);
    assert(!appCode.includes(dead), `renderer no longer references ${dead}`);
  }
  assert(!html.includes("Awards ending within 180 days"),
    "the old 180-day subhead is gone — 85% of that window was never competable");

  // ── the CSS the new panel needs actually shipped ──────────────────────────
  for (const cls of ["rc-head2", "rc-big", "rc-say", "rc-list", "rc-row", "rc-when", "rc-val",
                     "rc-sub", "rc-foot", "rc-lede", "rc-none", "blk-h", "blk-n", "blk-v",
                     "blk-s", "cf-rows", "cf-rk", "cf-u", "sec"]) {
    // The rule must START with this selector. Matching the bare class name also
    // matched descendant rules like `.blk-v i`, so deleting `.blk-v{...}` left
    // the assertion green — it was satisfied by a DIFFERENT rule.
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }
  assert(/\.off\s*\{/.test(html), ".off exists — the renderer hides sections with it");

  // ── the honesty properties, asserted on the renderer itself ───────────────
  assert(/RECOMPETES_MEASURED/.test(appCode),
    "the renderer branches on RECOMPETES_MEASURED — a never-pulled column must not read as a quiet market");
  const unmeasured = appCode.indexOf("rcUnmeasured");
  const empty = appCode.indexOf("rcEmpty");
  assert(unmeasured > -1 && empty > -1 && unmeasured !== empty,
    "there are TWO distinct empty states, not one");
  assert(/365/.test(appCode) && /548/.test(appCode),
    "the window bounds are stated, so the empty state can name what it looked for");
  // Not merely "S.code appears" — it does, in the scope LABEL, so deleting the
  // filter left this green while the panel silently showed every code.
  assert(/\.filter\(\s*r\s*=>\s*!S\.code\s*\|\|\s*r\.naics\s*===\s*S\.code\s*\)/.test(appCode),
    "the ROW SET is filtered by the live NAICS pill, not just labelled with it");
  // Exact values, never banded: no thresholds invented about customer capacity.
  assert(!/under \$\d|could perform|your capacity/i.test(appCode),
    "no invented capacity threshold — the record holds nothing to derive one from");

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
