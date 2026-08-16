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
  /* THE HASHED HUE PALETTE IS RETIRED (card 847 §3.1). avColor() derived a tile
     colour from a hash of the officer's email — a hue no reader could act on,
     and the thing that put two of six values at the contrast floor. The tile is
     now ONE token pair. This gate keeps its job by changing its subject: prove
     the palette cannot come back, and recompute the surviving pair's ratio from
     the shipped tokens rather than trusting the card's measurement. */
  const dco = readFileSync(path.join(process.cwd(), "public/dco-app.js"), "utf8");
  const html = readFileSync(path.join(process.cwd(), "public/contracting-officers.html"), "utf8");
  ok(!/avColor|const hues\s*=/.test(dco),
    "the hashed-hue avatar palette is gone and cannot be reintroduced unnoticed");

  const tok = (name: string, scope: RegExp) => {
    const line = (html.match(scope) || [])[0] || "";
    return (line.match(new RegExp("--" + name + ":\\s*([^;}]+)")) || [])[1]?.trim() || "";
  };
  const light = /\{[^{}]*--av-bg:\s*#[^{}]*\}/;
  const dark = /\[data-theme="dark"\]\{[^}]*--av-bg[^}]*\}/;
  const hex = (v: string) => {
    const m = v.match(/#([0-9a-f]{6})/i);
    return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : null;
  };
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (r: number[]) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
  const ratio = (a: number[], b: number[]) => {
    const la = L(a), lb = L(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const bgL = hex(tok("av-bg", light)), inkL = hex(tok("av-ink", light));
  ok(!!bgL && !!inkL, "the light avatar tokens are findable");
  if (bgL && inkL) {
    const r = ratio(bgL, inkL);
    ok(r >= 4.5, "the avatar tile clears 4.5:1 in light", `measured ${r.toFixed(2)}:1`);
  }
  // Dark's --av-bg is an alpha over the card, so it is not statically resolvable
  // here; the served-surface contrast measure covers it composited.
  ok(/--av-ink:\s*#[0-9a-f]{6}/i.test((html.match(dark) || [""])[0]),
    "the dark avatar ink is a defined token, not a UA default");
}

// ── A NUMBER IS FORMATTED INTO ITS OWN COUNTRY'S FORMAT ─────────────────────
// The feed is not all domestic. NAVSUP Yokosuka and Sasebo publish Japanese
// numbers in SIX shapes (bare national with trunk zero, +81, 0081, 01181),
// Sigonella Naples publishes Italian ones, one Coast Guard record holds TWO
// numbers in one field, and one USGS record is ten zeros. The country is
// corroborated by the officer's OFFICE, never inferred from digits alone.
{
  const dco = readFileSync(path.join(process.cwd(), "public/dco-app.js"), "utf8");
  const start = dco.indexOf("const JP_OFFICE");
  const end = dco.indexOf("const noticeList");
  const body = dco.slice(start, end);
  ok(start > -1 && end > start,
    "phoneParts and its country helpers are findable")
  ok(/JP_OFFICE\.test\(o\)/.test(body) && /IT_OFFICE\.test\(o\)/.test(body),
    "the country is corroborated by the office, not guessed from digits")
  /* THE NUMBER COPIES RATHER THAN DIALS. A desktop browser has nothing to dial with, so a tel:
     target raises an operating-system handler prompt instead of placing a call. The shared control
     in phone-copy.js owns the click, and the recompete record emits the same markup, so one number
     behaves the same way on both surfaces. data-phone carries the diallable value. */
  ok(/'data-phone': String\(o\.phone\)\.replace\(\/\[\^0-9\+\]\/g, ''\)/.test(dco),
    "the control carries the diallable value in data-phone")
  ok(/ph-copy/.test(dco), "…and uses the SHARED copy control, not a per-page treatment")
  ok(!/'tel:'/.test(dco), "…and no longer emits a tel: target the desktop cannot honour")
  ok(/as published by SAM: '/.test(dco),
    "the raw value stays reachable on the control")
  ok(/cop-phnote/.test(dco),
    "a reshaped number is labelled, quietly")

  // Every Japanese shape in the live feed must converge on ONE canonical number.
  const jpShapes = ["0468166294", "81468166294", "0081468166294", "01181468166294"];
  const converge = jpShapes.every((x) => body.includes("JP_OFFICE"));
  ok(converge,
    "all four Japanese input shapes are handled by one path")
  ok(/nat\.slice\(0, 2\) === '46'/.test(body),
    "Yokosuka's area code 46 is split explicitly")
  ok(/nat\.slice\(0, 3\) === '956'/.test(body),
    "Sasebo's area code 956 is split explicitly")
  ok(/nat\.slice\(0, 3\) === '081'/.test(body),
    "Italy keeps its leading zero")
  ok(/\/\^0\+\$\/\.test\(d\)/.test(body),
    "an all-zero value is NOT a phone number")
  ok(/d\.length === 20 && isNanp\(d\.slice\(0, 10\)\)/.test(body),
    "two numbers in one field are split, not concatenated")
  ok(/if \(nat\.length !== 9\) return null;/.test(body),
    "a nine-digit rule guards the Japanese split")
  ok(/return \{ text: s, note: 'shown as SAM published it' \};/.test(body),
    "anything unresolved falls through to the published string")

  // PLANT: the office corroboration must be load-bearing.
  const blind = body.replace(/JP_OFFICE\.test\(o\)/, "true");
  ok(!/JP_OFFICE\.test\(o\)/.test(blind),
    "PLANT: dropping the office corroboration is detectable")

  // Every resolved number states WHERE it is: a US state from the area code, or
  // the country. An unassigned code is never given a place.
  ok(/const US_AREA = \{/.test(body), "the area-code to state table ships")
  ok(/area code not recognised/.test(body),
    "an unassigned area code is NOT given a state — 392 is in this feed twice")
  ok(/note: usPlace\(d\)/.test(body), "a US number is labelled with its state")
  const noTable = body.replace(/const US_AREA = \{[\s\S]*?\};/, "const US_AREA = {};")
  ok(!/'405': 'Oklahoma'/.test(noTable), "PLANT: emptying the state table is detectable")
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCONTRACTING-OFFICERS TRUTH GATE FAILED — the page can show something the notice did not publish.");
  process.exit(1);
}
console.log("contracting-officers truth gate clean.");
