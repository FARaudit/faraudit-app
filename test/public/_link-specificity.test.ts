// Gate — link COLOUR is declared at zero specificity, so no component that happens to be an
// anchor can be out-specified by a page-wide rule.
//
// THE DEFECT THIS GENERALISES. `opportunities.html:61` records it exactly: written plainly,
// `[data-theme="dark"] a { color: … }` is 0-1-1 and beats `.btn-open` at 0-1-0, repainting the
// primary button's label to 4.25:1 — on the one control the page exists to drive. It has now
// been committed twice, once in the page and once by Design while building the card 861 sheet.
//
// The first version of this check banned the exact string `[data-theme="dark"] a{`. That is the
// wrong shape: the trap belongs to ANY page-wide rule that colours a bare anchor, and to ANY
// component that is an anchor — `.btn-open` today, `.pc-link` today, and whatever becomes one
// tomorrow. Naming one selector leaves the door open for the next one. Design named this gap.
//
// So the invariant is the durable form: on a page held to it, EVERY rule that sets `color` on a
// bare `a` puts that `a` inside `:where()`. Then no component needs to out-specify anything.
//
// L1 the held pages carry ZERO · L2 the rest are PINNED so the number cannot grow ·
// L3 the detector is falsifiable · L4 the detector reads CSS, not comments.
//
// Run: npx tsx test/public/_link-specificity.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readdirSync } from "node:fs";
import { pageStyles } from "./_page-styles";
import { unscopedAnchorColourRules } from "./_link-specificity";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// ── L1 · the pages held to the invariant ─────────────────────────────────────
// These two are the notice surfaces. Both were brought to zero when this gate was written.
const HELD = ["opportunities.html", "notice-detail.html"];
console.log("L1 · the held pages declare link colour at zero specificity");
for (const f of HELD) {
  const bad = unscopedAnchorColourRules(pageStyles(f));
  ok(bad.length === 0, `${f} carries no un-scoped bare-anchor colour rule`,
    bad.length ? bad.join(" · ") : "");
}

// ── L2 · the rest, PINNED ────────────────────────────────────────────────────
// The other served pages carry this pattern too. Fixing 15 pages was not this change's job
// and is not silently claimed here — the counts are pinned so the estate cannot get WORSE
// while nobody is looking, and each one is a known, named piece of work.
const BASELINE: Record<string, number> = {
  "access.html": 5, "contracting-officers.html": 5, "defense-agencies.html": 7,
  "defense-spending.html": 2, "how-it-works.html": 6, "learn.html": 8, "naics.html": 2,
  "past-audits.html": 2, "pricing.html": 6, "profile-settings.html": 32,
  "root-landing.html": 5, "run-audit.html": 6, "teaming-partners.html": 1,
  "today.html": 2, "who-to-call.html": 3,
};
console.log("\nL2 · the rest of the estate is pinned, not fixed and not hidden");
let regressions = 0, improvements: string[] = [];
for (const f of readdirSync("public").filter((n) => n.endsWith(".html")).sort()) {
  let css: string;
  try { css = pageStyles(f); } catch { continue; }
  const n = unscopedAnchorColourRules(css).length;
  const base = BASELINE[f] ?? 0;
  if (n > base) { regressions++; console.log(`  ✗ FAIL ${f}: ${n} un-scoped rules, baseline ${base}`); fail++; }
  else if (n < base) improvements.push(`${f} ${base}→${n}`);
}
ok(regressions === 0, "no page gained an un-scoped anchor colour rule");
if (improvements.length) console.log(`  ℹ improved since the pin: ${improvements.join(", ")} — lower the baseline`);
const total = Object.values(BASELINE).reduce((a, b) => a + b, 0);
console.log(`  ℹ ${total} known un-scoped rules remain across ${Object.keys(BASELINE).length} pages — named, not claimed fixed`);

// ── L3 · the detector is falsifiable ─────────────────────────────────────────
console.log("\nL3 · falsifiability (planted positives)");
ok(unscopedAnchorColourRules('[data-theme="dark"] a{color:var(--accent-light)}').length === 1,
  "the exact trap from opportunities.html:61 IS detected");
ok(unscopedAnchorColourRules(".nav a:hover{color:red}").length === 1,
  "a container-scoped bare anchor IS detected — the trap is not specific to [data-theme]");
ok(unscopedAnchorColourRules(":where(a){color:blue}").length === 0,
  "a zero-specificity rule is accepted");
ok(unscopedAnchorColourRules(':where([data-theme="dark"]) :where(a){color:blue}').length === 0,
  "and so is the wrapped dark form");
ok(unscopedAnchorColourRules("a.pc-title{color:var(--ink)}").length === 0,
  "a COMPONENT anchor colouring itself is not the defect");
ok(unscopedAnchorColourRules("abbr{color:red}").length === 0,
  "an element merely starting with 'a' is not an anchor");
ok(unscopedAnchorColourRules("a{background:red}").length === 0,
  "a bare anchor rule that sets no colour is not the defect");

// ── L4 · the detector reads CSS, not the prose beside it ─────────────────────
console.log("\nL4 · comments are not code");
ok(unscopedAnchorColourRules('/* never write [data-theme="dark"] a{color:x} */ :where(a){color:blue}').length === 0,
  "a comment NAMING the banned selector does not trip the gate",
  "two gates in this repo have already convicted their own warning text");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
