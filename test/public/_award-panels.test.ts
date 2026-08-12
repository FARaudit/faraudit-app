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
import path from "node:path";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ROOT = process.cwd();
const html = readFileSync(path.join(ROOT, "public/defense-spending.html"), "utf8");
const appRaw = readFileSync(path.join(ROOT, "public/dsb-app.js"), "utf8");
const app = appRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fnOf = (name: string, next: string) => {
  const i = app.indexOf(`function ${name}`);
  const j = app.indexOf(`function ${next}`);
  return i > -1 && j > i ? app.slice(i, j) : "";
};

function main() {
  // ── all three are called, and their ids exist ─────────────────────────────
  for (const [fn, ids] of [
    ["renderAwardSize", ["szBody", "szSub"]],
    ["renderSeasonality", ["snBody", "snSub"]],
    ["renderPrimeTargets", ["ptList", "ptSub", "ptCap"]]
  ] as Array<[string, string[]]>) {
    assert(new RegExp(`${fn}\\(\\)`).test(app), `${fn} is called from renderAll`);
    for (const id of ids) assert(html.includes(`id="${id}"`), `markup carries #${id}`);
  }

  // ── 3 · ⛔ NO AVERAGE across a bimodal market ─────────────────────────────
  const sz = fnOf("renderAwardSize", "renderSeasonality");
  assert(sz.length > 0, "the size renderer is findable");
  assert(/No average is shown/i.test(sz), "the panel states that no average is shown");
  assert(!/\bmean\b|\baverage of\b|avg/i.test(sz.replace(/No average is shown/gi, "")),
    "and never computes or prints one");
  assert(/d\.p25/.test(sz) && /d\.p75/.test(sz), "it states the middle 50%, p25 to p75");
  assert(/d\.inBand/.test(sz), "and how many awards actually fall inside that band");
  assert(/logarithmic/i.test(sz), "the log scale is declared, not silent");

  // ── 5 · ⛔ a FEDERAL fiscal calendar, not a calendar year ─────────────────
  const sn = fnOf("renderSeasonality", "renderPrimeTargets");
  assert(sn.length > 0, "the seasonality renderer is findable");
  assert(/q\.months/.test(sn), "it renders the twelve fiscal months from the derivation");
  assert(/m\.month >= 7 && m\.month <= 9/.test(sn), "July-September is marked as the fiscal fourth quarter");
  assert(/30 September/.test(sn), "and the caption says why — funds expire 30 September");
  assert(/zero rather than being omitted/i.test(sn),
    "quiet months are declared as zero, since an absent month reads as missing data");

  // ── 4 · ⛔ a call list must not include firms with no obligation ──────────
  const pt = fnOf("renderPrimeTargets", "renderCeilings");
  assert(pt.length > 0, "the prime renderer is findable");
  assert(/19\.702/.test(pt), "the FAR authority is cited, not implied");
  assert(/t\.threshold/.test(pt), "the dollar threshold is printed from the data, not hardcoded in prose");
  assert(/excludedSmallBusiness/.test(pt),
    "small-business exclusions are surfaced — they carry no plan obligation to sell into");
  assert(/Size is not verified/i.test(pt),
    "and the panel states that size is UNVERIFIED for the firms it does list");
  assert(/not a claim/i.test(pt), "explicitly not a claim that all of them are large");

  // ── shared · never measured is not an empty market ───────────────────────
  assert(/function anNone/.test(app), "there is a distinct not-measured state");
  const none = fnOf("anNone", "renderAwardSize");
  assert(/gap in our data/.test(none), "which calls the gap ours");
  // The sentence is split across a string concatenation in the source, so match
  // the distinctive fragment rather than the rendered phrase.
  assert(/not a market with nothing/i.test(none), "and not the market's");
  for (const fn of [sz, sn, pt]) assert(/anNone\(/.test(fn), "every panel uses it");

  // ── CSS shipped ───────────────────────────────────────────────────────────
  for (const cls of ["sz-band", "sz-mid", "sz-scale", "sz-rail", "sz-fill", "sz-tick", "sz-note",
                     "sn-grid", "sn-col", "sn-b", "sn-l", "sn-note",
                     "pt-list", "pt-r", "pt-n", "pt-v", "pt-m", "pt-cap", "an-none"]) {
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }
  assert(/(^|\n)\.sn-col\.q4 \.sn-b\s*\{/.test(html), "fiscal Q4 columns are visually distinct");

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
