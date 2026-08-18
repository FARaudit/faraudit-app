// /defense-spending — every state on the map carries its abbreviation.
// Run: npx tsx test/public/_defense-spending-map-labels.test.ts
//
// CEO ruling 2026-08-11: label every state whether or not it holds obligations.
// The risk that ruling creates is the reason for Part C — the feed names only the
// TOP TEN states per code, so a state with no row is one we did not measure into
// that ten, NOT a state with zero. A label that looked like the funded ones would
// assert a measurement nobody made, so the muted treatment and the legend key are
// load-bearing, not decoration.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pageSource } from "./_page-styles";

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const APP = read("public/dsb-app.js");
// Markup PLUS the stylesheet the page links — the map's CSS moved into a shared
// file when a second page began rendering these panels, and this gate is about
// whether the muted treatment SHIPS, not which file it was written in.
const HTML = pageSource("defense-spending.html");

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// ── A · the geography names the state, not the data ──
console.log("\n── A · every state is named ──");
{
  const block = (APP.match(/const FIPS_ABBR = \{[\s\S]*?\};/) || [""])[0];
  check("a FIPS to abbreviation table exists", block.length > 0);
  const pairs = [...block.matchAll(/'(\d{2})':\s*'([A-Z]{2})'/g)];
  check("it covers 50 states + DC", pairs.length === 51, String(pairs.length));

  // Spot-checks against the real FIPS codes. A table that is merely the right
  // SIZE can still be wrong in every entry.
  const map = new Map(pairs.map((m) => [m[1], m[2]]));
  const spot: Array<[string, string]> = [
    ["01", "AL"], ["06", "CA"], ["11", "DC"], ["36", "NY"], ["48", "TX"], ["51", "VA"], ["56", "WY"],
  ];
  for (const [fips, ab] of spot) {
    check(`FIPS ${fips} is ${ab}`, map.get(fips) === ab, String(map.get(fips)));
  }
  // 03, 07, 14, 43 and 52 are not states — a table that invented them would be
  // drawing labels onto geography that does not exist.
  check("no non-existent FIPS codes are invented",
    !["03", "07", "14", "43", "52"].some((f) => map.has(f)));

  check("the label falls back to geography when the feed has no row",
    /const abbrFor = \(d\) =>[\s\S]{0,120}FIPS_ABBR\[d\.id\]/.test(APP),
    "reading the abbreviation off the data row is what limited labels to funded states");
}

// ── B · the label set is no longer gated on having data ──
console.log("\n── B · the filter that limited labels is gone ──");
{
  check("labels are selected by abbreviation, not by a data row",
    /const labeled = states\.features\.filter\(d => abbrFor\(d\) && abbrFor\(d\) !== 'HI'\)/.test(APP),
    "ST[d.id] as the filter is exactly what left unfunded states unnamed");
  check("no surviving filter requires a feed row before labelling",
    !/labeled = states\.features\.filter\(d => ST\[d\.id\]/.test(APP));
  check("small states still route to the callout column",
    /callItems\.push\(\{ s: ST\[d\.id\] \|\| null, abbr: ab/.test(APP),
    "DC and RI cannot hold an inline label at this projection");
  check("a callout for an unfunded state does not crash on a missing row",
    /geoColor\(it\.s \? it\.s\.val : null\)/.test(APP),
    "it.s.val on a null row throws and takes the whole map render with it");
}

// ── C · negative control · a label must not assert a measurement ──
console.log("\n── C · an unfunded label states a NAME, never a value ──");
{
  check("an unfunded state's label is drawn muted",
    /return 'geo-lab nodata'/.test(APP),
    "styled like a funded one it would read as a measured value");
  check("the muted style exists and is visually quieter",
    /\.geo-lab\.nodata\{[^}]*opacity:\.72/.test(HTML) && /\.geo-callout\.nodata\{/.test(HTML));
  check("the legend keys what the unfunded fill means",
    /outside the top ten/.test(APP),
    "without it a muted label over a pale fill reads as a measured zero");
  check("the page still states that absence is not zero",
    /absent is outside that ten, not a zero/.test(APP),
    "this sentence is the whole reason the labels are allowed to exist");
}

// ── D · the render lifecycle the labels live inside ──
console.log("\n── D · nothing is drawn before the feed settles ──");
{
  check("a loading feed draws nothing and removes nothing",
    /if \(st === 'loading'\) return;/.test(APP),
    "the earlier seed tore the data region out before the fetch resolved");
  check("the unavailable notice is reached only from a settled failure",
    /Reached only from a\s*\n?\s*SETTLED failure/.test(APP) || /SETTLED failure/.test(APP));
}

// ── E · the harness can record a failure ──
console.log("\n── E · self-arm ──");
{
  const before = fail;
  const realLog = console.log;
  console.log = () => {};
  check("(self-arm)", false, "deliberate");
  console.log = realLog;
  const armed = fail === before + 1;
  fail = before;
  pass++;
  if (!armed) {
    console.log("✗ FAIL  the harness cannot record a failure — every result above is meaningless");
    process.exit(1);
  }
  console.log("✓ PASS  a deliberate false assertion was counted as a failure, then retracted");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
