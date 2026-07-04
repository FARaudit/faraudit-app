/** BRAIN CARD 240 FORK 5 — COMMITTAL-NO_BID EVIDENTIARY BAR ($0, deterministic, NO engine calls).
 *  Ruling: a `universalDefect`-marked finding may drive NO_BID ONLY when BOTH hold — (a) a positive allowlist
 *  match (the existing Fork-2 gate) AND (b) VERIFICATION EVIDENCE: a `verifiedBy` record whose `excerptHash`
 *  binds the affirmation to the cited grounded excerpt (Rule 64 — never a model prior). A mark WITHOUT (b),
 *  or with a hash that doesn't match, → NEEDS_HUMAN_REVIEW + a logged invariant breach (fail-safe family of the
 *  tristate coupling-lock). Standalone precondition — J-1/J-2 builds INTO the evidence shape, does not gate it.
 *    npx tsx scripts/audit-ai/test-fork5-committal-evidence.ts */
import { deriveVerdict, excerptHash, isVerifiedUniversalDefect, registerVerifier, _clearVerifiers } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  [PASS] ${label}`); } else { fails.push(label); console.log(`  [FAIL] ${label}`); } };
const inp = (findings: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });
const withTristate = <T>(fn: () => T): T => { // the coupling-lock requires tristate ON for ANY mark
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE; process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev; }
};

// A genuine universal defect (contradictory mandatory terms), grounded excerpt. The MARK is the same across cases;
// only the verification evidence differs — so the evidentiary bar is the sole variable under test.
const EXCERPT = "The solicitation mandates delivery within 5 days of award (§F) AND requires a 90-day first-article approval before any delivery (§E) — no offeror can satisfy both.";
const defect = (): TypedFinding => ({
  requirement: "Contradictory mandatory terms — the 5-day delivery and the 90-day non-waivable FAT gate cannot both be met by any offeror.",
  citation: "§E + §F (cross-clause contradiction)", excerpt: EXCERPT,
  kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "keyfact_detector",
  curableInWindow: false, universalDefect: "contradictory_mandatory_terms",
});
const VERIFIER = "adversarial-verifier@v3";
const validEvidence = () => ({ verifierId: VERIFIER, excerptHash: excerptHash(EXCERPT), affirmation: "the contradiction follows from the two cited mandatory clauses" });

console.log("[Fork-5 — evidentiary bar for a committal NO_BID]");

// ── FORK-5 HARDENING (card 242 Finding 3) — VERIFIER ALLOWLIST wall (registration-time) ──────────────
// Before ANY verifier registers (prod default), even a perfectly-formed, hash-bound record is UNVERIFIED — the
// self-signed/unregistered verifier can never reach NO_BID.
_clearVerifiers();
ok("hardening: a well-formed record from an UNREGISTERED verifier is unverified (allowlist empty in prod)", isVerifiedUniversalDefect({ ...defect(), verifiedBy: validEvidence() }) === false);
registerVerifier(VERIFIER); // J-1/J-2 registers its independent verifier here; the test registers the one it simulates
ok("hardening: after registration the SAME record verifies (allowlist admits the registered id)", isVerifiedUniversalDefect({ ...defect(), verifiedBy: validEvidence() }) === true);
ok("hardening: a DIFFERENT (unregistered) verifierId with an otherwise-valid record stays unverified", isVerifiedUniversalDefect({ ...defect(), verifiedBy: { ...validEvidence(), verifierId: "self-signed@rogue" } }) === false);

// ── UNIT: isVerifiedUniversalDefect ─────────────────────────────────────────────────────────────────
ok("unit: an unmarked finding is not a verified defect", isVerifiedUniversalDefect({ ...defect(), universalDefect: undefined }) === false);
ok("unit: a marked finding WITHOUT verifiedBy is unverified", isVerifiedUniversalDefect(defect()) === false);
ok("unit: a marked finding WITH a matching-hash verifiedBy is verified", isVerifiedUniversalDefect({ ...defect(), verifiedBy: validEvidence() }) === true);
ok("unit: a TAMPERED excerptHash (does not match sha256(excerpt)) is unverified — Rule 64 binding", isVerifiedUniversalDefect({ ...defect(), verifiedBy: { ...validEvidence(), excerptHash: "deadbeef" } }) === false);
ok("unit: an empty verifierId is unverified", isVerifiedUniversalDefect({ ...defect(), verifiedBy: { ...validEvidence(), verifierId: "" } }) === false);
ok("unit: an empty affirmation is unverified", isVerifiedUniversalDefect({ ...defect(), verifiedBy: { ...validEvidence(), affirmation: "" } }) === false);
ok("unit: a hash bound to a DIFFERENT excerpt is unverified (can't borrow another span's hash)", isVerifiedUniversalDefect({ ...defect(), verifiedBy: { ...validEvidence(), excerptHash: excerptHash("some other text") } }) === false);
// Rule-64 self-enforcement (adversarial review Finding 5): a grounded-false or empty excerpt can never pass.
ok("unit: matching hash but grounded=false is UNVERIFIED (mark can't rest on a hallucinated span)", isVerifiedUniversalDefect({ ...defect(), grounded: false, verifiedBy: validEvidence() }) === false);
ok("unit: an EMPTY excerpt (known-constant sha256('')) is unverified", isVerifiedUniversalDefect({ ...defect(), excerpt: "", verifiedBy: { ...validEvidence(), excerptHash: excerptHash("") } }) === false);

// ── ACCEPTANCE (b) ──────────────────────────────────────────────────────────────────────────────────
withTristate(() => {
  // marked + UNVERIFIED → NHR (never NO_BID) + logged breach (the [engine-invariant-breach] line prints above/below).
  const vUnverified = deriveVerdict(inp([defect()], null));
  ok(`b: marked + UNVERIFIED → NEEDS_HUMAN_REVIEW (never NO_BID) (got ${vUnverified.verdict})`, vUnverified.verdict === "NEEDS_HUMAN_REVIEW");
  ok("b: the NHR reason names the invariant breach (logged fail-safe)", /invariant breach/i.test(vUnverified.reason) && /verification evidence/i.test(vUnverified.reason));
  ok("b: eligible is NOT a false false (fails safe, positively-determined tristate → null)", vUnverified.eligible !== false);

  // marked + VERIFIED → NO_BID reachable (the only path).
  const vVerified = deriveVerdict(inp([{ ...defect(), verifiedBy: validEvidence() }], null));
  ok(`b: marked + VERIFIED → NO_BID reachable (got ${vVerified.verdict})`, vVerified.verdict === "NO_BID");
  ok("b: the NO_BID reason is the universal defect (no offeror can comply)", /Universal solicitation defect/i.test(vVerified.reason));

  // marked + TAMPERED hash → treated as unverified → NHR (an adversary can't fabricate the binding).
  const vTampered = deriveVerdict(inp([{ ...defect(), verifiedBy: { ...validEvidence(), excerptHash: excerptHash("fabricated") } }], null));
  ok(`b: marked + TAMPERED excerptHash → NEEDS_HUMAN_REVIEW (never NO_BID) (got ${vTampered.verdict})`, vTampered.verdict === "NEEDS_HUMAN_REVIEW");

  // marked + UNREGISTERED verifier (valid hash + affirmation, id not on the allowlist) → unverified → NHR (never NO_BID).
  const vUnregistered = deriveVerdict(inp([{ ...defect(), verifiedBy: { ...validEvidence(), verifierId: "self-signed@rogue" } }], null));
  ok(`b: marked + UNREGISTERED verifier → NEEDS_HUMAN_REVIEW (never NO_BID) (got ${vUnregistered.verdict})`, vUnregistered.verdict === "NEEDS_HUMAN_REVIEW");

  // MIXED: one verified + one unverified mark → fail-safe NHR (a broken mark blocks a committal even beside a good one).
  const vMixed = deriveVerdict(inp([{ ...defect(), verifiedBy: validEvidence() }, defect()], null));
  ok(`b: verified + unverified mark together → NEEDS_HUMAN_REVIEW (fail-safe; unverified breach wins) (got ${vMixed.verdict})`, vMixed.verdict === "NEEDS_HUMAN_REVIEW");
});

// ── FORK-2 GUARANTEE INTACT — an UNMARKED who-can-win bar can never reach NO_BID (defense-in-depth) ──
{
  const whoCanWin: TypedFinding = { ...defect(), universalDefect: undefined, controllability: "no_one_can_move" };
  const v = deriveVerdict(inp([whoCanWin], null));
  ok(`fork-2 intact: unmarked no_one_can_move under null → NEEDS_HUMAN_REVIEW, never NO_BID (got ${v.verdict})`, v.verdict === "NEEDS_HUMAN_REVIEW");
}

console.log(`\n${fails.length === 0 ? `✅ FORK-5 GREEN — ${pass} checks` : `❌ ${fails.length} FAIL of ${pass + fails.length}`} — committal-NO_BID evidentiary bar: a universalDefect mark drives NO_BID ONLY with verification evidence bound to the cited excerpt (Rule 64); unverified/tampered/mixed → NHR + logged breach. Evidence shape (verifierId · excerptHash · affirmation) defined for J-1/J-2 to build into. $0, no engine calls.`);
if (fails.length) { fails.forEach((f) => console.log(`   ✗ ${f}`)); process.exit(1); }
