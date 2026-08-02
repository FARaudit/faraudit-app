// FRESHNESS GATE — no frozen clock, and one writer per node.
//
// The defect this exists for shipped to production and was visible in the header:
// `· newest posted 25h ago` was a LITERAL. It was correct the day it was typed and
// wrong every hour after, on the one page whose whole premise is "live". Worse, the
// page already derived the true value (DSO.LAST_INGEST) and then discarded it,
// because #feedMeta had TWO writers and renderHeader ran last.
//
// The design-parity gate could not catch it twice over: set equality proves a
// literal did not CHANGE, never that it was WRONG — and the header region sits
// outside the slice that gate reads at all.
//
// Run: npx tsx test/public/_opportunities-freshness.test.ts

import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const APP = path.join(process.cwd(), "public", "dso-app.js");
const LIVE = path.join(process.cwd(), "public", "opportunities-live.js");
const appSrc = readFileSync(APP, "utf8");
const liveSrc = readFileSync(LIVE, "utf8");

// Comments are stripped before every sweep. A comment that EXPLAINS the frozen
// literal is not a frozen literal, and counting it would make the gate unfixable —
// you could never describe the bug you fixed.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// Extract a function body by brace matching from its declaration.
function fnSource(src: string, name: string): string {
  const decl = `function ${name}(`;
  const i = src.indexOf(decl);
  if (i < 0) return "";
  const open = src.indexOf("{", i);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return "";
}

// A relative-time phrase a human would read as freshness: "25h ago", "3 days ago",
// "22 hours ago", "2d ago".
const RELTIME = /\b\d+\s*(h|hr|hrs|hour|hours|d|day|days|m|min|mins|minute|minutes|w|week|weeks)\s+ago\b/i;

console.log("═══ 1 · THE SWEEP ACTUALLY READ SOMETHING ═══");
// Design's C18 discipline: print the size of what was swept. A toString()/extractor
// that returns nothing must report a measurement of ZERO, not a clean pass.
const headerFn = stripComments(fnSource(appSrc, "renderHeader"));
const metaFn = stripComments(fnSource(appSrc, "feedMetaHTML"));
// The four statements now live in ONE source read by BOTH surfaces, so the copy
// assertions must read that source, not just the header function.
function constSource(src: string, name: string): string {
  const i = src.indexOf(`const ${name} = {`);
  if (i < 0) return "";
  const open = src.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return "";
}
const copySrc = stripComments(
  constSource(appSrc, "FEED_COPY") + fnSource(appSrc, "windowPhrase") +
  fnSource(appSrc, "feedCopy") + fnSource(appSrc, "feedMetaHTML"));
const listFn = stripComments(fnSource(appSrc, "renderList"));
ok(headerFn.length > 200, "renderHeader() was located and swept", `${headerFn.length} chars`);
ok(metaFn.length > 200, "feedMetaHTML() was located and swept", `${metaFn.length} chars`);

console.log("\n═══ 2 · NO FROZEN CLOCK IN THE HEADER ═══");
const headerHit = headerFn.match(RELTIME);
const metaHit = metaFn.match(RELTIME);
ok(!headerHit, "renderHeader() states no relative time as a literal",
  headerHit ? `FROZEN: "${headerHit[0]}"` : "none");
ok(!metaHit, "feedMetaHTML() states no relative time as a literal",
  metaHit ? `FROZEN: "${metaHit[0]}"` : "none");

console.log("\n═══ 3 · THE FRESHNESS CLAUSE IS DERIVED, AND OPTIONAL ═══");
ok(/LAST_INGEST/.test(metaFn), "the freshness clause reads DSO.LAST_INGEST");
ok(/newest posted/.test(metaFn), "the clause still renders when a value exists");
// It must DISAPPEAR when unmeasured, not fall back to a default. An uncomputed
// default is the same defect wearing a conditional.
ok(/\?[\s\S]{0,120}newest posted[\s\S]{0,60}:\s*''/.test(metaFn.replace(/\s+/g, " ")) ||
   /LAST_INGEST\s*\)\s*\?/.test(metaFn),
  "and disappears when nothing was measured (no fallback string)");
ok(/LAST_INGEST\s*=/.test(liveSrc), "live.js is what derives LAST_INGEST");

console.log("\n═══ 4 · ONE WRITER PER NODE ═══");
const writers: string[] = [];
for (const [name, src] of [["dso-app.js", appSrc], ["opportunities-live.js", liveSrc]] as const) {
  const bare = stripComments(src);
  // any assignment into the #feedMeta element
  const re = /(getElementById\(\s*['"]feedMeta['"]\s*\)|\$\(\s*['"]feedMeta['"]\s*\))[\s\S]{0,80}?\.(innerHTML|textContent|innerText)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare)) !== null) writers.push(name);
  // the aliased form: `const meta = ...feedMeta...` then `meta.innerHTML =`
  if (/const\s+(\w+)\s*=\s*document\.getElementById\(\s*['"]feedMeta['"]\s*\)/.test(bare)) {
    const alias = bare.match(/const\s+(\w+)\s*=\s*document\.getElementById\(\s*['"]feedMeta['"]\s*\)/)![1];
    const aliasWrites = new RegExp(`\\b${alias}\\.(innerHTML|textContent|innerText)\\s*=`, "g");
    let a: RegExpExecArray | null;
    while ((a = aliasWrites.exec(bare)) !== null) writers.push(`${name} (via ${alias})`);
  }
}
ok(writers.length === 1, "exactly one place writes #feedMeta",
  writers.length ? writers.join(" · ") : "NONE — nobody writes it, which is also wrong");
ok(writers[0] === "dso-app.js", "and it is renderHeader in dso-app.js", writers[0] || "n/a");

console.log("\n═══ 5 · THE NON-LIVE STATES SURVIVED THE MOVE ═══");
// Removing setFeedStatus's #feedMeta branch must not have dropped the honest
// outage copy. Without these, a failed read still prints "N open notices read live
// from SAM.gov" — asserting a live read that never returned.
for (const [state, needle] of [
  ["error", "feed unavailable"],
  ["no-profile", "No NAICS codes on file"],
  ["empty", "no notices under your NAICS codes"],
  ["loading/unknown", "Reading the live SAM.gov feed"],
] as const) {
  ok(copySrc.includes(needle), `the ${state} state still has its own copy`, `"${needle}"`);
}

console.log("\n═══ 5b · THE COUNT SENTENCE IS REACHED, NEVER FALLEN INTO ═══");
// Design's finding on card 792: the count line used to be the DEFAULT branch, so
// any state added later — stale, cached, partial, a typo — would print "N open
// notices read live from SAM.gov" with no live read behind it. The honesty
// contract has to hold by construction, not by the state list staying short.
ok(/if\s*\(\s*state\s*===\s*['"]live['"]\s*\)/.test(metaFn),
  "the count sentence requires state==='live' explicitly");
{
  const returns = metaFn.match(/return\s+[^;]+;/g) || [];
  const last = returns[returns.length - 1] || "";
  ok(returns.length > 3, "the return set was actually extracted", `${returns.length} returns`);
  ok(!/open notices read live/.test(last),
    "the fall-through return is NOT the count sentence", last.slice(0, 52).replace(/\s+/g, " "));
  ok(/feedCopy\s*\(\s*state\s*,\s*['"]header['"]\s*\)/.test(last),
    "…it is the shared neutral line, read from the one source");
}

console.log("\n═══ 5c · THE WINDOW IS DERIVED, NOT TYPED ═══");
// Same class as the frozen clock: "30 days" typed into copy is correct today and
// silently wrong the day WINDOW_DAYS changes.
ok(/FEED_WINDOW_DAYS/.test(copySrc), "the empty line reads DSO.FEED_WINDOW_DAYS");
ok(!/last\s+\d+\s+days/.test(copySrc), "no window length is hardcoded in the copy",
  (copySrc.match(/last\s+\d+\s+days/) || ["none hardcoded"])[0]);
ok(/FEED_WINDOW_DAYS/.test(liveSrc), "live.js publishes it from the server response");
ok(/in the window read/.test(copySrc), "and the number is omitted when the server did not send one");

console.log("\n═══ 5d · ONE SOURCE, TWO SURFACES ═══");
// Design's card-793 finding: renderList was a SECOND state machine stating the
// same four facts in the words the header pass had just removed — the page said
// "Connecting" in one place and "Reading" in the other about the same request.
// A node is not a unit of voice; a state is.
ok(listFn.length > 200, "renderList() was located and swept", `${listFn.length} chars`);
ok(/feedCopy\s*\(/.test(listFn), "the empty list reads the SHARED copy source");
ok(/feedCopy\s*\(/.test(metaFn), "…and so does the header");
for (const orphan of [
  "Connecting to the SAM.gov feed",
  "Nothing on this page is sample data",
  "add one and the feed scopes to it",
  "The live SAM.gov feed is empty right now",
  "no notices matched in the current window",
]) {
  ok(!listFn.includes(orphan), `renderList no longer authors its own copy`, `"${orphan.slice(0, 40)}"`);
}
// FEED_SCOPE's real value is 'no-profile-codes', so a === 'no-profile' test can
// never match and the fixable case fell through to "the feed is empty".
ok(!/FEED_SCOPE\s*===\s*['"]no-profile['"]/.test(listFn),
  "the list keys on FEED_STATE, not the FEED_SCOPE value that could never match");
// The button needs a target: plistProfile was READ in two places and RENDERED in none.
ok(/id="plistProfile"/.test(listFn), "renderList RENDERS #plistProfile, so the editor can mount");

console.log("\n═══ 6 · PLANTED POSITIVES — prove this gate can fail ═══");
{
  const frozen = metaFn.replace("' on your profile'", "' on your profile · newest posted 25h ago'");
  ok(frozen !== metaFn, "P1a the planted mutation applied");
  ok(RELTIME.test(frozen), "P1b a re-introduced frozen clock IS caught");

  ok(RELTIME.test("newest posted 3 days ago"), "P2 the pattern catches other units ('3 days ago')");
  ok(RELTIME.test("refreshed 22 hours ago"), "P3 ...and other verbs ('22 hours ago')");
  ok(!RELTIME.test("newest posted · derived"), "P4 no false positive on derived copy");

  // P5 the comment-stripper must not become a hiding place
  ok(RELTIME.test(stripComments("const x = 'posted 25h ago';")),
    "P5 a frozen clock in CODE survives comment-stripping");
  ok(!RELTIME.test(stripComments("/* it used to say 25h ago */")),
    "P6 the same words inside a comment are correctly ignored");

  // P7 a missing function must report zero, never pass silently
  ok(fnSource("nothing here", "renderHeader") === "", "P7 a missing function extracts to empty, so §1 fails loudly");

  // P8 the fall-through defect Design found — restore it and §5b must fire
  const fellThrough = metaFn.replace(/if\s*\(\s*state\s*===\s*['"]live['"]\s*\)\s*\{/, "{");
  ok(fellThrough !== metaFn, "P8a the planted fall-through applied");
  ok(!/if\s*\(\s*state\s*===\s*['"]live['"]\s*\)/.test(fellThrough),
    "P8b removing the live guard IS caught");

  // P10 re-authoring copy in the list must be caught
  const split = listFn.replace(/feedCopy\s*\([^)]*\)/, "'Connecting to the SAM.gov feed…'");
  ok(split !== listFn, "P10a the planted re-author applied");
  ok(split.includes("Connecting to the SAM.gov feed"), "P10b a second author of feed copy IS caught");

  // P9 a hardcoded window must be caught
  const typedWindow = "return 'no notices under your NAICS codes in the last 30 days.';";
  ok(/last\s+\d+\s+days/.test(typedWindow), "P9 a typed window length IS caught");
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail === 0) console.log("freshness gate clean — the clock is derived and #feedMeta has one owner.");
process.exit(fail === 0 ? 0 : 1);
