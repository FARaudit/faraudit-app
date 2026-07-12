// $0 REGRESSION for B3-SEVERITY — the site-visit / hard-eligibility SEVERITY floor (Brain card 429).
// Run: npx tsx src/lib/audit-decide-sitevisit-severity.test.ts
//
// Doctrine (fail-toward-disqualifier on SEVERITY/BAND, verdict-preserving): when the NOTICE-BODY eligibility floor
// (B3-detection) routes to NEEDS_HUMAN_REVIEW, a grounded COMPLETED/mandatory site-visit (or hard-eligibility)
// disqualifier sitting in dispositions[] must render BID-DECIDING — the notice-body branch persists showStoppers=[]
// so it otherwise falls through v4-report severityOf() into the P2 "Advisories" band (buried finding[20] on run
// 24f0b29e). The promotion is applied IN-BRANCH (deriveVerdict noticeBodyBarUngrounded branch) — NOT on any other
// NHR pole. This test drives the REAL deriveVerdict path (faithful to production), flag INJECTED via
// VerdictInputs.siteVisitSeverityFloor; default undefined ⇒ the branch passes [] as before (byte-identical, Rule 61).
//
// KEY REGRESSION LOCKS (ultracode Gate-2): the floor must NOT promote on the META-AMBIGUITY poles
// (setAsideConflict / primaryIndeterminate) — a bar there would be a FALSE committal on an NHR report (root-C).
import { deriveVerdict } from "./audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log((cond ? "PASS" : "FAIL") + ": " + msg); if (!cond) failures++; };
const base = (over: Partial<VerdictInputs>): VerdictInputs =>
  ({ findings: [], bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, ...over });
const inSS = (ss: { requirement: string }[], req: string) => ss.some((s) => s.requirement === req);
const ssFor = (ss: Array<{ requirement: string; severity?: string }>, req: string) => ss.find((s) => s.requirement === req);

// ── FA8137 finding[20] — the regression-lock target, VERBATIM from the live run (audit 24f0b29e). A COMPLETED
//    mandatory site visit → controllability=no_one_can_move (→ disposeFinding "disqualifying"), severity=P2. ──
const siteVisitCompleted = (): TypedFinding => ({
  requirement: "Site Visit was held and concluded on May 28, 2026. The site visit is already past; any firm that did not attend cannot retroactively participate in the site visit.",
  citation: "UPDATE 01", excerpt: "UPDATE 01 - May 28, 2026 1) Site Visit was held and concluded on May 28, 2026.",
  kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko", severity: "P2",
});
// A genuine hard-eligibility bar (kind=eligibility_bar), firm status unknown (null profile).
const eligBar = (): TypedFinding => ({
  requirement: "Only firms holding an active facility clearance at the Secret level are eligible to propose.",
  citation: "L.4", excerpt: "Offerors shall possess a Secret facility clearance to be eligible for award.",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko",
  severity: "P2", requiredAttribute: "clearance:secret-fcl", curableInWindow: false,
});
// OVER-FIRE GUARD — a benign site-visit-ENCOURAGED gate: bidder attends it → bidder_controls (gate_to_clear).
const siteVisitEncouraged = (): TypedFinding => ({
  requirement: "Offerors are encouraged to attend the optional pre-proposal site visit.",
  citation: "L.2", excerpt: "An optional site visit is offered; attendance is encouraged but not required.",
  kind: "submission", controllability: "bidder_controls", grounded: true, lens: "proposal_manager", severity: "P2",
});
const pricingGate = (): TypedFinding => ({
  requirement: "Price all CLINs (0001 and 0002).", citation: "B", excerpt: "Offerors shall price both CLINs.",
  kind: "pricing", controllability: "bidder_controls", grounded: true, lens: "pricing_analyst", severity: "P1",
});
// A COMPLETED mandatory SITE TOUR — a synonym SITE_VISIT_RE must catch (kind=submission, not eligibility_bar).
const siteTourCompleted = (): TypedFinding => ({
  requirement: "A mandatory site tour was conducted; firms that did not attend the site tour may not submit.",
  citation: "UPDATE 02", excerpt: "The mandatory site tour was held and is now closed.",
  kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko", severity: "P2",
});
// Site-visit signal ONLY in the citation field (recall arm added Gate-2).
const siteVisitCitationOnly = (): TypedFinding => ({
  requirement: "Attendance at the referenced event is a condition of eligibility and cannot be met after the fact.",
  citation: "UPDATE 03 — Mandatory Site Visit (completed)", excerpt: "The referenced event has closed.",
  kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko", severity: "P2",
});
const nb = "A bidder-eligibility bar stated in the solicitation notice";

console.log("\n-- 1 · REGRESSION-LOCK (notice-body pole, flag ON): finding[20] promoted to a bid-deciding show-stopper --");
{
  const d = deriveVerdict(base({ findings: [pricingGate(), siteVisitCompleted()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW" && d.reason.startsWith(nb), "still the notice-body NHR pole (verdict unchanged)");
  assert(inSS(d.showStoppers, siteVisitCompleted().requirement), "completed site visit promoted into showStoppers[] (bid-deciding)");
  assert(ssFor(d.showStoppers, siteVisitCompleted().requirement)?.severity === "P0", "promoted show-stopper floored to P0");
  assert(!inSS(d.showStoppers, pricingGate().requirement), "the bidder-controlled pricing gate is NOT promoted");
}

console.log("\n-- 2 · FLAG-OFF => byte-identical: notice-body branch passes [] (Rule 61) --");
{
  const d = deriveVerdict(base({ findings: [siteVisitCompleted()], noticeBodyBarUngrounded: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW" && d.showStoppers.length === 0, "flag OFF => showStoppers empty (unchanged notice-body branch)");
}

console.log("\n-- 3 · REGRESSION-LOCK (setAsideConflict pole, flag ON): NOT promoted — no false committal (ultracode P1) --");
{
  const d = deriveVerdict(base({ findings: [eligBar()], setAsideConflict: { sam: "SBA", doc: "8(a)", note: "SAM and the document name different programs" }, siteVisitSeverityFloor: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW" && d.showStoppers.length === 0, "set-aside-conflict NHR: floor does NOT promote (eligible pool ambiguous)");
}

console.log("\n-- 4 · REGRESSION-LOCK (primaryIndeterminate pole, flag ON): NOT promoted (ultracode P1) --");
{
  const d = deriveVerdict(base({ findings: [eligBar()], primaryIndeterminate: true, siteVisitSeverityFloor: true }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW" && d.showStoppers.length === 0, "primary-indeterminate NHR: floor does NOT promote (base doc not anchored)");
}

console.log("\n-- 5 · OVER-FIRE GUARD: benign site-visit-ENCOURAGED (gate_to_clear) not promoted on the notice-body pole --");
{
  const d = deriveVerdict(base({ findings: [siteVisitEncouraged()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(d.showStoppers.length === 0, "encouraged/optional site visit stays advisory (bidder_controls excluded)");
}

console.log("\n-- 6 · PROVABLY-SATISFIED EXCLUDED: a bar the firm's profile PROVES it holds is not promoted (ultracode P1) --");
{
  const profile = { satisfiedAttributes: ["clearance:secret-fcl"] } as BidderProfile;
  const d = deriveVerdict(base({ findings: [eligBar()], bidderProfile: profile, noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(d.showStoppers.length === 0, "firmStatus=satisfies eligibility_bar NOT promoted (firm holds it -> not a blocker)");
}

console.log("\n-- 7 · CURABLE EXCLUDED: a curableInWindow=true bar is a gate to clear, never a show-stopper (ultracode P1) --");
{
  const curable: TypedFinding = { ...eligBar(), curableInWindow: true, requirement: "Provide a compliant quality cert (obtainable in-window)." };
  const d = deriveVerdict(base({ findings: [curable], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(d.showStoppers.length === 0, "curableInWindow=true bar NOT promoted (branch-5b parity)");
}

console.log("\n-- 8 · SYNONYM RECALL: completed mandatory SITE TOUR promotes (regex synonym arm, ultracode P2) --");
{
  const d = deriveVerdict(base({ findings: [siteTourCompleted()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(inSS(d.showStoppers, siteTourCompleted().requirement) && ssFor(d.showStoppers, siteTourCompleted().requirement)?.severity === "P0",
    "completed mandatory 'site tour' disqualifier promoted to a P0 show-stopper");
}

console.log("\n-- 9 · PRECISION GUARD: a disqualifier whose ONLY site-visit token is in the citation is NOT promoted (ultracode re-review #2 P2) --");
{
  const d = deriveVerdict(base({ findings: [siteVisitCitationOnly()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true }));
  assert(!inSS(d.showStoppers, siteVisitCitationOnly().requirement),
    "site-visit signal ONLY in the citation (doc name) does NOT promote — grounding keys off CONTENT, not a referenced doc name");
}

console.log("\n-- 10 · FIDELITY: on a NON-notice-body pole finding[20] is ALREADY bid-deciding (unmarkedUniversalClaim) — no floor needed --");
{
  const d = deriveVerdict(base({ findings: [siteVisitCompleted()] }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW" && inSS(d.showStoppers, siteVisitCompleted().requirement),
    "no_one_can_move disqualifier lands in showStoppers via unmarkedUniversalClaim (floor is a no-op here, by design)");
}

// ── 64b79916 pattern — a LIVE-sounding site-visit finding ("must attend to be eligible") while the SOURCE carries a
//    later SAM-body UPDATE saying the visit already concluded. The staleness guard (card #453) must NOT auto-promote. ──
const siteVisitLiveSounding = (): TypedFinding => ({
  requirement: "You must attend the initial site visit for the project to be considered eligible to propose.",
  citation: "SAM Notice Body", excerpt: "you must attend the initial site visit for the project to be considered eligible to propose.",
  kind: "submission", controllability: "no_one_can_move", grounded: true, lens: "ex_ko", severity: "P2",
});
const concludedSource = "SAM Notice Body: you must attend the initial site visit to be considered eligible to propose. UPDATE 01 - May 28, 2026: The Site Visit was held and concluded on May 28, 2026.";
const liveSource = "SAM Notice Body: Offerors must attend the mandatory site visit to be eligible; the site visit date will be provided by amendment.";

console.log("\n-- 11 · STALENESS GUARD (card #453): live-sounding site-visit finding + SOURCE shows concluded → NOT promoted --");
{
  const d = deriveVerdict(base({ findings: [siteVisitLiveSounding()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: concludedSource }));
  assert(d.verdict === "NEEDS_HUMAN_REVIEW" && d.reason.startsWith(nb), "still the notice-body NHR pole (verdict unchanged)");
  assert(!inSS(d.showStoppers, siteVisitLiveSounding().requirement), "stale (source shows concluded) site-visit bar NOT auto-promoted to P0 — eligibility routed to human review");
}

console.log("\n-- 12 · STALENESS GUARD control: SAME finding, NO concluded source marker → still promotes (PR #201 preserved) --");
{
  const d = deriveVerdict(base({ findings: [siteVisitLiveSounding()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: liveSource }));
  assert(inSS(d.showStoppers, siteVisitLiveSounding().requirement) && ssFor(d.showStoppers, siteVisitLiveSounding().requirement)?.severity === "P0",
    "no source concluded-marker → a live mandatory site-visit bar still promotes to P0 (guard is source-specific)");
}

console.log("\n-- 13 · STALENESS GUARD does NOT touch a non-site-visit eligibility bar even when a concluded marker is present --");
{
  const d = deriveVerdict(base({ findings: [eligBar()], noticeBodyBarUngrounded: true, siteVisitSeverityFloor: true, source: concludedSource }));
  assert(inSS(d.showStoppers, eligBar().requirement) && ssFor(d.showStoppers, eligBar().requirement)?.severity === "P0",
    "a clearance eligibility_bar still promotes (site-visit staleness guard is scoped to site-visit findings only)");
}

console.log("\n" + (failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"));
process.exit(failures === 0 ? 0 : 1);
