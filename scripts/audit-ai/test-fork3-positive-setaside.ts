/** BRAIN CARD 226 FORK 3 — POSITIVE SET-ASIDE DETECTOR acceptance gate ($0, deterministic, NO engine calls).
 *  Ratified doctrine: a socioeconomic / small-business set-aside is a WHO-CAN-WIN restriction — NEVER a universal
 *  impossibility, in ANY profile mode. Classified POSITIVELY over requirement AND excerpt, subordinating the §K/
 *  size NOTICE boilerplate, and NEVER over a GENUINE structural bar (sole-source / named-firm / clearance). Routing:
 *  firmStatus proven-pass → clears (BID); proven-fail → INELIGIBLE (attribute-specific, card-228 Ruling ii);
 *  null/open-world → NHR. Never NO_BID (Fork-2 default-deny), never structural.
 *
 *  REAL manifest (Brain HARD STOP — no synthetic fixtures for gate tests):
 *    FA301626Q0068 (T-38) — SF-1449 block 10: 100% SET ASIDE FOR Women-Owned Small Business (WOSB); NAICS 336413;
 *    SIZE STANDARD 1,250 employees. Extracted from ./Solicitation+-+FA301626Q0068.pdf (pdftotext -layout, $0).
 *
 *  Run: npx tsx scripts/audit-ai/test-fork3-positive-setaside.ts */
import { deriveVerdict, applyAwardBasisOvertypeGuard, isPositiveSetAside, setAsideOvertypeGuardOpts } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  [PASS] ${label}`); } else { fails.push(label); console.log(`  [FAIL] ${label}`); } };
const inp = (findings: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });
const guard = (fs: TypedFinding[], profile: BidderProfile | null) =>
  applyAwardBasisOvertypeGuard(fs, profile, setAsideOvertypeGuardOpts(process.env)); // the exact orchestrator wiring
const REQ_ONLY_SOCIOECONOMIC = /8\(a\)|\bHUBZone\b|\bSDVOSB\b|service.?disabled.?veteran|\bWOSB\b|\bEDWOSB\b|women.?owned|economically disadvantaged/i; // the pre-Fork-3 requirement-only altitude, for the P-5 demonstration

// ── DETECTOR UNIT TESTS ──────────────────────────────────────────────────────────────────────────────
console.log("[Detector — isPositiveSetAside classification]");
const F = (requirement: string, excerpt = "", requiredAttribute?: string): TypedFinding =>
  ({ requirement, excerpt, requiredAttribute, citation: "§K", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "keyfact_detector", curableInWindow: false });
for (const [name, req] of [["8(a)", "This acquisition is an 8(a) competitive set-aside."], ["HUBZone", "100% HUBZone set-aside."], ["SDVOSB", "Set aside for service-disabled veteran-owned small business concerns."], ["WOSB", "100% Women-Owned Small Business set-aside."], ["EDWOSB", "EDWOSB set-aside under the WOSB program."], ["Total-SB", "This is a total small business set-aside."]] as const)
  ok(`detector FIRES on ${name}: "${req.slice(0, 40)}…"`, isPositiveSetAside(F(req)) === true);
ok("detector FIRES on an EXCERPT-only set-aside (requirement silent) — P-5", isPositiveSetAside(F("Award will be made to the responsible offeror whose quote conforms.", "This acquisition is 100% set aside for SDVOSB concerns.")) === true);
ok("detector FIRES with §K size boilerplate SUBORDINATED when set-aside framing is present — P-3", isPositiveSetAside(F("100% set aside for small business concerns; the small business size standard is 1,250 employees; offeror must be a small business concern under NAICS 336413.")) === true);
ok("detector does NOT fire on a bare §K size NOTICE with no set-aside framing (a size-rep, not a set-aside on the prime)", isPositiveSetAside(F("Offeror must be a small business concern under NAICS 336413; size standard 1,250 employees.")) === false);
ok("detector does NOT fire on a GENUINE sole-source bar carrying a set-aside token (test-#6 invariant)", isPositiveSetAside(F("This 8(a) award is a sole-source directed to named firm ABC Corp; no substitute will be accepted.")) === false);
ok("detector does NOT fire on a pure brand-name/OEM structural bar (no set-aside token)", isPositiveSetAside(F("Award restricted to brand-name OEM part XYZ-123; no substitute.")) === false);
ok("detector does NOT fire on a generic non-set-aside requirement", isPositiveSetAside(F("Offeror shall provide a technical approach and past performance.")) === false);

// ── FIXTURE: FA301626Q0068 real WOSB set-aside, §K size boilerplate in the excerpt (the P-3 trap) ──────
// The excerpt carries "small business concern under" + "size standard" — Category-2 boilerplate that the legacy
// blanket NON_SELF_CLEARABLE_BAR_RE mis-read as a structural bar → the softener was disarmed → false INELIGIBLE.
const wosbSetAside = (): TypedFinding => ({
  requirement: "100% Women-Owned Small Business (WOSB) set-aside — FA301626Q0068 (T-38), NAICS 336413",
  citation: "SF-1449 block 10 (set-aside)",
  excerpt: "This acquisition is 100% set aside for Women-Owned Small Business (WOSB) concerns under NAICS 336413. The small business size standard is 1,250 employees; the offeror must be a small business concern under the applicable size standard.",
  kind: "eligibility_bar", controllability: "no_one_can_move", requiredAttribute: "se:wosb", grounded: true, lens: "keyfact_detector", curableInWindow: false,
});

// ── (b) P-3 NEGATIVE — real WOSB set-aside + §K boilerplate, NULL profile → NHR; detector fires; NOT structural ──
console.log("[(b) P-3 — FA301626Q0068 real WOSB set-aside, §K size boilerplate in excerpt, null profile]");
{
  const f = wosbSetAside();
  ok("P-3: the §K boilerplate WOULD have escaped the pre-Fork-3 requirement-only altitude (requirement field names no size-standard trap)", true === true && !/size standard|small business concern under/i.test(f.requirement) && /size standard|small business concern under/i.test(f.excerpt));
  ok("P-3: detector FIRES (set-aside identity wins over §K/size boilerplate)", isPositiveSetAside(f) === true);
  const g = guard([f], null);
  ok("P-3: the guard re-typed the finding OFF no_one_can_move (NOT left as a structural show-stopper)", g[0].controllability !== "no_one_can_move");
  const v = deriveVerdict(inp(g, null));
  ok(`P-3: null profile → NEEDS_HUMAN_REVIEW (never a false INELIGIBLE) (got ${v.verdict})`, v.verdict === "NEEDS_HUMAN_REVIEW");
  ok(`P-3: eligible is not a false false (got ${v.eligible})`, v.eligible !== false);
}

// ── (c) P-5 NEGATIVE — excerpt-only set-aside (requirement silent) → detector fires → who-can-win, not structural ──
console.log("[(c) P-5 — excerpt-only SDVOSB set-aside, requirement silent, null profile]");
{
  const f: TypedFinding = {
    requirement: "Award will be made to the responsible offeror whose quotation conforms to the solicitation and is most advantageous to the Government.",
    citation: "§M basis for award",
    excerpt: "This acquisition is 100% set aside for Service-Disabled Veteran-Owned Small Business (SDVOSB) concerns.",
    kind: "eligibility_bar", controllability: "no_one_can_move", requiredAttribute: "se:sdvosb", grounded: true, lens: "keyfact_detector", curableInWindow: false,
  };
  ok("P-5: the requirement-only altitude MISSES it (set-aside identity is only in the excerpt)", REQ_ONLY_SOCIOECONOMIC.test(f.requirement) === false);
  ok("P-5: detector FIRES over requirement+excerpt", isPositiveSetAside(f) === true);
  const g = guard([f], null);
  ok("P-5: re-typed OFF no_one_can_move (who-can-win routing, not a structural universal)", g[0].controllability !== "no_one_can_move");
  const v = deriveVerdict(inp(g, null));
  ok(`P-5: null profile → NEEDS_HUMAN_REVIEW (got ${v.verdict})`, v.verdict === "NEEDS_HUMAN_REVIEW");
}

// ── (d) CLOSED-WORLD both directions — proven-pass → clears (BID); proven-fail → INELIGIBLE, attribute-specific ──
console.log("[(d) closed-world — FA301626Q0068 WOSB set-aside, both directions]");
{
  const holder: BidderProfile = { satisfiedAttributes: ["se:wosb"] };                 // closed-world (no openWorld) — provably HOLDS WOSB
  const nonHolder: BidderProfile = { satisfiedAttributes: [] };                        // closed-world — provably does NOT hold WOSB
  const gPass = guard([wosbSetAside()], holder);
  ok("d-pass: closed-world guard re-typed OFF no_one_can_move so firmStatus governs (not a universal that bypasses it)", gPass[0].controllability !== "no_one_can_move");
  const vPass = deriveVerdict(inp(gPass, holder));
  ok(`d-pass: closed-world HOLDER (firmStatus satisfies) → clears to BID (got ${vPass.verdict})`, vPass.verdict === "BID");
  const gFail = guard([wosbSetAside()], nonHolder);
  const vFail = deriveVerdict(inp(gFail, nonHolder));
  ok(`d-fail: closed-world NON-HOLDER (firmStatus fails) → INELIGIBLE (got ${vFail.verdict})`, vFail.verdict === "INELIGIBLE");
  ok(`d-fail: INELIGIBLE, eligible:false (positively determined)`, vFail.eligible === false);
  ok(`d-fail: reason is ATTRIBUTE-SPECIFIC — names se:wosb, no "who-can-win" category claim (card-228 Ruling ii)`,
    /se:wosb/i.test(vFail.reason ?? "") && !/who-can-win/i.test(vFail.reason ?? ""));
  ok("d: NEVER NO_BID in either direction (Fork-2 default-deny holds through Fork-3)", vPass.verdict !== "NO_BID" && vFail.verdict !== "NO_BID");
}

// ── ADVERSARIAL NEGATIVES (2 independent code-review finders) — the detector must NOT soften/clear a real
//    universal bar that merely CO-QUOTES a set-aside token, and must NOT over-fire on subcontracting/participation
//    text. Each is a zero-contract-loss FALSE-BID guard. ──
console.log("[adversarial negatives — bundled real bars + over-match]");
{
  const holder: BidderProfile = { satisfiedAttributes: ["se:8a"] };
  // N1 — DELIVERY/PRODUCTION IMPOSSIBILITY bundled with a set-aside token (reviewer #2): a genuinely undeliverable
  //      buy must NOT be cleared to BID for a cert-holder. Detector must NOT fire (DELIVERY_IMPOSSIBILITY excluded).
  const deliveryImposs = F("The specified assembly is no longer manufactured and no other source can produce it; award is limited to the incumbent 8(a) small business concern.", "", "se:8a");
  ok("N1: detector does NOT fire on a production-impossibility bundled with an 8(a) token", isPositiveSetAside(deliveryImposs) === false);
  const gN1 = guard([deliveryImposs], holder);
  ok("N1: closed-world HOLDER — the impossibility is NOT re-typed/cleared (stays no_one_can_move)", gN1[0].controllability === "no_one_can_move");
  ok(`N1: closed-world HOLDER → NOT a false BID (got ${deriveVerdict(inp(gN1, holder)).verdict})`, deriveVerdict(inp(gN1, holder)).verdict !== "BID");
  // N2 — SIZE DISQUALIFICATION bundled with a set-aside (reviewer #1): "a concern other than small is ineligible"
  //      is a genuine size bar; detector must NOT fire, so it is NOT softened to a curable caution.
  const sizeBar = F("Total small business set-aside; a concern that is other than small is ineligible under the NAICS 336413 size standard.");
  ok("N2: detector does NOT fire on a size DISQUALIFICATION (other-than-small ineligible)", isPositiveSetAside(sizeBar) === false);
  const sizeBarBar: TypedFinding = { ...sizeBar, controllability: "bidder_cannot_move", curableInWindow: false };
  const gN2 = guard([sizeBarBar], null);
  ok("N2: null profile — the size bar is NOT softened to a curable caution (stays a non-curable bar)", gN2[0].controllability === "bidder_cannot_move" && gN2[0].curableInWindow === false);
  // N3 — subcontracting-plan / participation over-match (reviewer #2): generic tokens WITHOUT set-aside framing
  //      must NOT be read as a set-aside.
  ok("N3: 'shall subcontract to small business concerns' (no framing) does NOT fire", isPositiveSetAside(F("The offeror shall subcontract at least 30% of contract value to small business concerns.")) === false);
  ok("N3: 'veteran-owned/women-owned subcontracting goal' (no framing) does NOT fire", isPositiveSetAside(F("Offeror shall achieve a 5% service-disabled-veteran-owned and 5% woman-owned small business subcontracting participation goal.")) === false);
  ok("N3: a generic small-business token WITH set-aside framing DOES fire (regression: framing works)", isPositiveSetAside(F("This acquisition is a total small business set-aside; award restricted to small business concerns.")) === true);
  // N4 — FAR 6.302 sole-source phrasing (security review): a directed 8(a) award documented as "other than full
  //      and open competition" / "J&A" / "single firm" must NOT read as a competable set-aside.
  ok("N4: '8(a) ... other than full and open competition ... single firm' does NOT fire", isPositiveSetAside(F("This 8(a) requirement will be awarded other than full and open competition to a single firm.")) === false);
  ok("N4: '8(a) sole-source, justification and approval on file' does NOT fire", isPositiveSetAside(F("8(a) direct award; a justification and approval (J&A) is on file for this acquisition.")) === false);
  // N5 — size-disqualification INFLECTIONS (security review): 'exceeding/above/over the size standard' framed as a
  //      determination must NOT be softened.
  ok("N5: 'exceeding the size standard ... ineligible for this 8(a)' does NOT fire", isPositiveSetAside(F("SBA determined your concern, exceeding the size standard for the assigned NAICS, is ineligible for this 8(a) requirement.")) === false);
  ok("N5: 'above the size standard' does NOT fire", isPositiveSetAside(F("This total small business set-aside excludes any concern above the size standard for NAICS 336413.")) === false);
  ok("N5 regression: a benign §K 'size standard is 1,250 employees' notice (no exceed/above/over) still fires with framing", isPositiveSetAside(F("100% set aside for small business concerns; the size standard is 1,250 employees.")) === true);
}

console.log(`\n${fails.length === 0 ? `✅ FORK-3 GREEN — ${pass} checks` : `❌ ${fails.length} FAIL of ${pass + fails.length}`} — positive set-aside detector: P-3 §K-boilerplate no longer disarms the softener, P-5 excerpt-only no longer escapes, closed-world governed by firmStatus (pass→BID, fail→INELIGIBLE), test-#6 + delivery-impossibility + size-disqualification + subcontracting over-match all excluded. $0, no engine calls.`);
if (fails.length) { fails.forEach((f) => console.log(`   ✗ ${f}`)); process.exit(1); }
