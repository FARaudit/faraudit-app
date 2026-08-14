// /run-audit may not ship FABRICATED rows, DEAD slots, or claims the engine cannot make.
// Run: npx tsx test/public/_run-audit-truth.test.ts
//
// _today-fabrication.test.ts guarded today.html and cc-app.js. run-audit.html had no
// gate at all, and it was shipping four hardcoded audit cards — scores 50/69/50/75
// "/100", offices "DLA TROOP SUPPORT · PHILADELPHIA PA", verdicts NO-BID / CAUTION /
// PROCEED. They were replaced at runtime, so nobody caught them; they still shipped.
//
// It was also rendering two slots that can never fill. Measured on live production,
// 20 of 20 rows: compliance_score 0, exec_what 0, exec_factors 0, recommendation 0.
// So every card drew an empty score box and an empty reason line.
//
// And the "what runs when you submit" panel promised BID / NO-BID. All three
// committal decline poles are unreachable in production by design
// (src/lib/ENGINE-DECIDE-AUDIT-2026-08-05.md); across 77 audits this account has
// Bid 0 · No-bid 0 · Ineligible 0.
//
// Part D plants each defect back and asserts this suite goes red.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const html = readFileSync(join(ROOT, "public", "run-audit.html"), "utf8");

// ── Part A · no fabricated rows ──
console.log("── Part A · no fabricated audit rows ──");

// The exact tokens that shipped.
const BANNED: Array<[string, string]> = [
  ["DLA TROOP SUPPORT · PHILADELPHIA PA", "invented buying office"],
  ["AIR FORCE · 55 CONS · OFFUTT AFB NE", "invented buying office"],
  ["AIR FORCE · AFLCMC · WPAFB OH", "invented buying office"],
  ["USDA FOREST SERVICE · ALBUQUERQUE NM", "invented buying office"],
  ["HM047626R0039", "invented solicitation number"],
  ["Sol_1232SA26R0020_Amd_0001", "invented solicitation number"],
  ["No-bid unless SPRS is current today.", "invented engine insight"],
  ["Strong fit — file the clarifications below before quoting.", "invented engine insight"],
];
for (const [tok, why] of BANNED) {
  check(`no "${tok.slice(0, 34)}…" (${why})`, !html.includes(tok));
}

// Shape sweep: a ledger row in the STATIC markup is a fabricated row by definition —
// every real row is built by cell() from /api/audits at runtime. Match only the
// STATIC shape (`<a class="rac is-…"`), not cell()'s own template string
// (`<a class="rac '+v.cls+'"`), which this counted as a fabricated row on the first
// run — the gate condemning the very renderer that makes the rows real.
const staticRows = (html.match(/<a class="rac [a-z]/g) || []).length;
check("no static .rac rows in the markup (real rows are rendered, never authored)",
  staticRows === 0, `found ${staticRows}`);
check("no hardcoded /100 score literal", !/\/\s*100</.test(html), "a score literal survives");

// ── Part B · no slot that can never fill ──
console.log("── Part B · no dead slots ──");

check("the 100-point score badge is gone from the renderer",
  !/rac-score/.test(html),
  "scoring was retired; the badge rendered an em dash on every row");
check("its styling went with it",
  !/\.rac-of\{/.test(html),
  "dead CSS for a slot that no longer renders");
// The reason line's emptiness is a LAYOUT question, not a truth one, and it is the
// CEO's to rule — reverted 2026-08-13 pending his review. What this suite still owns
// is that nothing INVENTS a reason: exec_what / exec_factors / recommendation are all
// 0 of 20 on live, so insightOf() must never fall back to a verdict word.
check("the reason line is derived, never a verdict word dressed as an insight",
  /F2-LIVE: the reason line must NEVER fall back to the pole word/.test(html),
  "the guard against printing the verdict twice is gone");

// ── Part C · the engine panel may only claim what the engine does ──
console.log("── Part C · what the panel claims ──");

const ENGINE_LIES: Array<[string, string]> = [
  ["BID / NO-BID", "committal decline poles are unreachable in production; Bid 0 · No-bid 0 across 77 audits"],
  ["Full-package map", "names mapDocument(), which has no callers"],
  ["Honest-fail, no charge", "AUDIT_NHR_NOCHARGE_SUPPRESS excludes NHR — the majority outcome — from that promise"],
  ["Coverage ledger", "names buildCoverageLedger(), which has no callers"],
];
for (const [claim, why] of ENGINE_LIES) {
  check(`panel does not claim "${claim}"`, !html.includes(claim), why);
}
// And it must still describe SOMETHING — a panel emptied of claims is not the fix.
// The figure names the four poles LIVE ROWS ACTUALLY CARRY (verdictOf's labels), so the
// panel and the ledger below it cannot drift apart.
const POLES = ["Bid · caution", "Needs review", "Incomplete", "Unresolved"];
for (const pole of POLES) {
  check(`the panel still names the "${pole}" pole the engine does return`,
    html.includes(pole), "the verdict step claims nothing at all");
}
// The claims that DO hold, checked so a later cleanup cannot quietly strip them: the
// grounding gate is imported by agentic-panel-runner and audit-orchestrator with no flag,
// the report schema requires a finding to cite a VERIFIED lens claim, and the engine's
// refusal to guess is the decline path itself.
for (const kept of ["Verbatim citation", "Names what it could not read", "traceable to the clause", "stops rather than guesses"]) {
  check(`panel keeps "${kept}" — this one is wired`, html.includes(kept), "a true claim was removed with the false ones");
}

// ── Part D · the collapsibles are the CEO'S CALL, not this suite's ──
// Expanding them by default was shipped without his review and reverted 2026-08-13.
// This suite asserts nothing about their open/closed state on purpose: a gate that
// pins a layout decision takes it away from the person whose decision it is.

// ── Part E · positive controls ──
console.log("── Part E · positive controls ──");
const controls: Array<[string, string]> = [
  ["a fabricated card returns", html.replace('<div class="ra-list">', '<div class="ra-list">\n<a class="rac is-nobid" href="#"><span class="rac-office">DLA TROOP SUPPORT · PHILADELPHIA PA</span></a>')],
  ["the score badge returns", html.replace("rac-insight", "rac-score")],
  ["the BID / NO-BID claim returns", html.replace("Bid · caution", "BID / NO-BID")],
  ["a wired claim is quietly stripped", html.replace("Verbatim citation", "Reads the document")],
];
for (const [name, planted] of controls) {
  const changed = planted !== html;
  let red = false;
  if (changed) {
    red =
      BANNED.some(([t]) => planted.includes(t)) ||
      (planted.match(/<a class="rac /g) || []).length > 0 ||
      /rac-score/.test(planted) ||
      ENGINE_LIES.some(([c]) => planted.includes(c)) ||
      POLES.some((pole) => !planted.includes(pole)) ||
      !planted.includes("Verbatim citation");
  }
  check(`positive control · ${name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
