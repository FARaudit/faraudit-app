// ─────────────────────────────────────────────────────────────────────────────
// GAO + TEAMING TRUTH GATE — neither page may fill an empty answer with a seed.
//
// These two differed from the other mock surfaces in an important way: their
// routes are real. Both clients bailed on an EMPTY answer — `if (!decisions
// .length && !agencies.length) return;` and `if (!partners.length) return;` —
// so a single upstream hiccup silently restored the mock. What sat behind that
// bail:
//
//   gao-data.js   ten invented dockets naming REAL companies against REAL
//                 agencies, each with an outcome ("GAO sustained — inadequate
//                 market research"), a dollar value and a days-to-decision.
//   team-data.js  ten invented partner firms with fit scores, complementarity
//                 scores, past-performance dollars and a written rationale for
//                 teaming with each.
//
// Measured while fixing: gao.gov answers 403 to the feed request and the
// `protest_decisions` cache holds zero rows, so the seed is what the page has
// been showing. SAM's entity search, by contrast, answers — 30 registrations
// across this customer's three codes.
//
// The legs:
//   A · neither seed ships records
//   B · no served script computes a field with no writer
//   C · neither page's copy promises one
//   D · an empty answer renders as empty WITH ITS REASON, never as a fallback
//
// Run: npx tsx test/public/_gao-teaming-truth.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUB = path.join(process.cwd(), "public");
const FILES = [
  "gao-data.js", "gao-app.js", "gao-protests-live.js", "gao-protests.html",
  "team-data.js", "team-app.js", "teaming-partners-live.js", "teaming-partners.html"
];
for (const f of FILES) {
  if (!existsSync(path.join(PUB, f))) {
    console.error(`GAO+TEAMING TRUTH GATE cannot run — public/${f} is missing. Failing closed.`);
    process.exit(1);
  }
}
const read = (f: string) => readFileSync(path.join(PUB, f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const GAO = { data: read("gao-data.js"), app: read("gao-app.js"), live: read("gao-protests-live.js"), html: read("gao-protests.html") };
const TEAM = { data: read("team-data.js"), app: read("team-app.js"), live: read("teaming-partners-live.js"), html: read("teaming-partners.html") };

// ── A · the seeds ship no records ───────────────────────────────────────────
console.log("\n── A · seed files carry no records ──");

const RECORD_RX = /\{\s*(id|docket|name|cert|key)\s*:\s*['"]/g;
for (const [label, src] of [["gao-data.js", GAO.data], ["team-data.js", TEAM.data]] as const) {
  const n = (src.match(RECORD_RX) || []).length;
  ok(n === 0, `${label} ships no record literals`, `found ${n}`);
}
ok(/DECISIONS\s*:\s*\[\s*\]/.test(GAO.data), "gao seed declares an empty decision list");
ok(/PARTNERS\s*:\s*\[\s*\]/.test(TEAM.data), "team seed declares an empty partner list");
// A GAO docket number in a seed is the fingerprint of the invented docket set.
ok(!/\bB-\d{6}\b/.test(GAO.data), "gao seed carries no docket numbers");

// ── B · no uncomputable field in any served script ──────────────────────────
console.log("\n── B · no served script computes a field with no writer ──");

const GAO_NO_SOURCE: Array<[string, RegExp]> = [
  ["protest dollar value", /\bval\s*:\s*[\d.]/],
  ["days to decision", /\bdays\s*:\s*\d/],
  ["sustain odds by ground", /groundsList|sustain[_\s]?odds|\bodds\b/i],
  ["risk signals", /signalList|\bRISK_SIGNALS\b/],
  ["an Active protest status", /['"]Active['"]\s*[,:}]/],
  ["a written decision rationale", /\bdetail\s*:\s*['"]GAO (sustained|denied)/]
];
const TEAM_NO_SOURCE: Array<[string, RegExp]> = [
  ["fit score", /\bfit\s*:\s*\d|\.fit\b/],
  ["complementarity score", /\bcomplement\b/],
  ["past-performance dollars", /\bvalue\s*:\s*[\d.]|hsOpps/],
  ["agency overlap claim", /\bagencies\s*:\s*\[\s*['"]/],
  ["a written teaming rationale", /\binsight\s*:\s*['"]/],
  ["cert coverage you-vs-via", /CERT_COVERAGE|\byours\s*:\s*(true|false)|\bvia\s*:\s*\d/]
];

for (const [pageLabel, fields, srcs] of [
  ["gao", GAO_NO_SOURCE, [["gao-app.js", GAO.app], ["gao-data.js", GAO.data], ["gao-protests-live.js", GAO.live]]],
  ["team", TEAM_NO_SOURCE, [["team-app.js", TEAM.app], ["team-data.js", TEAM.data], ["teaming-partners-live.js", TEAM.live]]]
] as const) {
  for (const [label, rx] of fields) {
    const hits = (srcs as ReadonlyArray<readonly [string, string]>)
      .filter(([, src]) => rx.test(strip(src)))
      .map(([n]) => n);
    ok(hits.length === 0, `${pageLabel}: no ${label} in any served script`, hits.join(", "));
  }
}

// ── C · the copy promises nothing either ────────────────────────────────────
console.log("\n── C · page copy promises no unwired panel ──");

const GAO_PROMISES = [/Sustain Rate by Agency/i, /Protest Grounds/i, /Risk Signals/i, /Effectiveness/i, /CourtListener/i, /incumbent-disruption/i];
const TEAM_PROMISES = [/Partner Fit/i, /Complementarity/i, /Certification Coverage/i, /Teaming Opportunities/i, /past performance/i, /FPDS/i];
const gaoPromised = GAO_PROMISES.filter((rx) => rx.test(GAO.html)).map((rx) => rx.source);
const teamPromised = TEAM_PROMISES.filter((rx) => rx.test(TEAM.html)).map((rx) => rx.source);
ok(gaoPromised.length === 0, "gao page promises no unwired panel", gaoPromised.join(", "));
ok(teamPromised.length === 0, "team page promises no unwired panel", teamPromised.join(", "));
ok(/not a past-performance record/i.test(TEAM.app), "team states what a registration match is not");

// ── D · an empty answer keeps its reason ────────────────────────────────────
console.log("\n── D · empty is rendered as empty, with the reason ──");

for (const [label, src] of [["gao-protests-live.js", GAO.live], ["teaming-partners-live.js", TEAM.live]] as const) {
  const code = strip(src);
  ok(/state\s*:\s*['"]error['"]/.test(code), `${label} sets an explicit error state`);
  ok(/reason/.test(code), `${label} carries the reason through to the page`);
  ok(!/if\s*\(\s*!\w+\.length\s*\)\s*return\s*;/.test(code), `${label} does not bail on an empty list`);
  ok(/res\.ok/.test(code), `${label} checks the response status`);
}
// The GAO page must be able to say the source refused it — the state that is
// live today.
ok(/upstream-blocked/.test(strip(GAO.app)), "gao renderer handles a refused source distinctly");
ok(/HTTP/.test(GAO.app), "gao renderer can show the upstream status it was given");
ok(/sam-key-missing/.test(strip(TEAM.app)), "team renderer separates a config fault from an empty market");
ok(/id="stateBanner"/.test(GAO.html) && /id="stateBanner"/.test(TEAM.html), "both pages carry the banner those states render into");

// ── planted positives ───────────────────────────────────────────────────────
console.log("\n═══ PLANTED POSITIVES — prove this gate can fail ═══");

const PLANTED_GAO = `{ id: 'gp-005', docket: 'B-420887', status: 'Active', val: 0.11, days: 75, detail: 'GAO sustained — inadequate market research' }`;
ok((PLANTED_GAO.match(RECORD_RX) || []).length > 0, "A: record probe catches a planted docket");
ok(/\bB-\d{6}\b/.test(PLANTED_GAO), "A: docket-number probe catches it too");
ok(GAO_NO_SOURCE.filter(([, rx]) => rx.test(PLANTED_GAO)).length >= 3, "B: gao probes catch the planted invented fields");

const PLANTED_TEAM = `{ id: 'p-001', name: 'Falcon Aero', fit: 84, complement: 72, value: 2.1, agencies: ['AETC'], insight: 'Strong overlap.' }`;
ok(TEAM_NO_SOURCE.filter(([, rx]) => rx.test(PLANTED_TEAM)).length >= 5, "B: team probes catch the planted invented fields");

ok(!GAO_NO_SOURCE.some(([, rx]) => rx.test("const o = d.outcome; const g = d.ground; const a = d.agency;")),
  "B(−): gao probes do NOT fire on the fields GAO actually publishes");
ok(!TEAM_NO_SOURCE.some(([, rx]) => rx.test("const u = p.uei; const c = p.certifications; const s = p.state;")),
  "B(−): team probes do NOT fire on the fields SAM actually registers");

const PLANTED_BAIL = `const partners = data.partners || []; if (!partners.length) return;`;
ok(/if\s*\(\s*!\w+\.length\s*\)\s*return\s*;/.test(PLANTED_BAIL), "D: bail probe catches the exact pattern that was shipped");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nGAO+TEAMING TRUTH GATE FAILED — an empty answer can still be filled with a seed.");
  process.exit(1);
}
console.log("gao+teaming truth gate clean.");
