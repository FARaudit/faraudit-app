// WHICH WAY YOUR CODES ARE MOVING — the year-over-year panel, and the one way it
// can lie.
//
// MARKET_TREND sat in the payload from the first deploy and nothing drew it. It
// carries the most decision-useful pattern on the tab: every tracked code roughly
// doubled and then roughly halved across three fiscal years.
//
// ⛔ THE LAST YEAR IS STILL RUNNING. Its figure is obligations TO DATE, so an
// unmarked bar reports a collapse that has not happened — FY2026 at $25.04B
// against FY2025's $37.20B is a partial year beside a full one, not a 33% fall.
// Every assertion here exists for that: the flag comes from the PAYLOAD, it
// reaches the browser through the one-field-at-a-time mapper, the panel marks the
// bar, and the note says what the mark means.
//
// The second failure mode is quieter: one series rendered instead of all of them.
// The panel's whole claim is that the pattern is common to every tracked code, so
// a renderer that drew the largest and stopped would be making a stronger claim
// than the data supports.
//
// Run: npx tsx test/public/_market-yoy-open-year.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pageSource } from "./_page-styles";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const APP_RAW = read("public/dsb-app.js");
// Comments stripped so nothing passes by matching its own explanation.
const APP = APP_RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const LIVE = read("public/defense-spending-live.js");
const SEED = read("public/dsb-data.js");
const BUILDER = read("src/lib/bd-os/defense-spending.ts");
const HTML = pageSource("defense-spending.html");

const FN = (() => {
  const anchor = APP.indexOf("const SHOW_MAX");
  const i = anchor > -1 ? anchor : APP.indexOf("function renderMarketYoY");
  const j = APP.indexOf("function renderNowFigures");
  return i > -1 && j > i ? APP.slice(i, j) : "";
})();

// ── R1 · THE PANEL EXISTS AND IS REACHED ─────────────────────────────────────
console.log("\nR1  THE PANEL IS MOUNTED AND CALLED");
ok(FN.length > 0, "renderMarketYoY is findable");
ok(/renderMarketYoY\(\)/.test(APP.slice(APP.indexOf("function renderAll"))),
  "…and is called from renderAll, so it repaints on every scope change");
for (const id of ["myoyBody", "myoySub", "myoyNote", "myoyNow"]) {
  ok(HTML.includes(`id="${id}"`), `the markup carries #${id}`);
}
ok(/D\.MARKET_TREND/.test(FN), "it reads MARKET_TREND rather than re-deriving a series");

// ── R2 · THE OPEN-YEAR FLAG SURVIVES THE WHOLE CHAIN ─────────────────────────
// Four files, three deploy targets. A flag that stops at any one of them leaves
// the bar unmarked, which is the exact defect this gate exists for.
console.log("\nR2  `open` REACHES THE PANEL FROM THE BUILDER");
ok(/MARKET_TREND: \{[^}]*open: boolean\[\]/.test(BUILDER),
  "the payload TYPE carries `open`, so dropping it is a type error and not a silent undefined");
ok(/open: years\.map\(\(fy\) => fy >= currentFy\)/.test(BUILDER),
  "the builder derives it from the SAME currentFy the KPI sub-line uses",
  "a second derivation is a second thing to be wrong");
ok(/window\.DSB\.MARKET_TREND = data\.MARKET_TREND \|\| \{ labels: \[\], series: \{\}, open: \[\] \}/.test(LIVE),
  "the client mapper carries the whole object, defaulting `open` to EMPTY",
  "a default run of `false` would assert every year is closed");
ok(/MARKET_TREND: \{ labels: \[\], series: \{\}, open: \[\] \}/.test(SEED),
  "the pre-fetch seed declares it too, so nothing reads undefined before the feed answers");

// ── R3 · THE PANEL MARKS THE OPEN YEAR, AND SAYS WHAT THE MARK MEANS ─────────
console.log("\nR3  AN OPEN YEAR IS LABELLED AS OPEN");
ok(/T\.open/.test(FN) || /openFlags/.test(FN), "the renderer reads the flag");
ok(/openFlags\[i\] === true/.test(FN),
  "…and tests it STRICTLY, so a missing flag is not truthy-coerced into 'closed'");
ok(/'to date'/.test(FN), "an open year's row says `to date`");
ok(/'final'/.test(FN), "and a closed year's row says `final` — the contrast is what carries the meaning");
ok(/is still open/.test(FN), "the note names which year is open");
ok(/not a measured decline|not a full year/.test(FN),
  "…and states that the fall into it is not a measured decline");
ok(/\.myoy-y\.open/.test(HTML), "the open row has a visual treatment of its own in the shipped CSS");

// ⛔ THE FLAG MUST NOT BE RE-DERIVED HERE. A date comparison in the browser would
// disagree with the builder the first time the two disagreed about `currentFy`.
ok(!/new Date\(\)|Date\.now\(\)/.test(FN),
  "the panel does NOT recompute which year is open from the clock");

// ── R4 · EVERY TRACKED CODE IS DRAWN ─────────────────────────────────────────
console.log("\nR4  ONE SERIES PER TRACKED CODE");
ok(/Object\.keys\(T\.series/.test(FN),
  "the code list comes from the series itself, not from a hardcoded set");
ok(!/\.slice\(0,\s*\d/.test(FN),
  "no bare-numeric cap truncates the code list");
const CAPPED = /slice\(0,\s*SHOW_MAX\)/.test(FN);
// Graded on the FOOTNOTE ITSELF. Matching the whole file passes on the picker's
// own "N tracked codes" count line, so the check survived deleting the footnote.
const FOOT = (() => {
  const i = APP.indexOf("function renderNowFigures");
  const j = APP.indexOf("const last =", i);
  return i > -1 && j > i ? APP.slice(i, j) : "";
})();
ok(!CAPPED || (/tracked codes/.test(FOOT) && /shown/.test(FOOT)),
  "a cap on the visible codes is DECLARED in the footnote — the total counts codes the bars do not show");
ok(!CAPPED || /SHOW_MAX = 3\b/.test(FN),
  "…and the cap is a named bound, not a number buried in a slice");
ok(/c === S\.code/.test(FN),
  "a selected code narrows it to that code — the only filter applied");

// ── R5 · THE HEADLINE FIGURES ARE THIS SERIES, NOT A SECOND MEASUREMENT ──────
console.log("\nR5  THE TWO NOW-FIGURES COME FROM THE SCOPED VIEW");
const NOW = (() => {
  const i = APP.indexOf("function renderNowFigures");
  const j = APP.indexOf("const last =", i);
  return i > -1 && j > i ? APP.slice(i, j) : "";
})();
ok(NOW.length > 0, "renderNowFigures is findable");
ok(/view\(\)\.kpis/.test(NOW),
  "it reads the SCOPED view, so picking a code moves the headline with the panel");
ok(/renderNowFigures\(/.test(FN), "and it is driven by the panel it belongs to");
ok(!HTML.includes('id="kpiStrip"'),
  "the free-standing KPI strip is gone — the figures are the last point of this series");

// ── R6 · PLANTED POSITIVES — each check must be able to go red ───────────────
console.log("\nR6  PLANTED POSITIVES");
{
  const stripped = FN.replace(/'to date'/g, "''");
  ok(!/'to date'/.test(stripped), "PLANT: removing the open-year label is detectable");

  const unflagged = FN.replace(/openFlags\[i\] === true/g, "false");
  ok(!/openFlags\[i\] === true/.test(unflagged),
    "PLANT: replacing the strict flag test with a constant is detectable");

  const capped = FN.replace(/\.sort\(/, ".slice(0, 1).sort(");
  ok(/\.slice\(0,\s*1/.test(capped), "PLANT: a cap on the code list is detectable");

  const clocked = FN + "\nconst x = new Date();";
  ok(/new Date\(\)/.test(clocked), "PLANT: a clock read inside the panel is detectable");

  const noType = BUILDER.replace(/open: boolean\[\];/, "");
  ok(!/open: boolean\[\]/.test(noType.slice(noType.indexOf("MARKET_TREND:"), noType.indexOf("MARKET_TREND:") + 200)),
    "PLANT: dropping `open` from the payload type is detectable");
}

// ── R7 · SELF-ARM ────────────────────────────────────────────────────────────
console.log("\nR7  SELF-ARM");
{
  const before = fail;
  const realLog = console.log;
  console.log = () => {};
  ok(false, "(self-arm)", "deliberate");
  console.log = realLog;
  const armed = fail === before + 1;
  fail = before;
  pass++;
  if (!armed) {
    console.log("  ✗ FAIL the harness cannot record a failure — every result above is meaningless");
    process.exit(1);
  }
  console.log("  ✓ a deliberate false assertion was counted as a failure, then retracted");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
