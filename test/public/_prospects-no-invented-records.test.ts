// Gate — /prospects never invents a company, and never invents a federal identifier.
//
// WHAT SHIPPED BEFORE THIS GATE. /prospects rendered a hardcoded SEED of four subcontractors
// to SIGNED-IN customers as their own prospect list: invented cities, invented scores to one
// decimal (9.2 · 8.8 · 8.3 · 7.8), invented statuses ("Audit complete", "RFI in flight") and an
// invented contact person. /prospects/[slug] went further — a RECORDS map with four invented
// UEIs and four invented CAGE codes, plus certifications, revenue bands, audit histories and
// FIVE NAMED INDIVIDUALS with titles and a "reachable" flag, laid out over six tabs as though
// researched.
//
// ⛔ A UEI AND A CAGE CODE HAVE EXACTLY ONE HONEST SOURCE: SAM. Inventing one is not a
// placeholder — it is a federal registration identifier that resolves to nothing, shown to a
// contractor who may act on it.
//
// WHY THE FIX IS "NOTHING YET" AND NOT REAL ROWS: no source exists. `from("prospects")` appears
// nowhere in this codebase. Wiring one is #SESS-SALES-AI. The routes stay so that item has
// somewhere to land — deleting an in-flight surface is its own defect.
//
// P1 no invented companies · P2 no invented federal identifiers · P3 no invented people ·
// P4 the surfaces still exist and say what is true · P5 planted positives.
//
// Run: npx tsx test/public/_prospects-no-invented-records.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
/* Comments stripped: both files name the invented values in order to explain them. Three gates
   in this repo have already convicted their own warning text. */
const code = (p: string) =>
  readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LIST = code("src/app/prospects/page.tsx");
const SLUG = code("src/app/prospects/[slug]/page.tsx");
const BOTH = LIST + "\n" + SLUG;

console.log("P1 · no invented companies");
for (const n of ["Snoe Inc", "PMR Global", "Southern Machine Works", "American Valmark"]) {
  ok(!BOTH.includes(n), `the invented company "${n}" is gone`);
}
ok(!/\bconst SEED\b/.test(LIST), "no seed array remains on the list");
ok(!/\bconst RECORDS\b/.test(SLUG), "no records map remains on the detail page");

console.log("\nP2 · no invented federal identifiers");
for (const u of ["MK7XAB99TB29", "JK39AB72MN18", "RT47BC81PL92", "WX52CD93QR41"]) {
  ok(!BOTH.includes(u), `the invented UEI ${u} is gone`);
}
ok(!/\buei\s*:\s*["'`]/.test(BOTH), "no UEI is written into the page at all",
  "a UEI has one honest source and it is SAM");
ok(!/\bcage\s*:\s*["'`]/.test(BOTH), "no CAGE code is written into the page at all");

console.log("\nP3 · no invented people");
for (const p of ["Rachel Prevost", "Marvin Snoe", "Linda Park", "Patricia Russo", "Bill Henderson"]) {
  ok(!BOTH.includes(p), `the invented contact "${p}" is gone`);
}
ok(!/decision_makers/.test(BOTH), "no fabricated decision-maker roster remains");
ok(!/reachable/.test(BOTH), "and no 'reachable' claim about a person remains");

console.log("\nP4 · the surfaces still exist and say what is true");
for (const r of ["src/app/prospects/page.tsx", "src/app/prospects/[slug]/page.tsx"]) {
  ok(existsSync(join(ROOT, r)), `${r} still exists — an in-flight surface is not deleted`);
}
ok(/not connected to a data source|nothing here yet|No record/i.test(LIST + SLUG),
  "the pages state plainly that there is no data yet");
ok(!/from\(["'`]prospects["'`]\)/.test(BOTH),
  "and neither pretends to read a prospects table that does not exist");

console.log("\nP5 · planted positives");
ok(/\bconst SEED\b/.test('const SEED = [{name:"Snoe Inc"}]'),
  "the P1 detector would catch a reinstated seed");
ok(/\buei\s*:\s*["'`]/.test('uei: "MK7XAB99TB29"'),
  "the P2 detector would catch a reinstated identifier");
ok(!/\buei\s*:\s*["'`]/.test(code("src/app/prospects/page.tsx")),
  "and it does not fire on the live file");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
