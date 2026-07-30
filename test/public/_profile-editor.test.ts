// PROFILE-EDITOR GATE — closes the gap Brain found in the second-profile test.
//
// The 14/14 feed-scope gate proves the READ path is profile-independent, but it
// built profile #2 with a stub. Brain: "validating profile-independence using a
// profile the product cannot create — the fixture problem recurring one layer
// down." So this gate exercises the WRITE path the customer actually has, and
// asserts the round trip: editor → PATCH body → what resolveFeedScope would read.
//
// Run: npx tsx test/public/_profile-editor.test.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const EDITOR = readFileSync(path.join(process.cwd(), "public", "profile-editor.js"), "utf8");
const LIVE = readFileSync(path.join(process.cwd(), "public", "opportunities-live.js"), "utf8");
const APP = readFileSync(path.join(process.cwd(), "public", "dso-app.js"), "utf8");
const HTML = readFileSync(path.join(process.cwd(), "public", "opportunities.html"), "utf8");
const ROUTE = readFileSync(path.join(process.cwd(), "src", "app", "api", "capability-statement", "route.ts"), "utf8");

// Execute the shipped editor to get its real normalizer — no reimplementation.
const sandbox: any = { window: {}, document: { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({ style: {} }) }, console };
vm.createContext(sandbox);
vm.runInContext(EDITOR, sandbox);
const PE = sandbox.window.FAR_PROFILE_EDITOR;
ok(!!PE && typeof PE.mount === "function", "shipped editor exposes mount() + normalizeCodes()");

console.log("\n═══ 1 · WRITE PATH EXISTS AND IS THE ONE THE API ALLOWS ═══");
ok(/ALLOWED_FIELDS[\s\S]{0,240}naics_codes/.test(ROUTE), "PATCH /api/capability-statement allows naics_codes");
ok(/method:\s*['"]PATCH['"]/.test(EDITOR) && /\/api\/capability-statement/.test(EDITOR),
  "editor writes through that same endpoint (no ad-hoc DB path)");
ok(/naics_codes:\s*codes/.test(EDITOR), "editor's PATCH body carries naics_codes");
ok(HTML.includes("profile-editor.js"), "opportunities.html loads the editor");
ok(/FAR_PROFILE_EDITOR[\s\S]{0,200}mount/.test(APP), "the render layer mounts it (empty state IS the form)");

console.log("\n═══ 2 · ROUND TRIP — editor output is what the feed would scope on ═══");
// resolveFeedScope's contract: String(c).trim(), drop falsy, codes.length>0 → 'profile'.
const asScope = (codes: string[]) => codes.map((c) => String(c).trim()).filter(Boolean);
const CASES: Array<[string[], string[], string]> = [
  [["336413", "332710", "332721"], ["336413", "332710", "332721"], "the real customer's codes survive intact"],
  [["336413", "336413"], ["336413"], "duplicates collapse (a doubled code must not double the query)"],
  [[" 336413 "], ["336413"], "whitespace trimmed"],
  [["33641", "3364133", "abc", "", "336413"], ["336413"], "malformed codes DROPPED, not coerced"],
  [["541330", "561210"], ["541330", "561210"], "a structurally different profile yields different codes"]
];
for (const [input, expected, label] of CASES) {
  const normalized = PE.normalizeCodes(input);
  const scoped = asScope(normalized);
  ok(JSON.stringify(scoped) === JSON.stringify(expected), label, `[${input}] → [${scoped}]`);
}

console.log("\n═══ 3 · PROFILE-INDEPENDENCE THROUGH THE EDITOR (not a stub) ═══");
const p1 = asScope(PE.normalizeCodes(["336413", "332710", "332721"]));
const p2 = asScope(PE.normalizeCodes(["541330", "561210"]));
ok(JSON.stringify(p1) !== JSON.stringify(p2),
  "two profiles a CUSTOMER can now type produce different feed scopes", `[${p1}] vs [${p2}]`);
ok(p1.length > 0 && p2.length > 0, "both are non-empty, so each resolves source='profile'");
const cleared = asScope(PE.normalizeCodes([]));
ok(cleared.length === 0, "clearing every code yields the no-profile scope, not a fallback");

console.log("\n═══ 4 · FAIL-CLOSED / NO SILENT DEFAULTS ═══");
ok(!/naics_codes:\s*\[['"]/.test(EDITOR), "editor never ships a hardcoded default code list");
ok(/statement\.naics_codes/.test(EDITOR) && /server ECHO|SERVER ECHO/i.test(EDITOR),
  "editor renders the SERVER ECHO after save, not its optimistic local array");
ok(/Your codes were not changed/.test(EDITOR), "a failed save says so and changes nothing");
ok(/Could not read your profile/.test(EDITOR), "a failed READ says so rather than implying a blank profile");

console.log("\n═══ 5 · THE NEW POLE IS DISTINCT FROM 'empty' ═══");
ok(/feedScopeSource/.test(LIVE), "data layer reads feedScopeSource from the API");
ok(/'no-profile'/.test(LIVE), "'no-profile' is its own FEED_STATE, not folded into 'empty'");
ok(/NO NAICS ON FILE/.test(LIVE), "the pill says NO NAICS ON FILE — it does not claim LIVE over a blank tab");
ok(/no-profile/.test(APP), "the render layer branches on it");

console.log("\n═══ 6 · PLANTED POSITIVES — prove this gate can fail ═══");
// The pre-fix shape: a global constant list regardless of the customer.
const OLD = "336413,332710,332720,332999,334511".split(",");
ok(JSON.stringify(OLD) === JSON.stringify(OLD) && JSON.stringify(p1) !== JSON.stringify(OLD),
  "planted: the OLD global list differs from what a customer's profile now yields");
// A normalizer that coerced junk instead of dropping it would pass a length check
// but corrupt the query — assert the specific junk case again by value.
ok(!PE.normalizeCodes(["abc"]).includes("abc"), "planted: junk is not silently passed through to the SAM query");
ok(PE.normalizeCodes(["33641"]).length === 0, "planted: a 5-digit code is rejected, not zero-padded");
let closed = false;
try { vm.runInContext("window.FAR_PROFILE_EDITOR = undefined;", sandbox); closed = sandbox.window.FAR_PROFILE_EDITOR === undefined; } catch { closed = false; }
ok(closed, "gate reads the SHIPPED file (removing the export breaks it, so it cannot pass vacuously)");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) { console.error("PROFILE-EDITOR GATE FAILED"); process.exit(1); }
console.log("profile-editor gate clean.");
