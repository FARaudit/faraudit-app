// Pipeline must show the customer's OWN pipeline — or nothing, and say which.
// Run: npx tsx test/public/_pipeline-fabrication.test.ts
//
// Written RED (2026-08-06). public/pipeline.html shipped a 19-record PURSUITS array and an
// inline renderer that painted the KPI strip, the stage rail, the banner and the cards at
// parse time; public/pipeline-live.js then replaced the CARDS only. Measured live against the
// signed-in account, which holds 3 pursuits:
//
//   page said                          truth
//   In Flight 19, "across 7 stages"    3, one stage
//   Pipeline Value $239.7M             every estimated_value null
//   P0 3, "1 CO overdue"               2, both overdue
//   Due <=7 days 7                     0 (both dates expired)
//   rail 2 1 4 6 3 2 1 0               0 0 3 0 0 0 0 0
//
// And because TWO renderers owned #cards, clicking stage 04 replaced the customer's real
// pursuits with six fabricated ones (DISA, CECOM, NETCOM, DLA Aviation, NAVFAC, USACE).
//
// No pipeline gate existed at all — the fabrication gates that do exist scan today.html,
// defense-news.html and defense-spending.html, so none of this could go red.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const html = read("public/pipeline.html");
const js = read("public/pipeline-live.js");
const api = read("src/app/api/pipeline/route.ts");

// ── Part A · the markup states no number before the fetch settles ──
console.log("── Part A · the page ships no portfolio claim ──");
{
  check("A1 · a KPI strip exists to check", /class="kpi-strip"/.test(html), "no kpi-strip — this gate asserts nothing");

  const kpiVals = [...html.matchAll(/<div class="kpi-val">([\s\S]*?)<\/div>/g)].map((m) => m[1].trim());
  check("A2 · four KPI slots found", kpiVals.length === 4, `found ${kpiVals.length}`);
  const numeric = kpiVals.filter((v) => /\d/.test(v));
  check("A3 · no KPI ships a number", numeric.length === 0, `numeric KPIs: ${numeric.join(" | ")}`);

  const feet = [...html.matchAll(/<div class="foot">([\s\S]*?)<\/div>/g)].map((m) => m[1].trim());
  const numericFeet = feet.filter((f) => /\d/.test(f));
  check("A4 · no KPI footnote ships a number", numericFeet.length === 0, numericFeet.join(" | "));

  const allBtn = (html.match(/<button[^>]*id="allBtn"[^>]*>([\s\S]*?)<\/button>/) ?? ["", ""])[1];
  check("A5 · the show-all control ships no count", !/\d/.test(allBtn), `allBtn label: "${allBtn}"`);

  // The mock itself, and the shape of it.
  check("A6 · no PURSUITS array survives", !/\bPURSUITS\b/.test(html), "the mock record set is back");
  check("A7 · no inline renderer owns the data regions",
    !/getElementById\(['"](cards|rail|banner)['"]\)/.test(html),
    "an inline script writes a region pipeline-live.js owns");
  // A record set is recognisable by shape, not by its variable name.
  const looksLikeRecords = /\{\s*id:\s*['"][A-Z0-9-]{8,}['"]\s*,\s*stage:/.test(html);
  check("A8 · no solicitation-shaped literals in the markup", !looksLikeRecords, "a hardcoded record set is present");
}

// ── Part B · one renderer, one stage-code format ──
console.log("\n── Part B · one renderer, one format ──");
{
  check("B1 · pipeline-live.js is the only script writing the regions",
    /getElementById\(['"]rail['"]\)/.test(js) && /getElementById\(['"]banner['"]\)/.test(js),
    "the renderer does not own the rail/banner");

  // The DB check constraint accepts '01'..'08' (see the route's own comment), and the API
  // returns the padded code. Any second format on the page can never compare equal.
  check("B2 · the API contract is the padded code", /'01'\.\.'08'|"01"\.\."08"/.test(api) || /CAPTURE_STAGES\s*=\s*\["01"/.test(api),
    "could not confirm the server's stage-code contract");
  check("B3 · the renderer declares the padded codes",
    /\['01','02','03','04','05','06','07','08'\]/.test(js), "stage codes are not the padded set");
  // BOTH files: the unpadded emission lived in the PAGE's inline script, so testing only
  // the renderer let this check pass against the exact code it was written to condemn.
  const bothFiles = html + "\n" + js;
  check("B4 · no unpadded data-stage is emitted, in either file",
    !/data-stage="\$\{[^}]*\}"/.test(bothFiles) && !/data-stage="[1-8]"/.test(bothFiles),
    "an unpadded or computed stage code is emitted somewhere");
  check("B5 · one urgency derivation feeds every consumer",
    (js.match(/function daysOf\(/g) || []).length === 1, "more than one urgency derivation");
}

// ── Part C · customer values never become markup ──
console.log("\n── Part C · no data reaches the page as markup ──");
{
  // The fields POST /api/pipeline stores verbatim from SAM.
  const FIELDS = ["title", "agency", "naics", "notes", "solicitation_number"];
  const interpolated = FIELDS.filter((f) => new RegExp(`\\+\\s*(c|r|row)\\.${f}\\b`).test(js));
  check("C1 · no customer field is concatenated into a markup string", interpolated.length === 0,
    `concatenated: ${interpolated.join(", ")}`);
  check("C2 · the renderer builds nodes", /createElement\(/.test(js), "no DOM construction — it is building markup");
  check("C3 · values are set as text", /textContent\s*=/.test(js), "no textContent assignment");
  const innerHTMLWithData = /innerHTML\s*=\s*[^;]*\+/.test(js);
  check("C4 · no innerHTML assignment concatenates anything", !innerHTMLWithData, "innerHTML is built by concatenation");
}

// ── Part D · empty, failed and populated are three different answers ──
console.log("\n── Part D · empty is not failure is not data ──");
{
  check("D1 · a load error is recorded", /loadError/.test(js), "failure is not tracked");
  check("D2 · the catch re-renders instead of returning", /catch\(function\(e\)\{[\s\S]{0,400}?render\(\)/.test(js),
    "the failure path leaves whatever was on screen standing");
  check("D3 · the catch clears the rows", /catch\(function\(e\)\{[\s\S]{0,400}?STATE\.rows\s*=\s*\[\]/.test(js),
    "a failed fetch can leave stale rows on screen");
  check("D4 · KPIs go to a dash on failure, never to zero",
    /if\(STATE\.loadError\)\{[\s\S]{0,200}?'—'/.test(js), "a failed load can render 0");
  check("D5 · the failure copy does not claim an empty pipeline",
    /could not be loaded/.test(js) && /not an empty pipeline/.test(js), "failure and empty read the same");
  check("D6 · an empty pipeline has its own words", /No pursuits yet/.test(js), "no first-run empty state");
  check("D7 · the LIVE pill needs rows AND no error",
    /setLivePill\(\s*!STATE\.loadError\s*&&\s*STATE\.rows\.length\s*>\s*0\s*\)/.test(js),
    "the pill can assert live over a failure");
}

// ── Part E · planted positives — every check above must be able to go red ──
console.log("\n── Part E · planted positives ──");
{
  check("E-P1 · A3 rejects a KPI carrying a number", /\d/.test("19"));
  check("E-P2 · A3 accepts an em-dash placeholder", !/\d/.test("&mdash;"));
  check("E-P3 · A6 rejects the mock array returning", /\bPURSUITS\b/.test("const PURSUITS = ["));
  check("E-P4 · A8 rejects a solicitation-shaped literal",
    /\{\s*id:\s*['"][A-Z0-9-]{8,}['"]\s*,\s*stage:/.test("{id:'N00024-26-R-2207', stage:3,"));
  check("E-P5 · A8 accepts ordinary markup",
    !/\{\s*id:\s*['"][A-Z0-9-]{8,}['"]\s*,\s*stage:/.test('<div class="kpi-val">&mdash;</div>'));
  check("E-P6 · C1 rejects a concatenated title",
    /\+\s*(c|r|row)\.title\b/.test("'<h2>' + c.title + '</h2>'"));
  check("E-P7 · C1 accepts a textContent assignment",
    !/\+\s*(c|r|row)\.title\b/.test("el('h2','pcard-title', c.title || 'Untitled')"));
  check("E-P8 · B4 rejects the computed code the page emitted", /data-stage="\$\{[^}]*\}"/.test("data-stage=\"${i+1}\""));
  check("E-P9 · B4 accepts the padded code", !/data-stage="[1-8]"/.test('data-stage="03"'));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
