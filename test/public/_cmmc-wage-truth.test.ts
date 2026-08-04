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
  ok(!/catch\s*\([^)]*\)\s*\{\s*(console[^\n]*\n\s*)?return[;\s}]/.test(code), `${label} has no silent-return catch`);
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
ok(/catch\s*\([^)]*\)\s*\{\s*(console[^\n]*\n?\s*)?return[;\s}]/.test(PLANTED_BAIL), "D: bail probe catches a planted silent-return catch");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCMMC+WAGE TRUTH GATE FAILED — a page can show something no writer produces.");
  process.exit(1);
}
console.log("cmmc+wage truth gate clean.");
