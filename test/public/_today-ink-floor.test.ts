// /today may not print TEXT on --mute-2.
// Run: npx tsx test/public/_today-ink-floor.test.ts
//
// --mute-2 is #94a3b8 light / #5b6778 dark. On this page's grounds that measures
// 2.56:1 light and 3.01:1 dark — under AA and under the 3.25 floor every other tab
// was held to. It was carrying the action rank NUMBERS, the breadcrumb and row
// separators, the notification timestamps and the source chip.
//
// --mute-2 is still legitimate for things that are not READ: rules, dots, hover
// borders and icons. So this gate does not ban the token — it bans the token on a
// rule that also sets a font-size, which is what makes a rule a text rule.
//
// Part P plants each defect back and asserts this suite goes red.

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
const FILE = join(ROOT, "public", "today.html");
const html = readFileSync(FILE, "utf8");

// Only the inline <style> — a --mute-2 inside a script string is not a paint.
const styles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join("\n");
check("the page's stylesheet was located", styles.length > 2000, `${styles.length} bytes`);

/** Every rule body in the sheet, paired with its selector. */
function rules(css: string): Array<{ sel: string; body: string }> {
  // strip comments first so a commented-out rule cannot fail (or pass) this gate
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sel: m[1].trim(),
    body: m[2],
  }));
}

/** A rule is a TEXT rule when it sizes type. That is the thing --mute-2 must not tint. */
const textOnMute2 = (css: string): string[] =>
  rules(css)
    .filter((r) => /font-size\s*:/.test(r.body) && /(^|[^-])color\s*:\s*var\(--mute-2\)/.test(r.body))
    .map((r) => r.sel);

console.log("── the floor ──");
const offenders = textOnMute2(styles);
check("no rule sizes text AND tints it --mute-2",
  offenders.length === 0,
  `${offenders.length}: ${offenders.slice(0, 4).join(" · ")}`);

// The ones that actually shipped under the floor, named so a bulk revert is visible.
for (const sel of [".act-rank", ".wh-source", ".np-time"]) {
  const r = rules(styles).find((x) => x.sel.split(",").some((s) => s.trim() === sel));
  check(`${sel} reads on --mute`,
    !!r && /color\s*:\s*var\(--mute\)/.test(r.body),
    r ? "still on --mute-2" : "rule not found — was it renamed?");
}
// These two carry no font-size of their own, so the sweep above cannot see them.
for (const sel of [".crumbs .sep", ".act-dot"]) {
  const r = rules(styles).find((x) => x.sel.trim() === sel);
  check(`${sel} reads on --mute`,
    !!r && /color\s*:\s*var\(--mute\)/.test(r.body) && !/var\(--mute-2\)/.test(r.body),
    r ? "still on --mute-2" : "rule not found — was it renamed?");
}

// --mute-2 must stay AVAILABLE for the things that are not read; a gate that pushed
// the whole page off the token would be over-correcting, so assert it survives there.
console.log("── and the token is still used where nothing is read ──");
const nonText = rules(styles).filter(
  (r) => /var\(--mute-2\)/.test(r.body) && !/font-size\s*:/.test(r.body),
);
check("--mute-2 still tints non-text (rules, dots, hover borders, icons)",
  nonText.length > 0, "the token was stripped wholesale, not applied by role");

console.log("── Part P · positive controls ──");
const controls: Array<[string, string]> = [
  ["a sized rule goes back to --mute-2",
    styles.replace(
      '.act-rank{font-family:"IBM Plex Mono",monospace;font-size:13px;font-weight:800;color:var(--mute)',
      '.act-rank{font-family:"IBM Plex Mono",monospace;font-size:13px;font-weight:800;color:var(--mute-2)')],
  ["the separator goes back to --mute-2",
    styles.replace(".crumbs .sep{color:var(--mute)}", ".crumbs .sep{color:var(--mute-2)}")],
];
for (const [name, planted] of controls) {
  const changed = planted !== styles;
  let red = false;
  if (changed) {
    red =
      textOnMute2(planted).length > 0 ||
      [".crumbs .sep", ".act-dot"].some((sel) => {
        const r = rules(planted).find((x) => x.sel.trim() === sel);
        return !r || /var\(--mute-2\)/.test(r.body);
      });
  }
  check(`positive control · ${name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
