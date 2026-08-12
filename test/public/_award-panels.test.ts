// $0 STRUCTURAL gate for the three award-level panels: size distribution,
// seasonality, and prime subcontracting targets.
//
// Each states a number a customer could act on, and each has a specific way of
// lying: an average across a bimodal market, a fiscal calendar drawn as a
// calendar year, and a call list that includes firms with no obligation to
// answer. Those three are asserted, plus the shared "never measured is not
// empty" rule. Rendered output is proven in a browser.
//
// Run: npx tsx test/public/_award-panels.test.ts
import { readFileSync } from "node:fs";
import { pageSource } from "./_page-styles";
import path from "node:path";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ROOT = process.cwd();
// The page's styles moved into a shared stylesheet when a second page began rendering these panels.
// `pageSource` is the markup PLUS whatever CSS the page actually links, so this gate keeps asking
// whether the rule SHIPS rather than which file someone wrote it in.
// ⛔ THIS GATE SPANS BOTH PAGES NOW. Award size and seasonality stayed on Defense Spending; the primes
// panel moved to Who to Call. The three are one subject — everything derived from the stored award
// sample — so the markup half reads BOTH served pages. A gate keeps its subject, not its file path.
const html = pageSource("defense-spending.html") + "\n" + pageSource("who-to-call.html");
const appRaw = readFileSync(path.join(ROOT, "public/dsb-app.js"), "utf8");
const app = appRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fnOf = (name: string, next: string) => {
  const i = app.indexOf(`function ${name}`);
  const j = app.indexOf(`function ${next}`);
  return i > -1 && j > i ? app.slice(i, j) : "";
};

function main() {
  // ── the panels that exist are called, and their ids exist ─────────────────
  // ⛔ AWARD SIZE WAS RETIRED, not quietly dropped from this gate. Its p25-p75 was
  // pooled across every tracked code at once, so a $30M code and a $25B code
  // produced one band — $69K to $23M, a 333x spread that describes no award that
  // exists. The panel was scrupulously honest about showing no mean and was still
  // unreadable. The derivation stays in the payload; the rendering is gone. Part D
  // below asserts it is gone from BOTH pages, so this is a retirement with a check
  // on it rather than an assertion deleted because it went red.
  for (const [fn, ids] of [
    ["renderSeasonality", ["snBody", "snSub"]],
    ["renderPrimeTargets", ["ptList", "ptSub", "ptCap"]]
  ] as Array<[string, string[]]>) {
    assert(new RegExp(`${fn}\\(\\)`).test(app), `${fn} is called from renderAll`);
    for (const id of ids) assert(html.includes(`id="${id}"`), `markup carries #${id}`);
  }

  // ── D · the retirement is real on every page that mounts this script ──────
  assert(!/function renderAwardSize/.test(app), "renderAwardSize is gone from the renderer set");
  assert(!/renderAwardSize\(\)/.test(app), "and nothing still calls it");
  for (const id of ["szBody", "szSub"]) {
    assert(!html.includes(`id="${id}"`), `no page still carries the retired #${id}`);
  }

  // ── ⛔ NO AVERAGE SURVIVES ANYWHERE ───────────────────────────────────────
  // The band is gone, and the reason it existed must not come back as a mean:
  // these markets are bimodal, a $150,310 electronics job sits in the same code
  // as a $1.90B shipbuilding contract, and an average across that describes no
  // award that exists while reading as a target to aim at.
  // ⛔ SCOPED TO THE WORD THAT MAKES THE CLAIM. `\bmean\b` also matches "this does
  // not mean nothing is coming" in the recompete empty state — a verb, not a
  // statistic. A recognizer that fires on an unrelated sentence gets loosened by
  // the next person who trips it, which costs more than it catches.
  assert(!/\baverage\b|\bavg\b|\bmean of\b|arithmetic mean/i.test(app),
    "no renderer computes or prints an average award size");

  // ── 5 · ⛔ a FEDERAL fiscal calendar, not a calendar year ─────────────────
  // The twelve-bar grid became two numbers — the panel's entire payload was the
  // Q4 share and the peak month. The FISCAL definition is what makes either
  // figure mean anything, so it is still asserted at the same strength.
  const sn = fnOf("renderSeasonality", "renderPrimeTargets");
  assert(sn.length > 0, "the seasonality renderer is findable");
  assert(/q\.months/.test(sn), "it reads the fiscal months from the derivation");
  assert(/m\.month >= 7 && m\.month <= 9/.test(sn),
    "July-September is identified as the fiscal fourth quarter, not a calendar one");
  assert(/q\.q4Share/.test(sn), "the Q4 share is printed from the derivation");
  assert(/q\.peak/.test(sn), "and so is the heaviest month");
  assert(/30 September/.test(sn), "the caption says why — funds expire 30 September");
  assert(/count as zero rather than being omitted/i.test(sn),
    "quiet months are declared as zero, since an absent month reads as missing data");
  assert(/truncated/.test(sn),
    "and the largest-awards bias is still declared — it is when BIG money moves");

  // ── 4 · ⛔ a call list must not include firms with no obligation ──────────
  const pt = fnOf("renderPrimeTargets", "renderCeilings");
  const app2 = app;
  assert(pt.length > 0, "the prime renderer is findable");
  assert(/19\.702/.test(pt), "the FAR authority is cited, not implied");
  assert(/t\.threshold/.test(pt), "the dollar threshold is printed from the data, not hardcoded in prose");
  assert(/excludedSmallBusiness/.test(pt),
    "small-business exclusions are surfaced — they carry no plan obligation to sell into");
  assert(/Size is not verified/i.test(pt),
    "and the panel states that size is UNVERIFIED for the firms it does list");
  assert(/not a claim/i.test(pt), "explicitly not a claim that all of them are large");

  // ── ⛔ 4 · LIFETIME VALUE MUST NOT WEAR A FISCAL YEAR ──────────────────────
  // The panel printed Huntington Ingalls at $90.76B and Electric Boat at $88.57B
  // under "in your NAICS codes · FY2026", on a page whose own headline is
  // $30.06B obligated for FY2026 — two firms exceeding the whole market by 6x,
  // in the same view. award-analytics' own AwardSample note says these amounts
  // must never be shown against total_obligations; the panel did exactly that.
  assert(/lifetime award value/i.test(pt),
    "the subhead names the figure as LIFETIME award value");
  assert(/sampled from/i.test(pt),
    "the fiscal year is stated as which awards were SAMPLED, not as the money's period");
  assert(/larger than this page/i.test(pt),
    "and the caption says outright why these exceed the page's annual total");

  // ── ⛔ THE STATUS PILL IS DERIVED, NOT MARKUP ─────────────────────────────
  // It was typed into the HTML as data-state="unwired" / NOT CONNECTED and never
  // updated, so the page announced itself disconnected above $30B it had fetched.
  assert(/function renderStatusPill/.test(app), "a renderer owns the status pill");
  assert(/renderStatusPill\(\)/.test(app.slice(app.indexOf("renderAll"))) ||
         /renderStatusPill\(\);/.test(app), "and it runs on every render");
  const pill = fnOf("renderStatusPill", "renderUnavailable");
  assert(/dsbState\(\)/.test(pill), "the pill reads the real status");
  assert(/'LIVE'/.test(pill) && /'NOT CONNECTED'/.test(pill),
    "and can show either state, so it is not a constant");

  // ── ⛔ a panel about ROOM must not list rows with none ────────────────────
  const ch2 = fnOf("renderCeilings", "renderBuyingOffices");
  assert(/headroom > 0/.test(ch2), "rows with no headroom are filtered out");
  assert(/fullyUsed/.test(ch2), "and counted in the caption rather than dropped silently");

  // ── shared · never measured is not an empty market ───────────────────────
  assert(/function anNone/.test(app), "there is a distinct not-measured state");
  const none = fnOf("anNone", "renderSeasonality");
  assert(/gap in our data/.test(none), "which calls the gap ours");
  // The sentence is split across a string concatenation in the source, so match
  // the distinctive fragment rather than the rendered phrase.
  assert(/not a market with nothing/i.test(none), "and not the market's");
  for (const fn of [sn, pt]) assert(/anNone\(/.test(fn), "every panel uses it");

  // ── ⛔ THE SB PANEL MUST NOT RANK BACKWARDS FROM THE MONEY ────────────────
  // SB_SHARE arrives NAICS-ascending, so the panel led with 332710 (29.5%,
  // $8.88M) and put 336611 last (3.1%, $768.71M) — 86x more small-business money
  // presented as the weakest of the three. Read top to bottom that says
  // machining is open and shipbuilding is closed. The reverse is true.
  const sb = fnOf("renderSbShare", "renderConcentration");
  const sbAny = sb || app.slice(app.indexOf("function renderSbShare"), app.indexOf("function renderSbShare") + 2600);
  assert(/\.sort\(\s*\(a, b\)\s*=>\s*sbDollarsOf\(b\) - sbDollarsOf\(a\)\s*\)/.test(sbAny),
    "rows are sorted by small-business DOLLARS, not by code number");
  assert(/sbs-money/.test(sbAny), "and the dollar figure leads the row, not just the percentage");
  assert(/function sbDollarsOf/.test(app), "the dollar figure has a named accessor");
  const acc = fnOf("sbDollarsOf", "renderSbShare");
  assert(/pct != null/.test(acc),
    "it reads the latest year with a MEASURED share, so dollars and percentage come from the same point");

  // ── ⛔ THE CODE PILL SCOPES EVERY PANEL THAT CLAIMS TO BE SCOPED ──────────
  // Concentration ignored it while the recipients table it shares a widget with
  // honoured it: pick 336412 and the table narrowed to 336412 while the block
  // above it went on leading with 336611 — two answers to one question, under one
  // heading, with nothing on screen saying they disagreed. The insight bar
  // promises a click scopes every panel; a panel that opts out silently is the one
  // a reader will quote.
  const conc = fnOf("renderConcentration", "renderSbWinners");
  assert(conc.length > 0, "the concentration renderer is findable");
  assert(/rows\.filter\(r => r\.naics === S\.code\)/.test(conc),
    "concentration filters on the selected code");
  assert(/if \(S\.code\)/.test(conc), "…only when one is selected — the aggregate is a real view");
  assert(/gap in our data, not a code no one holds/.test(conc),
    "a code with no measured concentration says the gap is OURS, rather than falling back to every code");
  // The neighbours that already honoured it, asserted so this cannot regress into
  // consistency-by-everyone-ignoring-it.
  // The mirror, one widget over: the share block ignored the pill while the
  // set-aside list beneath it honoured it — three codes here, one there, inside a
  // single card.
  const sbs = fnOf("renderSbShare", "renderConcentration");
  assert(/rows\.filter\(r => r\.naics === S\.code\)/.test(sbs),
    "the small-business share block filters on the selected code");
  assert(/gap in our data, not a code that/.test(sbs),
    "…and an unmeasured code says the gap is OURS rather than falling back to every code");
  // ⛔ AND IT MUST STAY CROSS-YEAR. Year and code are different axes; scoping by
  // year would delete the direction the panel exists to show.
  assert(!/p\.fy === S\.fy|points.*S\.fy/.test(sbs),
    "the share block is still NOT filtered by the year control — direction needs every year");
  const win = fnOf("renderSbWinners", "renderAll");
  assert(/if \(S\.code\) rows = rows\.filter\(r => r\.naics === S\.code\)/.test(win),
    "the set-aside winners list still honours the pill");

  // ── CSS shipped ───────────────────────────────────────────────────────────
  for (const cls of ["sn-two", "sn-fig", "sn-n", "sn-k", "sn-note",
                     "pt-list", "pt-r", "pt-n", "pt-v", "pt-m", "pt-cap", "an-none"]) {
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }
  // The retired panel's rules must leave with it: dead CSS on a served, unminified
  // stylesheet is shipped bytes that describe markup nobody renders.
  for (const cls of ["sz-band", "sz-mid", "sz-scale", "sz-rail", "sz-fill", "sz-tick", "sz-note",
                     "sn-grid", "sn-col", "sn-b", "sn-l"]) {
    assert(!new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `retired CSS rule .${cls} is gone`);
  }

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
