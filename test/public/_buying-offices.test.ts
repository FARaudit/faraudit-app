// $0 STRUCTURAL gate for "Who actually buys".
//
// The panel exists because "Department of Defense" is not a buyer. The two ways
// it can lie are (a) rendering a never-pulled column as a market with no buyers,
// and (b) silently dropping the tail so the visible bars imply the whole market.
// Both are asserted here; the rendered output is proven in a browser.
//
// Run: npx tsx test/public/_buying-offices.test.ts
import { readFileSync } from "node:fs";
import { pageSource } from "./_page-styles";
import path from "node:path";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ROOT = process.cwd();
// The page's styles moved into a shared stylesheet when a second page began rendering these panels.
// `pageSource` is the markup PLUS whatever CSS the page actually links, so this gate keeps asking
// whether the rule SHIPS rather than which file someone wrote it in.
const html = pageSource("defense-spending.html");
const appRaw = readFileSync(path.join(ROOT, "public/dsb-app.js"), "utf8");
const live = readFileSync(path.join(ROOT, "public/defense-spending-live.js"), "utf8");
const lib = readFileSync(path.join(ROOT, "src/lib/bd-os/defense-spending.ts"), "utf8");
const agent = readFileSync(path.join(ROOT, "agents/defense-spending/usaspending.ts"), "utf8");
// Comments stripped so nothing passes by matching its own explanation.
const app = appRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function main() {
  // ── the full chain, one link at a time ────────────────────────────────────
  assert(/awarding_subagency/.test(agent), "the worker queries the awarding_subagency category");
  assert(/sub_agency_breakdown/.test(lib), "the route selects sub_agency_breakdown");
  assert(/sub_agency_breakdown/.test(readFileSync(path.join(ROOT, "agents/defense-spending/index.ts"), "utf8")),
    "the worker writes the column");
  assert(/window\.DSB\.BUYING_OFFICES\s*=/.test(live),
    "the client mapper copies BUYING_OFFICES — a payload field not copied here ships the panel EMPTY");
  assert(/id="boList"/.test(html) && /id="boCap"/.test(html) && /id="boSub"/.test(html),
    "the markup carries the ids the renderer writes to");
  assert(/renderBuyingOffices\(\)/.test(app), "the renderer is called from renderAll");

  // ── ⛔ NOT derived from the largest-500 sample ─────────────────────────────
  // That bias would over-report big offices and under-report the small ones a
  // small business can reach — the exact question the panel answers.
  const fn = app.slice(app.indexOf("function renderBuyingOffices"), app.indexOf("function renderRecompetes"));
  assert(fn.length > 0, "the renderer is findable");
  assert(!/award_sample|AWARD_ANALYTICS/.test(fn),
    "the panel does NOT read the largest-500 sample — it would over-report big offices");

  // ── the tail is collapsed, never dropped ──────────────────────────────────
  assert(/\.slice\(BO_SHOW\)|rest\s*=/.test(fn), "the overflow offices are captured, not discarded");
  assert(/rest\.reduce/.test(fn), "and summed, so the dollars outside the visible set stay visible");
  assert(/other office/.test(fn), "the collapsed row is LABELLED with how many it stands for");

  // ── a never-pulled column is not a market with no buyers ──────────────────
  assert(/box\.measured/.test(fn), "the renderer branches on `measured`");
  assert(/gap in our data/.test(fn), "and says a gap is ours, not the market's");

  // ── CSS shipped ───────────────────────────────────────────────────────────
  for (const cls of ["bo-list", "bo-row", "bo-n", "bo-v", "bo-bar", "bo-cap", "bo-none"]) {
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }
  assert(/(^|\n)\.bo-row\.rest\s*[,{]/.test(html), "the collapsed row is visually distinguished");

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
