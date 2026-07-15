// $0 REGRESSION for the INQUIRY-DEADLINE BENIGN GUARD (Brain card 520, R1) — the passed-Q&A-window false-NHR seam.
// Run: npx tsx src/lib/audit-decide-inquiry-deadline.test.ts
//
// Doctrine (Brain card 520 R1): an information-exchange milestone (a questions/inquiries/RFI-submission window or a
// Q&A answer-posting date) is a ROUTINE SCHEDULE FACT — it does NOT gate offer submission or award eligibility. A
// lens that types it no_one_can_move ("questions can no longer be submitted") forces a false NEEDS_HUMAN_REVIEW via
// Fork-2's unmarkedUniversalClaim (LIVE driver, seq-1 run 5d0477e7 on FA303026Q0020). This guard is a SHAPE allowlist
// (position-checked info-exchange shape) that demotes such a finding → bidder_controls (informational). HARD BOUNDARY:
// a participation-prerequisite deadline (mandatory site visit / conference registration, vehicle/BOA/IDIQ enrollment)
// or a real offer-submission deadline STAYS a universal-path candidate. Ambiguity → escalate. Pure functions; flag
// INJECTED via the opt (no env mutation). Default-OFF ⇒ byte-identical.
import { applyInquiryDeadlineBenignGuard, isInquiryDeadlineBenign, deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
const on = (fs: TypedFinding[]) => applyInquiryDeadlineBenignGuard(fs, { enabled: true });
const off = (fs: TypedFinding[]) => applyInquiryDeadlineBenignGuard(fs, { enabled: false });
const committal = (v: string) => v === "BID" || v === "BID_WITH_CAUTION";

// ── THE LIVE DRIVER (seq-1 run 5d0477e7), typed no_one_can_move exactly as the lens produced it. ──
const liveDriver = (): TypedFinding => ({
  requirement: "Questions deadline — questions must be submitted by 10 Jul 2026 at 12:00 PM CDT; answers posted by 17 Jul 2026. (Already passed; bidders cannot submit new questions.)",
  citation: "§L – Instructions to Offerors (schedule)",
  excerpt: "All questions concerning this solicitation must be submitted in writing no later than 10 Jul 2026 at 12:00 PM CDT. Answers will be posted by 17 Jul 2026.",
  kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
});

// ── BENIGN PROBES — information-exchange milestones, every temporal state. All must DEMOTE. ──
const benign: Array<[string, TypedFinding]> = [
  ["questions-due future", { requirement: "Questions must be submitted no later than 20 Aug 2026.", citation: "§L", excerpt: "questions are due by 20 Aug 2026", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "former_ko" }],
  ["inquiries-closed", { requirement: "The inquiry period has closed; inquiries were due 01 Jun 2026 and can no longer be submitted.", citation: "§L schedule", excerpt: "inquiries deadline 01 Jun 2026 — closed", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "former_ko" }],
  ["RFI-window", { requirement: "Requests for Information (RFI) must be submitted by the cutoff date listed.", citation: "§L", excerpt: "RFI submittal cutoff", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "proposal_manager" }],
  ["Q&A-answers-posted", { requirement: "Answers to offeror questions will be posted via amendment by 17 Jul 2026.", citation: "§L", excerpt: "Q&A responses posted by 17 Jul", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "former_ko" }],
  ["clarification-questions", { requirement: "Clarification questions must be received by the Contracting Officer no later than 5 business days before the closing date.", citation: "§L", excerpt: "clarification questions received 5 days prior", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
];

// ── COUNTER-PROBES — participation prerequisites + real submission deadlines. All must STAY universal-path. ──
const counter: Array<[string, TypedFinding]> = [
  ["mandatory site-visit registration", { requirement: "Attendance at the mandatory site visit is required; offerors must register to attend by 10 Jul 2026 or be ineligible to propose.", citation: "§L", excerpt: "MANDATORY site visit — registration required to attend; failure to attend renders the offeror ineligible", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
  ["mandatory pre-proposal conference", { requirement: "A mandatory pre-proposal conference will be held; registration is required prior to attendance.", citation: "§L", excerpt: "mandatory pre-proposal conference — must register before attending", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
  ["vehicle/BOA enrollment", { requirement: "Only holders of the Basic Ordering Agreement (BOA) may submit; enrollment closed prior to this order.", citation: "§L", excerpt: "BOA holders only; enrollment window closed", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
  ["IDIQ on-ramp window", { requirement: "The IDIQ on-ramp/open season enrollment period must be completed to be eligible for task-order competition.", citation: "§L", excerpt: "IDIQ on-ramp open season enrollment required to be eligible", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "capture_manager" }],
  ["real quote submission deadline (passed)", { requirement: "Quotes must be submitted no later than 12 Jul 2026 at 2:00 PM; the deadline has passed.", citation: "§L", excerpt: "quotes due 12 Jul 2026 2:00 PM — closed", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
  ["adversarial: questions ABOUT the mandatory site visit", { requirement: "Questions regarding the mandatory site visit must be submitted by 08 Jul; registration to attend the site visit is required to be eligible.", citation: "§L", excerpt: "questions about the mandatory site visit due 08 Jul; site visit registration required to attend", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
  // AMBIGUITY → ESCALATE (doctrine): "responses due" collides with an OFFER-response deadline → conservatively kept.
  ["ambiguous: 'responses due' (offer-response collision)", { requirement: "Responses are due by 12 Jul 2026; late responses will not be considered.", citation: "§L", excerpt: "responses due 12 Jul; late responses not considered", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko" }],
];

// ── A GENUINE non-inquiry universal impossibility — NOT the guard's shape → must be untouched (stays NHR). ──
const techImpossible = (): TypedFinding => ({
  requirement: "The specified 3-day delivery against a 90-day irreducible production lead time is unmeetable by any offeror.",
  citation: "§F", excerpt: "deliver within 3 days ARO", kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
});

console.log("\n── P1 · the LIVE driver (5d0477e7): flag ON → demotes to bidder_controls (informational), verdict leaves NHR ──");
{
  const before = deriveVerdict({ findings: [liveDriver()], ...base });
  assert(before.verdict === "NEEDS_HUMAN_REVIEW", `BASELINE (flag OFF): live driver → NHR via unmarkedUniversalClaim (got ${before.verdict})`);
  const g = on([liveDriver()]);
  assert(g[0].controllability === "bidder_controls" && g[0].inquiryDeadlineGuard === true, "driver re-typed → bidder_controls + inquiryDeadlineGuard marker");
  assert(g[0].cautionFloor !== true, "informational: NOT floored to caution (a passed Q&A window has nothing to cure)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(committal(d.verdict), `post-fix verdict = committal (got ${d.verdict})`);
  assert(off([liveDriver()])[0].controllability === "no_one_can_move", "flag OFF ⇒ byte-identical (still no_one_can_move)");
}

console.log("\n── P2a · BENIGN probes — all demote to bidder_controls, all leave the NHR path ──");
for (const [name, f] of benign) {
  assert(isInquiryDeadlineBenign(f) === true, `benign: ${name} → isInquiryDeadlineBenign=true`);
  const g = on([{ ...f }]);
  assert(g[0].controllability === "bidder_controls", `benign: ${name} → demoted`);
  assert(committal(deriveVerdict({ findings: g, ...base }).verdict), `benign: ${name} → committal verdict`);
}

console.log("\n── P2b · COUNTER-probes — participation prereqs + real deadlines STAY universal-path candidates (NHR) ──");
for (const [name, f] of counter) {
  assert(isInquiryDeadlineBenign(f) === false, `counter: ${name} → isInquiryDeadlineBenign=false (kept)`);
  const g = on([{ ...f }]);
  assert(g[0].controllability === "no_one_can_move", `counter: ${name} → NOT demoted (stays no_one_can_move)`);
  assert(deriveVerdict({ findings: g, ...base }).verdict === "NEEDS_HUMAN_REVIEW", `counter: ${name} → stays NHR (escalation candidate)`);
}

console.log("\n── P2c · a GENUINE technical universal impossibility is untouched (wrong shape) → stays NHR ──");
{
  assert(isInquiryDeadlineBenign(techImpossible()) === false, "tech-impossible → not benign (no inquiry shape)");
  assert(deriveVerdict({ findings: on([techImpossible()]), ...base }).verdict === "NEEDS_HUMAN_REVIEW", "tech-impossible → stays NHR");
}

console.log("\n── P2d · a marked/verified universal defect is NEVER demoted (safety) ──");
{
  const marked: TypedFinding = { ...liveDriver(), universalDefect: "unmeetable_by_any_offeror" };
  assert(isInquiryDeadlineBenign(marked) === false, "universalDefect-marked inquiry finding → never benign");
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
