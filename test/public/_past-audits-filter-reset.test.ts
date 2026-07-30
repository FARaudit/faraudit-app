// PAST-AUDITS FILTER-RESET DRIFT GATE (2026-07-29).
//
// Bug this pins (found live on /past-audits, demo account):
//   Card #769 re-keyed the slicer set — Status → Window, Recommendation → the
//   verdict rail. The slicer-bar clear (#paClear) was updated to the new keys.
//   The no-match "clear filters" link was NOT: it kept resetting the RETIRED
//   `rec`/`status` keys and omitted `window` entirely. STATE.f.window then
//   became `undefined`, and rowMatchesBar's
//       if (f.window !== "all" && a._w !== f.window) return false;
//   rejected EVERY row. So the one control offering to rescue you from the
//   empty state emptied the whole ledger instead — and syncSlicers, seeing all
//   selects at "all", hid the WORKING clear button. Reload was the only exit.
//
// The class is TWO-WRITERS DRIFT, not a typo, so the fix was to collapse every
// reset onto one defaultFilters() writer and this gate enforces that shape:
// a second literal key set cannot be introduced without failing here.
//
// Falsification (run it both ways — a gate that cannot fail proves nothing):
//   npx tsx test/test/public/_past-audits-filter-reset.test.ts                 → PASS (fixed)
//   git show HEAD~1:public/dashboard-live.js > /tmp/old.js && \
//     npx tsx test/test/public/_past-audits-filter-reset.test.ts /tmp/old.js   → FAIL (the live bug)

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2] || join(process.cwd(), "public", "dashboard-live.js");
const src = readFileSync(SRC, "utf8");
console.log(`target: ${SRC} (${src.length} bytes)\n`);

// ── FAIL CLOSED ON UNRECOGNIZABLE INPUT ──────────────────────────────────────
// Every check below is "the bad pattern is ABSENT", so a file that isn't
// dashboard-live.js at all scores partial ✅s. Caught live 2026-07-29: pointing
// this gate at the DEPLOYED asset returned an HTTP 307 body (15 bytes) and two
// checks passed on it — an inert input reading as a passing input. Unrecognized
// bytes must land on the restrictive pole, never the permissive one, so the
// fingerprint is asserted BEFORE any absence-based check runs.
const FINGERPRINT: Array<[string, RegExp]> = [
  ["dashboard-live IIFE header", /Past Audits \/ Dashboard live wiring/],
  ["the STATE object", /\bvar\s+STATE\s*=\s*\{/],
  ["the row predicate", /function\s+rowMatchesBar/],
];
const missingPrint = FINGERPRINT.filter(([, re]) => !re.test(src)).map(([n]) => n);
if (missingPrint.length) {
  console.error(`❌ ABORT — target is not public/dashboard-live.js (missing: ${missingPrint.join(", ")}).`);
  console.error(`   First 120 bytes: ${JSON.stringify(src.slice(0, 120))}`);
  console.error(`   Refusing to report on unrecognizable bytes: every check here tests for the ABSENCE`);
  console.error(`   of a bad pattern, so a redirect body / 404 page / empty file would score partial passes.`);
  process.exit(2);
}

let failures = 0;
const assert = (c: boolean, m: string) => {
  console.log(`${c ? "✅" : "❌"} ${m}`);
  if (!c) failures++;
};

function keysOf(literal: string): string[] {
  return [...literal.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]).sort();
}

// ── 1. the single writer exists and carries the full live slicer set ─────────
const def = src.match(/function\s+defaultFilters\s*\(\s*\)\s*\{\s*return\s*\{([^}]*)\}/);
assert(!!def, "defaultFilters() is the single source of the slicer key set");
const canonical = keysOf(def?.[1] ?? "");
for (const key of ["time", "window", "agency", "type", "naics", "setAside"]) {
  assert(canonical.includes(key), `defaultFilters() includes \`${key}\``);
}
// `window` is called out on its own: dropping it is the exact live defect, and
// its absence is silent (undefined !== "all" rejects every row).
assert(canonical.includes("window"), "defaultFilters() includes `window` — the key whose omission emptied the ledger");

// ── 2. no reset may bypass it with its own literal ───────────────────────────
const literalResets = [...src.matchAll(/STATE\.f\s*=\s*\{([^}]*)\}/g)];
literalResets.forEach((m) => {
  const line = src.slice(0, m.index ?? 0).split("\n").length;
  assert(false, `dashboard-live.js:${line} resets STATE.f from a LITERAL (${keysOf(m[1]).join(", ")}) — must call defaultFilters()`);
});
assert(literalResets.length === 0, "no STATE.f reset bypasses defaultFilters() with an inline literal");

const literalInit = src.match(/\bf:\s*\{([^}]*)\}/);
assert(!literalInit, `STATE initializer uses defaultFilters()${literalInit ? ` — found literal (${keysOf(literalInit[1]).join(", ")})` : ""}`);

// ── 3. every clear control actually routes through the writer ────────────────
const callSites = [...src.matchAll(/STATE\.f\s*=\s*defaultFilters\(\)/g)].length;
assert(callSites >= 2, `both clear controls call defaultFilters() (found ${callSites} reset call site(s))`);

// ── 4. the predicate that turns an omission into an empty ledger still exists,
//      so the invariant above stays load-bearing. If this line is ever changed
//      to tolerate undefined, re-read this gate rather than silently keeping it.
assert(
  /f\.window\s*!==\s*"all"\s*&&\s*a\._w\s*!==\s*f\.window/.test(src),
  "rowMatchesBar still rejects rows on a non-'all' window value (why a dropped key empties the ledger)"
);

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
