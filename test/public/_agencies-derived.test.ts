// DEFENSE AGENCIES IS DERIVED, AND TARGET AGENCIES IS GONE.
//   npx tsx test/public/_agencies-derived.test.ts
//
// Settings carried a "Target Agencies" tab that asked the customer to name the agencies
// they cared about. Nothing stored the answer and nothing read it. The deeper problem was
// the question: a small business with no capture team does not know which offices to name,
// and finding that out is the product. So declaring was replaced by deriving.
//
// This pins the two halves. The tab is removed with nothing dangling behind it, and the
// page that replaced it states what it measured rather than implying more.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

const route = read("src/app/api/agencies/route.ts");
const app = read("public/dag-app.js");
const live = read("public/agencies-live.js");
const data = read("public/dag-data.js");
const page = read("public/defense-agencies.html");
const psApp = codeOnly(read("public/ps-app.js"));
const psLive = codeOnly(read("public/profile-settings-live.js"));
const psPage = codeOnly(read("public/profile-settings.html"));

console.log("── Target Agencies is retired, with nothing left dangling ──");
check("no Target Agencies nav entry", !/key:\s*'agencies'/.test(psApp), "the tab is still in the settings nav");
check("no agencies panel renderer", !/^\s*agencies:\s*\(\)\s*=>/m.test(psApp), "the panel body still ships");
check("no AGENCIES array on the page state", !/AGENCIES/.test(psApp), "dead state the panel used to read");
check("settings no longer calls /api/agencies", !/\/api\/agencies/.test(psLive), "a fetch with no consumer left behind");
check("no #agState element or writer", !/agState/.test(psApp) && !/agState/.test(psLive), "the status box outlived its panel");
check("no Agencies header counter", !/hsAgencies/.test(psPage) && !/hsAgencies/.test(psLive),
  "the strip still counts a tab that no longer exists");
// Planted positives — the removal checks must be able to fail.
check("T-P1 · rejects a resurrected nav entry", /key:\s*'agencies'/.test("{ key: 'agencies', label: 'Target Agencies' }"));
check("T-P2 · rejects a resurrected counter", /hsAgencies/.test('<span id="hsAgencies">—</span>'));

console.log("\n── the replacement is derived, never declared ──");
check("the route reads the customer's own NAICS scope", /fetchLiveOpportunitiesScoped/.test(route),
  "offices are not scoped to this customer's codes");
check("it joins the customer's own audits", /fetchRecentAudits/.test(route), "no record of which offices they have worked");
check("no agency column is read or written", !/target_agenc|\.from\(["']agenc/.test(route),
  "the route reaches for storage that does not exist");
check("nothing is seeded in the data file", /OFFICES:\s*\[\]/.test(data) && !/department:/.test(data),
  "dag-data.js ships offices of its own");

console.log("\n── one unit, shared with the feed ──");
// Opportunities counts buying offices as the SECOND segment of resolveAgency's
// "Department · Office". Keying this page on the deeper resolveOfficeLeaf would make the
// two surfaces report different numbers for the same firm.
check("the route splits on the same separator Opportunities uses", /indexOf\(" · "\)/.test(route),
  "a different split means the two surfaces disagree about the same notice");
// Code only. The route's comment EXPLAINS why the deeper leaf is not used, and scanning
// comments made this check fire on its own rationale — the same way the settings and NAICS
// gates did. What must never happen is the leaf being keyed on, not mentioned.
const routeCode = codeOnly(route);
const appCode = codeOnly(app);
check("it does NOT key on the deeper office leaf", !/resolveOfficeLeaf/.test(routeCode),
  "the leaf is not carried on feed rows — this page would disagree with Opportunities");
check("A-P0 · the code-only scan can still see real route logic", /fetchLiveOpportunitiesScoped/.test(routeCode),
  "stripping comments removed the code too — the check would pass on an empty string");

console.log("\n── the span is stated, not implied ──");
check("the page prints the window it measured", /window_days/.test(app), "a rank with no stated span reads as a trend");
check("it says the ranking is not a running total", /not a running total/.test(app),
  "nothing distinguishes current-window volume from accumulated history");
check("no 90-day claim in anything rendered", !/90[- ]day/i.test(appCode) && !/90[- ]day/i.test(routeCode),
  "nothing persists notice history, so a 90-day count cannot be honest");

console.log("\n── empty is three answers, and failure is not one of them ──");
check("no-codes-on-file is named separately", /no-profile-codes/.test(route) && /no-profile-codes/.test(app),
  "a fixable profile reads the same as a real zero");
check("an empty window is named separately", /no-notices-in-window/.test(route),
  "a real zero is not distinguished");
check("a failed feed returns a failure state, not an empty list", /state: "error"/.test(route) && /503/.test(route),
  "an upstream failure would render as 'no offices'");
check("the client keeps failure and empty apart", /state === 'error'/.test(live) && /state: 'empty'/.test(live),
  "the page collapses two different facts into one");
check("the live pill only lights on ok", /state !== 'ok'/.test(app), "the pill would claim live over a failure");

console.log("\n── the page states what it is ──");
check("the header no longer says no source is connected", !/no source is connected/.test(page),
  "stale copy denying the data it now shows");
check("it names whose codes these are", /your NAICS codes/i.test(page), "the scope is not stated on the page");

console.log("\n── planted positives ──");
// ── "Your audits" counts runs that FINISHED ────────────────────────────────
// fetchRecentAudits applies no status filter, so this column was counting failed runs and
// telling the customer we had audited an office when nothing was produced. A run that died
// is our problem, not a fact about their pursuit. Production carried 1 failed of 50 sampled.
const agRoute = read("src/app/api/agencies/route.ts");
check("only completed runs count as an audit",
  /a\.status !== "complete"/.test(agRoute) && /continue/.test(agRoute),
  "a failed run is still counted in Your audits");
// The notice→audit join is a raw string on both sides. It agrees today; normalising is
// insurance, because the failure mode is silent — an unmatched office reads as zero audits.
check("the audit join is normalised on both sides",
  /function officeKey/.test(agRoute)
    && /officeKey\(a\.agency\)/.test(agRoute)
    && /auditedByOffice\.get\(officeKey\(raw\)\)/.test(agRoute),
  "a case or spacing change on SAM's side silently zeroes an office's audit count");
// "Your audits: 37" beside a buying office is read as 37 of their opportunities. It was
// counting engine runs — 21 runs against the Air Force covered 2 solicitations, 3 against
// DLA covered 1. A re-run is our retry, not their pursuit.
check("Your audits counts solicitations, not runs",
  /sols: Set<string>/.test(agRoute) && /cur\.sols\.add\(sol\)/.test(agRoute)
    && /o\.audited = hit\.sols\.size/.test(agRoute),
  "re-auditing one solicitation inflates the office's count");
check("A-P5 · that check can see a run-counting renderer",
  !/cur\.sols\.add\(sol\)/.test('cur.audited += 1;'));
check("A-P4 · the completed-runs check can see its own absence",
  !/a\.status !== "complete"/.test('for (const a of audits) { cur.audited += 1; }'));

check("A-P1 · rejects a 90-day claim", /90[- ]day/i.test("ranked by volume over the last 90 days"));
check("A-P2 · rejects a seeded data file", /department:/.test("window.DAG={OFFICES:[{department:'Army'}]}"));
check("A-P3 · accepts an empty data file", !/department:/.test("window.DAG = { OFFICES: [], META: null };"));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
