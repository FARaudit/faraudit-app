// /far-dfars-updates + /defense-news must not ship FABRICATED customer-facing data.
// Run: npx tsx test/public/_feed-fabrication.test.ts
//
// Written RED against the pre-fix files (2026-08-03, engine audit pass 4). This is
// _today-fabrication.test.ts's class on the two pages that sweep never reached. That
// file's own lesson was "ONE surface inventory, not N serial fixes" — and then the
// inventory covered today.html + cc-app.js and stopped, while two adjacent sidebar
// items kept their mocks.
//
// WHAT WAS LIVE, not hypothetical. All three feeds behind /api/regulatory-updates
// were measured dead on 2026-08-03:
//   acquisition.gov/rss-feed/farsite-update                        -> HTTP 504
//   acq.osd.mil/dpap/rss-dfars.xml                                 -> HTTP 404
//   federalregister.gov ...topics[]=federal-acquisition-regulation -> HTTP 200, 0 items
// Each is swallowed by `catch { return []; }`, so the route answers 200 {updates: []},
// and far-dfars-updates-live.js does `if (!items.length) return;` — leaving far-data.js's
// "Illustrative mock" on screen. That mock states FAR/DFARS clause changes with invented
// before/after CLAUSE TEXT and "7 of your tracked solicitations", to a signed-in
// contractor, on a permanent sidebar nav item, in a compliance product.
//
// defense-news.html is the same shape one step less far along: 2 of its 4 feeds were
// alive, so MOCK_ARTICLES was a latent fallback rather than the live state. Latent is
// still shipped — its lead story hardcodes "167 days until" a milestone that is
// suspended, and that countdown can never be right.
//
// Part D plants known positives so a vacuous pass is impossible.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// Gates public/ assets but must not LIVE in public/ — everything there is served
// verbatim and a gate file is not an asset. test/public/ -> public/.
const PUBLIC = join(import.meta.dirname ?? __dirname, "..", "..", "public");
const read = (f: string) => readFileSync(join(PUBLIC, f), "utf8");

// ── Shared shape helpers (same contract as _today-fabrication.test.ts) ───────────
const declared = (src: string, name: string) =>
  new RegExp(`(?:${name}\\s*[:=]\\s*)\\[`).test(src);

/** True when NAME's array literal holds no object-literal records. Brace-balanced
 *  rather than `[^\\]]*` — these arrays contain nested `diff: { ... }` objects and
 *  bracketed text, which a negated-class scan terminates on early and then reports
 *  clean. The looser form passes on far-data.js UNFIXED; this one does not. */
function arrayIsEmpty(src: string, name: string): boolean {
  const open = src.match(new RegExp(`(?:${name}\\s*[:=]\\s*)\\[`));
  if (!open || open.index === undefined) return true;   // declaration gone = acceptable
  let i = open.index + open[0].length;
  let depth = 1;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
  }
  return !/\{\s*\w/.test(src.slice(start, i - 1));
}

// ── Part A · far-data.js carries no fabricated regulatory records ────────────────
// ENUMERATED FROM THE FILE, not from a name list. The first cut of this gate checked
// UPDATES and passed everything else — and far-data.js also shipped EFFECTIVE (a
// `days: 15` countdown to an invented deadline) and AFFECTED (four real-shaped
// solicitation numbers, FA3016-26-Q-0068 among them, presented as the signed-in
// user's own affected pursuits with per-solicitation compliance actions). Naming the
// defect "the UPDATES mock" produced a recognizer exactly that size.
//
// So: every array the module EXPORTS must hold no object literals, and the only
// exemptions are the render templates named here — a name this gate has never seen
// must be empty. Fail-closed, and the exemptions are printed rather than implied.
console.log("── Part A · far-data.js holds no invented FAR/DFARS records ──");
const farData = read("far-data.js");

// Presentation templates: labels, colours, sort keys. No business facts.
const FAR_TEMPLATES = new Set(["TYPES", "IMPACTS", "IMPACT_META", "TYPE_COLOR", "SORTS"]);
console.log(`   exempt as render templates: ${[...FAR_TEMPLATES].join(", ")}`);

const exported = (farData.match(/return\s*\{([^}]*)\}\s*;?\s*\}\)\(\)/)?.[1] ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
check("far-data.js · export list is readable", exported.length > 0, "could not parse the module's return object");

for (const name of exported) {
  if (FAR_TEMPLATES.has(name)) continue;
  check(
    `far-data.js · ${name} holds no record literals`,
    !declared(farData, name) || arrayIsEmpty(farData, name),
    "still contains object literals — invented business data",
  );
}

// The single most damaging field: quoted BEFORE/AFTER regulation text. A contractor
// reading this believes the clause language actually changed as printed.
check(
  "far-data.js · no invented before/after clause text",
  !/\bdiff\s*:\s*\{\s*before\s*:/.test(farData),
  "a diff{before,after} literal is present",
);

// "affects: 7" reads as a count over the USER's own tracked solicitations. No query
// produced it. Same class as the today.html sidebar counts.
check(
  "far-data.js · no invented per-user affected counts",
  !/\baffects\s*:\s*\d/.test(farData),
  "an affects: <n> literal is present",
);

// A file that announces itself as a mock is a file that should not be rendering.
check(
  "far-data.js · no self-declared mock banner",
  !/illustrative mock/i.test(farData),
  "still labelled an illustrative mock",
);

// ── Part B · defense-news.html carries no mock article set ───────────────────────
console.log("\n── Part B · defense-news.html holds no mock articles ──");
const dnHtml = read("defense-news.html");

// Same fail-closed enumeration as Part A. Checking MOCK_ARTICLES alone passed while
// the page still shipped TICKER_ITEMS (eight invented awards scrolling as a live
// ticker), REG_ITEMS (six invented regulatory headlines with compliance advice) and
// AWARDS (six more, under the heading "RECENT AWARDS · YOUR NAICS").
const DN_TEMPLATES = new Set(["DN_NAV", "SOURCES", "TOPIC_COLORS", "DN_CAT"]);
console.log(`   exempt as render templates: ${[...DN_TEMPLATES].join(", ")}`);

const dnArrays = [...dnHtml.matchAll(/(?:^|\n)\s*(?:var|const)\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[/g)]
  .map((m) => m[1]);
check("defense-news.html · array declarations are readable", dnArrays.length > 0, "found none");

for (const name of dnArrays) {
  if (DN_TEMPLATES.has(name)) continue;
  check(
    `defense-news.html · ${name} holds no record literals`,
    arrayIsEmpty(dnHtml, name),
    "still contains object literals — invented business data",
  );
}

// A generated series rendered as measured history. The old volumeSeries() built 14
// days of "news volume" from sin/cos over a topic count.
check(
  "defense-news.html · no synthesized time series",
  !/Math\.(sin|cos)\s*\(/.test(dnHtml),
  "a trigonometric data generator is present",
);

// mergeArticles() must not have a fabricated branch to fall back to.
check(
  "defense-news.html · mergeArticles has no mock fallback branch",
  !/return\s+MOCK_ARTICLES/.test(dnHtml),
  "still returns MOCK_ARTICLES",
);

// A countdown written as a source literal is a number that stops being true the day
// after it ships, and this one counts to a suspended milestone.
check(
  "defense-news.html · no hardcoded day countdown",
  !/\b\d{2,3}\s+days?\s+until\b/i.test(dnHtml),
  "a '<n> days until' literal is present",
);

// ── Part C · the live scripts must make failure VISIBLE, not silent ──────────────
// The defect is not that the fetch can fail — it is that failing looks identical to
// succeeding-with-nothing. Each script must route an empty/failed payload to a named
// unavailable renderer instead of returning from wire() with the page untouched.
console.log("\n── Part C · empty payload reaches a visible unavailable state ──");

for (const file of ["far-dfars-updates-live.js", "defense-news-live.js"] as const) {
  const src = read(file);
  const silentReturn = /if\s*\(\s*!\s*items\.length\s*\)\s*return\s*;/.test(src);
  check(`${file} · no silent early return on empty payload`, !silentReturn, "bare `if (!items.length) return;` still present");
  check(`${file} · declares an unavailable renderer`, /function\s+renderUnavailable/.test(src), "no renderUnavailable path");
  // A catch that only console.errors leaves the previous DOM in place, which is the
  // same defect wearing a log line.
  const catchBody = src.match(/catch\s*\(\s*\w*\s*\)\s*\{([\s\S]*?)\n\s{0,4}\}/)?.[1] ?? "";
  check(`${file} · catch surfaces failure to the page`, /renderUnavailable/.test(catchBody), "catch only logs to console");
}

// ── Part E · dsb-data.js carries no invented defense-spending records ────────────
// The most damaging of the three, because it makes claims about IDENTIFIABLE THIRD
// PARTIES: "Raytheon Intel & Space · NAVSEA · $54.2M · May 26", "General Dynamics
// Land · TACOM · $87.5M", "F-35 GSE Support IDIQ · incumbent DRS Technologies ·
// $500M". Real defense contractors, invented award values, agencies and dates,
// under a green LIVE pill citing "FY2026 · FPDS-NG + USAspending.gov". The route
// serving it says "Template-only with mock data for design review" and it sits
// behind the auth gate on a permanent nav item.
console.log("\n── Part E · dsb-data.js holds no invented spending records ──");
const dsb = read("dsb-data.js");

const DSB_TEMPLATES = new Set(["AGENCY_FILTERS", "RANK_TABS", "FY_TABS"]);
console.log(`   exempt as render templates: ${[...DSB_TEMPLATES].join(", ")}`);

const dsbArrays = [...dsb.matchAll(/(?:^|\n)\s*(?:const|var)\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[/g)].map((m) => m[1]);
check("dsb-data.js · array declarations are readable", dsbArrays.length > 0, "found none");
for (const name of dsbArrays) {
  if (DSB_TEMPLATES.has(name)) continue;
  check(
    `dsb-data.js · ${name} holds no record literals`,
    arrayIsEmpty(dsb, name),
    "still contains object literals — invented business data",
  );
}

// A named company beside a dollar figure is the specific harm. These are the exact
// third parties the file shipped; none of them was sourced from anything.
for (const co of ["Raytheon", "General Dynamics", "Ducommun", "DRS Technologies", "Vertex Aerospace", "Aviall"]) {
  check(`dsb-data.js · no invented award attributed to "${co}"`, !dsb.includes(co), "named third party present");
}

// The page must not assert a live federal data source it never queries.
const dsbHtml = read("defense-spending.html");
check(
  "defense-spending.html · no LIVE pill over unwired data",
  !/class="live-pill"[^>]*>\s*LIVE/i.test(dsbHtml),
  "a LIVE pill is asserted",
);
check(
  "defense-spending.html · does not cite FPDS-NG / USAspending as its source",
  !/FPDS-NG|USAspending/i.test(dsbHtml),
  "cites a federal source the route never queries",
);

// ── Part D · planted positives: prove every checker can fail ─────────────────────
console.log("\n── Part D · planted positives (each probe must catch a known bad) ──");
const PLANTED_ARR = `const UPDATES = [ { clause: '252.204-7021', diff: { before: 'x', after: 'y' }, affects: 7 } ];`;
const PLANTED_SILENT = `async function wire(){ const items = []; if (!items.length) return; }`;

check("D1 · array-shape check catches a planted record", declared(PLANTED_ARR, "UPDATES") && !arrayIsEmpty(PLANTED_ARR, "UPDATES"));
check("D2 · diff sweep catches planted clause text", /\bdiff\s*:\s*\{\s*before\s*:/.test(PLANTED_ARR));
check("D3 · affects sweep catches a planted count", /\baffects\s*:\s*\d/.test(PLANTED_ARR));
check("D4 · silent-return sweep catches a planted early return", /if\s*\(\s*!\s*items\.length\s*\)\s*return\s*;/.test(PLANTED_SILENT));
// NEGATIVE controls — these must NOT fire, or every fix looks broken and the gate is
// unreadable. (_today's `[^\]]*` form fails D5 against nested-object arrays; that is
// why arrayIsEmpty is brace-balanced.)
check("D5 · array-shape check does NOT fire on an emptied array", arrayIsEmpty(`const UPDATES = [];`, "UPDATES"));
check("D6 · array-shape check does NOT fire on a template of primitives", arrayIsEmpty(`const TYPES = [ 'all', 'FAR' ];`, "TYPES"));

// ── The live SAM feed is not silently truncated ────────────────────────────
// It was held at 200 AFTER a newest-posted-first sort, so the rows deleted were the
// oldest posted — which skew hard to soonest closing. Measured on a real 147-row feed the
// eight nearest the chopping block had 0,1,1,1,2,2,7,8 days left. Separately, one call per
// code read the first page only and lost the rest at the source. Both were console warnings.
{
  const feed = readFileSync(
    join(import.meta.dirname ?? __dirname, "..", "..", "src", "lib", "bd-os", "live-opportunities.ts"),
    "utf8"
  );
  check("the 200-row feed cap is gone", !/FEED_CAP/.test(feed), "the feed is truncated again");
  check("SAM is paginated, not read one page deep",
    /offset: String\(offset\)/.test(feed) && /while \(items\.length < first\.total/.test(feed),
    "a code with more than one page loses the remainder at the source");
  check("any residual ceiling keeps by soonest deadline, never newest posted",
    /SAFETY_CEILING/.test(feed) && /a\.response_deadline \? Date\.parse\(a\.response_deadline\)/.test(feed),
    "a truncation would again delete what the customer can still bid on");
  check("F-P1 · these checks can see the old shape",
    /FEED_CAP/.test("const FEED_CAP = 200;") && !/offset: String\(offset\)/.test("limit: String(PAGE_LIMIT),"));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
