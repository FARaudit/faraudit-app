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
  ["empty", "no notices in the current window"],
  ["loading", "Connecting to the SAM.gov ingest"],
] as const) {
  ok(metaFn.includes(needle), `the ${state} state still has its own copy`, `"${needle}"`);
}
ok(/state\s*===\s*['"]error['"]/.test(metaFn), "and the live line is gated behind the state branch");

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
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail === 0) console.log("freshness gate clean — the clock is derived and #feedMeta has one owner.");
process.exit(fail === 0 ? 0 : 1);
