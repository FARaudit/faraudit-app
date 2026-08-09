// THE SIZE-STANDARD TABLE IS DATA THE ENGINE READS FOR ELIGIBILITY.
//   npx tsx test/public/_naics-reference.test.ts
//
// The table was maintained by hand. Checked against 13 CFR 121.201 it carried two wrong
// thresholds (334511 said 1,250 where SBA says 1,350; 541513 said $34M where SBA says
// $37.0M), five codes with no threshold at all, two codes listed twice — where the lookup
// resolved to the copy WITHOUT a size standard — and one code the regulation no longer
// contains. None of that is visible to a reader, and a threshold that is too low can make
// a firm look too large for a set-aside it actually qualifies for.
//
// This pins the properties that make the table trustworthy: it is generated, every row is
// unique, every code sits in its own sector, and no row states a figure it cannot source.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const src = read("public/naics-reference.js");
const page = read("public/naics.html");
const build = read("scripts/naics/build-naics-reference.mjs");
// The tab's behaviour moved out of an inline <script> in naics.html and into its own served
// file. The invariants below are unchanged; only where they are written has changed. Read the
// two together so a check cannot pass merely because the code it guards left the file.
const tab = read("public/naics-tab.js");
const surface = page + "\n" + tab;

// Loaded the way the browser loads it — the file is an IIFE that assigns window.NAICS_REF,
// so planting a window on the global and requiring it runs the real module.
(globalThis as any).window = {};
createRequire(import.meta.url)(join(ROOT, "public", "naics-reference.js"));
const REF: any = (globalThis as any).window.NAICS_REF;

console.log("── the table is generated, not typed ──");
check("the file declares itself generated", /GENERATED\. Do not edit by hand/.test(src), "a hand-edited table drifts from the regulation between revisions");
check("it names the regulation it came from", /13 CFR 121\.201/.test(src), "no source cited for a threshold the engine reads");
check("a build script is checked in", build.length > 0);
check("the build can verify the committed file", /--check/.test(build), "no way to detect a stale committed table");

console.log("\n── every row is real, unique, and sourced ──");
const DATA: any[][] = REF?.DATA;
check("the table loaded", Array.isArray(DATA) && DATA.length > 0, "module did not populate window.NAICS_REF");
check("it covers the regulation, not a sample", DATA.length > 900, `only ${DATA.length} codes`);
const codes = DATA.map((r) => String(r[0]));
check("every code is six digits", codes.every((c) => /^\d{6}$/.test(c)), `bad: ${codes.filter((c) => !/^\d{6}$/.test(c)).slice(0, 3).join(", ")}`);
const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
check("NO duplicate codes", dupes.length === 0, `duplicated: ${[...new Set(dupes)].join(", ")}`);
check("byCode holds every row", Object.keys(REF.byCode).length === DATA.length, "the lookup lost rows to collisions");

// A row that states a threshold must state its kind, or the page renders a bare number
// with no unit — and a row with no threshold at all cannot be checked against anything.
const sizeless = DATA.filter((r) => !r[3]);
check("every row carries a size standard", sizeless.length === 0, `${sizeless.length} row(s) have none, e.g. ${sizeless.slice(0, 3).map((r) => r[0]).join(", ")}`);
const kindless = DATA.filter((r) => r[3] && r[4] !== "rev" && r[4] !== "emp");
check("every threshold declares revenue or employees", kindless.length === 0, `${kindless.length} row(s) would render a number with no unit`);
check("every row has all nine cells", DATA.filter((r) => r.length !== 9).length === 0, "a short row shifts every column after it");

console.log("\n── a code sits in its own sector ──");
// Sector is the code's first two digits BY DEFINITION, so it is checkable. Reading it off
// the last heading seen filed 400+ manufacturing codes under Construction while every row
// still had a sector — presence was never the property worth asserting.
const inSector = (code: string, id: string) => {
  const p = Number(code.slice(0, 2));
  const [lo, hi] = String(id).split("-").map(Number);
  return p >= lo && p <= (isNaN(hi) ? lo : hi);
};
const misfiled = DATA.filter((r) => !r[8] || !inSector(String(r[0]), String(r[8])));
check("every code is inside the sector it is filed under", misfiled.length === 0,
  `${misfiled.length} misfiled, e.g. ${misfiled.slice(0, 3).map((r) => `${r[0]}→${r[8]}`).join(", ")}`);
check("manufacturing is its own sector", DATA.some((r) => r[8] === "31-33"), "the ranged sector heading did not parse");
check("transportation is its own sector", DATA.some((r) => r[8] === "48-49"), "the ranged sector heading did not parse");
check("sectors are declared for the browse control", Array.isArray(REF.SECTORS) && REF.SECTORS.length > 10, `only ${REF.SECTORS?.length} sectors`);

console.log("\n── retired codes are gone ──");
check("811219 is absent — the regulation folded it into 811210", !REF.byCode["811219"], "a customer can pick a code SBA no longer carries");
check("811210 is present", !!REF.byCode["811210"]);
check("the build refuses an overlay naming a dead code", /absent from 121\.201/.test(build), "a retired code could be reintroduced by the overlay");

console.log("\n── spot-check against 13 CFR 121.201 ──");
// Transcribed from the regulation. If SBA revises these the gate goes red, and the answer
// is to re-run the build — never to edit the expectation to match the table.
const SPOT: Record<string, [string, string]> = {
  "334511": ["1,350", "emp"],   // was 1,250 by hand
  "541513": ["$37M", "rev"],    // was $34M by hand
  "541310": ["$12.5M", "rev"],  // was empty — the duplicate row won
  "541715": ["1,000", "emp"],   // was empty — the duplicate row won
  "332710": ["500", "emp"],
  "336412": ["1,500", "emp"],
};
for (const [code, [size, kind]] of Object.entries(SPOT)) {
  const r = REF.byCode[code];
  check(`${code} · ${size} ${kind === "emp" ? "employees" : "revenue"}`, !!r && r[3] === size && r[4] === kind,
    r ? `table says ${r[3]} ${r[4]}` : "code absent");
}

console.log("\n── the page renders what is sourced and omits what is not ──");
// r[8] is the sector; r[1] the curated category. Scoping on r[8] is the invariant — 951 of
// 978 rows carry no category, so a directory keyed on it would hide them.
check("the directory groups by sector, not the editorial category",
  /r\[8\]\s*!==\s*S\.scope/.test(tab) && /SEC_N\[r\[8\]\]/.test(tab),
  "the rail still scopes on the curated category, which most rows lack");
// Nothing is defaulted: the four editorial fields render only where all four are sourced,
// and every element carrying authored content is marked so the gate can find it.
check("the editorial block is gated on all four sourced fields",
  /function isEd\(r\)\s*\{\s*return !!\(r\[1\] && r\[5\] && r\[6\] && r\[7\]\)/.test(tab),
  "a row missing a field would render undefined as a chip");
check("the register row renders editorial content only behind that gate",
  /if \(isEd\(r\)\)/.test(tab), "the chips and note are drawn unconditionally");
check("the category chip is conditional in the card", /if \(r\[1\] && CM\[r\[1\]\]\)/.test(tab),
  "a row without a category would read a property of undefined");
check("the note block is conditional in the card", /if \(r\[7\]\)/.test(tab),
  "an empty note renders as an empty insight block");
check("authored content is marked for the gate to read", (tab.match(/dataset\.ed/g) || []).length >= 4,
  "data-ed is what distinguishes sourced content from rendered chrome");
check("search is null-safe on editorial fields",
  /\(r\[7\] \|\| ''\)/.test(tab) && /r\[1\] && CM\[r\[1\]\] \?/.test(tab),
  "searching would throw on rows with no note or category");
// Comments are documentation, not shipped claims. Scanning them made the copy check fire
// on the comment explaining why the copy changed — the same way the settings gate did.
// Code only, for every check that asks "does this still ship?".
const pageCode = surface.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
check("no stale hardcoded size-standard vintage", !/tbl\s*\d\/\d{4}/.test(pageCode), "a hand-typed table date will outlive the data");
check("the count is not described as a curated set", !/defense-relevant codes/.test(pageCode), "copy still claims a curated subset over the full regulation");
check("N-P0 · the copy check can still see shipped text", /codes with an SBA size standard/.test(pageCode), "stripping comments removed the copy too — the check would pass on an empty string");

console.log("\n── the settings picker names itself as suggestions, not the table ──");
// The picker browses the CURATED categories, which cover a few dozen codes. That is the
// right shape for a dropdown — nobody browses a thousand rows — but with the reference
// now carrying the whole regulation, an unlabelled list of two dozen reads as the whole
// of NAICS. Search spans every row; the copy has to say so.
{
  const live = read("public/profile-settings-live.js");
  check("the picker labels its list as common/suggested, not as the reference",
    /Common defense codes/.test(live), "an unlabelled short list reads as the entire table");
  check("it states how to reach the codes it is not showing",
    /Search or type any six-digit code to reach the other/.test(live), "no route offered to the rest of the table");
  check("the remainder is COMPUTED, not typed",
    /\.length - \(ref\.DATA \|\| \[\]\)\.filter/.test(live), "a hand-typed count goes stale the next time SBA revises");
  check("no copy still calls the reference a subset of NAICS",
    !/carries a subset of NAICS/.test(live), "stale copy understates what the table now holds");
  check("the no-match message explains what absence means",
    /so a code that is absent is one SBA does not size/.test(live), "absence reads as a gap in our data rather than a fact about SBA");
  check("N-P5 · rejects the stale subset copy", /carries a subset of NAICS/.test("It carries a subset of NAICS — type it in."));
}


// THE OVERLAY AND THE GENERATED FILE MUST AGREE ON EVERY CATEGORY. The categories are the one
// part of this table that is NOT derived from 13 CFR — they are hand-authored in overlay.json —
// so nothing else would catch an edit landing in one file and not the other. That drift is silent:
// the picker groups by the GENERATED value while a future regeneration would restore the overlay's.
{
  const overlay = JSON.parse(read("scripts/naics/overlay.json")) as { rows: Record<string, { cat?: string }> };
  const gen = read("public/naics-reference.js");
  const mismatched: string[] = [];
  let compared = 0;
  for (const [code, row] of Object.entries(overlay.rows)) {
    if (!row || typeof row.cat !== "string" || !row.cat) continue;
    const m = gen.match(new RegExp(`\\['${code}','([a-z]*)'`));
    if (!m) { mismatched.push(`${code} absent from the generated file`); continue; }
    compared++;
    if (m[1] !== row.cat) mismatched.push(`${code}: overlay ${row.cat} vs generated ${m[1]}`);
  }
  check("every overlay category compared against the generated file", compared > 0,
    "nothing was compared — this leg is inert");
  check("overlay and generated file agree on every category",
    mismatched.length === 0, mismatched.join(" · "));
}

console.log("\n── planted positives ──");
check("N-P1 · the duplicate check catches a repeat", (() => { const c = ["1", "2", "1"]; return c.filter((x, i) => c.indexOf(x) !== i).length === 1; })());
check("N-P2 · the sector check catches a misfile", !inSector("332710", "23"));
check("N-P3 · the sector check accepts a correct file", inSector("332710", "31-33"));
check("N-P4 · a sizeless row is caught", [["999999", "", "x", "", ""]].filter((r) => !r[3]).length === 1);

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
