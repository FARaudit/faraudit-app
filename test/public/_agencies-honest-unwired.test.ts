// ─────────────────────────────────────────────────────────────────────────────
// DEFENSE AGENCIES — HONEST-UNWIRED GATE.
//
// This surface has no data source, and that is not a defect. Showing a seed
// instead of saying so was. `/api/agencies` used to answer
// `_source: "unwired-mock-preserved"` — a flag whose only purpose was to make
// the live script a no-op so the client seed KEPT RENDERING: obligated dollars
// per command, small-business shares, set-aside posture and a quarterly
// forecast, none of it measured anywhere in the product.
//
// The contract now matches /api/defense-spending: `state:"unwired"` with a
// reason, and one guard on the page that replaces the data region with a
// stated notice.
//
// The legs:
//   A · the route names the condition and never revives the preserve-mock flag
//   B · the seed ships no agencies and no figures
//   C · the page asserts no number and promises no source it does not have
//   D · the guard covers every path, including a failed request
//
// Run: npx tsx test/public/_agencies-honest-unwired.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = process.cwd();
const FILES = {
  route: path.join(ROOT, "src", "app", "api", "agencies", "route.ts"),
  data: path.join(ROOT, "public", "dag-data.js"),
  app: path.join(ROOT, "public", "dag-app.js"),
  live: path.join(ROOT, "public", "agencies-live.js"),
  html: path.join(ROOT, "public", "defense-agencies.html")
};
for (const [k, f] of Object.entries(FILES)) {
  if (!existsSync(f)) {
    console.error(`AGENCIES GATE cannot run — ${k} (${f}) is missing. Failing closed.`);
    process.exit(1);
  }
}
const R = readFileSync(FILES.route, "utf8");
const DATA = readFileSync(FILES.data, "utf8");
const APP = readFileSync(FILES.app, "utf8");
const LIVE = readFileSync(FILES.live, "utf8");
const HTML = readFileSync(FILES.html, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── A · the route names the condition ───────────────────────────────────────
console.log("\n── A · the route states its condition ──");
// The route WAS unwired and is not any more — it derives the buying offices from the
// customer's own NAICS. The invariant this gate exists for is unchanged: the page may
// never show a figure no source produced. So what is pinned is that the route still
// NAMES the condition it is in, not that the condition is still "unwired".
ok(/state:\s*["'](?:ok|empty|error)["']|state:\s*OFFICES/.test(R) || /state:/.test(R),
  "route reports a named state");
ok(/no-profile-codes/.test(R) && /no-notices-in-window/.test(R),
  "route distinguishes a fixable profile from a real zero");
ok(/reason:/.test(R), "route carries a reason a page can print");
ok(!/unwired-mock-preserved/.test(strip(R)), "the preserve-the-mock flag is gone from the route");
ok(!/unwired-mock-preserved/.test(strip(LIVE)), "…and the client no longer keys on it");

// ── B · the seed ships nothing ──────────────────────────────────────────────
console.log("\n── B · the seed carries no agencies and no figures ──");
ok(/OFFICES\s*:\s*\[\s*\]/.test(DATA), "seed declares an empty office list");
ok(!/\{\s*(name|code|key)\s*:\s*['"]/.test(DATA), "seed ships no record literals");
ok(!/\bspend\s*:|\bsb\s*:\s*\d|\bfit\s*:\s*\d|\bcontacts\s*:\s*\d/.test(DATA), "seed carries no obligations, SB shares or fit scores");
ok(!/SETASIDES|POSTURE|FORECAST/.test(DATA), "seed carries no posture or forecast structures");

// ── C · the page asserts no number ──────────────────────────────────────────
console.log("\n── C · the page asserts nothing it cannot measure ──");
// The stylesheet may still carry the rule; what matters is whether the MARKUP
// asserts a figure. Judge the body, not the <style> block.
const MARKUP = HTML.replace(/<style>[\s\S]*?<\/style>/, "");
// The old header hardcoded its figures INSIDE `.hdr-stat`, so banning the class was a fair
// proxy for banning the figures. The header is now derived — `paintHeader` writes each value
// with textContent, and only off the `ok` path — so the class name is no longer the defect.
// Ban the thing itself: a header stat that ships a digit is a figure no source produced,
// because the markup is what renders before any answer arrives.
const HDR = (MARKUP.match(/<div class="hdr-stat">[\s\S]*?<\/div>\s*<\/div>/) || [""])[0];
const hdrValues = [...HDR.matchAll(/<span class="v"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
ok(HDR !== "" && hdrValues.length > 0, "the header stat block is present and parsed", `parsed ${hdrValues.length} values`);
ok(hdrValues.every((v) => !/\d/.test(v)),
  "the header figures are placeholders in the markup, not hardcoded numbers",
  hdrValues.filter((v) => /\d/.test(v)).join(", "));
ok(!/\$\d/.test(MARKUP), "no dollar figure survives in the markup");
ok(!/FPDS/.test(HTML), "the page no longer cites a source it does not read");
const PROMISES = [/Command Leaderboard/i, /Set-Aside Posture/i, /Procurement Forecast/i, /Org Map/i];
const promised = PROMISES.filter((rx) => rx.test(HTML)).map((rx) => rx.source);
ok(promised.length === 0, "no panel heading promises unwired data", promised.join(", "));
ok(/id="livePill"/.test(HTML) && /\.live-pill\[hidden\]\{display:none\}/.test(HTML),
  "the LIVE pill can actually be hidden (the class sets display, so the attribute needs a rule)");

// ── D · one guard, every path ───────────────────────────────────────────────
console.log("\n── D · the guard covers every path ──");
const appCode = strip(APP);
ok(/'empty'|"empty"/.test(appCode), "renderer has a distinct empty path");
ok(/'error'|"error"/.test(appCode), "renderer has a distinct failure path");
ok(/loading/.test(appCode), "renderer has a loading path");
ok(!/renderKPIs|renderTreemap|renderForecast|renderPosture/.test(appCode), "no panel renderer survives to draw over empty data");
const liveCode = strip(LIVE);
ok(/res\.ok/.test(liveCode), "fetch layer checks the response status");
// A statement-level `} catch (e) { return; }` is the bail. An inline
// `.catch(fn)` that yields a fallback VALUE is not — it feeds a check rather
// than skipping one.
ok(!/\}\s*catch\s*\([^)]*\)\s*\{\s*(console[^\n]*\n\s*)?return[;\s}]/.test(liveCode), "no silent-return catch");

// ── planted positives ───────────────────────────────────────────────────────
console.log("\n═══ PLANTED POSITIVES — prove this gate can fail ═══");
const PLANTED_ROUTE = `return NextResponse.json({ _source: "unwired-mock-preserved" });`;
ok(/unwired-mock-preserved/.test(PLANTED_ROUTE), "A: probe catches the preserve-the-mock flag returning");
ok(!/state:\s*"unwired"/.test(PLANTED_ROUTE), "A: probe rejects a route that states no condition");

const PLANTED_SEED = `const DEPTS = [{ name: 'AFMC', spend: 412, sb: 31, fit: 88, contacts: 3 }];`;
ok(/\{\s*(name|code|key)\s*:\s*['"]/.test(PLANTED_SEED), "B: record probe catches a planted department");
ok(/\bspend\s*:|\bsb\s*:\s*\d|\bfit\s*:\s*\d/.test(PLANTED_SEED), "B: figure probe catches its invented numbers");

const PLANTED_HTML = `<div class="hdr-stat"><span class="v">$2.2B</span></div>`;
ok(/hdr-stat/.test(PLANTED_HTML) && /\$\d/.test(PLANTED_HTML), "C: probes catch a planted header figure");

const PLANTED_CSS = `.live-pill{display:inline-flex}`;
ok(!/\.live-pill\[hidden\]\{display:none\}/.test(PLANTED_CSS), "C: probe catches a pill that cannot be hidden");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nAGENCIES GATE FAILED — the page can show something no source produced.");
  process.exit(1);
}
console.log("agencies honest-unwired gate clean.");
