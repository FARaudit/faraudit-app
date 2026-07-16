// $0 PROOF — §M EVIDENCE-FACTOR DEMOTION + FABRICATED-MECHANIC GUARD (Brain card #538). Run:
//   npx tsx src/lib/mm-evidence-factor.test.ts
//
// Live driver: FA303026Q0020 audit 8d137350 — a §M LPTA technical criterion ("shall demonstrate successful
// delivery … Chapel/Church, IAW the SOW"; SOW §10.3 "preferred/not required") mis-typed a non-curable bar →
// false NEEDS_HUMAN_REVIEW with the fabricated "lead time exceeds the response window" mechanic. Gate-4 /panel
// unanimously concurred (correct pole = BID_WITH_CAUTION). This suite banks BOTH directions + the fabrication
// guard + the full deriveVerdict re-prove (flag OFF reproduces the live NHR; flag ON → BID_WITH_CAUTION) + a
// byte-identical control (a genuine clearance bar is UNAFFECTED, both flag states).
import { classifyMmEvidenceFactor, demoteMmEvidenceFactor, hasGroundedLeadTimeBasis, sourceContradictsBar } from "./mm-evidence-factor";
import { deriveVerdict } from "./audit-decide";
import type { TypedFinding, VerdictInputs } from "./audit-findings";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const cls = (requirement: string, citation = "", excerpt = "", source?: string) =>
  classifyMmEvidenceFactor({ requirement, excerpt, citation }, source);

// ── R1 — quote-evidenced §M factors MUST demote ──────────────────────────────────────────────────────
console.log("\n── R1 DEMOTE — §M evidence-factors (evidenced inside the quote) ──");
const CHAPEL = "The Offeror shall demonstrate successful delivery of personnel or direct delivery of services to at least one position of this service type, Chapel/Church, IAW the Statement of Work.";
assert(cls(CHAPEL, "Section M, Technical Requirements, Item I") === "demote", "chapel specimen (cite §M) → demote");
assert(cls(CHAPEL, "Section M – Evaluation Criteria, Technical Requirements, Item I") === "demote", "chapel specimen (dup cite) → demote");
assert(cls("Offeror shall provide a capability statement demonstrating past performance on similar services.", "", "Technical suitability will be evaluated using the Technical Criteria Checklist.") === "demote", "capability statement + eval framing → demote");
assert(cls("Technical acceptability will be evaluated; the offeror must demonstrate relevant prior experience delivering these services.", "Section M") === "demote", "demonstrate prior experience + LPTA framing → demote");
assert(cls("Include a past-performance narrative for at least one relevant contract of this service type.", "Evaluation Factors for Award") === "demote", "past-performance narrative + §M position → demote");

// ── R2 — escalation vetoes MUST NOT demote (fail toward escalation) ───────────────────────────────────
console.log("\n── R2 ESCALATE — coupled true bar / possession-at-offer / who-may-bid (veto demotion) ──");
assert(cls("Offeror must already hold a Top Secret facility clearance at time of proposal submission.", "Section M") === "escalate", "possession-at-offer (clearance @ submission) → escalate");
assert(cls("Only firms that hold a GSA Schedule 03FAC contract may submit a quote.", "Section M") === "escalate", "who-may-bid (holder-only) → escalate");
assert(cls("The offeror shall demonstrate NADCAP accreditation for the process.", "Section M, evaluation criteria") === "escalate", "coupled true bar (NADCAP) even with 'demonstrate' → escalate");
assert(cls("Offeror shall demonstrate prior experience AND possess an active Secret clearance at the time of offer.", "Section M") === "escalate", "experience COUPLED to clearance possession → escalate");
assert(cls("Provide proof of ISO 9001 certification the firm currently holds.", "Section M") === "escalate", "currently-held ISO cert → escalate");
assert(cls("Only offerors that already hold the incumbent BOA vehicle may respond.", "Section M") === "escalate", "who-may-bid + holder-only → escalate");

// ── GAUNTLET ROUND-2 REGRESSION — held-credential bars must ESCALATE (requirement OR excerpt) ──────────
console.log("\n── GAUNTLET round-2 regression (BREAK A — held credential, req or excerpt) ──");
assert(cls("The proposed director must hold a current state professional license; demonstrate this in your capability statement.", "Section M") === "escalate", "BREAK A: held state license + §M framing → escalate (not demote)");
assert(cls("Offeror shall demonstrate the required personnel qualification.", "Section M, Evaluation Criteria", "Personnel must possess an active state license and a surety bond.") === "escalate", "BREAK A-excerpt: held license/bond in the EXCERPT → escalate");
assert(cls("Offeror must carry a $500,000 payment bond and demonstrate capability.", "Section M") === "escalate", "BREAK A: surety/payment bond → escalate");
assert(cls("Contractor personnel must be U.S. citizens; demonstrate citizenship in the capability statement.", "Section M") === "escalate", "BREAK A: citizenship screen → escalate");
assert(cls("The firm must be licensed and bonded; provide a capability statement.", "Section M") === "escalate", "BREAK A: licensed+bonded status → escalate");
// ROUND-3: a held security-status bar phrased WITHOUT the literal word "clearance" must still escalate (shape-based).
assert(cls("Proposed personnel must hold TS/SCI eligibility; demonstrate this in the capability statement.", "Section M") === "escalate", "R3-break: TS/SCI eligibility (no 'clearance' token) → escalate");
assert(cls("Offeror shall demonstrate that key personnel have access to Sensitive Compartmented Information.", "Section M, Evaluation Criteria") === "escalate", "R3-break: SCI access → escalate");
assert(cls("Personnel must be cleared to the Top Secret level; provide a past-performance narrative.", "Section M") === "escalate", "R3-break: cleared to TS level → escalate");
assert(cls("Offeror shall provide personnel; demonstrate capability.", "Section M", "Individuals must be eligible for access to classified national security information.") === "escalate", "R3-break: classified-access status in EXCERPT → escalate");
// ROUND-4: actor-agnostic who-may-bid restriction (non-standard actor) must escalate, even with leading "demonstrate experience".
assert(cls("Offeror shall demonstrate experience as an authorized distributor; only OEM-authorized distributors are eligible for award.", "Section M, Evaluation Criteria") === "escalate", "R4-break: 'only OEM-authorized distributors are eligible for award' → escalate");
assert(cls("Demonstrate capability; award is limited to authorized manufacturers of the item.", "Section M") === "escalate", "R4-break: 'award limited to authorized manufacturers' → escalate");
assert(cls("Provide a capability statement; only holders of the incumbent BPA may be awarded.", "Section M") === "escalate", "R4-break: 'only holders … may be awarded' → escalate");
// ROUND-5: NEGATIVE polarity eligibility restriction + tenure floor must escalate.
assert(cls("Offeror shall demonstrate experience; firms with a minimum of ten years in business are eligible — newer firms are not eligible for award.", "Section M, Evaluation Criteria") === "escalate", "R5-break: 'newer firms are not eligible' (negative polarity) → escalate");
assert(cls("Demonstrate capability; a minimum of ten years in business is required.", "Section M") === "escalate", "R5-break: 'minimum ten years in business' tenure floor → escalate");
assert(cls("Provide a past-performance narrative; offerors without an active facility are disqualified from award.", "Section M") === "escalate", "R5-break: 'disqualified from award' → escalate");
// ROUND-6: prohibited/negative structural status (FOCI / debarment) must escalate.
assert(cls("Offeror shall demonstrate capability; the offeror must not be under foreign ownership, control, or influence.", "Section M, Evaluation Criteria") === "escalate", "R6-break: FOCI prohibition → escalate");
assert(cls("Provide a capability statement; the firm must not be debarred, suspended, or excluded.", "Section M") === "escalate", "R6-break: debarred/suspended/excluded prohibition → escalate");
// ROUND-7: contract-vehicle holder-only gate must escalate (ratified BOA/IDIQ holder regex).
assert(cls("Offeror shall demonstrate capability as a current holder of the Basic Ordering Agreement.", "Section M, Evaluation Criteria") === "escalate", "R7-break: BOA holder-only gate → escalate");
assert(cls("Provide a capability statement; award is limited to IDIQ contract holders.", "Section M") === "escalate", "R7-break: IDIQ holder-only → escalate");
// ROUND-8: definitive-responsibility DOLLAR-MAGNITUDE floor must escalate; bare ratable count still demotes.
assert(cls("Offeror shall demonstrate at least 3 prior contracts each valued at not less than $5,000,000.", "Section M, Evaluation Criteria") === "escalate", "R8-break: ≥3 contracts each valued ≥$5M → escalate");
assert(cls("Demonstrate past performance on projects of $10 million magnitude or greater.", "Section M") === "escalate", "R8-break: projects of $10M magnitude → escalate");
assert(cls("Offeror shall demonstrate successful delivery on at least one relevant contract of this service type.", "Section M, Evaluation Criteria") === "demote", "R8 guard: bare ratable 'at least one relevant contract' (no $ floor) → demote");
// ROUND-9: responsibility-determination negative class must escalate; positive "responsible offeror" stays safe.
assert(cls("Offeror shall demonstrate capability; a firm determined non-responsible will not receive award.", "Section M") === "escalate", "R9-break: 'non-responsible' → escalate");
assert(cls("Demonstrate past performance; offerors not considered responsible are ineligible.", "Section M") === "escalate", "R9-break: 'not considered responsible' → escalate");
assert(cls("Offeror shall demonstrate successful delivery to at least one position of this service type; award to the responsible offeror with the lowest price.", "Section M, Evaluation Criteria") === "demote", "R9 guard: benign 'the responsible offeror' phrase does NOT block demote");
// GUARD: the LPTA 'will not be considered for award' RATING consequence must STILL demote (not caught as who-may-bid).
assert(cls("The Offeror shall demonstrate successful delivery of these services; a quote that fails will not be considered for award.", "Section M") === "demote", "R4 guard: LPTA 'not considered for award' rating consequence → demote (not a who-may-bid restriction)");

// ── R2 residual — substance WITHOUT §M corroboration is left alone (ambiguity fails toward escalation) ─
console.log("\n── R2 RESIDUAL — bare substance, no §M corroboration, no contradiction → not_applicable ──");
assert(cls("Provide a technical narrative describing your approach.", "Attachment 3 — Forms") === "not_applicable", "bare technical narrative, non-§M cite, no framing → not_applicable (left alone)");
assert(cls("The awardee will gain experience operating the facility during performance.", "Section C") === "not_applicable", "no evidenced-in-quote substance → not_applicable");

// ── R3 — SOURCE contradiction ("preferred/not required") is itself grounds to demote ──────────────────
console.log("\n── R3 CONTRADICTION — document calls the substance optional → demote ──");
const SOW_103 = "Section 10.3: Previous experience in a Catholic Director of Music military chapel setting is preferred/not required.";
assert(sourceContradictsBar("demonstrate prior chapel/church service delivery experience", SOW_103) === true, "sourceContradictsBar: §10.3 over the DISTINCTIVE 'chapel' substance → true");
assert(cls("Offeror shall demonstrate successful delivery of services of this type (chapel/church).", "Attachment 1 — SOW", "", SOW_103) === "demote", "R3: non-§M cite + distinctive (chapel) source contradiction → demote");
assert(sourceContradictsBar("hold a Secret clearance", SOW_103) === false, "sourceContradictsBar: unrelated substance → false (no false demote)");
assert(sourceContradictsBar("demonstrate prior delivery experience for this service type", SOW_103) === false, "sourceContradictsBar: GENERIC-only overlap ('experience') → false (Gauntlet BREAK #3 guard)");

// ── GAUNTLET ROUND-1 REGRESSION — the three breaks the opus red-team found, now banked ────────────────
console.log("\n── GAUNTLET round-1 regression (BREAK #1/#3/#4) ──");
// BREAK #1 [R2] CRITICAL — an 8(a)/set-aside status must ESCALATE (its own handling), never demote via §M evidence.
assert(cls("Offeror must be a certified 8(a) participant and demonstrate past performance on similar work.", "Section M, Evaluation Criteria") === "escalate", "BREAK#1: 8(a) status + past-performance → escalate (SET_ASIDE_SHAPE veto), NOT demote");
assert(cls("This is a 100% WOSB set-aside; offeror shall demonstrate relevant prior experience.", "Section M") === "escalate", "BREAK#1: WOSB set-aside + experience → escalate");
// BREAK #3 [R3] — an unrelated 'not required' must NOT false-demote a genuine held-certificate bar.
assert(cls("Offeror must hold a current FAA Part 145 repair station certificate.", "Section L", "", "Prior maintenance experience is preferred but not required.") === "escalate", "BREAK#3: FAA-145 held cert (profile_bar) + unrelated 'not required' → escalate, not demote");
// BREAK #2 (RED-TEAM WITHDREW as a false break, but bank it) — possession smuggled into capability-statement phrasing.
assert(cls("Submit a capability statement demonstrating that your firm holds an active Top Secret clearance.", "Section M") === "escalate", "BREAK#2: possession (clearance) inside capability-statement phrasing → escalate");
// BREAK #4 [R4] — duration-to-acquire is a grounded lead-time basis (mechanic legitimately renders).
assert(hasGroundedLeadTimeBasis([{ requirement: "The required state license typically takes 6 months to obtain." }]) === true, "BREAK#4: duration-to-acquire ('6 months to obtain') → grounded");
assert(hasGroundedLeadTimeBasis([{ requirement: "Processing time of 90 days to receive the credential." }]) === true, "BREAK#4: 'processing time of 90 days to receive' → grounded");

// ── P2 — FABRICATED-MECHANIC GUARD: lead-time basis grounded vs not ──────────────────────────────────
console.log("\n── P2 R4 — hasGroundedLeadTimeBasis ──");
assert(hasGroundedLeadTimeBasis([{ requirement: CHAPEL }]) === false, "chapel specimen carries NO lead-time basis → false (mechanic ungrounded)");
assert(hasGroundedLeadTimeBasis([{ requirement: "Top Secret facility clearance required; DD-254 applies." }]) === true, "facility clearance → grounded lead-time basis");
assert(hasGroundedLeadTimeBasis([{ requirement: "Product must be on the QPL / approved source list." }]) === true, "QPL → grounded");
assert(hasGroundedLeadTimeBasis([{ requirement: "Offeror must already hold a CMMC Level 2 certification at time of offer." }]) === true, "CMMC hold-at-offer → grounded");
assert(hasGroundedLeadTimeBasis([{ requirement: "90-day irreducible production lead time vs a 30-day delivery." }]) === true, "explicit lead time → grounded");

// ── P3 — FULL deriveVerdict RE-PROVE on the specimen shape (flag OFF → NHR; flag ON → BID_WITH_CAUTION) ─
console.log("\n── P3 deriveVerdict re-prove (specimen finding shape) ──");
const chapelFinding: TypedFinding = {
  id: "panel:chapel", requirement: CHAPEL, citation: "Section M, Technical Requirements, Item I",
  excerpt: CHAPEL, kind: "eligibility_bar", controllability: "bidder_cannot_move",
  curableInWindow: false, requiredAttribute: "prior_chapel_experience", grounded: true, lens: "source-selection",
};
const base = (findings: TypedFinding[]): VerdictInputs => ({
  findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false,
  manifestComplete: true, documentsComplete: true, source: `${CHAPEL}\n${SOW_103}`,
});
const runFlag = (on: boolean, inp: VerdictInputs) => {
  const prev = process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION;
  if (on) process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION = "true"; else delete process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION;
  try { return deriveVerdict(inp); } finally {
    if (prev === undefined) delete process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION; else process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION = prev;
  }
};
const off = runFlag(false, base([chapelFinding]));
assert(off.verdict === "NEEDS_HUMAN_REVIEW", `flag OFF: chapel → NEEDS_HUMAN_REVIEW (reproduces live) [got ${off.verdict}]`);
assert(/lead time exceeds the response window/i.test(off.reason), "flag OFF: carries the (now-known-fabricated) lead-time prose");
const on = runFlag(true, base([chapelFinding]));
assert(on.verdict === "BID_WITH_CAUTION", `flag ON: chapel → BID_WITH_CAUTION (correct pole) [got ${on.verdict}]`);
assert(!/lead time exceeds the response window/i.test(on.reason), "flag ON: the fabricated lead-time prose is GONE");

// ── P4 — BYTE-IDENTICAL CONTROL: a genuine clearance bar is UNAFFECTED (both flag states → NHR, lead-time kept) ─
console.log("\n── P4 control — genuine clearance bar unaffected + R4 keeps GROUNDED lead-time prose ──");
const clearanceFinding: TypedFinding = {
  id: "panel:clr", requirement: "Offeror must possess a Top Secret facility clearance; DD-254 applies.",
  citation: "Section L", excerpt: "Top Secret facility clearance required (DD-254).",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false,
  requiredAttribute: "ts_clearance", grounded: true, lens: "contracts-attorney",
};
const clrOff = runFlag(false, base([clearanceFinding]));
const clrOn = runFlag(true, base([clearanceFinding]));
assert(clrOff.verdict === "NEEDS_HUMAN_REVIEW" && clrOn.verdict === "NEEDS_HUMAN_REVIEW", `clearance bar → NHR both flag states [off=${clrOff.verdict} on=${clrOn.verdict}]`);
assert(clrOff.reason === clrOn.reason, "clearance bar reason is byte-identical across the flag (grounded → lead-time prose kept)");
assert(/lead time exceeds the response window/i.test(clrOn.reason), "R4: a GROUNDED lead-time bar keeps the lead-time mechanic");

// ── P5 — ULTRA #240 FINDING B: demote + tristate TOGETHER (both flags ON) must not re-clamp eligibility ──
// Pre-fix: the demoted chapel finding kept kind="eligibility_bar" + requiredAttribute, so the tristate
// unverifiedGates filter clamped eligible=null and named the ML-authored "prior_chapel_experience" in the
// customer-facing caution — re-injecting the exact framing the demote exists to remove. The mmEvidenceFactor
// marker is now LOAD-BEARING on that one filter.
console.log("\n── P5 both-flags-ON (ultra #240 Finding B) — demoted §M factor must not clamp eligibility ──");
const runBoth = (demote: boolean, tristate: boolean, inp: VerdictInputs) => {
  const prevD = process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION;
  const prevT = process.env.AUDIT_ELIGIBLE_TRISTATE;
  if (demote) process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION = "true"; else delete process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION;
  if (tristate) process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; else delete process.env.AUDIT_ELIGIBLE_TRISTATE;
  try { return deriveVerdict(inp); } finally {
    if (prevD === undefined) delete process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION; else process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION = prevD;
    if (prevT === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prevT;
  }
};
const both = runBoth(true, true, base([chapelFinding]));
assert(both.verdict === "BID_WITH_CAUTION", `both flags ON: chapel → BID_WITH_CAUTION [got ${both.verdict}]`);
assert(both.eligible === true, `both flags ON: eligible === true (demoted factor is NOT an unverified gate) [got ${both.eligible}]`);
assert(!/ELIGIBILITY NOT VERIFIED/i.test(both.reason), "both flags ON: no eligibility-not-verified clamp in the reason");
assert(!/prior_chapel_experience/.test(both.reason), "both flags ON: the ML-authored attribute never reaches customer-facing text");
// direction 2 — the marker exclusion must NOT swallow a GENUINE unverified gate riding alongside a demoted factor.
const wosbGate = (id: string): TypedFinding => ({
  id, requirement: "This acquisition is a 100% WOSB set-aside; only certified WOSBs are eligible for award.",
  citation: "SF1449 block 10", excerpt: "100% WOSB set-aside.", kind: "eligibility_bar",
  controllability: "bidder_controls", curableInWindow: true, requiredAttribute: "setaside:WOSB", grounded: true, lens: "smallbiz",
});
const mixed = runBoth(true, true, base([chapelFinding, wosbGate("panel:wosb-1")]));
assert(mixed.eligible === null, `mixed: a GENUINE unverified gate still clamps eligible=null [got ${mixed.eligible}]`);
assert(/ELIGIBILITY NOT VERIFIED/i.test(mixed.reason) && /setaside:WOSB/.test(mixed.reason), "mixed: clamp fires and names the genuine gate");
assert(!/prior_chapel_experience/.test(mixed.reason), "mixed: the demoted factor's attribute stays OUT of the clamp");

// ── P6 — ULTRA #240 SIDE-FIND: clamp text dedups repeated attributes (live Gate-3 showed 'setaside:WOSB' ×5) ──
console.log("\n── P6 clamp dedup (ultra #240 side-find) ──");
const dup = runBoth(true, true, base([chapelFinding, wosbGate("panel:wosb-1"), wosbGate("panel:wosb-2"), wosbGate("panel:wosb-3")]));
const wosbMentions = (dup.reason.match(/setaside:WOSB/g) ?? []).length;
assert(/ELIGIBILITY NOT VERIFIED/i.test(dup.reason), "dedup: clamp still fires on the genuine gates");
assert(wosbMentions === 1, `dedup: 'setaside:WOSB' listed exactly once [got ${wosbMentions}]`);

// ── P7 — ULTRA #240 FINDING C: bare "§M" citation must corroborate (the \b§ arm never matched) ──
console.log("\n── P7 bare-§M citation (ultra #240 Finding C) ──");
assert(cls(CHAPEL, "§M, Item I") === "demote", "bare '§M, Item I' cite → demote (pre-fix: \\b§ arm dead → not_applicable)");
assert(cls(CHAPEL, "cite: §M, para 1") === "demote", "mid-string '§M' cite → demote");
assert(cls(CHAPEL, "(§M)") === "demote", "parenthesized '(§M)' cite → demote");
assert(cls(CHAPEL, "Attachment 3 — Forms") === "not_applicable", "guard: non-§M cite still does NOT corroborate (no over-match)");
// red-team rounds 1-2 — the §M arm must NOT over-match (over-match widens demotion, against fail-toward-escalation):
assert(cls(CHAPEL, "AFI 36-2618 § M") === "not_applicable", "R-T guard: a FOREIGN document's '§ M' (digit-designator prefix) does NOT corroborate");
assert(cls(CHAPEL, "52.212-1 §m") === "not_applicable", "R-T guard: lowercase '§m' after a clause cite does NOT corroborate");
assert(cls(CHAPEL, "see § m herein") === "not_applicable", "R-T guard: lowercase spaced '§ m' does NOT corroborate");
assert(cls(CHAPEL, "RCW § M-DOT standard") === "not_applicable", "R-T guard: '§ M-DOT' (hyphen continuation) does NOT corroborate");
assert(cls(CHAPEL, "per statute §m(3)") === "not_applicable", "R-T guard: statute subparagraph '§m(3)' does NOT corroborate");
// round-2 BREAK (banked): the round-1 lookbehind was a SEPARATOR BLOCKLIST — one comma/semicolon/paren/em-dash
// bridged the digit to § and resurrected the foreign-doc over-match with a proven verdict flip. Positive-bridge
// re-shape kills the whole class regardless of separator:
assert(cls(CHAPEL, "AFI 36-2618, § M") === "not_applicable", "R-T round-2: comma-bridged foreign-doc '§ M' does NOT corroborate");
assert(cls(CHAPEL, "AFI 36-2618; § M") === "not_applicable", "R-T round-2: semicolon-bridged variant does NOT corroborate");
assert(cls(CHAPEL, "AFI 36-2618 (§ M)") === "not_applicable", "R-T round-2: paren-bridged variant does NOT corroborate");
assert(cls(CHAPEL, "DoDI 5200.01 — § M") === "not_applicable", "R-T round-2: em-dash-bridged variant does NOT corroborate");
assert(cls(CHAPEL, "per statute §M(3)") === "not_applicable", "R-T round-2: UPPERCASE statute subparagraph '§M(3)' does NOT corroborate");
// keep-set (round-2 under-match sweep) — genuine UCF §M cites still corroborate after the re-shape:
assert(cls(CHAPEL, "See §M.") === "demote", "R-T round-2 keep: 'See §M.' still corroborates");
assert(cls(CHAPEL, "– §M") === "demote", "R-T round-2 keep: en-dash-preceded bare '§M' still corroborates");

// ── P8 — R10 THIRD-PARTY-STATUS VETOES (card #545 ruling — the six red-team leak shapes must ESCALATE) ──
// Round-2/3 red-team proved these six classify demote and, with the tristate co-armed, read eligible=true where a
// KO sees a genuine gate. Each is a CONFERRED status (agency audit / labor agreement / physical footprint /
// credentialing office / source-approval authority) — never quote-authored evidence.
console.log("\n── P8 R10 vetoes — conferred third-party status escalates (all six leak shapes) ──");
assert(cls("Offeror shall demonstrate an accounting system approved by DCAA.", "Section M, Evaluation Criteria") === "escalate", "R10-1: DCAA-approved accounting system → escalate");
assert(cls("Demonstrate a DCMA-approved purchasing system in the capability statement.", "Section M") === "escalate", "R10-2: DCMA-approved purchasing system → escalate");
assert(cls("Offeror shall demonstrate that it is a signatory to the applicable collective bargaining agreement.", "Section M, Evaluation Criteria") === "escalate", "R10-3: CBA-signatory status → escalate");
assert(cls("Demonstrate capability; the offeror must maintain a facility within 50 miles of the installation.", "Section M") === "escalate", "R10-4: 50-mile facility geography → escalate");
assert(cls("Demonstrate experience; personnel must possess current DBIDS credentials for base access.", "Section M") === "escalate", "R10-5: DBIDS base-access credential → escalate");
assert(cls("Demonstrate past performance as an approved source for this item.", "Section M, Evaluation Criteria") === "escalate", "R10-6: approved-source restriction → escalate");
// coupled form — evidence-language wrapping a conferred status still escalates:
assert(cls("Provide a capability statement demonstrating your government-approved estimating system.", "Section M") === "escalate", "R10 coupled: capability-statement phrasing around an approved system → escalate");
assert(cls("Submit past performance showing your office located within the county and staff badging.", "Section M") === "escalate", "R10 coupled: geography inside past-performance phrasing → escalate");
// keep-set — genuine quote-evidenced factors are NOT swallowed by the new vetoes:
assert(cls(CHAPEL, "Section M, Technical Requirements, Item I") === "demote", "R10 keep: chapel specimen still demotes");
assert(cls("Offeror shall demonstrate past performance managing multiple facilities for government clients.", "Section M, Evaluation Criteria") === "demote", "R10 keep: 'managing facilities' (no bounded-location form) still demotes");
assert(cls("Demonstrate relevant experience within the past five years delivering these services.", "Section M") === "demote", "R10 keep: 'within the past five years' (no facility noun + place token) still demotes");
assert(cls("Provide a capability statement describing your quality system and technical approach.", "Section M") === "demote", "R10 keep: bare 'quality system' (no third-party approval structure) still demotes");

// ── P9 — POST-R10 COVERAGE STATEMENT (card #545 item 2): who protects the customer on each channel ──
// (a) FINDINGS channel: an R10-escalated shape keeps its eligibility-bar typing → NHR pole (not BID_WITH_CAUTION),
//     eligible=null under the tristate — protection restored WITHOUT the manifest backstop.
// (b) MANIFEST backstop (audit-orchestrator.ts:1788-1790): keys SET-ASIDE manifest elements ONLY (+ null profile,
//     under AUDIT_SETASIDE_ELIG_CLAMP) — code-read, unchanged by this pass.
// (c) RESIDUAL (stated for Brain, carried on card #545): a proposer that emits NO typed finding for a
//     non-set-aside gate (DCAA-class) is covered by NEITHER channel — same omission risk that predates #538.
console.log("\n── P9 post-R10 coverage — findings channel restores the NHR pole on the leak shapes ──");
const dcaaFinding: TypedFinding = {
  id: "panel:dcaa", requirement: "Offeror shall demonstrate an accounting system approved by DCAA.",
  citation: "Section M, Evaluation Criteria", excerpt: "accounting system approved by DCAA",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false,
  requiredAttribute: "dcaa_approved_accounting_system", grounded: true, lens: "pricing",
};
const dcaaBoth = runBoth(true, true, base([dcaaFinding]));
assert(dcaaBoth.verdict === "NEEDS_HUMAN_REVIEW", `P9: DCAA gate → NHR pole retained under both flags [got ${dcaaBoth.verdict}]`);
assert(dcaaBoth.eligible === null, `P9: DCAA gate → eligible=null (never a false green) [got ${dcaaBoth.eligible}]`);
const geoFinding: TypedFinding = { ...dcaaFinding, id: "panel:geo", requirement: "Demonstrate capability; the offeror must maintain a facility within 50 miles of the installation.", excerpt: "maintain a facility within 50 miles", requiredAttribute: "facility_within_50_miles" };
const geoBoth = runBoth(true, true, base([geoFinding]));
assert(geoBoth.verdict === "NEEDS_HUMAN_REVIEW" && geoBoth.eligible === null, `P9: geography gate → NHR + eligible=null [got ${geoBoth.verdict}/${geoBoth.eligible}]`);

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
