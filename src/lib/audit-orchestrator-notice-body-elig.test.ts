// $0 GAUNTLET for B3 — the NOTICE-BODY deterministic ELIGIBILITY-BAR floor (Brain card 421 Fork-3).
// Run: npx tsx src/lib/audit-orchestrator-notice-body-elig.test.ts
//
// Charter: documentsCovered runs ELIGIBILITY_BAR_RE only on non-primary binding ATTACHMENTS (`if (r.isPrimary)
// continue`). A hard bidder-eligibility / disqualifier bar stated in the SAM NOTICE BODY — a MANDATORY pre-proposal
// site visit gating eligibility, a set-aside, a clearance — is invisible to that floor whenever the notice body is the
// primary region (synopsis-only / ITO notices) or the package is single-region. `noticeBodyEligibilityUngrounded`
// scans ONLY the "SAM Notice Body" region (bounded — never the whole primary PDF) and, on an ELIGIBILITY_BAR_RE hit
// that NO grounded decision-bearing finding covers, returns true → the caller forces INCOMPLETE (fail-toward-
// disqualifier → NEEDS_HUMAN_REVIEW).
//
// Gauntlet metrics (standing bar): UNDER_ABSTAIN=0 (hard) · WRONG_VERDICT=0 committal (INCOMPLETE is never a committal)
// · OVER_ABSTAIN=reduction target (the grounded-finding escape hatch + benign-fixture silence). The flag lands OFF;
// corpus-scale OVER_ABSTAIN calibration (the bare-"eligibility" prose arm) is the convergence Gauntlet, at the CEO gate.
import { noticeBodyEligibilityUngrounded } from "./audit-orchestrator";
import { deriveVerdict } from "./audit-decide";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const PRIMARY = "Solicitation W912-XX-26-R-0001. Standard Form 1449 commercial-items solicitation. Section B pricing schedule, Section C statement of work, Sections L and M instructions and evaluation factors follow in the attached document.";
// Assemble a fullSource with the "==== DOCUMENT: name ====" delimiter assembleFullSource writes (docs.length>1).
const mk = (noticeText: string) =>
  `\n\n==== DOCUMENT: Solicitation W912-XX ====\n\n${PRIMARY}\n\n==== DOCUMENT: ${NOTICE_BODY_DOC_NAME} ====\n\n${noticeText}`;

// ── POSITIVES — a real hard bar in the notice body, UNGROUNDED → floor MUST fire (UNDER_ABSTAIN=0). ──
const POS = {
  siteVisit: "A mandatory pre-proposal site visit will be conducted on 15 March 2026. Only offerors who attended the site visit will be eligible to submit a proposal for this requirement.",
  setAside:  "This requirement is a total HUBZone small business set-aside under NAICS 236220. All offerors must be certified HUBZone concerns at time of offer.",
  clearance: "The contractor must hold an active TOP SECRET facility clearance at the time of award to perform this classified effort.",
};
// ── BENIGN — the resume's named over-fire cases; floor must STAY SILENT (OVER_ABSTAIN control). ──
const BENIGN = {
  siteVisitEncouraged: "An optional site visit is encouraged but not required. Attendance is not a condition of award, and offerors who do not attend may still submit a proposal.",
  informationalBoa:    "Orders will be issued against the existing Basic Ordering Agreement (BOA). The period of performance is twelve months from award with two option years.",
};

console.log("\n── 1 · POSITIVES: ungrounded hard bar in the notice body → floor fires (UNDER_ABSTAIN=0) ──");
for (const [k, txt] of Object.entries(POS)) {
  assert(noticeBodyEligibilityUngrounded(mk(txt), []) === true, `POS ${k}: ungrounded notice-body bar → INCOMPLETE`);
}

console.log("\n── 2 · BENIGN: encouraged site-visit + informational BOA → floor SILENT (no over-fire) ──");
for (const [k, txt] of Object.entries(BENIGN)) {
  assert(noticeBodyEligibilityUngrounded(mk(txt), []) === false, `BENIGN ${k}: no eligibility-bar language → not abstained`);
}

console.log("\n── 3 · OVER_ABSTAIN control: a grounded, decision-bearing finding SPANNING the bar → floor SILENT ──");
{
  // The engine already surfaced the site-visit eligibility bar as a decision-bearing (bidder_cannot_move → 'disqualifying')
  // finding whose excerpt SPANS the full bar clause (so it overlaps the "… eligible to submit" bar occurrence) → the
  // verdict path owns it → the floor must not double-abstain.
  const grounded: TypedFinding = {
    requirement: "Only offerors who attended the mandatory site visit may submit a proposal.",
    citation: "SAM Notice Body", excerpt: POS.siteVisit,   // full clause → overlaps every bar occurrence
    kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko", curableInWindow: false,
  };
  assert(noticeBodyEligibilityUngrounded(mk(POS.siteVisit), [grounded]) === false,
    "grounded decision-bearing finding spanning the bar → floor silent (verdict path owns it)");
  // A boilerplate/dropped finding with the same excerpt does NOT credit coverage → floor still fires (safe direction).
  const dropped: TypedFinding = { ...grounded, kind: "boilerplate" };
  assert(noticeBodyEligibilityUngrounded(mk(POS.siteVisit), [dropped]) === true,
    "a 'dropped' (boilerplate) finding is not decision-bearing → does NOT cover → floor still fires");
  // UNDER_ABSTAIN=0 guard: a benign decision-bearing finding grounded ELSEWHERE in the notice must NOT mask the bar.
  const benignElsewhere: TypedFinding = {
    requirement: "Period of performance is twelve months.",
    citation: "SAM Notice Body", excerpt: "will be conducted on 15 March 2026",  // grounded, but does NOT overlap the bar span
    kind: "clause_flowdown", controllability: "bidder_controls", grounded: true, lens: "ex_ko", curableInWindow: true,
  };
  assert(noticeBodyEligibilityUngrounded(mk(POS.siteVisit), [benignElsewhere]) === true,
    "benign finding grounded elsewhere in the notice does NOT mask the bar → floor still fires (UNDER_ABSTAIN=0)");
}

console.log("\n── 3b · CHARTER CASE (P0 regression-lock): SYNOPSIS-ONLY notice — no '==== DOCUMENT ====' delimiter ──");
{
  // A synopsis-only package assembles as ONE unnamed "(primary solicitation)" region (assembleFullSource writes the
  // delimiter only when docs>1), so region-by-name MISSES it. The executor threads the raw notice-body text → the
  // floor scans it directly. Without the explicit-text path this returned false (UNDER_ABSTAIN on the charter case).
  const synopsisOnly = POS.siteVisit;   // fullSource IS the notice body, no delimiter
  assert(noticeBodyEligibilityUngrounded(synopsisOnly, [], synopsisOnly) === true,
    "synopsis-only notice (explicit text) → floor fires (charter-case UNDER_ABSTAIN=0)");
  // Explicit text also wins over a delimited fullSource that lacks the bar (the executor is authoritative).
  assert(noticeBodyEligibilityUngrounded(mk("Benign combined synopsis, no bars."), [], POS.setAside) === true,
    "explicit notice-body text is authoritative over fullSource region lookup");
  // Explicit empty/whitespace → falls back to the named region in fullSource.
  assert(noticeBodyEligibilityUngrounded(mk(POS.clearance), [], "  ") === true,
    "blank explicit text → falls back to the named region (still fires on the delimited notice)");
}

console.log("\n── 4 · GUARDS: no notice-body region, or a notice body with no bar → floor SILENT ──");
{
  // No "SAM Notice Body" region at all (attachments-only package).
  const noNotice = `\n\n==== DOCUMENT: Solicitation ====\n\n${PRIMARY}\n\n==== DOCUMENT: Attachment 1 SOW ====\n\nThe contractor shall perform the work described herein in accordance with the plans.`;
  assert(noticeBodyEligibilityUngrounded(noNotice, []) === false, "no notice-body region → nothing to floor");
  // Notice body present but carries no eligibility-bar language.
  assert(noticeBodyEligibilityUngrounded(mk("This is a combined synopsis for commercial widgets. Quotes are due 30 days after posting. The period of performance is one year."), []) === false,
    "notice body with no eligibility-bar language → not abstained");
  // Empty / too-thin notice body (below hasEngineText floor) → not abstained.
  assert(noticeBodyEligibilityUngrounded(mk("N/A."), []) === false, "sub-threshold notice body (unreadable) → not abstained");
}

console.log("\n── 5 · OVER_ABSTAIN calibration target (documented, non-blocking): bare 'eligibility' prose currently fires ──");
{
  // KNOWN: ELIGIBILITY_BAR_RE's bare \\beligib token fires on benign "eligibility for award…per FAR 9.1" prose. This is
  // the OVER_ABSTAIN the resume flags for the convergence Gauntlet to calibrate. Recorded here (soft, not a hard assert)
  // so the behavior is VISIBLE and future tuning is measurable — the floor lands flag-OFF precisely for this reason.
  const bare = noticeBodyEligibilityUngrounded(mk("Eligibility for award will be determined in accordance with the responsibility standards of FAR subpart 9.1 prior to any award decision."), []);
  console.log(`   ℹ over-abstain-candidate 'bare eligibility prose' fires today = ${bare} (Gauntlet calibration target; flag stays OFF until tuned)`);
}

console.log("\n── 6 · VERDICT ROUTING: the dedicated gate FLIPS a committal → NHR (WRONG_VERDICT=0), survives GATE_V2 ──");
{
  // A benign, curable finding over a fully-covered package commits (BID) — the committal control.
  const committalFinding: TypedFinding = { requirement: "Submit reps & certs.", citation: "§ K", excerpt: "provide annual representations", kind: "clause_flowdown", controllability: "bidder_controls", grounded: true, lens: "ex_ko", curableInWindow: true };
  const base = { findings: [committalFinding], bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false };
  assert(deriveVerdict({ ...base }).verdict === "BID", `control: clean package commits (BID)`);
  // noticeBodyBarUngrounded=true FLIPS that committal → NEEDS_HUMAN_REVIEW (fail-toward-disqualifier; never a committal).
  assert(deriveVerdict({ ...base, noticeBodyBarUngrounded: true }).verdict === "NEEDS_HUMAN_REVIEW",
    "notice-body bar gate flips a committal → NHR (WRONG_VERDICT=0 committal)");
  // GATE_V2-SURVIVAL: with a coverageV2 that grades NO coverage cap (cap===null), the coverageComplete veto is bypassed
  // (audit-decide:1581) — WITHOUT a dedicated gate the bar would wave through to the committal. B3's gate runs AFTER the
  // GATE_V2 block → still → NHR. coverageV2 present here; the branch is active only under AUDIT_GATE_V2=true (proven in
  // the harness run below), but the gate's PLACEMENT (a standalone `if` after the block) guarantees survival either way.
  const noCapV2 = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [], coverageGrade: 1 };
  assert(deriveVerdict({ ...base, noticeBodyBarUngrounded: true, coverageV2: noCapV2 }).verdict === "NEEDS_HUMAN_REVIEW",
    "gate survives a no-cap coverageV2 → NHR (never a committal)");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
