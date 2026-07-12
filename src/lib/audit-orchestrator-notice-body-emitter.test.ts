// $0 GAUNTLET for D2-B — the NOTICE-BODY ELIGIBILITY-BAR finding EMITTER (Brain card 441, flag AUDIT_NOTICE_BODY_ELIG_FLOOR).
// Run: npx tsx src/lib/audit-orchestrator-notice-body-emitter.test.ts
//
// Charter: noticeBodyEligibilityUngrounded (the B3-detection floor) routes NHR on an ungrounded notice-body eligibility
// bar but returns a BOOLEAN — it emits NO finding. The B3-severity floor (siteVisitEligStoppers, audit-decide.ts) only
// promotes a grounded disqualifier already sitting in dispositions[], so on a detect-only-signal package the bar buries as
// a P2 advisory. emitNoticeBodyEligBarFindings is the missing SIBLING to emitSetAsideNoticeFindings: it emits ONE grounded
// eligibility-bar finding per ungrounded bar span so the floor has a disqualifier to promote.
//
// RULED CONDITION (Brain, LOAD-BEARING): at most ONE finding per bar span; a span already covered by a decision-bearing
// finding is NEVER re-emitted (double-promotion inflating showStoppers[] is the over-fire class). Proofs: the STARVATION
// gap-demo (before-state), the emit/disposition/end-to-end promotion, over-fire + dedup guards, and flag-OFF byte-identical.
import { emitNoticeBodyEligBarFindings, noticeBodyEligibilityUngrounded } from "./audit-orchestrator";
import { deriveVerdict, disposeFinding } from "./audit-decide";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";
import { SITE_VISIT_CONCLUDED_RE } from "./audit-site-visit-patterns";
import type { TypedFinding, VerdictInputs, BidderProfile } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const PRIMARY = "Solicitation W912-XX-26-R-0001. Standard Form 1449 commercial-items solicitation. Section B pricing schedule, Section C statement of work, Sections L and M follow in the attached document.";
const mk = (noticeText: string) =>
  `\n\n==== DOCUMENT: Solicitation W912-XX ====\n\n${PRIMARY}\n\n==== DOCUMENT: ${NOTICE_BODY_DOC_NAME} ====\n\n${noticeText}`;

const POS = {
  siteVisit: "A mandatory pre-proposal site visit will be conducted on 15 March 2026. Only offerors who attended the site visit will be eligible to submit a proposal for this requirement.",
  clearance: "The contractor must hold an active TOP SECRET facility clearance at the time of award to perform this classified effort.",
};
const BENIGN = {
  siteVisitEncouraged: "An optional site visit is encouraged but not required. Attendance is not a condition of award, and offerors who do not attend may still submit a proposal.",
  informationalBoa:    "Orders will be issued against the existing Basic Ordering Agreement (BOA). The period of performance is twelve months from award with two option years.",
};
const base = (over: Partial<VerdictInputs>): VerdictInputs =>
  ({ findings: [], bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, ...over });
const inSS = (ss: Array<{ requirement: string }>, req: string) => ss.some((s) => s.requirement === req);

// ── 0 · STARVATION GAP-DEMO (the before-state that motivates the emitter) ──
console.log("\n── 0 · GAP-DEMO: detector routes NHR but emits nothing → severity floor has nothing to promote ──");
{
  // The detector fires (the bar is ungrounded), so the caller sets noticeBodyBarUngrounded=true; but WITHOUT a grounded
  // finding in dispositions[], the severity floor promotes nothing — the exact starvation D2-B fixes.
  assert(noticeBodyEligibilityUngrounded(mk(POS.siteVisit), []) === true, "detector fires on the ungrounded notice-body bar (NHR)");
  const d = deriveVerdict(base({ findings: [], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", "verdict is the notice-body NHR pole");
  assert(d.showStoppers.length === 0, "STARVATION: no grounded finding → showStoppers empty (bar buries as advisory)");
}

// ── 1 · EMIT: one grounded, promotable eligibility-bar finding per ungrounded bar ──
console.log("\n── 1 · EMIT: grounded eligibility-bar finding with the promotable shape ──");
{
  const emitted = emitNoticeBodyEligBarFindings(mk(POS.siteVisit), []);
  assert(emitted.length === 1, "exactly ONE finding emitted for the single site-visit bar");
  const f = emitted[0];
  assert(f?.kind === "eligibility_bar", "kind = eligibility_bar (floor-promotable)");
  assert(f?.controllability === "bidder_cannot_move", "controllability = bidder_cannot_move (→ disposes disqualifying)");
  assert(f?.curableInWindow === false, "curableInWindow = false (a real bar, not a gate to clear)");
  assert(f?.grounded === true && !!f?.excerpt, "grounded = true with a non-empty excerpt");
  assert(f?.requiredAttribute === undefined, "requiredAttribute UNSET → firmStatus stays 'unknown' (promotable)");
  assert(f?.citation === NOTICE_BODY_DOC_NAME, "citation = provenance label (SAM Notice Body), not a fabricated clause");
  // excerpt grounds: it is a verbatim substring of the normalized notice body (the detector's coordinate space).
  const nNotice = mk(POS.siteVisit).replace(/\s+/g, " ").trim().toLowerCase();
  assert(nNotice.includes((f?.excerpt || "").toLowerCase()), "excerpt is a verbatim substring of the notice body (grounds by indexOf)");
}

// ── 2 · DISPOSITION: the emitted finding disposes 'disqualifying' ──
console.log("\n── 2 · DISPOSITION: emitted finding → 'disqualifying' ──");
{
  const f = emitNoticeBodyEligBarFindings(mk(POS.clearance), [])[0];
  assert(!!f && disposeFinding(f) === "disqualifying", "disposeFinding(emitted clearance bar) === 'disqualifying'");
}

// ── 3 · END-TO-END PROMOTION: emit → deriveVerdict on the notice-body pole → P0 show-stopper ──
console.log("\n── 3 · END-TO-END: emitted finding promotes to a P0 bid-deciding show-stopper on the notice-body pole ──");
{
  const emitted = emitNoticeBodyEligBarFindings(mk(POS.siteVisit), []);
  const d = deriveVerdict(base({ findings: emitted, noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", "verdict stays NHR (WRONG_VERDICT=0 — never a committal)");
  assert(inSS(d.showStoppers, emitted[0].requirement), "emitted bar promoted into showStoppers[] (bid-deciding)");
  const promoted = d.showStoppers.find((s) => s.requirement === emitted[0].requirement) as { severity?: string } | undefined;
  assert(promoted?.severity === "P0", "promoted show-stopper floored to P0");
}

// ── 4 · OVER-FIRE + RULED DEDUP ──
console.log("\n── 4 · OVER-FIRE + DEDUP (the load-bearing over-fire class) ──");
{
  // (a) benign encouraged site visit → no bar language → emit nothing.
  assert(emitNoticeBodyEligBarFindings(mk(BENIGN.siteVisitEncouraged), []).length === 0, "encouraged/optional site visit → emits nothing");
  assert(emitNoticeBodyEligBarFindings(mk(BENIGN.informationalBoa), []).length === 0, "informational BOA → emits nothing");
  // (b) a decision-bearing finding already SPANNING the bar → NOT re-emitted (the ruled dedup).
  const covering: TypedFinding = {
    requirement: "Only offerors who attended the mandatory site visit may submit.", citation: "SAM Notice Body",
    excerpt: POS.siteVisit, kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko", curableInWindow: false,
  };
  assert(emitNoticeBodyEligBarFindings(mk(POS.siteVisit), [covering]).length === 0, "bar already covered by a decision-bearing finding → NOT re-emitted (no double-promotion)");
  // (c) a 'dropped' (boilerplate) finding does NOT cover → emitter still fires (mirrors the detector; safe direction).
  const dropped: TypedFinding = { ...covering, kind: "boilerplate" };
  assert(emitNoticeBodyEligBarFindings(mk(POS.siteVisit), [dropped]).length === 1, "a 'dropped' finding does NOT suppress the emit (safe direction)");
  // (d) the SAME bar sentence duplicated in the notice → still exactly ONE finding (span dedup).
  assert(emitNoticeBodyEligBarFindings(mk(POS.siteVisit + " " + POS.siteVisit), []).length === 1, "duplicated bar sentence → a single finding (ruled: one per span)");
  // (e) TWO DISTINCT bars (site visit + clearance, different sentences) → TWO findings (each real bar surfaced).
  assert(emitNoticeBodyEligBarFindings(mk(POS.siteVisit + " " + POS.clearance), []).length === 2, "two distinct bars → two findings (distinct spans)");
}

// ── 5 · FLAG-OFF BYTE-IDENTICAL (structural) ──
console.log("\n── 5 · FLAG-OFF byte-identical (Rule 61) ──");
{
  // The emitter is invoked at the orchestrator ONLY when noticeBodyBarUngrounded (itself `AUDIT_NOTICE_BODY_ELIG_FLOOR ===
  // "true" && detector`). Structural proof of no self-forced promotion: the emitted finding, fed to deriveVerdict WITHOUT
  // the severity-floor flag, does NOT promote (the floor is what promotes, in-branch) — so the emitter alone changes nothing.
  const emitted = emitNoticeBodyEligBarFindings(mk(POS.siteVisit), []);
  const dOff = deriveVerdict(base({ findings: emitted, noticeBodyBarUngrounded: true /* no siteVisitSeverityFloor */ }));
  assert(dOff.showStoppers.length === 0, "severity-floor flag OFF → emitted finding not promoted (byte-identical band behavior)");
  // And a no-bar notice → emitter is a no-op regardless.
  assert(emitNoticeBodyEligBarFindings(mk("Combined synopsis for commercial widgets. Quotes due 30 days after posting."), []).length === 0, "no-bar notice → emitter no-op");
}

// ── 6 · REGRESSION PAIR (Brain card #453/#454) — concluded vs upcoming mandatory site-visit framing ──
console.log("\n── 6 · REGRESSION PAIR: concluded → conditional-concluded (no live-gate); upcoming → live gate ──");
{
  // (a) CONCLUDED mandatory visit — the notice/UPDATE carries a held/concluded past-marker.
  const concludedNotice = "A mandatory pre-proposal site visit was held and concluded on May 28, 2026. Only offerors who attended the site visit are eligible to submit a proposal; attendance cannot be completed after the fact.";
  const emittedC = emitNoticeBodyEligBarFindings(mk(concludedNotice), []);
  assert(emittedC.length === 1, "(a) concluded: exactly one finding emitted");
  const fc = emittedC[0];
  assert(/held\/concluded|has concluded/i.test(fc.requirement) && /bars award unless/i.test(fc.requirement),
    "(a) concluded: finding carries the TEMPORAL FRAME + conditional-concluded copy ('bars award unless … confirmed')");
  assert(!/plan to attend/i.test(fc.requirement), "(a) concluded: ZERO live-gate language ('plan to attend' absent)");
  assert(/may 28,? 2026/i.test(fc.requirement), "(a) concluded: the event date is surfaced (from the normalized notice)");
  // excerpt spans BOTH the bar and the concluded marker (one verbatim span), and grounds by indexOf.
  const nC = mk(concludedNotice).replace(/\s+/g, " ").trim().toLowerCase();
  assert(nC.includes((fc.excerpt || "").toLowerCase()), "(a) concluded: combined excerpt is a verbatim substring (grounds)");
  assert(/concluded/i.test(fc.excerpt || "") && /site visit/i.test(fc.excerpt || ""), "(a) concluded: excerpt spans both the bar and the concluded marker");
  // END-TO-END: the correctly-framed finding PROMOTES (guard sees the concluded frame in the finding itself).
  const dC = deriveVerdict(base({ findings: emittedC, noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: mk(concludedNotice) }));
  assert(dC.verdict === "NEEDS_HUMAN_REVIEW", "(a) concluded: verdict stays NHR");
  assert(inSS(dC.showStoppers, fc.requirement), "(a) concluded: conditional-concluded finding PROMOTED to a show-stopper (correctly framed)");

  // (b) UPCOMING mandatory visit — no concluded marker → live-gate framing, promoted with the date.
  const emittedU = emitNoticeBodyEligBarFindings(mk(POS.siteVisit), []);
  const fu = emittedU[0];
  assert(/plan to attend/i.test(fu.requirement), "(b) upcoming: LIVE-gate framing ('plan to attend')");
  assert(!/bars award unless/i.test(fu.requirement), "(b) upcoming: NOT conditional-concluded copy");
  const dU = deriveVerdict(base({ findings: emittedU, noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: mk(POS.siteVisit) }));
  assert(inSS(dU.showStoppers, fu.requirement), "(b) upcoming: live mandatory site-visit bar PROMOTED (no concluded marker in source)");
}

// ── 7 · MIS-FRAMED lens finding (live text + concluded source) STAYS not-promoted (the built guard, unchanged) ──
console.log("\n── 7 · MIS-FRAMED: live-sounding lens finding + concluded SOURCE → not promoted (guard unchanged) ──");
{
  const concludedNotice = "A mandatory site visit was held and concluded on May 28, 2026.";
  const misFramed: TypedFinding = {
    requirement: "You must attend the initial site visit to be considered eligible to propose.",
    excerpt: "you must attend the initial site visit to be considered eligible to propose.",
    citation: "SAM Notice Body", kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko",
  };
  const d = deriveVerdict(base({ findings: [misFramed], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: mk(concludedNotice) }));
  assert(!inSS(d.showStoppers, misFramed.requirement), "mis-framed live-sounding finding (concluded only in source) NOT promoted — routed to human review");
}

// ── 8 · NO-DATE concluded (Gate-2 fix): requirement still carries a CONCLUDED_RE-matchable frame → promotes ──
console.log("\n── 8 · NO-DATE concluded: emitted requirement matches the shared CONCLUDED_RE → promotes ──");
{
  const noDate = "The mandatory pre-proposal site visit has been concluded and is now closed. Only offerors who attended the site visit are eligible to submit a proposal.";
  const f = emitNoticeBodyEligBarFindings(mk(noDate), [])[0];
  assert(!!f && /was held\/concluded/i.test(f.requirement) && !/plan to attend/i.test(f.requirement),
    "(no date) requirement uses 'was held/concluded (date not stated)' framing, no live-gate language");
  assert(SITE_VISIT_CONCLUDED_RE.test(f.requirement), "(no date) requirement matches the shared CONCLUDED_RE (guard will recognize it)");
  const d = deriveVerdict(base({ findings: [f], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: mk(noDate) }));
  assert(inSS(d.showStoppers, f.requirement), "(no date) correctly-framed finding PROMOTES even without a parseable date");
}

// ── 9 · MULTI-VISIT (Gate-2 fix): a concluded visit far above must NOT mis-frame a separate UPCOMING visit bar ──
console.log("\n── 9 · MULTI-VISIT: window-scoped concluded search — upcoming bar stays live, not concluded ──");
{
  const filler = " ".padEnd(0) + "The period of performance is twelve months from award with two option years. ".repeat(10); // >600 chars, no bar/concluded language
  const multi = `A mandatory site visit was held and concluded on May 1, 2026. Only offerors who attended that first site visit are eligible for base work.${filler}A second mandatory site visit will be conducted on 15 August 2026. Only offerors who attend the August site visit will be eligible to submit a proposal.`;
  const emitted = emitNoticeBodyEligBarFindings(mk(multi), []);
  const concludedF = emitted.find((f) => /May 1, 2026/i.test(f.requirement));
  const upcomingF = emitted.find((f) => /plan to attend/i.test(f.requirement));
  assert(!!concludedF, "the EARLY concluded visit → conditional-concluded frame (May 1)");
  assert(!!upcomingF && !/was held\/concluded/i.test(upcomingF.requirement),
    "the LATER UPCOMING visit → live-gate frame, NOT mis-labeled concluded (concluded search is window-scoped to its own bar)");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
