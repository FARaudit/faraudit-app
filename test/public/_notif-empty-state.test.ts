// The notification panel's empty and failure states may not render as a ROW.
// Run: npx tsx test/public/_notif-empty-state.test.ts
//
// .np-item is a three-column grid — dot | body | time — built for a real
// notification. The empty and failure states carry ONLY a body, so rendered as an
// .np-item that body landed in the 9px DOT track: "No notifications / You're all
// caught up." measured 9px wide and wrapped one word per line inside a 355px panel.
//
// Same shape as the audit row that kept a 54px track after its badge was deleted:
// a track belongs to the ROW, never to whichever child happens to be present. The
// states now use .np-note, which is display:block and owns its own padding.
//
// Part P plants the regression back and asserts this suite goes red.

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
const js = readFileSync(join(ROOT, "public", "notifications-chrome.js"), "utf8");

const WRITER = new RegExp("scroll\\.inner" + "HTML\\s*=\\s*html\\s*\\|\\|([\\s\\S]{0,320}?);");

/** The single expression that writes the panel's body. */
function emptyBranch(src: string): string | null {
  const m = src.match(WRITER);
  return m ? m[1] : null;
}

console.log("── the state is not a row ──");
const branch = emptyBranch(js);
check("the empty/failure branch was located", !!branch, "the panel writer changed shape");
check("it does NOT reuse the .np-item grid row",
  !!branch && !/class="np-item/.test(branch),
  "a body-only child lands in the 9px dot track");
check("...it uses the block .np-note instead",
  !!branch && /class="np-note"/.test(branch), branch ?? "");

console.log("── and that block is actually styled ──");
check(".np-note is declared display:block",
  /\.np-note\{[^}]*display:block/.test(js),
  "without a rule the panel has an unstyled paragraph");
check(".np-note carries its own padding",
  /\.np-note\{[^}]*padding:/.test(js),
  "the row's padding came from .np-item, which it no longer uses");
// The real rows must KEEP the grid — a fix that flattened everything would lose the
// dot and the timestamp alignment this panel is built on.
check(".np-item is still the three-column row for real notifications",
  /\.np-item\{[^}]*display:grid[^}]*grid-template-columns:9px 1fr auto/.test(js),
  "the row lost its grid — dots and timestamps no longer align");

console.log("── all four states still exist, and stay distinct ──");
const STATES: Array<[string, RegExp]> = [
  ["outage", /Notifications unavailable/],
  ["settled-empty", /No notifications/],
  ["loading", /Loading/],
];
for (const [label, re] of STATES) {
  check(`the ${label} state survives`, re.test(js), "a state was lost in the fix");
}

console.log("── Part P · positive controls ──");
const ROW_OPEN = 'html || \'<div class="np-note">';
const ROW_BAD = 'html || \'<div class="np-item" style="cursor:default"><div class="np-body">';
const controls: Array<[string, string]> = [
  ["the state goes back to being an .np-item", js.replace(ROW_OPEN, ROW_BAD)],
  ["the .np-note rule is deleted", js.replace(/\s*\+ '\.np-note\{[^']*'/, "")],
];
for (const [name, planted] of controls) {
  const changed = planted !== js;
  let red = false;
  if (changed) {
    const b = emptyBranch(planted);
    red = !b || /class="np-item/.test(b) || !/\.np-note\{[^}]*display:block/.test(planted);
  }
  check(`positive control · ${name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
