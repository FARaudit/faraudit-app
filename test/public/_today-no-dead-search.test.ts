// Today advertises no control it cannot perform.
// Run: npx tsx test/public/_today-no-dead-search.test.ts
//
// The topbar carried a search box reading "Search officers, agencies, offices…"
// with a "⌘K" hint. Measured on production 2026-08-13: nothing in Today's script
// set listened for that key — dispatching it on `document` and on `window`, and
// clicking the box, produced no overlay and no DOM change — and the box was not
// inside a button, so it was not clickable at all. The copy was the Contracting
// Officers desk's, borrowed onto a page that has no such search.
//
// CEO ruling 2026-08-13: it was never planned for Today, so it is FABRICATED
// rather than in-flight, and the standing rule sends fabricated surfaces to
// deletion rather than to a label.
//
// ⛔ THE LAYOUT WAS LOAD-BEARING. `.tb-search` carried `margin-left:auto`, which
// is what pushed the action buttons to the right edge. Deleting the box without
// carrying that would collapse the topbar against the breadcrumb — the control
// owned more than itself, and Part B is what keeps that true.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = process.cwd();
const HTML = readFileSync(join(ROOT, "public", "today.html"), "utf8");
const SCRIPTS = ["cc-app.js", "command-center-live.js", "notifications-chrome.js"]
  .map((f) => { try { return readFileSync(join(ROOT, "public", f), "utf8"); } catch { return ""; } })
  .join("\n");

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part A · the dead control is gone, markup and styles together ──");
{
  check("A1 · no search box in the topbar", !/tb-search/.test(HTML));
  check("A2 · no borrowed placeholder copy", !/Search officers, agencies, offices/.test(HTML));
  check("A3 · no ⌘K affordance", !/⌘K/.test(HTML) && !/class="kbd"/.test(HTML));
  // An injected component owns its CSS: leaving the rules behind leaves the next
  // reader a style for an element that does not exist.
  check("A4 · its styles went with it", !/\.tb-search\s*\{/.test(HTML) && !/\.kbd\s*\{/.test(HTML));
  check("A5 · the variable it was the only consumer of went too", !/search-bg/.test(HTML));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part B · the layout it was holding is still held ──");
// This is the half that breaks silently. The box was the flex child carrying
// `margin-left:auto`; without it the buttons slide left and sit on the crumbs.
{
  const m = HTML.match(/\.top-actions\s*\{([^}]*)\}/);
  check("B1 · .top-actions rule is findable (fails closed if it moves)", !!m);
  check("B2 · …and now carries the right-alignment the search box used to",
    /margin-left:\s*auto/.test(m?.[1] || ""), m?.[1] || "(not found)");
  check("B3 · the crumbs and the actions are still the topbar's two children",
    /class="crumbs"/.test(HTML) && /class="top-actions"/.test(HTML));
  // Removing a block is where a stray tag ejects its neighbours.
  const topbar = HTML.slice(HTML.indexOf('<div class="topbar">'));
  const opens = (topbar.slice(0, topbar.indexOf("</main>")).match(/<div/g) || []).length;
  const closes = (topbar.slice(0, topbar.indexOf("</main>")).match(/<\/div>/g) || []).length;
  check("B4 · div tags balance from the topbar to </main>", opens === closes,
    `${opens} open vs ${closes} close`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part C · nothing may re-advertise a shortcut nothing binds ──");
// The rule this file really enforces: if the page shows a keyboard hint, some
// script Today loads must listen for that key. Both halves have to be true, so
// the check is symmetric rather than a blanket ban.
{
  const advertises = /⌘K|class="kbd"/.test(HTML);
  const binds = /metaKey|ctrlKey/.test(SCRIPTS);
  check("C1 · the page advertises no key it does not bind", !advertises || binds,
    advertises ? "a ⌘K hint is shown but no script listens" : "");
  // The planted positives run the REAL predicate over fixture pairs. Written as
  // inline booleans they reduced to constants and would have passed against any
  // implementation at all.
  const honest = (html: string, scripts: string) =>
    !(/⌘K|class="kbd"/.test(html)) || /metaKey|ctrlKey/.test(scripts);
  check("C2 · PLANTED: the probe catches an advertised-but-unbound key",
    honest('<span class="kbd">⌘K</span>', 'document.addEventListener("keydown", e => {});') === false);
  check("C3 · PLANTED: …and permits one that IS bound",
    honest('<span class="kbd">⌘K</span>',
      'if ((e.metaKey || e.ctrlKey) && e.key === "k") focusSearch();') === true);
  check("C4 · PLANTED: …and a page that advertises nothing is fine either way",
    honest('<div class="topbar"></div>', '') === true);
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
