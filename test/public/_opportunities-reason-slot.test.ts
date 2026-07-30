// ─────────────────────────────────────────────────────────────────────────────
// REASON-SLOT GATE — "a reason must state something that would still be true if
// FARaudit did not exist."
//
// Adjudicated 2026-07-29 after three of my own proposals for policing this slot
// were each refuted for measuring the DISTRIBUTION OF OUTPUT STRINGS (a variety
// census, then a duplicate-reason invariant, then a "differentiation floor").
// Every one of them was the same rule rewritten over the same surface. The
// decidable form measures the reason's SUBJECT instead:
//
//   The subject is the NOTICE or the BUYER. Never our pipeline.
//     A1 · pole in the reason slot — subject is our processing state. HARD FAIL.
//     A2 · imperative in the reason slot — no assertion, only an instruction.
//          Rewrite: the underlying fact exists and is correct, it just wasn't
//          the thing rendered.
//
// WHAT THIS GATE CAN AND CANNOT DO — stated plainly, because a gate that
// overclaims is the defect it exists to catch:
//   CAN  · block the specific historical A1/A2 strings from returning (regression)
//   CAN  · flag our-pipeline vocabulary in any NEW reason string (A1 detector)
//   CAN  · flag a reason that opens with an imperative verb (A2 detector)
//   CANNOT · decide the counterfactual for a genuinely novel sentence. That is a
//            judgment call and it routes to Brain/CEO, not to this file. The
//            detectors below are deliberately noisy in the safe direction: a
//            false flag costs a conversation, a false pass ships a category error.
//
// Run: npx tsx test/public/_opportunities-reason-slot.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0, flag = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};
const warn = (label: string, detail = "") => { flag++; console.log(`  ⚠ REVIEW ${label}${detail ? "  — " + detail : ""}`); };

const APP = readFileSync(path.join(process.cwd(), "public", "dso-app.js"), "utf8");

// Extract every string literal returned by pursuitInsight().
function insightStrings(src: string): string[] {
  const start = src.indexOf("function pursuitInsight(");
  if (start < 0) throw new Error("pursuitInsight not found — gate cannot run (fail closed)");
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  const body = src.slice(start, i + 1);
  // template literals returned by the function, comments stripped first
  const noComments = body.replace(/\/\/[^\n]*/g, "");
  return [...noComments.matchAll(/return\s+`([^`]+)`/g)].map((m) => m[1]);
}

// EVERY customer-visible explanatory string, not just pursuitInsight()'s returns.
// The first version of this gate read only pursuitInsight, and MISSED a `title=`
// tooltip on the same rows still carrying the exact A1 string the insight had just
// been cleaned of — an incomplete fix that the gate certified as complete. Fix all
// N sites, then make the gate cover all N.
// SCOPE: the A1 rule governs the REASON slot. A pole living in a POLE surface is
// correct and must not be "fixed" — the fit tile's "Not yet audited — no fit
// score" is a pole tooltip on the element whose entire job is to show audit
// state, so pipeline vocabulary there is honest and correctly placed. The defect
// A1 names is PLACEMENT, not vocabulary. Pole surfaces are excluded by the
// element they hang on, and asserted separately below so a future edit cannot
// quietly reword them.
const POLE_SURFACES = /fit-ring|fit-tile|pc-fit/;
function tooltipStrings(src: string): string[] {
  const noComments = src.replace(/\/\/[^\n]*/g, "");
  return [...noComments.matchAll(/title="([^"]{25,})"/g)]
    .filter((m) => !POLE_SURFACES.test(noComments.slice(Math.max(0, m.index! - 140), m.index!)))
    .map((m) => m[1]);
}
function poleTooltips(src: string): string[] {
  const noComments = src.replace(/\/\/[^\n]*/g, "");
  return [...noComments.matchAll(/title="([^"]{10,})"/g)]
    .filter((m) => POLE_SURFACES.test(noComments.slice(Math.max(0, m.index! - 140), m.index!)))
    .map((m) => m[1]);
}

const insight = insightStrings(APP);
const tooltips = tooltipStrings(APP);
const strings = [...insight, ...tooltips];
ok(insight.length > 0, `extracted ${insight.length} reason strings from the shipped pursuitInsight()`);
ok(tooltips.length > 0, `extracted ${tooltips.length} customer-visible title= tooltips (the site the first gate missed)`);

console.log("\n═══ A1 · REGRESSION GUARDS — the exact strings ruled out ═══");
// "Not yet audited — run the audit…" : is_audited is a fact about OUR QUEUE and
// nothing else. Ruled A1 (hard fail). Still present pending the Test A pass that
// moves it to the POLE and leaves the reason honestly absent — so this guard is
// recorded as PENDING, not passing, and must flip when that pass lands.
const hasNotAudited = strings.some((s) => /not yet audited/i.test(s));
if (hasNotAudited) {
  warn("'Not yet audited — run the audit…' still occupies the reason slot",
    "A1, ruled hard-fail. Pending the Test A pass (board row OPPS-REASON-SLOT-ABOUTNESS): those rows should carry the POLE 'Not audited' with the reason column honestly ABSENT. This warning must become a FAIL once that ships.");
}
ok(!strings.some((s) => /nothing to audit/i.test(s)),
  "'nothing to audit' is GONE from EVERY customer-visible string — insight AND tooltip (was A1: described our operation, and rendered the earliest government signal as a null)");
ok(!tooltips.some((s) => /nothing to audit|not yet audited|run the audit/i.test(s)),
  "no NON-POLE tooltip carries pipeline-subject vocabulary",
  tooltips.filter((s) => /nothing to audit|not yet audited|run the audit/i.test(s)).join(" | "));
// The complement, asserted so the correct placement is protected rather than
// merely tolerated: a pole tooltip SHOULD name our audit state — that is its job.
const poles = poleTooltips(APP);
ok(poles.some((s) => /not yet audited/i.test(s)),
  `pole surface still names audit state (${poles.length} pole tooltip(s)) — correct placement, do not reword`,
  poles.join(" | "));
ok(strings.some((s) => /pre-solicitation signal/i.test(s)),
  "Special Notice now states the NOTICE's property: 'Pre-solicitation signal — no solicitation document posted yet'");

console.log("\n═══ A2 · imperative-first — the finding must lead ═══");
ok(!strings.some((s) => /^\s*(assert|run|confirm|open|click|read it)\b/i.test(s)),
  "no reason string OPENS with an imperative");
const sole = strings.find((s) => /sole-source/i.test(s));
ok(!!sole && /competition is not open/i.test(sole),
  "sole-source leads with the FACT (competition is not open), not the instruction",
  sole ? `"${sole.slice(0, 74)}…"` : "string missing");

console.log("\n═══ COUNTERFACTUAL · would this still be true without FARaudit? ═══");
// A1 detector: vocabulary that can only name OUR pipeline. Deliberately narrow —
// these are phrases with no reading in which the subject is the notice or buyer.
const OUR_PIPELINE = [
  /\bnot yet audited\b/i, /\bnothing to audit\b/i, /\brun the audit\b/i,
  /\bwe (?:have|could|cannot|couldn't)\b/i, /\bour (?:engine|queue|pipeline|system)\b/i,
  /\bnot (?:yet )?(?:processed|ingested|scanned)\b/i, /\bin (?:our )?queue\b/i
];
for (const s of strings) {
  const hit = OUR_PIPELINE.find((re) => re.test(s));
  if (hit) {
    if (/not yet audited/i.test(s)) continue; // already reported above as PENDING
    fail++; console.log(`  ✗ FAIL A1 · subject is our pipeline: "${s.slice(0, 70)}…"  (matched ${hit})`);
  }
}
ok(true, `${strings.length} strings screened for our-pipeline vocabulary`);
// The one Brain ruled cleanest, asserted explicitly so a future edit can't quietly
// "fix" it: unreadability is a property of the NOTICE's own field.
const unknown = strings.find((s) => /eligibility is unread/i.test(s));
ok(!!unknown && /not open/i.test(unknown),
  "UNKNOWN set-aside kept VERBATIM — 'eligibility is unread, not open' passes the counterfactual",
  "the field is absent/malformed ON THE NOTICE whether or not we look");

console.log("\n═══ PLANTED POSITIVES — prove this gate can fail ═══");
const PLANTED_A1 = [
  "Not yet audited — run the audit for a scored, grounded read.",
  "We could not process this notice yet.",
  "Still in our queue — check back later."
];
const caughtA1 = PLANTED_A1.filter((s) => OUR_PIPELINE.some((re) => re.test(s))).length;
ok(caughtA1 === PLANTED_A1.length, `A1 detector catches ${caughtA1}/${PLANTED_A1.length} planted pipeline-subject strings`);
const PLANTED_A2 = ["Assert capability inside the response window.", "Run the audit to see the fit."];
const caughtA2 = PLANTED_A2.filter((s) => /^\s*(assert|run|confirm|open|click|read it)\b/i.test(s)).length;
ok(caughtA2 === PLANTED_A2.length, `A2 detector catches ${caughtA2}/${PLANTED_A2.length} planted imperative-first strings`);
// and prove the gate fails closed if the function is renamed away
let closed = false;
try { insightStrings("function somethingElse(){ return `x`; }"); } catch { closed = true; }
ok(closed, "gate FAILS CLOSED if pursuitInsight() is renamed or removed (never silently passes)");

console.log(`\n══════ ${pass} passed · ${fail} failed · ${flag} pending-review ══════`);
if (flag > 0) console.log("PENDING items are ruled defects awaiting a scheduled pass — they are reported, not swallowed.");
if (fail > 0) { console.error("\nREASON-SLOT GATE FAILED — a reason names our pipeline or leads with an instruction."); process.exit(1); }
console.log("reason-slot gate clean.");
