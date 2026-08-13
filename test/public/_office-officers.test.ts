// WHO TO CALL · THE OFFICER JOIN — exact match only, and four states that stay apart.
//
// A recompete row carries the buying office that signed; the officer directory keys on SAM's own
// office leaf. Measured 2026-08-12 on the customer's 21 real rows: 21/21 carried an office and 12
// matched an officer we already hold, byte-for-byte, with ZERO normalisation.
//
// ⛔ THE TWO THINGS THAT MUST NOT DRIFT:
//   1. EXACT MATCH. The cost of a bad match is a real officer's phone number printed beside someone
//      else's contract. No folding, no trimming, no fuzzy fallback — a miss that says so is better.
//   2. THE CLAIM. Neither source records who SIGNED. The copy may say "officers who post from this
//      office" and may never say "the officer on this contract".
//
// Run: npx tsx test/public/_office-officers.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = process.cwd();
const APP = readFileSync(join(ROOT, "public", "dsb-app.js"), "utf8");
const LIVE = readFileSync(join(ROOT, "public", "defense-spending-live.js"), "utf8");
const ROUTE_PATH = join(ROOT, "src", "app", "api", "office-officers", "route.ts");
const ROUTE = existsSync(ROUTE_PATH) ? readFileSync(ROUTE_PATH, "utf8") : "";
const WORKER = readFileSync(join(ROOT, "agents", "defense-spending", "usaspending.ts"), "utf8");

// ── R1 · THE JOIN KEY IS CAPTURED ────────────────────────────────────────────
console.log("\nR1  THE BUYING OFFICE IS CAPTURED AT THE SOURCE");
ok(/office: string \| null;/.test(WORKER), "the worker's RecompeteRow carries an office");
ok(/office_agency_name/.test(WORKER),
  "…read from the award DETAIL endpoint", "the search endpoint returns null for it");
ok(/generated_internal_id/.test(WORKER),
  "…via generated_internal_id, the only handle the detail endpoint accepts");
ok(/catch \{ row\.office = null; \}/.test(WORKER),
  "a failed lookup leaves null — never a guess, and never a throw that costs the whole list");

// ── R2 · EXACT MATCH ONLY ────────────────────────────────────────────────────
console.log("\nR2  EXACT MATCH ONLY — no normaliser anywhere on this path");
ok(ROUTE.length > 0, "the route exists");
ok(/\(box\.offices \|\| \{\}\)\[office\]/.test(APP),
  "the client looks the office up by its EXACT key");
/* ⛔ THE ASSERTION THAT MATTERS. A future edit that adds .toUpperCase(), .trim(),
   .replace() or a fuzzy scorer to this lookup fails here — that is precisely the
   change that would put a wrong officer beside a $1.9B contract. */
const rcCall = APP.slice(APP.indexOf("function rcCall("), APP.indexOf("function rcUnmeasured("));
ok(rcCall.length > 200, "rcCall() located", `${rcCall.length}c`);
const fuzzy = ["toUpperCase()", "toLowerCase()", ".trim()", "levenshtein", "startsWith(", "includes(office"]
  .filter((t) => rcCall.includes(t));
ok(fuzzy.length === 0, "no folding, trimming or fuzzy matching in the lookup",
  fuzzy.length ? `FOUND: ${fuzzy.join(", ")}` : "");
ok(/match: "exact"/.test(ROUTE), "the route declares its match rule to the client");

// ── R3 · FOUR STATES, KEPT APART ─────────────────────────────────────────────
console.log("\nR3  FOUR STATES — only ONE is a fact about the directory");
/* ⛔ THE STATES ARE ASSERTED AS DISTINCT OUTPUTS, not as four remembered sentences.
   The explanation that used to sit on every row now sits ONCE in the panel foot —
   measured, ten rows carried the same 36px paragraph — while each row keeps its own
   office and its own state. Four greps for four literal strings would have gone red
   on that move while describing nothing that changed, so the check is now the thing
   that actually matters: each branch emits DIFFERENT markup, and the claim about
   whose gap it is still ships. */
const branches = [
  /no buying office on this award/,        // the award carries none
  /looking up contracting officers/,       // the lookup is still running
  /could not be read/,                     // the lookup failed — OUR gap
  /no contact held/,                       // office known, directory has nobody
];
const hits = branches.map((re) => (rcCall.match(re) || [])[0]).filter(Boolean);
ok(hits.length === 4, "all four states are emitted", `${hits.length}/4`);
ok(new Set(hits).size === 4, "…and no two of them produce the same words",
  "collapsing any pair states a fact about the directory in a case where it does not hold");
ok(/no buying office on this award/.test(rcCall), "no office on the row says so");
ok(/looking up contracting officers/.test(rcCall), "the lookup running is its own state");
ok(/could not be read/.test(rcCall),
  "a failed lookup says OUR gap", "not 'no officer', which would be a claim about the office");
ok(/no contact held/.test(rcCall),
  "office known + no match is the only case that states something about the directory");
// The row states the FACT; the panel states the CLAIM, once. Both must ship — a chip
// with no explanation anywhere reads as "this office has no officers", which is the
// one thing this feed cannot support.
const APP_ALL = readFileSync(join(ROOT, "public/dsb-app.js"), "utf8");
ok(/that is our gap, not an\s*\n?\s*.?office without officers/.test(APP_ALL)
   || /our gap, not an ' \+ 'office without officers/.test(APP_ALL)
   || /no contact — that is our gap/.test(APP_ALL),
  "the panel states ONCE that a missing contact is OUR gap, not an office without officers");
ok(/carr' \+ \(callable === 1 \? 'ies' : 'y'\) \+ ' a contracting/.test(APP_ALL),
  "…and it counts how many rows a reader can actually call");
ok(/state: 'loading'/.test(LIVE) && /state: 'unwired'/.test(LIVE) && /state: 'ok'/.test(LIVE),
  "the fetcher sets all three transport states");
ok(/state: "unwired"/.test(ROUTE) && /503/.test(ROUTE),
  "a failed SAM read answers 503 unwired, never an empty map that reads as 'no officers'");

// ── R4 · THE CLAIM IS BOUNDED ────────────────────────────────────────────────
console.log("\nR4  IT NEVER CLAIMS THE OFFICER SIGNED THE CONTRACT");
ok(/not necessarily the officer on this contract/.test(rcCall),
  "the lede states the weaker, true claim");
const OVERCLAIM = [/the officer on this contract(?!")/, /awarded by <b>/i, /signed by/i, /contract officer for this award/i];
const over = OVERCLAIM.filter((re) => re.test(rcCall.replace("not necessarily the officer on this contract", "")));
ok(over.length === 0, "and nothing on the path claims they signed it");

// ── R5 · THE MARKUP IS VALID ─────────────────────────────────────────────────
console.log("\nR5  THE CALL BLOCK SITS OUTSIDE THE ROW'S ANCHOR");
// A mailto nested inside the row's own <a> is invalid, and the browser drops one
// of the two links. Which one is not something to leave to the parser.
ok(/'<div class="rc-item">' \+ row \+ rcCall\(r\) \+ '<\/div>'/.test(APP),
  "the anchor and the call block are siblings, not nested");
ok(/mailto:/.test(rcCall) && /tel:/.test(rcCall), "the contacts are actually actionable");
ok(/replace\(\/\[\^0-9\+\]\/g, ''\)/.test(rcCall), "the tel: href is stripped to diallable characters");

// ── R6 · IT IS NOT IN FRONT OF THE PANELS ────────────────────────────────────
console.log("\nR6  A SLOW UPSTREAM DOES NOT GATE THE PAGE");
ok(/paint\(\);\s*\n\s*loadOfficers\(\);/.test(LIVE),
  "the officers load AFTER the panels are painted", "a live SAM call must not gate every panel");
/* ⛔ THE GUARD IS CHECKED AGAINST THE MARKUP, NOT AGAINST A LITERAL STRING. Pinning the exact text
   `getElementById('rcList')` proved only that a line had not been edited — and the failure this
   guard can actually have is the opposite one: the line stays untouched while the page it names is
   rebuilt around a different host. The fetch then never fires, OFFICERS keeps its default, and the
   call list states "we hold no contracting officer for any of these offices" — a claim about the
   offices manufactured out of a lookup that was never attempted.
   So: read the ids the guard names, and require one of them to exist on the page whose call list
   depends on this directory. Rebuilding that page without updating the guard now goes red. */
const guardMatch = LIVE.match(/if \(([^;]*getElementById[^;]*)\) return;/);
ok(!!guardMatch, "the fetch is guarded by an early return on a host lookup");
const guardIds = [...(guardMatch?.[1] || "").matchAll(/getElementById\('([^']+)'\)/g)]
  .map((m) => m[1]);
ok(guardIds.length > 0, "…and the guard names the hosts that consume the directory",
  guardIds.join(", "));
const WTC_HTML = readFileSync(join(ROOT, "public", "who-to-call.html"), "utf8");
const named = guardIds.filter((id) => WTC_HTML.includes(`id="${id}"`));
ok(named.length > 0,
  "…including a host /who-to-call actually carries, so its call list gets its officers",
  named.length ? `resolves via #${named.join(", #")}`
    : `guard names ${guardIds.join(", ")} — none of which is on that page`);

// ── R7 · STAYING LIVE WITHOUT LYING ABOUT IT ─────────────────────────────────
console.log("\nR7  THE FEED IS RE-CHECKED, AND A FAILED CHECK IS NOT AN ABSENCE");
/* The record is rebuilt nightly, so a reader with a tab open can sit on
   yesterday's answer for a whole day. Three mechanisms close that window without
   asking them to know they should reload. */
ok(/setInterval\(refresh, REFRESH_MS\)/.test(LIVE), "the feed is re-checked on a timer");
ok(/visibilitychange/.test(LIVE),
  "…and again when the tab comes back to the front, the moment staleness shows");
ok(/setInterval\(repaintStamp, STAMP_MS\)/.test(LIVE),
  "…and the stamp repaints on its own, so a frozen age cannot outlive the clock");
ok(/if \(refreshing \|\| document\.hidden\) return;/.test(LIVE),
  "a hidden tab does not poll — that is the customer's battery, on a page nobody is reading");

/* ⛔ THE INVARIANT THIS SECTION EXISTS FOR. Once a record is on screen, a later
   fetch that fails must leave it there. Routing a refresh failure into unwired()
   would blank a real record because the network blinked, telling the reader
   their data is gone when it is only un-rechecked — and discarding the only copy
   held. So the refresh path gets its own terminal, and it must NOT set STATUS. */
const checkFailedFn = LIVE.slice(LIVE.indexOf("function checkFailed"),
  LIVE.indexOf("async function wire"));
ok(checkFailedFn.length > 0, "the refresh failure path is its own function");
ok(!/STATUS/.test(checkFailedFn),
  "…and it does NOT touch STATUS — a failed re-check never tears down a good record");
ok(/state: 'failed'/.test(checkFailedFn), "…it records that the check failed");
ok(/const fail = isRefresh \? checkFailed : unwired;/.test(LIVE),
  "the first load still tears down honestly; only a REFRESH is non-destructive");
/* addEventListener hands its listener an Event. Passing `wire` directly would
   make that Event arrive as `isRefresh`, so a first load against a dead feed
   would report a failed RE-check over a page that never held a record. */
ok(!/addEventListener\('DOMContentLoaded', wire\)/.test(LIVE),
  "wire() is not handed straight to addEventListener, which would pass an Event as isRefresh");
ok(/addEventListener\('DOMContentLoaded', start\)/.test(LIVE), "…it boots through start()");
ok(/wire\(false\)/.test(LIVE), "…which calls the first load explicitly as a non-refresh");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
