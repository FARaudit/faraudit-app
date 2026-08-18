// /today may not print text below the 11px type floor.
// Run: npx tsx test/public/_today-type-floor.test.ts
//
// The page predated the floor every other tab was held to: 39 declarations sat
// between 8px and 10.5px, including the date eyebrow, the "Need Action" labels, the
// desk and urgency tags and the whole week strip. An 11px label on a faint ink looks
// more legible than it is; a 8.5px one is not legible at all.
//
// TWO SURFACES. today.html carries the page, and notifications-chrome.js injects the
// notification panel into it — the count badge lived there and survived a sweep of
// the page alone.
//
// OUT OF SCOPE, DELIBERATELY: the rail (.sb-*) is injected into EVERY tab, so raising
// it is a platform-wide change with platform-wide verification, not this page's.
//
// Part P plants a sub-floor rule back and asserts this suite goes red.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const HTML = readFileSync(join(ROOT, "public", "today.html"), "utf8");
const PANEL = readFileSync(join(ROOT, "public", "notifications-chrome.js"), "utf8");

/** Rules declaring type below the floor, excluding the shared rail and SVG chart text. */
function subFloor(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (/\.sb-|data-sb=/.test(sel)) continue;          // rail — every tab, not this one
    if (/scatter-svg/.test(sel)) continue;              // chart text, its own collision rules
    for (const f of m[2].matchAll(/font-size:\s*([0-9.]+)px/g)) {
      if (parseFloat(f[1]) < 11) out.push(`${sel} @${f[1]}px`);
    }
  }
  return out;
}

console.log("── the page ──");
const pageBad = subFloor(HTML);
check("no rule on today.html sizes text below 11px",
  pageBad.length === 0, `${pageBad.length}: ${pageBad.slice(0, 5).join(" · ")}`);

console.log("── and the panel injected into it ──");
const panelBad = subFloor(PANEL);
check("no rule in the notification panel sizes text below 11px",
  panelBad.length === 0, `${panelBad.length}: ${panelBad.slice(0, 5).join(" · ")}`);
// The panel is a separate file loaded by the page; a sweep of the page alone missed
// its count badge, which rendered at 10px on a floor-compliant page.
check("the panel is actually swept (its rules were found)",
  /\.np-count\{/.test(PANEL) && /\.np-time\{/.test(PANEL),
  "the panel's CSS moved — this gate is checking nothing");

console.log("── the rail is untouched, on purpose ──");
check("the shared rail keeps its own sizes",
  /\.sb-group-label\{[^}]*font-size:9px/.test(HTML) || /data-sb="open"\] \.sb-group-label\{[^}]*font-size:9px/.test(HTML),
  "the rail was swept with the page — that is a platform-wide change");

console.log("── Part P · positive controls ──");
const controls: Array<[string, string, (s: string) => boolean]> = [
  ["a page label drops back under the floor",
    HTML.replace(".eyebrow{font-family:\"IBM Plex Mono\",monospace;font-size:11px",
                 ".eyebrow{font-family:\"IBM Plex Mono\",monospace;font-size:10px"),
    (s) => subFloor(s).length > 0],
  ["the panel's count badge drops back under the floor",
    PANEL.replace('.np-count{font-family:"IBM Plex Mono",monospace;font-size:11px',
                  '.np-count{font-family:"IBM Plex Mono",monospace;font-size:10px'),
    (s) => subFloor(s).length > 0],
];
for (const [name, planted, red] of controls) {
  const changed = planted !== (name.includes("panel") ? PANEL : HTML);
  check(`positive control · ${name}`, changed && red(planted),
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
