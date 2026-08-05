// /today + /command-center must not ship FABRICATED customer-facing data.
// Run: npx tsx test/public/_today-fabrication.test.ts
//
// Written RED against the pre-fix files (2026-07-29): the served landing page
// showed a dateline of "June 3, 2026" on July 29, invented figures ($32M
// closing, $212M pipeline, $5.4M protest, $18.4M SPY-6, $87M), and TWO named
// people ("Greg Bauer (TACOM)", "Diane Hartwell (NAVSEA)") presented as the
// signed-in user's own pipeline. Rule 61 class: honest-fail is product-wide,
// and blank beats plausible-but-false.
//
// Guards SIX render sites, not two. command-center-live.js only ever replaced
// DESK/ACTIONS/WEEK, so renderKPIs / renderInsight / renderSignals /
// initNotifications stayed hardcoded even when live data arrived — the
// uncomputed-default class (L42): ONE surface inventory, not N serial fixes.
//
// Part C plants a known positive so a vacuous pass is impossible.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// This suite gates public/ assets but must not LIVE in public/: everything under
// there is served verbatim, and a gate file is not an asset. test/public/ → public/.
const PUBLIC = join(import.meta.dirname ?? __dirname, "..", "..", "public");
const read = (f: string) => readFileSync(join(PUBLIC, f), "utf8");

// ── The fabricated tokens that actually shipped. Each is a claim about the
// USER's own business that no query produced.
const BANNED: Array<[string, string]> = [
  ["Greg Bauer", "named contracting officer, fabricated"],
  ["Diane Hartwell", "named contracting officer, fabricated"],
  ["SPY-6", "program asserted as the user's pursuit"],
  ["Desert Aerospace", "invented teaming partner"],
  ["WD 2015-4267", "invented wage determination"],
  ["Field Feeding", "invented solicitation"],
  ["$18.4M", "invented ceiling"],
  ["$5.4M", "invented protest exposure"],
  ["$32M", "invented closing-this-week total"],
  ["$212", "invented pipeline value"],
  ["$87M", "invented CO-controlled value"],
  ["$14.2M", "invented IDIQ value"],
  ["June 3, 2026", "hardcoded dateline"],
  ["78%", "invented CMMC readiness"],
  ["−3.4%", "invented wage delta"],
  ["3.4% below market", "invented wage claim"],
  ["47 days quiet", "invented CO dormancy"],
  ["16 controls", "invented open-control count"],
];

// Shape sweep: a currency literal with a magnitude suffix anywhere in these
// files is a hardcoded business figure. Real values arrive from the API at
// runtime and are formatted, never written as source literals.
const CURRENCY_LITERAL = /\$\d[\d,.]*\s*[MKB]\b/g;

function scan(file: string, body: string) {
  for (const [token, why] of BANNED) {
    const hit = body.includes(token);
    check(`${file} · no "${token}" (${why})`, !hit);
  }
  const money = body.match(CURRENCY_LITERAL);
  check(
    `${file} · no hardcoded $-magnitude literals`,
    money === null,
    money ? `found ${money.slice(0, 6).join(", ")}` : ""
  );
}

console.log("── Part A · no fabricated tokens in the served files ──");
const ccApp = read("cc-app.js");
const todayHtml = read("today.html");
scan("cc-app.js", ccApp);
scan("today.html", todayHtml);

// ── Part B · the data arrays must be empty, not merely edited. An array that
// still holds records is a mock waiting to be re-shipped.
console.log("\n── Part B · mock data arrays are empty ──");
function arrayIsEmpty(src: string, name: string): boolean {
  // Matches `NAME: [` / `const NAME = [` and inspects up to the closing
  // bracket for object-literal records.
  const re = new RegExp(`(?:${name}\\s*[:=]\\s*)\\[([^\\]]*)\\]`, "m");
  const m = re.exec(src);
  if (!m) return false; // declaration gone entirely is also acceptable — caller decides
  return !/\{\s*\w/.test(m[1]);
}
const declared = (src: string, name: string) =>
  new RegExp(`(?:${name}\\s*[:=]\\s*)\\[`).test(src);

for (const name of ["ACTIONS", "WEEK"]) {
  check(
    `cc-app.js · ${name} holds no record literals`,
    !declared(ccApp, name) || arrayIsEmpty(ccApp, name),
    "still contains object literals"
  );
}
// renderSignals / initNotifications held their mocks in local arrays
// (`sigs`, `ITEMS`) — invisible to any ACTIONS/WEEK fix.
for (const name of ["sigs", "ITEMS"]) {
  check(
    `cc-app.js · local mock array "${name}" holds no record literals`,
    !declared(ccApp, name) || arrayIsEmpty(ccApp, name),
    "still contains object literals"
  );
}
// renderKPIs' `cards` array legitimately survives as a TEMPLATE (labels,
// routes, tones) — what must not survive is a hardcoded VALUE. So instead of
// requiring it empty, require that every tile value is read from the live
// payload: the function must reference CC.LIVE, and the currency/token sweeps
// above already fail on any figure written as a literal.
const kpiBody = /function renderKPIs\(\)\s*\{([\s\S]*?)\n  \}/.exec(ccApp)?.[1] ?? "";
check("cc-app.js · renderKPIs reads values from CC.LIVE", /CC\.LIVE|\bL\b/.test(kpiBody), "no live read found");
check(
  "cc-app.js · renderKPIs has no bare numeric-value literals",
  !/val:\s*['"][^'"]*\d/.test(kpiBody),
  "a tile value is written as a literal"
);
check("cc-app.js · renderKPIs prints an em dash for unknown", kpiBody.includes("DASH"), "no unknown-value fallback");

// Shape guard for the class as a whole: any COUNT baked into the static shell
// is a number nobody counted. Sidebar badges and header stats must ship empty
// or em-dashed and be filled from the API (three sidebar counts — past audits,
// at-risk pipeline, agencies — shipped hardcoded and were caught by driving the
// page, not by reading it). Non-numeric badges ("New", "Live") are labels.
console.log("\n── Part B2 · no counts baked into the static shell ──");
{
  const badges = todayHtml.match(/<span class="sb-badge[^"]*"[^>]*>([^<]*)<\/span>/g) || [];
  const numericBadges = badges.filter((b) => /> *\d/.test(b));
  check(
    "today.html · no hardcoded sidebar badge counts",
    numericBadges.length === 0,
    numericBadges.join(" ")
  );
  const hdrStats = todayHtml.match(/id="(hsAct|hsCrit|hsDays|bellBadge)"[^>]*>([^<]*)</g) || [];
  const numericStats = hdrStats.filter((s) => /> *\d/.test(s));
  check(
    "today.html · no hardcoded header-stat / bell values",
    numericStats.length === 0,
    numericStats.join(" ")
  );
}

// ── Part C · planted positive: prove the checker can fail. A sweep that finds
// nothing is the most believable false clean.
console.log("\n── Part C · planted positive (the probe must catch a fabrication) ──");
const PLANTED = `const sigs = [{ t: 'Greg Bauer (TACOM) controls $87M', d: 'x' }];`;
const plantedTokenCaught = BANNED.some(([t]) => PLANTED.includes(t));
const plantedMoneyCaught = CURRENCY_LITERAL.test(PLANTED);
const plantedArrayCaught = declared(PLANTED, "sigs") && !arrayIsEmpty(PLANTED, "sigs");
check("C1 · banned-token list catches the planted row", plantedTokenCaught);
check("C2 · currency sweep catches the planted figure", plantedMoneyCaught);
check("C3 · array-shape check catches the planted record", plantedArrayCaught);

// ─────────────────────────────────────────────────────────────────────────────
// Part D · THE PIPELINE READ MUST NOT FAIL OPEN (added 2026-08-04)
//
// /api/command-center-data selected `pipeline.status` — a column that does not
// exist. The select returned 42703, the handler turned that into `[]`, and every
// pipeline number on Today became a structural zero: the customer had 3 pursuits
// on file while the page showed an empty pipeline and hid the sidebar badge.
// Verified against production: the corrected select returns those 3 rows.
//
// The contract now matches the one this same route already uses for the live
// feed — null on failure, never [] — so "no pursuits" and "could not read your
// pursuits" stay different facts.
// ─────────────────────────────────────────────────────────────────────────────
{
  const ROUTE = readFileSync(join(process.cwd(), "src", "app", "api", "command-center-data", "route.ts"), "utf8");
  const CCAPP = readFileSync(join(process.cwd(), "public", "cc-app.js"), "utf8");

  const sel = ROUTE.match(/from\("pipeline"\)\s*\n?\s*\.select\("([^"]+)"\)/);
  check("D1 · the pipeline select is findable (gate fails closed if it moves)", !!sel);
  const cols = (sel ? sel[1] : "").split(",").map((c) => c.trim());
  // The real columns, read from production 2026-08-04.
  const REAL = new Set(["stage", "due_date", "updated_at", "estimated_value", "agency",
    "naics", "notes", "solicitation_number", "title", "id", "user_id", "created_at"]);
  const bogus = cols.filter((c) => c && !REAL.has(c));
  check("D2 · every selected pipeline column exists", bogus.length === 0, "bogus: " + bogus.join(","));

  check("D3 · a pipeline query error yields null, not an empty array", /r\.error\s*\?\s*null/.test(ROUTE));
  check("D4 · the response carries whether the pipeline was readable", /pipelineAvailable/.test(ROUTE));
  check("D5 · pipelineTotal is null when unreadable", /pipelineTotal\s*=\s*pipelineAvailable\s*\?/.test(ROUTE));

  check("D6 · the page renders the unreadable case distinctly", /pipelineAvailable\s*===\s*false/.test(CCAPP));
  check("D7 · …and says so in words", /could not be read/.test(CCAPP));
  check("D8 · the old foot that asserted an empty pipeline is gone", !/no stated values in your pipeline/.test(CCAPP));

  // planted positives
  check("D9 · PLANTED: the column probe catches `status` returning", ["stage", "due_date", "status"].filter((c) => !REAL.has(c)).length === 1);
  check("D10 · PLANTED: the null-on-error probe rejects the old fail-open handler", !/r\.error\s*\?\s*null/.test(`.then((r) => (r.data as any[]) || [], () => [] as any[])`));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
