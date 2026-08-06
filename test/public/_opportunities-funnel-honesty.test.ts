// ─────────────────────────────────────────────────────────────────────────────
// Gate — the funnel line must say why nothing was subtracted, correctly.
//
// The defect: the NAICS line read `S.profile ? A : B`, and `S.profile` was
// assigned `false` once and never `true` anywhere. The true branch was
// unreachable, so the panel told EVERY customer "no profile on record" — while
// their three NAICS codes sat in the header driving the entire feed. It is the
// first panel a customer reads, and it contradicted the capability statement
// that scopes the product.
//
// The class matters more than the instance: a ternary on a flag nothing sets is
// a decision that only looks like one. So this gate does two things — it checks
// the copy is right for each real scope, and it checks the seam is driven by a
// value the SERVER actually supplies rather than local state that never moves.
//
// Run: npx tsx test/public/_opportunities-funnel-honesty.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const DSO = readFileSync(path.join(process.cwd(), "public", "dso-app.js"), "utf8");
const LIVE = readFileSync(path.join(process.cwd(), "public", "opportunities-live.js"), "utf8");
const CODE = DSO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nA · the dead flag is gone, not merely bypassed");
ok(!/S\.profile/.test(CODE), "S.profile is no longer read or written anywhere");
ok(!/profile\s*:\s*false/.test(CODE), "and it is not left sitting in the state object");

console.log("\nB · the seam is driven by a value the SERVER supplies");
ok(/function FEED_SCOPE\(\)/.test(DSO), "a FEED_SCOPE() reader exists");
ok(/window\.DSO\s*&&\s*window\.DSO\.FEED_SCOPE/.test(CODE),
  "it reads window.DSO.FEED_SCOPE — set from the server's feedScopeSource");
// The producer must actually populate it, or the reader is the same dead branch
// in a new place. This is the check that would have caught the original bug.
ok(/window\.DSO\.FEED_SCOPE\s*=\s*data\.feedScopeSource/.test(LIVE),
  "opportunities-live.js assigns it from the API response — the reader has a producer");
ok(/FEED_SCOPE\(\)/.test(CODE), "and the funnel calls it");

console.log("\nC · every scope the server can send has its own honest sentence");
// Extract the label expression and drive it, rather than trusting it by reading.
const m = DSO.match(/const naicsLabel = outNaics[\s\S]*?;\n/);
ok(!!m, "the label is a single addressable expression");
const expr = (m ? m[0] : "").replace(/^\s*const naicsLabel = /, "").replace(/;\s*$/, "");
function labelFor(outNaics: number, scope: string | null): string {
  // eslint-disable-next-line no-new-func
  return Function("outNaics", "FEED_SCOPE", `return (${expr});`)(outNaics, () => scope);
}

const onProfile = labelFor(0, "profile");
ok(!/no profile on record/.test(onProfile),
  "a customer WITH codes on file is NOT told there is no profile", onProfile);
ok(/already limited/.test(onProfile),
  "and is told the real reason nothing was subtracted", onProfile);

const noCodes = labelFor(0, "no-profile-codes");
ok(/no profile on record/.test(noCodes),
  "a customer with NO codes on file is still told so — the message is right, just not for everyone", noCodes);

const unknown = labelFor(0, null);
ok(!/no profile on record/.test(unknown) && !/already limited/.test(unknown),
  "when the server did not say, the copy claims NEITHER", unknown);

const filtered = labelFor(7, "profile");
ok(/you have selected/.test(filtered),
  "a non-zero count is attributed to the customer's own chip filter, not to their profile", filtered);
ok(!/no profile on record/.test(filtered), "and never to a missing profile", filtered);

// Every branch must be reachable — that is the whole lesson.
const outputs = new Set([onProfile, noCodes, unknown, filtered]);
ok(outputs.size === 4, `all four branches produce distinct copy (${outputs.size}/4 distinct)`);

console.log("\nD · falsifiability (planted positive)");
// Plant the original defect: a flag nothing sets. The C checks must reject it.
const plantedExpr = "outNaics ? 'outside the NAICS codes you have selected' : (S_profile ? 'outside your NAICS codes' : 'outside your NAICS codes — no profile on record, so nothing is removed')";
const planted = (outNaics: number) =>
  Function("outNaics", "S_profile", `return (${plantedExpr});`)(outNaics, false);
ok(/no profile on record/.test(planted(0)),
  "the original dead-flag version DOES tell a profiled customer there is no profile",
  "so the C checks reject it");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
