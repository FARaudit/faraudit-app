// ─────────────────────────────────────────────────────────────────────────────
// CMMC + WAGE TRUTH GATE — neither page may show a number nothing computes.
//
// Both surfaces shipped the same defect as contracting-officers: a live script
// fetched, could not read the answer (the route returns `distribution` and
// `rates`; the clients demanded `DOMAINS` and `WAGES`), returned — and a seed
// file rendered. What the seeds asserted was worse than a placeholder:
//
//   cmmc-data.js  — a control-by-control compliance posture for THIS company
//                   (82% on Access Control, 16 open controls, a readiness
//                   score of 78) from a self-assessment the product has never
//                   collected.
//   wage-data.js  — the company's own pay rates per labor category, a variance
//                   against market, a below-market compliance flag, and wage
//                   determination renewal countdowns. No payroll is stored and
//                   no wage determination is fetched.
//
// The legs, each of which catches that alone:
//   A · neither seed ships records
//   B · no served script computes a field with no writer
//   C · neither page's copy promises one
//   D · the fetch layers name their failure instead of falling back
//
// Every leg carries a planted positive. Fails closed if a file is renamed.
//
// Run: npx tsx test/public/_cmmc-wage-truth.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUB = path.join(process.cwd(), "public");

// A BARE `return;` is the defect: a catch that swallows the failure and reports nothing.
// `return { state: "error" }` is the opposite — it hands the failure up to be rendered.
// Written with `return[;\s}]`, the whitespace class matched the space in `return {` and the
// check condemned the honest form, which would have forced the silent one.
const SILENT_CATCH = /catch\s*\([^)]*\)\s*\{\s*(console[^\n]*[\n;]\s*)?return\s*[;}]/;
const FILES = [
  "cmmc-data.js", "cmmc-app.js", "cmmc-readiness-live.js", "cmmc-readiness.html",
  "wage-data.js", "wage-app.js", "wage-benchmarks-live.js", "wage-benchmarks.html"
];
for (const f of FILES) {
  if (!existsSync(path.join(PUB, f))) {
    console.error(`CMMC+WAGE TRUTH GATE cannot run — public/${f} is missing. Failing closed.`);
    process.exit(1);
  }
}
const read = (f: string) => readFileSync(path.join(PUB, f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const CMMC = { data: read("cmmc-data.js"), app: read("cmmc-app.js"), live: read("cmmc-readiness-live.js"), html: read("cmmc-readiness.html") };
const WAGE = { data: read("wage-data.js"), app: read("wage-app.js"), live: read("wage-benchmarks-live.js"), html: read("wage-benchmarks.html") };

// ── A · the seeds ship no records ───────────────────────────────────────────
console.log("\n── A · seed files carry no records ──");

// A record is a repeated object literal keyed on a domain field. One or two are
// config; a list of them is a dataset.
const RECORD_RX = /\{\s*(code|cat|wd|category|name|key)\s*:\s*['"]/g;
for (const [label, src, cap] of [["cmmc-data.js", CMMC.data, 0], ["wage-data.js", WAGE.data, 0]] as const) {
  const n = (src.match(RECORD_RX) || []).length;
  ok(n <= cap, `${label} ships no record literals`, `found ${n}`);
}
ok(/DISTRIBUTION\s*:\s*\{\s*'0'\s*:\s*0/.test(CMMC.data), "cmmc seed declares a zeroed distribution");
ok(/RATES\s*:\s*\[\s*\]/.test(WAGE.data), "wage seed declares an empty rate list");
// Currency and percentage literals in a seed are the mock's fingerprints.
ok(!/\d+\.\d+\s*,\s*(yours|market|sca)/.test(WAGE.data), "wage seed carries no rate triples");

// ── B · no uncomputable field in any served script ──────────────────────────
console.log("\n── B · no served script computes a field with no writer ──");

const CMMC_NO_SOURCE: Array<[string, RegExp]> = [
  ["readiness score", /\bscore\s*:|\.score\b|hsScore/],
  // `gap:` alone is the CSS property. The mock's field was a bare count, so the
  // shape is matched: a number that ends the value, never a length unit.
  ["open-control count", /\bgap\s*:\s*\d+\s*[,}]|\.gap\b|hsGaps/],
  ["per-domain posture", /\bDOMAINS\b|\bdomains\s*:|\.met\b|\bnone\s*:/],
  ["control percentage", /\bpct\s*:|\.pct\b/],
  ["domain priority", /PRIO_META|\bpriority\s*:/],
  ["certification timeline", /\bTIMELINE\b|c3List|\bdays\s*:\s*\d/],
  ["enforcement countdown", /\bDEADLINE\b|daysToDeadline|hsDays/]
];
const WAGE_NO_SOURCE: Array<[string, RegExp]> = [
  ["the company's own rate", /\byours\b/],
  ["variance vs market", /\bvar\s*:|\.var\b|hsFlags/],
  ["compliance status", /STATUS_META|\bstatus\s*:\s*['"](Compliant|Watch|FLAG)/],
  ["SCA floor per row", /\bsca\s*:|\.sca\b/],
  ["wage determination number", /\bwd\s*:|\bWD \d{4}-\d+/],
  ["WD renewal countdown", /\bRENEWALS\b|wdList|hsWD/],
  ["site/base attribution", /\bsite\s*:|\bLOCATIONS\b/]
];

for (const [pageLabel, fields, srcs] of [
  ["cmmc", CMMC_NO_SOURCE, [["cmmc-app.js", CMMC.app], ["cmmc-data.js", CMMC.data], ["cmmc-readiness-live.js", CMMC.live]]],
  ["wage", WAGE_NO_SOURCE, [["wage-app.js", WAGE.app], ["wage-data.js", WAGE.data], ["wage-benchmarks-live.js", WAGE.live]]]
] as const) {
  for (const [label, rx] of fields) {
    const hits = (srcs as ReadonlyArray<readonly [string, string]>)
      .filter(([, src]) => rx.test(strip(src)))
      .map(([n]) => n);
    ok(hits.length === 0, `${pageLabel}: no ${label} in any served script`, hits.join(", "));
  }
}

// ── C · the copy promises nothing either ────────────────────────────────────
console.log("\n── C · page copy promises no unwired metric ──");

const CMMC_PROMISES = [/Compliance Radar/i, /Domain Gap Analysis/i, /Path to L2/i, /Priority Gap Actions/i, /Open Controls/i, /Days to Nov/i];
const WAGE_PROMISES = [/Your Rate vs/i, /Compliance Flags/i, /WD Renewals/i, /Below Market/i, /DOL WHD/i];
const cmmcPromised = CMMC_PROMISES.filter((rx) => rx.test(CMMC.html)).map((rx) => rx.source);
const wagePromised = WAGE_PROMISES.filter((rx) => rx.test(WAGE.html)).map((rx) => rx.source);
ok(cmmcPromised.length === 0, "cmmc page promises no unwired panel", cmmcPromised.join(", "));
ok(wagePromised.length === 0, "wage page promises no unwired panel", wagePromised.join(", "));

// The CMMC reference IS legitimate content, but it must be labelled as the DoD
// model rather than read as this company's status.
ok(/reference, not your assessment/i.test(CMMC.app), "cmmc labels the reference as reference, not assessment");
// And the wage band must say what it is not.
ok(/not your payroll/i.test(WAGE.app), "wage states the band is not the company's payroll");

// ── D · the fetch layers fail loudly ────────────────────────────────────────
console.log("\n── D · a failed fetch is a visible failure, never a fallback ──");

for (const [label, src] of [["cmmc-readiness-live.js", CMMC.live], ["wage-benchmarks-live.js", WAGE.live]] as const) {
  const code = strip(src);
  ok(/state\s*:\s*['"]error['"]/.test(code), `${label} sets an explicit error state`);
  // A BARE `return;` IS THE DEFECT — a catch that swallows the failure and reports nothing.
  // `return { state: 'error' }` is the OPPOSITE: it hands the failure to the caller to render.
  // Written as `return[;\s}]`, the whitespace class matched the space in `return {`, so the
  // check condemned the honest form and would have forced the silent one.
  ok(!SILENT_CATCH.test(code), `${label} has no silent-return catch`);
  ok(/res\.ok/.test(code), `${label} checks the response status`);
}
for (const [label, src] of [["cmmc-app.js", CMMC.app], ["wage-app.js", WAGE.app]] as const) {
  const code = strip(src);
  ok(/['"]error['"]/.test(code) && /['"]empty['"]/.test(code), `${label} distinguishes error from empty`);
}
ok(/id="stateBanner"/.test(CMMC.html) && /id="stateBanner"/.test(WAGE.html), "both pages carry the banner those states render into");

// ── planted positives ───────────────────────────────────────────────────────
console.log("\n═══ PLANTED POSITIVES — prove this gate can fail ═══");

const PLANTED_SEED = `window.WAGE={WAGES:[{wd:'WD 2015-4267',cat:'Aircraft Mechanic I',sca:28.14,yours:29.5,var:2.4,status:'Compliant'}]};`;
ok((PLANTED_SEED.match(RECORD_RX) || []).length > 0, "A: record probe catches a planted seed row");
ok(WAGE_NO_SOURCE.filter(([, rx]) => rx.test(PLANTED_SEED)).length >= 4, "B: wage probes catch the planted invented fields");

const PLANTED_CMMC = `const pct = d.pct; const score = o.score; const t = D.TIMELINE;`;
ok(CMMC_NO_SOURCE.filter(([, rx]) => rx.test(PLANTED_CMMC)).length >= 3, "B: cmmc probes catch the planted invented fields");

ok(!CMMC_NO_SOURCE.some(([, rx]) => rx.test("const d = data.distribution; const t = r.matched_on;")),
  "B(−): cmmc probes do NOT fire on the fields that DO have a source");
ok(!WAGE_NO_SOURCE.some(([, rx]) => rx.test("const m = r.rate_median; const s = r.source; const c = r.naics_codes;")),
  "B(−): wage probes do NOT fire on the fields that DO have a source");

const PLANTED_BAIL = `try { const r = await fetch(u); } catch (e) { console.error(e); return; }`;
// THE PROBE MUST TEST THE REGEX THE CHECK USES. These were two different expressions — the
// probe's had an optional newline the check's did not, so it proved a pattern that was not
// guarding anything. A planted positive against a different recognizer certifies nothing.
ok(SILENT_CATCH.test(PLANTED_BAIL), "D: bail probe catches a planted silent-return catch");
ok(!SILENT_CATCH.test("catch (e) { return { state: 'error' }; }"),
  "D(−): a catch that RETURNS AN ERROR STATE is not silent and must pass");

// ── THE PANEL SAYS WHAT THE ROW CANNOT ──────────────────────────────────────
// CEO review 2026-08-10: "when you click a category the right box brings up further detail but
// really it's the same thing"; and "where this came from is the same for all — it's fluff".
// Both were right. The panel restated low/median/high, which the row already prints, and 50 of
// the 55 reference rows carry the identical source string.
{
  const wapp = read("wage-app.js");
  const wlive = read("wage-benchmarks-live.js");
  const spec = readFileSync(path.join(PUB, "..", "src", "lib", "labor-category-spec.ts"), "utf8");
  const route = readFileSync(path.join(PUB, "..", "src", "app", "api", "labor-rates", "route.ts"), "utf8");

  ok(!/\['Low', r\.rate_low\], \['Median', r\.rate_median\], \['High', r\.rate_high\]/.test(wapp), "the panel no longer restates the band the row prints",
    "the detail panel repeats the three numbers already on the row");
  ok(/What this role does/.test(wapp), "the panel says what the role does",
    "clicking a category adds no depth");
  ok(/Typical qualifications/.test(wapp), "…and what it takes to fill it");
  ok(/FARaudit editorial, not a government standard/.test(wapp), "the editorial layer is labelled as ours",
    "an authored role summary reads as a government definition");
  ok((spec.match(/^  "/gm) || []).length >= 55, "every reference category carries a spec",
    `${(spec.match(/^  "/gm) || []).length} specs for 55 categories — a row would render without one`);
  ok(/spec: CATEGORY_SPEC\[r\.category\] \|\| null/.test(route), "the spec travels with the row",
    "the panel must look it up separately and goes blank for a curated row");

  // COMPARE TO WHAT PRIMES HAVE WON — the CEO's second ask. GSA CALC+ indexes awarded ceiling
  // rates off GSA schedules, which is the only comparison a sub pricing against a prime can make.
  ok(/const compare = \(url\.searchParams\.get\("compare"\)/.test(route), "the route answers a single-category comparison",
    "the awarded-rate layer only fires on a text search, so a selected row cannot ask for it");
  ok(/WAGE_COMPARE\(r\.category\)/.test(wapp), "the comparison is requested when a row is selected");
  ok(/window\.WAGE_COMPARE = compare/.test(wlive), "the client exposes that lookup");
  ok(/\['Difference',/.test(wapp), "the panel prints the difference, not just two numbers",
    "the customer has to do the subtraction the page could do");
  ok(/Awarded rates in sample/.test(wapp), "the sample size is shown",
    "a median over 2 awards reads the same as a median over 200");

  // THREE FAILURE STATES, EACH SAID PLAINLY. A blank panel for all of them tells three
  // different customers the same untrue thing.
  for (const [what, re] of [
    ["not indexed", /indexes no awarded rate under this category name/],
    ["unreachable", /could not be reached, so no comparison is shown/],
    ["in flight", /Checking GSA CALC\+/]
  ] as const) {
    ok(re.test(wapp), `the ${what} state is stated, not blank`,
      "an absent comparison is indistinguishable from a rate of zero");
  }
  ok(/state: "none"/.test(route) && /state: "error"/.test(route) && /state: "found"/.test(route), "the route distinguishes those states too",
    "the server collapses them, so the page cannot tell them apart");
  ok(/if \(S\.sel !== asked\) return;/.test(wapp), "a stale answer cannot land under a new selection",
    "clicking quickly paints one category's awarded rates under another's name");

  // Source per row was 50-of-55 identical; it prints only when this row differs.
  ok(/r\.source !== DEFAULT_SOURCE/.test(wapp), "the source line prints only when it differs",
    "the same sentence is repeated on every panel and learns to be skipped");

  ok(/\['Low', r\.rate_low\]/.test("[['Low', r.rate_low], ['Median', r.rate_median]]"), "P· the band check can see the restated shape",
    "the check cannot see the shape it forbids");
}

// ── THE HEADLINE IS WHAT WAS AWARDED ────────────────────────────────────────
// CEO ruling 2026-08-10: a band from national BLS medians is where to start; what schedule
// holders actually won on federal contracts is what a subcontractor prices against. Measured
// while building: the reference is off by -$43.74 on Program Manager II and +$14.85 on Quality
// Engineer against awarded medians over 200 and 104 rates.
{
  const wapp2 = read("wage-app.js");
  const whtml = read("wage-benchmarks.html");
  const route2 = readFileSync(path.join(PUB, "..", "src", "app", "api", "labor-rates", "route.ts"), "utf8");
  const calc = readFileSync(path.join(PUB, "..", "src", "lib", "calc-rates.ts"), "utf8");

  ok(/function headlineRate\(r\)/.test(wapp2) && /r\.awarded\.median != null \? money\(r\.awarded\.median\)/.test(wapp2),
    "the row leads with the awarded median when there is one");
  ok(/: money\(r\.rate_median\);/.test(wapp2),
    "a row with no awarded rate still shows the reference rather than a blank");
  ok(/Awarded median · ' \+ r\.awarded\.count \+ ' rates/.test(wapp2),
    "the row says how many awarded rates the median came from",
    "a median over 2 awards reads identically to one over 200");
  ok(/not indexed by CALC\+/.test(wapp2) && /awarded rate not checked/.test(wapp2),
    "NOT INDEXED and NOT CHECKED are different sentences on the row",
    "a category we ran out of time to ask about would read as having no market");
  ok(/Ref low/.test(whtml) && /Ref high/.test(whtml) && !/<span>Median<\/span>/.test(whtml),
    "the column headers say which number is which");
  ok(/actually been awarded/.test(whtml),
    "the page still describes itself as a reference band");

  // The route must ask for every visible row, and keep the three states apart.
  ok(/calcRateStatsBulk\(merged\.map\(\(r\) => r\.category\)\)/.test(route2),
    "awarded rates are fetched for every row that survives the filters");
  ok(/awarded_state: "unresolved"/.test(route2) && /awarded_state: "none"/.test(route2) && /awarded_state: "found"/.test(route2),
    "the route keeps found, not-indexed and unresolved apart");
  ok(/!awarded\.has\(r\.category\)/.test(route2),
    "a category absent from the result is UNRESOLVED, not unindexed",
    "a missing key would be read as 'CALC+ has no rate', which is a different fact");

  // Bulk lookup: cached, bounded, and it must not hang the page.
  ok(/RATE_TTL_MS = 6 \* 3600_000/.test(calc), "the awarded-rate cache has a stated TTL");
  ok(/if \(Date\.now\(\) >= deadline\) break;/.test(calc),
    "the bulk lookup stops at its deadline",
    "55 categories measured at 5.8s — without a deadline a slow upstream is a hung page");
  ok(/catch \{\s*\/\/ Not cached/.test(calc),
    "a transient failure is not cached as a verdict",
    "one bad response would pin 'unknown' on a category for six hours");
  ok(/export function __resetRateCache/.test(calc),
    "the process-global cache has a test seam");

  ok(/function headlineRate/.test("function headlineRate(r) { return money(r.rate_median); }"),
    "P· the headline check can see a reference-only implementation");
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCMMC+WAGE TRUTH GATE FAILED — a page can show something no writer produces.");
  process.exit(1);
}
console.log("cmmc+wage truth gate clean.");
