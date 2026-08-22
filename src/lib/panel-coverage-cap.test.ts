// $0 regression lock for RULE 70 AT THE PANEL COVERAGE FLOOR
// (src/lib/agentic-panel-runner.ts, flag AUDIT_PANEL_COVERAGE_CAP_NOT_MUTE).
// Run: npx tsx src/lib/panel-coverage-cap.test.ts
//
// SUBJECT: the production `enforceCoverageFloor`.
//
// WHAT IS AT STAKE. The chief judge's verdict is not the customer's verdict pole — `deriveVerdict` owns
// that — but it GATES THE REASON FOLD at audit-executor-v3.ts:727, which only folds the panel's rationale
// into `decision.reason` when the judge verdict is COMMITTAL. So muting to INCOMPLETE deletes the panel's
// whole narrative from the report's "Bottom line" after the engine spent ~48% of the run producing it.
// Measured 2026-08-22: 40 of 50 banked packages carry a non-empty `unroutedBinding`, and the floor fires on
// ANY single line, so this is the common case, not an edge.
//
// THE THREE WAYS THIS FIX COULD BE WRONG, each silent:
//   • IT WEAKENS THE FAILED-DEPENDENCY MUTE. `droppedSections` means content the panel never read. That must
//     mute in EVERY flag state — Rule 70 case (b). A cap there would be a confident verdict over unread text.
//   • IT TOUCHES THE DISQUALIFIER CLASS. NO_BID / INELIGIBLE must pass through unchanged. Rule 70 narrows the
//     ambient application of fail-toward-disqualifier; it does not disarm the disqualifier.
//   • IT IS NOT INERT WHEN OFF. Default-OFF must be byte-identical to the shipped floor.
import { enforceCoverageFloor, type ChiefJudgeOutput } from "./agentic-panel-runner";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

const j = (verdict: string): ChiefJudgeOutput => ({
  verdict, eligible: true, fit_score: 72, show_stoppers: [{ claim_ref: "ex_ko:G1", text: "x" }],
  rationale: "The package is a paving IDIQ; §L is complete and the firm clears the size standard.",
} as any);

const UNROUTED = ["Attachment L - NMDOT Spec.pdf", "Attachment B - As-built Requirements.pdf", "Wage Determination TX20260293.pdf", "Attachment K - Site Clearance.pdf"];
const DROPPED = ["capture:§C", "capture:§L"];

const withFlag = <T,>(v: string | undefined, fn: () => T): T => {
  const r = process.env.AUDIT_PANEL_COVERAGE_CAP_NOT_MUTE;
  if (v === undefined) delete process.env.AUDIT_PANEL_COVERAGE_CAP_NOT_MUTE; else process.env.AUDIT_PANEL_COVERAGE_CAP_NOT_MUTE = v;
  try { return fn(); } finally { if (r === undefined) delete process.env.AUDIT_PANEL_COVERAGE_CAP_NOT_MUTE; else process.env.AUDIT_PANEL_COVERAGE_CAP_NOT_MUTE = r; }
};
const COMMITTAL = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE"];

console.log("── the flag reads ONLY \"true\"; absence is OFF");
for (const v of [undefined, "", "false", "TRUE", "1", "yes"]) withFlag(v, () => {
  ok(`flag=${JSON.stringify(v)} · a BID with unrouted content still MUTES`, enforceCoverageFloor(j("BID"), { unroutedBinding: UNROUTED }).verdict === "INCOMPLETE");
});

console.log("── FLAG-OFF is the shipped floor, unchanged");
withFlag("false", () => {
  for (const v of [...COMMITTAL, "NEEDS_HUMAN_REVIEW", "INCOMPLETE", "OUT_OF_SCOPE"]) {
    const r = enforceCoverageFloor(j(v), { unroutedBinding: UNROUTED });
    ok(`${v} ⇒ INCOMPLETE`, r.verdict === "INCOMPLETE");
    ok(`${v} ⇒ eligible=false · fit=0 · stoppers cleared`, r.eligible === false && r.fit_score === 0 && r.show_stoppers.length === 0);
  }
  const clean = j("BID");
  ok("no gaps at all ⇒ the judgment is returned untouched (same object)", enforceCoverageFloor(clean, {}) === clean);
});

console.log("── FLAG-ON · unrouted-only · the CAP replaces the mute");
withFlag("true", () => {
  const r = enforceCoverageFloor(j("BID"), { unroutedBinding: UNROUTED });
  ok("BID caps to BID_WITH_CAUTION", r.verdict === "BID_WITH_CAUTION");
  ok("eligibility work SURVIVES (eligible stays true)", r.eligible === true);
  ok("fit_score SURVIVES (72, not zeroed)", r.fit_score === 72);
  ok("show_stoppers SURVIVE", r.show_stoppers.length === 1);
  ok("the uncovered items are NAMED in the rationale", r.rationale.includes("Attachment L - NMDOT Spec.pdf"));
  ok("the count is stated and the overflow is disclosed", r.rationale.includes("4 binding item(s)") && r.rationale.includes("+1 more"));
  ok("the judge's own reasoning is still carried", r.rationale.includes("paving IDIQ"));
  ok("BID_WITH_CAUTION stays BID_WITH_CAUTION (no double-demotion)", enforceCoverageFloor(j("BID_WITH_CAUTION"), { unroutedBinding: UNROUTED }).verdict === "BID_WITH_CAUTION");
  ok("the capped verdict is COMMITTAL, so the reason-fold can run", ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE"].includes(r.verdict));
});

console.log("── FLAG-ON · the DISQUALIFIER class is untouched (Rule 70 does not disarm it)");
withFlag("true", () => {
  for (const v of ["NO_BID", "INELIGIBLE"]) {
    const r = enforceCoverageFloor(j(v), { unroutedBinding: UNROUTED });
    ok(`${v} passes through unchanged`, r.verdict === v && r.eligible === true && r.fit_score === 72);
  }
});

console.log("── FLAG-ON · a DROPPED SECTION is a FAILED DEPENDENCY and STILL MUTES");
withFlag("true", () => {
  for (const v of COMMITTAL) {
    ok(`${v} + dropped sections ⇒ INCOMPLETE`, enforceCoverageFloor(j(v), { droppedSections: DROPPED }).verdict === "INCOMPLETE");
    ok(`${v} + dropped AND unrouted ⇒ INCOMPLETE (dropped dominates)`, enforceCoverageFloor(j(v), { droppedSections: DROPPED, unroutedBinding: UNROUTED }).verdict === "INCOMPLETE");
  }
  const r = enforceCoverageFloor(j("BID"), { droppedSections: DROPPED });
  ok("the mute still zeroes eligibility work", r.eligible === false && r.fit_score === 0 && r.show_stoppers.length === 0);
  ok("the mute still names what was dropped", r.rationale.includes("capture:§C"));
});

console.log("── FLAG-ON · a NON-COMMITTAL judge verdict is left as the judge wrote it, then muted");
withFlag("true", () => {
  for (const v of ["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "OUT_OF_SCOPE"])
    ok(`${v} + unrouted ⇒ INCOMPLETE (never promoted into a commitment)`, enforceCoverageFloor(j(v), { unroutedBinding: UNROUTED }).verdict === "INCOMPLETE");
});

console.log("── the input judgment is never mutated in place, in any state");
for (const v of ["true", "false"]) withFlag(v, () => {
  const src = j("BID");
  enforceCoverageFloor(src, { unroutedBinding: UNROUTED });
  enforceCoverageFloor(src, { droppedSections: DROPPED });
  ok(`flag=${v} · caller's object still reads BID / eligible / fit=72`, src.verdict === "BID" && src.eligible === true && src.fit_score === 72);
});

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
