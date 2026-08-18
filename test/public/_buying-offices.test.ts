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
  // Matches the COUNT + a noun, not the word "office": the panel showed
  // sub-agencies under an "office" heading and the copy was corrected to say so.
  assert(/rest\.length \+ ' other (office|agenc)/.test(fn),
    "the collapsed row is LABELLED with how many it stands for");

  // ── a never-pulled column is not a market with no buyers ──────────────────
  assert(/box\.measured/.test(fn), "the renderer branches on `measured`");
  assert(/gap in our data/.test(fn), "and says a gap is ours, not the market's");

  // ── THE DEPARTMENTS ABOVE THEM ────────────────────────────────────────────
  // The ranked twelve-row block became lines, because eleven of the twelve rows
  // drew a rounding error. The risk that creates is the opposite one:
  //
  // ⛔ COLLAPSING BY RANK RATHER THAN BY WEIGHT. Everything-below-first holds at
  // FY2024 (DoD 96.1%) and FY2025 (97.8%) and is FALSE at FY2026, where DoD is
  // 72.8% and Homeland Security is 26.0% — $7.81B against $0.80B a year earlier.
  // A rank cut would have printed "11 other departments" over the largest
  // movement on the tab. The cut must be a share test, and the tail must still
  // be summed and labelled rather than dropped.
  const ag = app.slice(app.indexOf("function renderAgencyList"), app.indexOf("function renderBuyingOffices"));
  assert(ag.length > 0, "the departments renderer is findable");
  assert(/renderAgencyList\(\)/.test(app), "and is called from renderAll");
  assert(/const AG_MATERIAL_PCT = \d/.test(app),
    "a named materiality threshold exists — the cut is a share, not a rank");
  // (a rank cut — slice(1) — would bury a 26% buyer behind "other departments")
  assert(/pct\(a\.val\) >= AG_MATERIAL_PCT/.test(ag),
    "every department at or above that share is NAMED");
  assert(/i === 0/.test(ag), "…and the largest always shows, even in a single-buyer market");
  assert(/rest\.reduce/.test(ag), "the tail is summed");
  assert(/rest\.length \+ ' smaller department/.test(ag),
    "and the collapsed row is LABELLED with how many it stands for");
  assert(/summed not dropped|summed, not dropped/.test(ag),
    "the row says outright that the tail was kept, not discarded");
  assert(/no prior-year figure/.test(ag),
    "a department with no prior year says so rather than printing a change it cannot compute");
  assert(!/id="agencyLegend"|id="agFyCol"/.test(html),
    "the per-code legend and the year column left with the bars they labelled");

  // ── CSS shipped ───────────────────────────────────────────────────────────
  for (const cls of ["ag-one", "ag-one-v", "ag-one-s", "ag-one-g"]) {
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }
  assert(/(^|\n)\.ag-one\.rest\s*[,{]/.test(html), "the collapsed department row is visually distinguished");
  for (const cls of ["ag-row", "ag-bar2", "ag-legend2", "seg-split"]) {
    assert(!new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `retired CSS rule .${cls} is gone`);
  }
  for (const cls of ["bo-list", "bo-row", "bo-n", "bo-v", "bo-bar", "bo-cap", "bo-none"]) {
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }
  assert(/(^|\n)\.bo-row\.rest\s*[,{]/.test(html), "the collapsed row is visually distinguished");

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
