// ─────────────────────────────────────────────────────────────────────────────
// CONTRACTING-OFFICERS TRUTH GATE — the page may show only what the notice
// published.
//
// WHAT IT IS GUARDING AGAINST, stated as the defect it was written from: the
// page shipped eight invented federal officials with .mil addresses, complete
// with reply rates, obligated dollars, fit scores and an engagement timeline.
// None of those fields had a writer anywhere in the product. They rendered
// because the live fetch failed on every load and the client fell back to a
// seed file — so the failure of the real path was invisible, and the mock was
// what a signed-in customer saw.
//
// The three legs, each of which would have caught that on its own:
//   A · the seed file ships NO officer records — no addresses, no people
//   B · neither served script computes a metric with no source (fit, reply
//       rate, obligated $, relationship temperature, timeline, schedule)
//   C · the fetch layer has NO fallback: a failed request must set an error
//       state, never leave prior/seed rows standing
//
// Every leg carries a planted positive below. A gate whose subject can go
// empty reports on nothing and calls it clean, so each leg also fails closed
// when its file or anchor is missing.
//
// Run: npx tsx test/public/_contracting-officers-truth.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUB = path.join(process.cwd(), "public");
const FILES = {
  data: "dco-data.js",
  app: "dco-app.js",
  live: "contracting-officers-live.js",
  html: "contracting-officers.html"
};

// Fail closed: a renamed or deleted file must break the gate, not empty it.
for (const [k, f] of Object.entries(FILES)) {
  if (!existsSync(path.join(PUB, f))) {
    console.error(`CONTRACTING-OFFICERS TRUTH GATE cannot run — ${k} file public/${f} is missing. Failing closed.`);
    process.exit(1);
  }
}
const DATA = readFileSync(path.join(PUB, FILES.data), "utf8");
const APP = readFileSync(path.join(PUB, FILES.app), "utf8");
const LIVE = readFileSync(path.join(PUB, FILES.live), "utf8");
const HTML = readFileSync(path.join(PUB, FILES.html), "utf8");

// ── A · the seed ships no people ────────────────────────────────────────────
console.log("\n── A · seed data carries no officer records ──");

// An address is the identity this page keys on; a personal name is what a
// reader believes. Both are checked, because either alone shipped the defect.
const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RX = /\(\d{3}\)\s*\d{3}-\d{4}/g;

const seedEmails = DATA.match(EMAIL_RX) || [];
ok(seedEmails.length === 0, "seed file ships no email addresses", seedEmails.slice(0, 3).join(", "));
const seedPhones = DATA.match(PHONE_RX) || [];
ok(seedPhones.length === 0, "seed file ships no phone numbers", seedPhones.slice(0, 3).join(", "));

// The array the renderer reads must be declared empty in the seed. Measured on
// the DECLARATION, not on a count of names: a future mock with different names
// is the same defect.
const officersDecl = /OFFICERS\s*:\s*\[\s*\]/.test(DATA);
ok(officersDecl, "seed declares OFFICERS as an empty array");

// ── B · no uncomputable metric is rendered ──────────────────────────────────
console.log("\n── B · no served script computes a metric with no source ──");

// Each entry is a field the mock carried and nothing in the product writes.
// Matched as property access / object keys so the words themselves (in prose or
// a class name) do not fire.
const NO_SOURCE_FIELDS: Array<[string, RegExp]> = [
  ["fit score", /\.fit\b|\bfit\s*:/],
  ["reply rate", /\.resp\b|\bresp\s*:/],
  ["days to reply", /\.respDays\b|\brespDays\s*:/],
  ["obligated dollars", /\.awards\b|\bawards\s*:/],
  ["award actions", /\.actions\b|\bactions\s*:/],
  ["set-aside share", /\.setaside\b|\bsetaside\s*:/],
  // `rel:` alone is the anchor attribute — the temperature is the VALUE set,
  // so the shape is matched, not the word.
  ["relationship temperature", /\.rel\b|REL_META|\brel\s*:\s*['"](warm|active|cold|new)['"]/],
  ["engagement timeline", /\.timeline\b|\btimeline\s*:|KIND_META/],
  ["buying schedule", /\.sched\b|\bsched\s*:/],
  ["last contact", /\.lastContact\b|\blastContact\s*:/],
  ["warrant", /\.warrant\b|\bwarrant\s*:/]
];

for (const [label, rx] of NO_SOURCE_FIELDS) {
  const hits: string[] = [];
  for (const [name, src] of [["dco-app.js", APP], ["dco-data.js", DATA], ["contracting-officers-live.js", LIVE]] as const) {
    // Comments are prose about the defect, not a render path.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    if (rx.test(code)) hits.push(name);
  }
  ok(hits.length === 0, `no ${label} in any served script`, hits.join(", "));
}

// The page must not promise those metrics in its own copy either — a column
// header is a claim even when the cell below it is empty.
const PROMISED = [/Reply rate/i, /Obligations/i, /Outreach Funnel/i, /Engagement Timeline/i, /Responsiveness vs Buying Power/i, /FPDS/i];
const promised = PROMISED.filter((rx) => rx.test(HTML)).map((rx) => rx.source);
ok(promised.length === 0, "page copy promises no unwired metric", promised.join(", "));

// ── C · the fetch layer has no fallback ─────────────────────────────────────
console.log("\n── C · a failed fetch is a visible failure, never a fallback ──");

const liveCode = LIVE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
ok(/state\s*:\s*['"]error['"]/.test(liveCode), "fetch layer sets an explicit error state");
// The old bail was a bare `return` out of the catch, which left whatever was
// already on the page standing — the seed. Any return that exits without
// setting a state is that defect.
ok(!/catch\s*\([^)]*\)\s*\{\s*(console[^\n]*\n\s*)?return[;\s}]/.test(liveCode),
  "catch branch does not return without setting a state");
ok(/OFFICERS\s*=\s*\[\s*\]/.test(liveCode), "failure path clears any rows already rendered");
ok(liveCode.includes("res.ok"), "response status is checked before the payload is trusted");

// The renderer must be able to SAY it failed — an error state nothing renders
// is the same silence.
const appCode = APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
ok(/['"]error['"]/.test(appCode) && /['"]empty['"]/.test(appCode),
  "renderer distinguishes the error state from the empty state");
ok(/id="stateBanner"/.test(HTML), "page carries the banner element those states render into");

// ── planted positives — prove each leg can fail ─────────────────────────────
console.log("\n═══ PLANTED POSITIVES — prove this gate can fail ═══");

const PLANTED_SEED = `window.DCO={OFFICERS:[{id:'co-x',name:'Diane Hartwell',email:'d.hartwell@navy.mil',phone:'(202) 555-0142'}]};`;
ok((PLANTED_SEED.match(EMAIL_RX) || []).length > 0, "A: address probe catches a planted seed officer");
ok((PLANTED_SEED.match(PHONE_RX) || []).length > 0, "A: phone probe catches a planted seed officer");
ok(!/OFFICERS\s*:\s*\[\s*\]/.test(PLANTED_SEED), "A: empty-array probe rejects a populated seed");

const PLANTED_METRIC = `const v = o.fit; const r = o.resp; const t = o.timeline;`;
const caughtMetrics = NO_SOURCE_FIELDS.filter(([, rx]) => rx.test(PLANTED_METRIC)).length;
ok(caughtMetrics >= 3, `B: field probes catch ${caughtMetrics} planted uncomputable fields`);
ok(!NO_SOURCE_FIELDS.some(([, rx]) => rx.test("const noticeCount = o.noticeCount; const office = o.office;")),
  "B(−): probes do NOT fire on the fields that DO have a source");

const PLANTED_BAIL = `try { const r = await fetch(u); } catch (e) { console.error(e); return; }`;
const bailCaught = /catch\s*\([^)]*\)\s*\{\s*(console[^\n]*\n?\s*)?return[;\s}]/.test(PLANTED_BAIL);
ok(bailCaught, "C: bail probe catches a planted silent-return catch");
ok(!/state\s*:\s*['"]error['"]/.test(PLANTED_BAIL), "C: error-state probe rejects a fetch layer that sets none");

/* ── ⛔ WHITE INITIALS ON A HASHED COLOUR ─────────────────────────────────────
   The avatar's initials are white and its background is a GRADIENT, so the
   LIGHTEST stop sets the contrast. At l=52% two of the six hues failed — teal at
   1.91:1 and cyan at 2.94:1 — and the hue is picked by hashing the officer's own
   email, so roughly one officer in three had initials nobody could read. A
   gradient is also invisible to a backgroundColor-based contrast sweep, which is
   why nothing caught it.

   This RECOMPUTES the ratio from the shipped palette rather than trusting a
   number in a comment: change a hue or the lightness and it re-derives. */
{
  const dco = readFileSync(path.join(process.cwd(), "public/dco-app.js"), "utf8");
  const hueList = (dco.match(/const hues = \[([^\]]+)\]/) || [])[1];
  const stop = dco.match(/hsl\(' \+ hue \+ ',(\d+)%,(\d+)%\)/);
  ok(!!hueList && !!stop, "the avatar palette and its lightest stop are findable");
  const H = (hueList || "").split(",").map((x) => parseFloat(x.trim()));
  const S = parseFloat(stop ? stop[1] : "0"), L = parseFloat(stop ? stop[2] : "100");
  const chan = (h: number, n: number) => {
    const sN = S / 100, lN = L / 100;
    const k = (n + h / 30) % 12;
    const a = sN * Math.min(lN, 1 - lN);
    return lN - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const cw = (h: number) =>
    1.05 / (0.2126 * lin(chan(h, 0)) + 0.7152 * lin(chan(h, 8)) + 0.0722 * lin(chan(h, 4)) + 0.05);
  const worst = H.map((h) => ({ h, r: cw(h) })).reduce((a, b) => (a.r < b.r ? a : b));
  ok(H.length >= 2, "the palette carries more than one hue", `${H.length}`);
  ok(worst.r >= 4.5,
    "EVERY avatar hue clears 4.5:1 against white initials",
    `worst ${worst.r.toFixed(2)}:1 at hue ${worst.h} — an officer whose email hashes to it cannot read their own initials`);
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCONTRACTING-OFFICERS TRUTH GATE FAILED — the page can show something the notice did not publish.");
  process.exit(1);
}
console.log("contracting-officers truth gate clean.");
