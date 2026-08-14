// WHO TO CALL — the destination exists, mounts the right panels, and shares one renderer set.
//
// Primes · Ceilings · Recompete Radar left Defense Spending for their own page: openings on contracts
// that ALREADY EXIST, none of which reach SAM.gov as a solicitation. The risk in a move like this is
// not that the markup is wrong — it is that the move quietly becomes a FORK, with a copied script or a
// copied stylesheet that drifts until one page is right and the other is stale.
//
// So this gate is mostly about SAMENESS: same renderer file, same stylesheet, same scope module, one
// payload. It also pins the split itself — the three panels are here and the eleven that stayed are
// not — because "moved" and "copied" look identical from a screenshot.
//
// Run: npx tsx test/public/_who-to-call.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { injectRail, WORKFLOW } from "../../src/lib/nav/rail";
import { pageStyles } from "./_page-styles";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = process.cwd();
const PAGE = join(ROOT, "public", "who-to-call.html");
const ROUTE = join(ROOT, "src", "app", "who-to-call", "route.ts");

// ── R1 · IT IS REACHABLE ─────────────────────────────────────────────────────
console.log("\nR1  THE DESTINATION IS REACHABLE");
ok(existsSync(PAGE), "public/who-to-call.html exists");
ok(existsSync(ROUTE), "src/app/who-to-call/route.ts exists");
const HTML = existsSync(PAGE) ? readFileSync(PAGE, "utf8") : "";
const ROUTE_SRC = existsSync(ROUTE) ? readFileSync(ROUTE, "utf8") : "";
ok(/injectRail\(html, "who-to-call"\)/.test(ROUTE_SRC), "the route marks its own rail item active");
ok(/redirect\("\/sign-in\?next=\/who-to-call"\)/.test(ROUTE_SRC),
  "…and it is behind the auth gate, like every other authenticated page");

// ⛔ A PAGE NOBODY CAN NAVIGATE TO IS NOT SHIPPED. The rail is the only way in.
const item = WORKFLOW.find((i) => i.key === "who-to-call");
ok(!!item, "the rail carries a Who to call item");
ok(item?.href === "/who-to-call", "…pointing at the route", item?.href);
const RAILED = injectRail(HTML, "who-to-call");
ok(RAILED.includes('href="/who-to-call"'), "the composed page renders that link");

// ── R2 · THE SPLIT — these three moved, the rest did not ─────────────────────
console.log("\nR2  THE SPLIT IS EXACTLY THE THREE PANELS");
const MOVED = ["ptList", "ptSub", "ptCap", "chList", "chBig", "chSay", "chCap", "chSub",
  "rcList", "whSub", "bigN", "bigSay", "lede", "footL", "footR"];
/* `szBody` and `kpiStrip` LEFT THIS LIST because they left the product, not
   because the check was inconvenient: "How big is a deal here" was cut (a
   p25-p75 pooled across a $30M and a $25B code), and the KPI strip merged into
   the year-over-year panel it is the last point of. An id that no page carries
   cannot prove a page did not take it — so the ABSENCE check below keeps its
   teeth only over ids that still exist somewhere. */
const STAYED = ["geoSvg", "geoLegend", "rankList", "rankTabs", "agencyList", "boList",
  "sbShareList", "sbWinnersList", "concList", "iiBody", "snBody", "myoyBody", "insightBar"];
/* Retired hosts, asserted GONE FROM BOTH PAGES. Dropping them from STAYED alone
   would have let a copy of either one reappear unnoticed. */
const RETIRED = ["szBody", "szSub", "kpiStrip", "agencyLegend", "agFyCol"];
/* ⛔ THE PAGE IS NOW ONE DOCUMENT, NOT THREE WIDGETS. It renders a recompete record into #o4
   through wtc-app.js: the same RECOMPETES array becomes §01–§03, and CONCENTRATION and SB_WINNERS —
   which arrived in this payload and had no host on this page at all — become §04 and §05.
   So the three widgets are UNMOUNTED, and the assertion inverts: they must be on NEITHER page.
   Their renderers stay in dsb-app.js, which the theme-flip and panel gates hold to. */
ok(HTML.includes('id="o4"'), "the page carries the document host #o4");
const stillWidgets = MOVED.filter((id) => HTML.includes(`id="${id}"`));
ok(stillWidgets.length === 0, "the three widgets are unmounted — none of their hosts remain here",
  stillWidgets.length ? `still present: ${stillWidgets.join(", ")}` : `${MOVED.length} hosts checked`);
const leaked = STAYED.filter((id) => HTML.includes(`id="${id}"`));
ok(leaked.length === 0, "and nothing that stayed on Defense Spending came along",
  leaked.length ? `also present: ${leaked.join(", ")}` : `${STAYED.length} checked`);

/* ⛔ THE OTHER DIRECTION, WHICH THIS GATE ORIGINALLY DID NOT CHECK — and the
   omission shipped. Every assertion above was about what is ON this page, so a
   COPY passed all of them: the three panels went to /who-to-call and stayed on
   /defense-spending too, 9 widgets on a page that was supposed to have 6. The
   CEO caught it by asking. "Moved" and "copied" are indistinguishable from the
   new page alone — the evidence is only ever on the page they left. */
const SPENDING_HTML = readFileSync(join(ROOT, "public", "defense-spending.html"), "utf8");
const stillThere = MOVED.filter((id) => SPENDING_HTML.includes(`id="${id}"`));
ok(stillThere.length === 0,
  "THEY LEFT: no panel host from this page survives on defense-spending.html",
  stillThere.length ? `still on the old page — this is a COPY: ${stillThere.join(", ")}` : "");
// And the mirror, so the check above cannot pass by reading an empty file.
const stayedPut = STAYED.filter((id) => SPENDING_HTML.includes(`id="${id}"`));
ok(stayedPut.length === STAYED.length,
  "…while everything that was meant to stay is still there",
  `${stayedPut.length}/${STAYED.length}`);
const resurrected = RETIRED.filter((id) => HTML.includes(`id="${id}"`) || SPENDING_HTML.includes(`id="${id}"`));
ok(resurrected.length === 0,
  "and a RETIRED host has not come back on either page",
  resurrected.length ? `back in the markup: ${resurrected.join(", ")}` : `${RETIRED.length} checked`);

/* THE SCOPE CONTROLS ARE GONE, AND THAT IS THE DESIGN. This destination is a document rather than a
   view: it states its own scope in the masthead — prepared date and the NAICS codes on file — and
   the reader changes that scope on the capability statement, not with a picker on the report.
   Asserted as ABSENT rather than deleted, so a control reappearing here is a decision someone has
   to make on purpose instead of a widget drifting back onto a printed record. */
for (const id of ["segFY", "hdrNaicsPills", "dsbProvenance", "resetBtn", "selChip"]) {
  ok(!HTML.includes(`id="${id}"`), `the document carries no scope control #${id}`);
}

/* ── THE NAICS SCOPE IS CHROME, AND IT GOES THROUGH THE SHARED MODULE ────────
   The document has no controls inside it, but the page needs one: without it the
   record can only ever be all codes at once. It sits above the sheet and reads
   and writes window.BD_SCOPE, so the code chosen here has an address (URL, then
   localStorage) and the next destination opens on it. */
console.log("\nR2b THE SCOPE AND FRESHNESS CHROME");
const WTCJS = readFileSync(join(ROOT, "public", "wtc-app.js"), "utf8");
ok(HTML.includes('id="wtcScope"'), "the page carries the scope strip");
ok(/BD_SCOPE/.test(WTCJS), "…and the render layer drives it through window.BD_SCOPE");
ok(/\.reconcile\(/.test(WTCJS),
  "…via reconcile(), so a URL naming an untracked code is REPORTED, not swallowed");
ok(/SC\.set\(\{ code:/.test(WTCJS), "…and a click publishes the code to the shared scope");
/* ⛔ SCOPING MUST FILTER THE INPUT, NOT THE OUTPUT. Every figure is derived
   inside build(), so narrowing the arrays before the call RECOMPUTES the record.
   Filtering rendered rows instead would leave the headline, the cluster and the
   dollar total describing a set the reader can no longer see. */
ok(/rows: \(Array\.isArray\(DSB\.RECOMPETES\)[^)]*\)\.filter\(byCode\)/.test(WTCJS),
  "the scope narrows RECOMPETES before the document is built");
for (const arr of ["CONCENTRATION", "SB_WINNERS"]) {
  ok(new RegExp(`Array\\.isArray\\(DSB\\.${arr}\\)[^)]*\\)\\.filter\\(byCode\\)`).test(WTCJS),
    `…and ${arr} too, so section shares narrow with it`);
}

/* ── FRESHNESS · TWO CLOCKS, NEVER ONE STAMP ────────────────────────────────
   `as_of` is when the feed was MEASURED; `checkedAt` is when this browser last
   asked. A re-check that confirms day-old data must not be able to print
   "updated just now", so the two are rendered as separate sentences. */
ok(HTML.includes('id="wtcFresh"'), "the page carries the freshness line");
ok(/Read from USASpending|Read from USAspending/.test(WTCJS),
  "…which states how old the MEASUREMENT is");
ok(/FRESHNESS/.test(WTCJS) && /checkedAt/.test(WTCJS),
  "…and separately when we last checked");
ok(/id="wtcRefresh"/.test(WTCJS), "a manual refresh control exists to press");
ok(/paintFreshness/.test(WTCJS) && /paintFreshness: paintFreshness/.test(WTCJS),
  "…and the stamp has a repaint entry point, so the age cannot sit frozen");

// ── R3 · SAMENESS — one renderer set, one stylesheet, one scope ──────────────
console.log("\nR3  ONE RENDERER SET, ONE STYLESHEET, ONE SCOPE");
const SPENDING = readFileSync(join(ROOT, "public", "defense-spending.html"), "utf8");
const scripts = (src: string) =>
  [...src.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ""));
const wtc = scripts(HTML), dsb = scripts(SPENDING);
// The data container, the live wiring and the scope module are still SHARED — one payload, one
// fetch, one scope. Only the render layer differs, because the two pages render different things.
for (const s of ["bd-scope.js", "dsb-data.js", "defense-spending-live.js"]) {
  ok(wtc.includes(s), `loads the SHARED ${s}`, wtc.join(" "));
  ok(dsb.includes(s), `…and defense-spending loads the same ${s}`);
}
ok(wtc.includes("wtc-app.js"), "and its own render layer for the document", wtc.join(" "));
ok(!wtc.includes("dsb-app.js"),
  "it does NOT load the widget renderer set it no longer has hosts for");

/* ⛔ THE FORK CHECK IS ABOUT SUBSTANCE, NOT A FILENAME. This gate used to ban a file called
   wtc-app.js outright, because on the day a fork ships a copy and a rewrite look identical. A
   name ban cannot tell them apart either — so the check now asks the question it always meant:
   does this file DUPLICATE the shared renderers?
   A copy would carry the same renderer functions. A distinct render layer for a distinct document
   carries none of them, and the payload keeps arriving through the one shared fetch above. */
const WTC_APP = join(ROOT, "public", "wtc-app.js");
ok(existsSync(WTC_APP), "the document's render layer exists on disk");
const WTC_SRC = existsSync(WTC_APP) ? readFileSync(WTC_APP, "utf8") : "";
const SHARED_RENDERERS = ["renderPrimeTargets", "renderCeilings", "renderRecompetes",
  "renderConcentration", "renderSbWinners", "renderIncumbents", "renderSeasonality",
  "renderBuyingOffices", "renderAll"];
const duplicated = SHARED_RENDERERS.filter((fn) => WTC_SRC.includes(`function ${fn}`));
ok(duplicated.length === 0, "it copies NO renderer out of the shared set",
  duplicated.length ? `forked: ${duplicated.join(", ")}` : `${SHARED_RENDERERS.length} checked`);
ok(!/window\.DSB\s*=\s*\{/.test(WTC_SRC),
  "…and it does not fork the data container either — it reads the shared window.DSB");

// One stylesheet, and it is the same file the other page links.
const sheets = (src: string) =>
  [...src.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)["']/) || [])[1] || "")
    .filter((h) => h && !/^https?:|^\/\//.test(h));
ok(sheets(HTML).includes("/dsb.css") && sheets(SPENDING).includes("/dsb.css"),
  "both pages link the SAME stylesheet", `${sheets(HTML)} vs ${sheets(SPENDING)}`);
/* The DOCUMENT's own rules must be reachable from this page. They are inline rather than in
   dsb.css, which is deliberate: the record has no cards inside it, so none of the widget chrome
   applies to it, and putting its rules in the shared sheet would ship them to a page that never
   uses them. pageStyles() reads inline <style> as well as linked files, so this asks whether the
   rule SHIPS rather than which file it was written in. */
const CSS = pageStyles("who-to-call.html");
for (const rule of [".o4-h", ".o4-hero", ".o4-sum", ".o4-t", ".o4-rec", ".o4-call", ".o4-empty"]) {
  ok(CSS.includes(rule + "{") || CSS.includes(rule + ",") || CSS.includes(rule + " "),
    `the page's styles carry ${rule}`);
}
/* ⛔ AND THE SHEET IS THE SHIPPING SHELL. The document sits on the platform's app surface as one
   bordered sheet; without data-shell="sheet" on the root it renders as a bare paper page and the
   rail stops reading as chrome around a page. */
ok(/<html[^>]*\bdata-shell="sheet"/.test(HTML), "the root declares the platform sheet shell");

// ── R4 · THE SCOPE IS THE SHARED ONE ─────────────────────────────────────────
console.log("\nR4  IT READS THE SHARED SCOPE, NOT A LOCAL ONE");
const APP = readFileSync(join(ROOT, "public", "dsb-app.js"), "utf8");
ok(/window\.BD_SCOPE/.test(APP), "the renderer set reads window.BD_SCOPE");
ok(/SCOPE\.reconcile\(/.test(APP), "…through reconcile(), so an unmeasured request is reported");
ok(/SCOPE\.set\(\{ fy: S\.fy, code: S\.code \}, \{ url: false \}\)/.test(APP),
  "…and publishes what is ON SCREEN, so the next destination inherits it",
  "reading a URL persists nothing — without this the second page starts from scratch");
ok(HTML.includes("bd-scope.js") && SPENDING.includes("bd-scope.js"),
  "both pages load the scope module");

// ── R5 · PLANTED POSITIVES ───────────────────────────────────────────────────
console.log("\nR5  PLANTED POSITIVES — the split checks can fail");
const withMapHost = HTML.replace("</body>", '<div id="geoSvg"></div></body>');
ok(STAYED.filter((id) => withMapHost.includes(`id="${id}"`)).length > 0,
  "a host that should have stayed behind IS detected when planted");
/* ⛔ THIS POSITIVE HAD TO BE REBUILT, NOT RE-POINTED. It used to rename `id="ptList"` in the markup
   and assert the absence was noticed. With the widgets unmounted that string is not in the file, so
   the replace is a no-op, the filter matches all fifteen ids, and the check passes without testing
   anything — green for the same reason whether the gate works or not.
   Both directions are planted against the assertions that now exist: a widget host put BACK, and
   the document host taken away. */
const remounted = HTML.replace("</body>", '<div id="ptList"></div></body>');
ok(MOVED.filter((id) => remounted.includes(`id="${id}"`)).length > 0,
  "PLANTED: a widget host remounted on this page IS detected");
const noDoc = HTML.replace('id="o4"', 'id="o4X"');
ok(!noDoc.includes('id="o4"'), "PLANTED: losing the document host #o4 IS detected");
// The copy that actually shipped: put one panel host back on the old page.
const copied = SPENDING_HTML.replace("</body>", '<div id="ptList"></div></body>');
ok(MOVED.filter((id) => copied.includes(`id="${id}"`)).length > 0,
  "PLANTED: a panel left behind on defense-spending IS detected — the case that shipped");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
