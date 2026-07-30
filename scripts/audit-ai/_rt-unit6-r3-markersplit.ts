/* RED-TEAM Unit6 R3 — MARKER/DISPOSITION SPLIT deep probe.
   The survivor takes kind+controllability+curable from `worst` but ALL OTHER markers
   (requiredAttribute, mmEvidenceFactor, nmrGuard, universalDefect, cautionFloor-base) from `primary`.
   When forced!==null, primary=the single protected member; worst may be a DIFFERENT plain member.
   Hunt: a marker(primary) + disposition(worst) combination that no real member had. */
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";

type VI = Parameters<typeof deriveVerdict>[0];
const mkVI = (f: TypedFinding[], p: BidderProfile | null): VI =>
  ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false } as VI);
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  id: o.id ?? Math.random().toString(36).slice(2), requirement: o.requirement ?? "r",
  citation: o.citation ?? "", excerpt: o.excerpt ?? "", kind: o.kind ?? "submission",
  controllability: o.controllability ?? "bidder_controls", grounded: o.grounded ?? true, lens: o.lens ?? "L", ...o,
} as TypedFinding);

const nullP: BidderProfile | null = null;
const owEmpty: BidderProfile = { satisfiedAttributes: [], closedWorld: false } as BidderProfile;
const owSat: BidderProfile = { satisfiedAttributes: ["setaside:sb"], closedWorld: false } as BidderProfile;
const cwFail: BidderProfile = { satisfiedAttributes: [], closedWorld: true } as BidderProfile;
const cwSat: BidderProfile = { satisfiedAttributes: ["setaside:sb"], closedWorld: true } as BidderProfile;
const allP = [nullP, owEmpty, owSat, cwFail, cwSat];

let fails = 0;
function inv(name: string, findings: TypedFinding[], profiles = allP, source?: string) {
  const dd = applyFindingDedup(findings, { enabled: true });
  const surv: any = dd.find((f: any) => f.findingDedupMerged);
  for (const p of profiles) {
    const full = deriveVerdict({ ...mkVI(findings, p), source } as VI);
    const ded = deriveVerdict({ ...mkVI(dd, p), source } as VI);
    if (full.verdict !== ded.verdict || full.eligible !== ded.eligible) {
      fails++;
      console.log(`BREAK [${name}] p=${p ? (p.closedWorld ? "cw" : "ow") + JSON.stringify(p.satisfiedAttributes) : "null"}`);
      console.log(`   full : ${full.verdict} el=${full.eligible}   dedup: ${ded.verdict} el=${ded.eligible}`);
      if (surv) console.log(`   survivor: ctrl=${surv.controllability} kind=${surv.kind} cur=${surv.curableInWindow} attr=${surv.requiredAttribute} mm=${surv.mmEvidenceFactor} nmr=${surv.nmrGuard} caut=${surv.cautionFloor}`);
      return;
    }
  }
  console.log(`OK   ${name}${surv ? `  [surv ctrl=${surv.controllability} kind=${surv.kind} attr=${surv.requiredAttribute} mm=${surv.mmEvidenceFactor}]` : " [no merge]"}`);
}

process.env.AUDIT_ELIGIBLE_TRISTATE = "true";

// ── M1: mm-demoted protected primary (bidder_controls/eligibility_bar/mm) + plain HARD BAR member ──
//  worst = plain hard bar → survivor ctrl=bidder_cannot_move, kind=eligibility_bar, BUT mm=true rides from primary.
//  In deriveVerdict: unverifiedGates excludes mm; but disqualifying picks it up → provenFails/unknownBars path.
//  Full set: primary is a caution (mm), plain hard bar drives the pole. Does survivor reproduce?
const mmPrimary = base({ id: "MM", citation: "FAR 52.219-8", requirement: "M-factor evidenced in quote",
  controllability: "bidder_controls", kind: "eligibility_bar", requiredAttribute: "setaside:sb",
  curableInWindow: true, cautionFloor: true, mmEvidenceFactor: true });
const plainHardBar = base({ id: "HB", citation: "FAR 52.219-8", requirement: "plain hard eligibility bar",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: false });
inv("M1-mm-primary-plain-hardbar", [mmPrimary, plainHardBar]);

// ── M1b: same but plain bar has NO requiredAttribute (worst.kind rides, but attr from mm primary) ──
const plainHardBarNoAttr = base({ id: "HB2", citation: "FAR 52.219-9", requirement: "plain hard bar no attribute",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false });
const mmPrimary2 = base({ id: "MM2", citation: "FAR 52.219-9", requirement: "M-factor",
  controllability: "bidder_controls", kind: "eligibility_bar", requiredAttribute: "setaside:sb",
  curableInWindow: true, cautionFloor: true, mmEvidenceFactor: true });
inv("M1b-mm-primary-plain-hardbar-noattr", [mmPrimary2, plainHardBarNoAttr]);

// ── M2: nmrGuard protected primary (bidder_cannot_move nmr) + plain member that is a DIFFERENT-curability bar ──
//  survivor ctrl from worst; nmrGuard rides from primary. deriveVerdict 5b excludes nmrGuard from nonCurable,
//  routes to nmr branch. If worst=a NON-nmr structural non-curable bar, survivor keeps nmrGuard(primary) → wrong branch?
const nmrPrimary = base({ id: "NM", citation: "FAR 52.219-33", requirement: "nonmanufacturer rule bar",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "nonmanufacturer:compliant",
  curableInWindow: false, nmrGuard: true });
const plainStructBar = base({ id: "SB", citation: "FAR 52.219-33", requirement: "clearance the firm must hold at award",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false });
inv("M2-nmr-primary-plain-structbar", [nmrPrimary, plainStructBar]);

// ── M2b: nmr primary is the ONLY bar; plain member is a controllable dup. worst should = nmr primary. ──
const plainCtrlDup = base({ id: "CD", citation: "FAR 52.219-33", requirement: "controllable dup",
  controllability: "bidder_controls", kind: "submission" });
inv("M2b-nmr-primary-plain-ctrl", [nmrPrimary, plainCtrlDup]);

// ── M3: cautionFloor split — primary lacks cautionFloor, a plain member HAS it; survivor OR-s it in. ──
//  survivor gets cautionFloor via members.some(). Both controllable → BID_WITH_CAUTION either way. Verify floor preserved.
const noCaut = base({ id: "NC", citation: "FAR 52.222-41", requirement: "SCA wage compliance",
  controllability: "bidder_controls", kind: "submission", requiredAttribute: "x", mmEvidenceFactor: true }); // protected (mm)
const withCaut = base({ id: "WC", citation: "FAR 52.222-41", requirement: "qualification caution",
  controllability: "bidder_controls", kind: "submission", cautionFloor: true, curableInWindow: true });
inv("M3-cautionfloor-or", [noCaut, withCaut]);

// ── M4: universalDefect primary + a plain no_one_can_move member (unmarked). ──
//  worst ctrl-rank: no_one_can_move = 4 both. kind: universalDefect has kind 'other'(2) vs plain 'other'(2). tie → curable → sev.
//  survivor keeps universalDefect(primary). deriveVerdict: markedUniversalDefect path. Full set: primary=UD (→suppressed NHR),
//  plain no_one_can_move (unmarkedUniversalClaim → NHR). Both NHR. But eligible? UD path uses nhrEligible, unmarked uses nhrEligible. OK.
//  Try: worst=plain no_one_can_move sorted BEFORE UD primary → but primary is forced (protected). Survivor keeps UD marker + worst disposition (no_one_can_move). Fine.
const udPrimary = base({ id: "UD", citation: "FAR 52.211-6", requirement: "universal defect",
  controllability: "no_one_can_move", kind: "other", universalDefect: "unmeetable_by_any_offeror", grounded: true, excerpt: "x" });
const plainUniv = base({ id: "PU", citation: "FAR 52.211-6", requirement: "plain universal claim",
  controllability: "no_one_can_move", kind: "other" });
inv("M4-ud-primary-plain-universal", [udPrimary, plainUniv]);

// ── M5: THE KEY ONE — primary demoted mm (controllable), worst = a hard bar, under a CLOSED-WORLD profile that FAILS the attr.
//  Full set: plain hard bar with attr the firm fails → INELIGIBLE(false). Survivor: ctrl=bidder_cannot_move(worst), kind=eligibility_bar,
//  requiredAttribute=setaside:sb (from primary), mm=true (from primary). firmStatus(cwFail) fails → provenFails → INELIGIBLE. reproduce?
//  BUT with a source, requiredAttributeGrounded matters. Test with source containing the attr and without.
const src = "FAR 52.219-8 setaside:sb small business set-aside required";
inv("M5-mm-primary-hardbar-cwfail-src", [mmPrimary, plainHardBar], [cwFail, cwSat, nullP], src);

console.log(`\n=== MARKER-SPLIT: ${fails} invariance breaks ===`);
