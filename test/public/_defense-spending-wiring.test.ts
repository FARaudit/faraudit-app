// /defense-spending — the writer/reader contract between the route, the client
// mapper and the app.
// Run: npx tsx test/public/_defense-spending-wiring.test.ts
//
// THE DEFECT THIS EXISTS FOR. The route can return a field, the app can render
// it, and the page can still show "No codes tracked" forever — because the thing
// in between, defense-spending-live.js, copies the response onto window.DSB one
// NAMED FIELD AT A TIME. Add a field to the payload and to the renderer, forget
// the mapper, and every gate stays green while the panel is permanently empty.
// That is exactly what happened to SB_SHARE and CONCENTRATION on first deploy.
//
// Three files, three deploy targets, and nothing else makes them agree.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const APP = read("public/dsb-app.js");
const LIVE = read("public/defense-spending-live.js");
const SEED = read("public/dsb-data.js");
const BUILDER = read("src/lib/bd-os/defense-spending.ts");

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// ── A · every field the app READS is a field the mapper WRITES ──
console.log("\n── A · reader ⊆ writer ──");
{
  // What the app reads off the shared data object.
  const reads = new Set(
    [...APP.matchAll(/\bD\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])
  );
  // What the mapper assigns, plus what the seed file declares before the fetch.
  const writes = new Set([
    ...[...LIVE.matchAll(/window\.DSB\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]),
    ...[...SEED.matchAll(/\b([A-Z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]),
  ]);

  check("the app reads a real set of fields off D", reads.size >= 9, String(reads.size));
  const orphans = [...reads].filter((r) => !writes.has(r));
  check("every field the app reads is written by the mapper or seeded",
    orphans.length === 0,
    `never populated: ${orphans.join(", ")} — the panel renders its empty state forever`);

  // The two that shipped broken. Named explicitly so a future rename cannot
  // quietly drop them and leave the generic check passing on a smaller set.
  for (const f of ["SB_SHARE", "CONCENTRATION", "BY_FY", "MARKET_TREND", "RECOMPETES", "coverage"]) {
    check(`${f} is carried end to end`,
      LIVE.includes(`window.DSB.${f} =`),
      "the route can return it and the app can render it while this line is missing");
  }
}

// ── B · and the mapper only carries what the route actually returns ──
console.log("\n── B · writer ⊆ payload ──");
{
  const mapped = [...LIVE.matchAll(/window\.DSB\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[^;]*\bdata\.([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((m) => m[2]);
  check("the mapper reads named fields off the response", mapped.length >= 6, String(mapped.length));
  // The payload interface is the contract. A field the mapper reads that the
  // builder never emits is a silent undefined, which renders as an empty panel
  // rather than an error.
  const KNOWN_OPTIONAL = new Set(["AGENCY_FILTERS"]); // tolerated: defaulted in the mapper
  const missing = mapped.filter((f) => !KNOWN_OPTIONAL.has(f) && !BUILDER.includes(`${f}:`) && !BUILDER.includes(`${f},`));
  check("every field the mapper reads is emitted by the builder",
    missing.length === 0,
    `not in the payload: ${missing.join(", ")}`);
}

// ── C · negative control · the empty state is real, not a stand-in for a bug ──
console.log("\n── C · an empty panel must mean empty data ──");
{
  check("the share panel states its own empty case",
    /No codes tracked/.test(APP),
    "a panel that renders nothing on missing data is indistinguishable from one that is broken");
  check("nothing before the fetch settles is drawn",
    /if \(st === 'loading'\) return;/.test(APP));
  check("the seed does not pre-populate the new fields",
    !/SB_SHARE|CONCENTRATION/.test(SEED),
    "a seeded array would render as measured data before the feed answered");
}

// ── D · state that changes must be RE-rendered, not rendered once ──
console.log("\n── D · the code filter repaints on every change ──");
{
  check("the code pills have their own renderer",
    /function renderCodePills\(\)/.test(APP),
    "living inside a build-once function is what froze their active state");
  check("and it is called from syncControls, not only from build",
    /else chip\.classList\.remove\('show'\);\s*\n\s*renderCodePills\(\);/.test(APP),
    "the filter worked while the pills never showed which code was active");
  check("the pill reflects S.code rather than a fixed value",
    /S\.code === code \? ' on' : ''/.test(APP) && /aria-pressed=/.test(APP));
  check("a second click clears the selection",
    /S\.code = \(S\.code === b\.dataset\.code\) \? null : b\.dataset\.code/.test(APP),
    "without it the aggregate view is unreachable once a code is picked");
  // The sub-line under a patched KPI must move with the number above it.
  check("the scoped recipients card patches its sub-line, not just its count",
    /val: String\(list\.length\),\s*\n\s*sub:/.test(APP),
    "patching only the number printed '1 of 20 small business' beside a list of 7");
}

// ── E · self-arm ──
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
