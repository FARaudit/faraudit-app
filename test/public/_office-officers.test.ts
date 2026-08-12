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
ok(/No buying office recorded on this award/.test(rcCall), "no office on the row says so");
ok(/looking up contracting officers/.test(rcCall), "the lookup running is its own state");
ok(/could not be read/.test(rcCall),
  "a failed lookup says OUR gap", "not 'no officer', which would be a claim about the office");
ok(/no officer at this office has posted/.test(rcCall),
  "office known + no match is the only case that states something about the directory");
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
ok(/if \(!document\.getElementById\('rcList'\)\) return;/.test(LIVE),
  "…and only on the page that renders recompete rows");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
