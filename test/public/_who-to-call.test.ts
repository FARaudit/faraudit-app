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
const STAYED = ["geoSvg", "geoLegend", "rankList", "rankTabs", "agencyList", "boList",
  "sbShareList", "sbWinnersList", "concList", "iiBody", "szBody", "snBody", "kpiStrip", "insightBar"];
const missing = MOVED.filter((id) => !HTML.includes(`id="${id}"`));
ok(missing.length === 0, "every host the three panels write into is here",
  missing.length ? `missing: ${missing.join(", ")}` : `${MOVED.length} hosts`);
const leaked = STAYED.filter((id) => HTML.includes(`id="${id}"`));
ok(leaked.length === 0, "and nothing that stayed on Defense Spending came along",
  leaked.length ? `also present: ${leaked.join(", ")}` : `${STAYED.length} checked`);

// The controls DO come along: a destination the reader cannot scope is a report,
// not a view. These are the scope's own inputs, not the other page's panels.
for (const id of ["segFY", "hdrNaicsPills", "dsbProvenance", "resetBtn", "selChip"]) {
  ok(HTML.includes(`id="${id}"`), `the scope control #${id} came along`);
}

// ── R3 · SAMENESS — one renderer set, one stylesheet, one scope ──────────────
console.log("\nR3  ONE RENDERER SET, ONE STYLESHEET, ONE SCOPE");
const SPENDING = readFileSync(join(ROOT, "public", "defense-spending.html"), "utf8");
const scripts = (src: string) =>
  [...src.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ""));
const wtc = scripts(HTML), dsb = scripts(SPENDING);
for (const s of ["bd-scope.js", "dsb-data.js", "dsb-app.js", "defense-spending-live.js"]) {
  ok(wtc.includes(s), `loads the SHARED ${s}`, wtc.join(" "));
}
// ⛔ NO FORKED COPY. A `wtc-app.js` beside dsb-app.js is the failure this whole
// gate exists for — it would look identical on the day it shipped.
const forked = wtc.filter((s) => /^(wtc|who-to-call)[-.]/i.test(s));
ok(forked.length === 0, "no page-specific copy of the renderers", forked.join(", "));
ok(!existsSync(join(ROOT, "public", "wtc-app.js")), "no wtc-app.js on disk either");

// One stylesheet, and it is the same file the other page links.
const sheets = (src: string) =>
  [...src.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)["']/) || [])[1] || "")
    .filter((h) => h && !/^https?:|^\/\//.test(h));
ok(sheets(HTML).includes("/dsb.css") && sheets(SPENDING).includes("/dsb.css"),
  "both pages link the SAME stylesheet", `${sheets(HTML)} vs ${sheets(SPENDING)}`);
// The panels' rules are reachable from this page, not merely from the other one.
const CSS = pageStyles("who-to-call.html");
for (const rule of [".pt-list", ".ch-list", ".rc-list", ".widget", ".w-part"]) {
  ok(CSS.includes(rule + "{") || CSS.includes(rule + ","),
    `the page's stylesheet carries ${rule}`);
}

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
const withoutPanel = HTML.replace('id="ptList"', 'id="ptListX"');
ok(MOVED.filter((id) => !withoutPanel.includes(`id="${id}"`)).length > 0,
  "a missing panel host IS detected when removed");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
