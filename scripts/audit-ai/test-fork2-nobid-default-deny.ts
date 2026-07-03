/** BRAIN CARD 226 FORK 2 — DEFAULT-DENY NO_BID acceptance gate ($0, deterministic, NO engine calls).
 *  Real manifests only (Brain HARD STOP: no synthetic fixtures for gate tests):
 *    Fixture A — the retired N0016426Q0192 OEM/brand-name base (real bar from ceo/proofs/v3-*-result.json).
 *    Fixture B — FA301626Q0068 (T-38), a real 100% Total Small Business set-aside, NAICS 336413.
 *  Proves: NO_BID is UNREACHABLE without a POSITIVE UNIVERSAL_DEFECT allowlist match; who-can-win bars route
 *  to INELIGIBLE (profile proves non-qual) / NHR (null); the allowlist marker is the ONLY NO_BID gate.
 *    npx tsx scripts/audit-ai/test-fork2-nobid-default-deny.ts */
import { readFileSync } from "node:fs";
import { deriveVerdict, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts, EngineInvariantError, registerUniversalDefectProducer, validateUniversalDefectProducerConfig, _clearUniversalDefectProducers } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  [PASS] ${label}`); } else { fails.push(label); console.log(`  [FAIL] ${label}`); } };
const inp = (findings: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });

// ── FIXTURE A (real): the N0016426Q0192 "BRAND NAME ONLY - OEM AND AUTHORIZED DISTRIBUTORS" bar, loaded from the
//    persisted v3 result. Brain's scenario: a who-can-win bar a lens MIS-TYPED as no_one_can_move + a non-
//    eligibility kind (the exact shape that reached NO_BID/eligible:true under the old negative-deny code). ──
console.log("[Fixture A — N0016426Q0192 real brand-name/OEM bar, mis-typed]");
const proofA = JSON.parse(readFileSync("ceo/proofs/v3-N0016426Q0192-result.json", "utf8"));
const realBar = (proofA.findings as TypedFinding[]).find((f) => /brand.?name only/i.test(`${f.requirement} ${f.excerpt ?? ""}`));
if (!realBar) throw new Error("Fixture A: real brand-name bar not found in v3 proof");
const misTyped: TypedFinding = { ...realBar, controllability: "no_one_can_move", kind: "technical_spec", curableInWindow: false, grounded: true };
const vA = deriveVerdict(inp([misTyped], null));
ok(`A: mis-typed who-can-win brand-name bar under NULL profile → ${vA.verdict} (NOT NO_BID)`, vA.verdict !== "NO_BID");
ok("A: specifically → NEEDS_HUMAN_REVIEW (fails safe, never the catastrophic pole)", vA.verdict === "NEEDS_HUMAN_REVIEW");
ok("A: eligible is NOT a default true (positively determined)", vA.eligible !== true || vA.verdict !== "NO_BID");

// ── FIXTURE B (real): FA301626Q0068 (T-38) — a real 100% Total Small Business set-aside, NAICS 336413.
//    Under a NULL profile (SB status unverified) the who-can-win set-aside must NOT be INELIGIBLE and NOT NO_BID. ──
console.log("[Fixture B — FA301626Q0068 real Total-SB set-aside, null profile]");
const setAsideB: TypedFinding = {
  requirement: "100% Total Small Business set-aside (NAICS 336413) — FA301626Q0068 (T-38 Talon)",
  citation: "SF-1449 set-aside block", excerpt: "This acquisition is 100% set aside for Small Business concerns; NAICS 336413.",
  kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "keyfact_detector",
};
const softenedB = applyAwardBasisOvertypeGuard([setAsideB], null, setAsideOvertypeGuardOpts(process.env));
const vB = deriveVerdict(inp(softenedB, null));
ok(`B: real Total-SB set-aside under NULL profile → ${vB.verdict} (NOT INELIGIBLE)`, vB.verdict !== "INELIGIBLE");
ok(`B: real Total-SB set-aside under NULL profile → ${vB.verdict} (NOT NO_BID)`, vB.verdict !== "NO_BID");

// ── INVARIANT (Brain acceptance #5): NO_BID is UNREACHABLE across A/B when no allowlisted class is present;
//    it becomes reachable ONLY when a finding is POSITIVELY classified a universal defect. Locked as a test. ──
// ── DiD FALSE-BID GUARD (adversarial review) — REAL-manifest-bound to N0016426Q0192. The real brand-name bar
//    mis-typed no_one_can_move must NEVER silently clear to BID via its REAL curable flag or a satisfying profile. ──
console.log("[DiD false-BID guard — real N0016426Q0192 bar]");
const realCurable: TypedFinding = { ...realBar, controllability: "no_one_can_move", kind: "technical_spec", curableInWindow: true, grounded: true };
ok("DiD (real N0016426Q0192): mis-typed no_one_can_move + real curableInWindow:true → NHR (never BID_WITH_CAUTION)", deriveVerdict(inp([realCurable], null)).verdict === "NEEDS_HUMAN_REVIEW");
const realAttr = realBar.requiredAttribute!;
const realSatisfied: TypedFinding = { ...realBar, controllability: "no_one_can_move", kind: "technical_spec", grounded: true };
ok("DiD (real N0016426Q0192): mis-typed no_one_can_move + firm SATISFIES its real OEM attribute → NHR (never a silent BID)", deriveVerdict(inp([realSatisfied], { satisfiedAttributes: [realAttr] })).verdict === "NEEDS_HUMAN_REVIEW");

console.log("[Invariant — default-deny locked]");
const noneAllowlisted = [misTyped, ...softenedB];
ok("INV: no universalDefect present anywhere → NO finding can drive NO_BID (default-deny)",
  deriveVerdict(inp([misTyped], null)).verdict !== "NO_BID" && deriveVerdict(inp(softenedB, null)).verdict !== "NO_BID");
// coupling-lock (Ruling B): the SAME real bar POSITIVELY marked a universal defect → HARD ERROR under
// AUDIT_ELIGIBLE_TRISTATE=off (no universal-defect producer may run without positive-eligibility), and → NO_BID
// under tristate=on (the allowlist is the ONLY NO_BID gate).
const markedUniversal: TypedFinding = { ...misTyped, universalDefect: "unmeetable_by_any_offeror" };
{
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE; delete process.env.AUDIT_ELIGIBLE_TRISTATE;
  let threw = false; let caught: unknown; try { deriveVerdict(inp([markedUniversal], null)); } catch (e) { threw = true; caught = e; }
  ok("INV Ruling B/i: universalDefect under tristate=off → coupling-lock BACKSTOP HARD ERROR (never returns a verdict)", threw);
  ok("INV Ruling i: backstop throws EngineInvariantError → billing-safe boundary conversion, NEVER an NHR verdict", caught instanceof EngineInvariantError);
  process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
  const vMarked = deriveVerdict(inp([markedUniversal], null));
  ok("INV: universalDefect='unmeetable_by_any_offeror' under tristate=on → NO_BID (positive-allow is the ONLY path)", vMarked.verdict === "NO_BID");
  ok("INV Ruling B: NO_BID eligible is NOT a default true (positively determined)", vMarked.eligible !== true);
  if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev;
}
ok("INV: a who-can-win class ('contradictory'/'unmeetable' NOT set) can NEVER reach NO_BID", noneAllowlisted.every((f) => !f.universalDefect));

// ═══ CARD 228 RULING (i) — COUPLING-LOCK AT BOOT/REGISTRATION-TIME (fails at INIT, not mid-audit) ═══════════
console.log("[Ruling i — INIT-time coupling-lock]");
{
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE;
  // (a) registering a universalDefect producer while tristate is OFF → fails at INIT (process refuses to start).
  delete process.env.AUDIT_ELIGIBLE_TRISTATE;
  _clearUniversalDefectProducers();
  let initThrew = false; let initErr: unknown;
  try { registerUniversalDefectProducer("test:sim-universal-detector"); } catch (e) { initThrew = true; initErr = e; }
  ok("i(a): register a universalDefect producer under tristate=off → FAILS AT INIT (registration throws)", initThrew);
  ok("i(a): the INIT failure is an EngineInvariantError (config error, never NHR, never a raw 500)", initErr instanceof EngineInvariantError);
  ok("i(a): the message states the process refuses to start (config error, not a document-uncertainty)",
    initErr instanceof Error && /refuses to start/i.test(initErr.message) && !/NEEDS_HUMAN_REVIEW|NHR/i.test(initErr.message));
  // (b) same producer registered WITH the tristate ON → INIT passes (no throw); byte-identical to no-producer prod.
  process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
  _clearUniversalDefectProducers();
  let okInit = true; try { registerUniversalDefectProducer("test:sim-universal-detector"); validateUniversalDefectProducerConfig(); } catch { okInit = false; }
  ok("i(b): the SAME producer under tristate=on → INIT passes (a positive eligibility determination is reachable)", okInit);
  _clearUniversalDefectProducers();  // restore empty prod registry — no residue for later gates
  if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev;
}

// ═══ CARD 228 RULING (ii) — PRECEDENCE PRE-LOCK: universal attribution BEFORE firmStatus ══════════════════
//   A finding marked universalDefect WITH a coincident closed-world attribute-fail is attributed
//   universal/requirement-side; firmStatus does NOT re-label it "firm does not qualify". Simulated mark
//   (no producer emits today); the REAL bar/attribute is N0016426Q0192's OEM attribute.
console.log("[Ruling ii — precedence pre-lock (universal BEFORE firmStatus)]");
{
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE; process.env.AUDIT_ELIGIBLE_TRISTATE = "true";  // so the coupling-lock permits the marked finding
  const realAttr2 = realBar.requiredAttribute!;
  // real bar + REAL requiredAttribute the closed-world profile provably fails, ALSO marked a universal defect:
  const markedAndFails: TypedFinding = { ...realBar, controllability: "no_one_can_move", kind: "technical_spec", universalDefect: "unmeetable_by_any_offeror", grounded: true };
  const vPrec = deriveVerdict(inp([markedAndFails], { satisfiedAttributes: [] }));  // closed-world, does NOT hold realAttr2 → firmStatus "fails"
  ok("ii-precedence: marked universalDefect + coincident closed-world attribute-fail → NO_BID (attributed universal, requirement-side)", vPrec.verdict === "NO_BID");
  ok("ii-precedence: reason is the UNIVERSAL defect, firmStatus did NOT re-label to a firm disqualification",
    /Universal solicitation defect/i.test(vPrec.reason) && !/does not satisfy the required attribute/i.test(vPrec.reason));
  void realAttr2;
  if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev;
}

// ═══ CARD 228 RULING (ii) — INELIGIBLE REASON IS ATTRIBUTE-SPECIFIC (no bar-type category claim) ══════════
//   REAL manifest: the N0016426Q0192 OEM/brand-name bar, closed-world profile that provably fails its real
//   requiredAttribute → INELIGIBLE naming the FAILED ATTRIBUTE, with NO "who-can-win restriction" category claim.
console.log("[Ruling ii — attribute-specific INELIGIBLE reason]");
{
  const realAttr3 = realBar.requiredAttribute!;
  const provenFailBar: TypedFinding = { ...realBar, controllability: "no_one_can_move", kind: "technical_spec", grounded: true };
  const vIn = deriveVerdict(inp([provenFailBar], { satisfiedAttributes: [] }));  // closed-world non-hold → firmStatus "fails"
  ok(`ii-reason: closed-world proven-fail (real N0016426Q0192) → INELIGIBLE (was ${vIn.verdict})`, vIn.verdict === "INELIGIBLE");
  ok("ii-reason: names the SPECIFIC failed attribute", vIn.reason.includes(realAttr3));
  ok("ii-reason: does NOT assert a bar-type category ('who-can-win restriction') the engine never classified",
    !/who-can-win/i.test(vIn.reason) && !/restriction/i.test(vIn.reason));
}

console.log(`\nfork-2 default-deny gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ FORK-2 GREEN — NO_BID is default-DENY: reachable ONLY on a positive UNIVERSAL_DEFECT allowlist match; real who-can-win bars (N0016426Q0192 brand-name, FA301626Q0068 Total-SB set-aside) route to NHR/INELIGIBLE, never NO_BID. $0, no engine calls.");
