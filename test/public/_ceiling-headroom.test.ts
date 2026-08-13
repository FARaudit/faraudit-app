// $0 STRUCTURAL gate for "Room left on contracts already awarded".
//
// The panel states a dollar figure a customer could mistake for money available
// to them. Three ways it can lie: calling a capped sample the whole market,
// implying margin from a capacity figure, and rendering "never read" as
// "no room left". All three are asserted.
//
// Run: npx tsx test/public/_ceiling-headroom.test.ts
import { readFileSync } from "node:fs";
import { pageSource } from "./_page-styles";
import path from "node:path";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ROOT = process.cwd();
// The page's styles moved into a shared stylesheet when a second page began rendering these panels.
// `pageSource` is the markup PLUS whatever CSS the page actually links, so this gate keeps asking
// whether the rule SHIPS rather than which file someone wrote it in.
// ⛔ THE PANELS MOVED. This gate's markup half now reads who-to-call.html, which is where these
// hosts live; the ENGINE half still reads the shared dsb-app.js and the library, which did not move.
// A gate keeps its subject, not its file path.
const html = pageSource("who-to-call.html");
const appRaw = readFileSync(path.join(ROOT, "public/dsb-app.js"), "utf8");
const agent = readFileSync(path.join(ROOT, "agents/defense-spending/usaspending.ts"), "utf8");
const lib = readFileSync(path.join(ROOT, "src/lib/bd-os/award-analytics.ts"), "utf8");
const app = appRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const libCode = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function main() {
  // ── the chain ─────────────────────────────────────────────────────────────
  assert(/base_and_all_options/.test(agent), "the worker reads base_and_all_options — the ceiling");
  assert(/total_obligation/.test(agent), "and total_obligation — what is actually committed");
  assert(/ceilingHeadroom/.test(libCode), "the route derives headroom");
  /* ⛔ THIS PANEL IS CURRENTLY UNMOUNTED. /who-to-call was rebuilt as a single recompete document
     and carries no widget hosts, so Room left on contracts already awarded has no host on any page.
     The DERIVATION half of this gate — worker, route, renderer, and the capacity-is-not-margin
     rule — is untouched and still runs, which is why this assertion is INVERTED rather than
     deleted: the chain stays proven, and the day a host comes back the line goes red and asks to be
     turned around rather than silently passing on a panel nobody can see. */
  assert(!/id="chList"/.test(html) && !/id="chBig"/.test(html) && !/id="chCap"/.test(html),
    "the panel is unmounted — no page carries the ids the renderer writes to");
  assert(/renderCeilings\(\)/.test(app), "the renderer is retained and still called from renderAll");

  const fn = app.slice(app.indexOf("function renderCeilings"), app.indexOf("function renderBuyingOffices"));
  assert(fn.length > 0, "the renderer is findable");

  // ── ⛔ headroom is CAPACITY, never margin ─────────────────────────────────
  assert(/not margin/i.test(fn), "the caption states this is NOT margin");
  assert(/no cost, rate or profit data|carries no cost/i.test(fn),
    "and says why — USAspending carries no cost, rate or profit data");
  // NOT a bare "profit" search — that matched the DISCLAIMER ("carries no cost,
  // rate or profit data"), i.e. the sentence doing the work. The check is for
  // phrasings that would offer the money TO THE READER.
  for (const claim of [
    /available to you/i, /you could (earn|win|make)/i, /your (profit|margin|share)/i,
    /profit (available|of|margin)/i, /yours/i
  ]) {
    assert(!claim.test(fn), `no phrasing offers the money to the reader (${claim.source})`);
  }

  // ── ⛔ a capped sample must say so ────────────────────────────────────────
  assert(/capped sample/i.test(fn), "the caption declares it is a capped sample");
  assert(/c\.cap/.test(fn), "and prints the cap itself rather than implying the whole market");
  assert(/unreadable/.test(fn), "awards whose detail could not be read are surfaced");

  // ── ⛔ never-read is not zero-headroom ────────────────────────────────────
  assert(/gap in our data/.test(fn), "an unread ceiling is called a gap in OUR data");
  assert(/not contracts with no room/i.test(fn), "explicitly not a claim about the contracts");

  // ── the omission rule, in the fetch ───────────────────────────────────────
  assert(/unreadable\+\+;\s*continue;/.test(agent.replace(/\s+/g, " ").replace(/ /g, " ")) ||
         /unreadable\+\+/.test(agent),
    "an unreadable award is OMITTED and counted, never defaulted to zero");
  assert(!/ceiling:\s*0\b|headroom:\s*0\b/.test(agent),
    "no zero-valued default is ever constructed — unknown is not zero");
  /* A ZERO CEILING IS A MISSING VALUE. Number.isFinite() rejects null but 0
     passes it, and USAspending returns 0 for an unpopulated base_and_all_options
     — which produced −$9.4B of "room left" against a $9.4B obligated award.
     Finiteness alone is not enough and this pins the second check. */
  assert(/ceiling <= 0[\s\S]{0,60}unreadable\+\+/.test(agent),
    "a ZERO ceiling is treated as unknown, not as a real $0 ceiling");

  // ── ⛔ ONE FIRM IS ONE ROW ─────────────────────────────────────────────────
  // Rendered award-by-award, the live panel listed HUNTINGTON INGALLS
  // INCORPORATED and HUNTINGTON INGALLS INC as two rows — the $7.36B name split,
  // reintroduced because normaliseRecipient was applied to the prime list and not
  // to this one. 24 rows against a stated cap of 8 also printed
  // "24 of at most 8" and made this the tallest panel on the tab.
  const analytics = readFileSync(path.join(ROOT, "src/lib/bd-os/award-analytics.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const ch = analytics.slice(analytics.indexOf("export function ceilingHeadroom"));
  assert(/normaliseRecipient\(/.test(ch),
    "ceilingHeadroom folds recipient name spellings — INC and INCORPORATED are one firm");
  assert(/byFirm/.test(ch), "and groups by firm, so one company is one row");
  assert(/firms:/.test(ch), "the firm count is reported separately from the award count");
  assert(/c\.firms/.test(fn), "and the caption distinguishes firms from awards");

  const dsl = readFileSync(path.join(ROOT, "src/lib/bd-os/defense-spending.ts"), "utf8");
  assert(/merged\.ceilings\.cap = \(merged\.ceilings\.cap \|\| 0\) \+/.test(dsl),
    "merging codes SUMS their caps — carrying one code's cap printed '24 of at most 8'");

  // ── CSS shipped ───────────────────────────────────────────────────────────
  for (const cls of ["ch-top", "ch-big", "ch-say", "ch-list", "ch-r", "ch-n", "ch-h", "ch-m",
                     "ch-cap", "ch-none"]) {
    assert(new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `CSS rule for .${cls} shipped`);
  }

  /* ⛔ RETIRED WITH A CHECK, not dropped because it went red. The track drew "% used"
     and the meta line beneath it PRINTED "N% used" — one value encoded twice on every
     row, the same rule that retired the small-business bars and the concentration
     segments. If either comes back, this fails. */
  for (const cls of ["ch-track", "ch-fill"]) {
    assert(!new RegExp(`(^|\\n)\\.${cls}\\s*[,{]`).test(html), `retired CSS rule .${cls} is gone`);
    assert(!html.includes(`class="${cls}`), `…and no page still emits .${cls}`);
  }

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
