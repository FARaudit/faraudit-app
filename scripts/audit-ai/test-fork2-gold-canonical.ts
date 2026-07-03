/** BRAIN CARD 226/227 FORK 2 — CANONICAL gold replay (FROZEN-gold-only; NO untracked ceo/proofs, NO synthetic
 *  keys). Print-only: grade each canonical key deterministically ($0, no engine) so the SAME script can run on
 *  baseline vs the isolated Fork-2 tree to produce the before→after diff.
 *    #2 BID · #4 CAUTION · #6 CAUTION  ← tracked frozen fixtures tests/fixtures/frozen/
 *    #3 INELIGIBLE                      ← the Dillon sole-source bar, real-bound to SPRDL125Q0030.judgment.frozen.json
 *    npx tsx scripts/audit-ai/test-fork2-gold-canonical.ts */
import { readFileSync } from "node:fs";
import { applyTemporalConflict, applyPreconditionOvertypeFloor, applyCautionFloor, deriveVerdict } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

const FROZEN = "tests/fixtures/frozen";
const frozen = (file: string) => (JSON.parse(readFileSync(`${FROZEN}/${file}`, "utf8")).findings as TypedFinding[]).map((f) => ({ ...f, grounded: true }));
const decideFx = (findings: TypedFinding[], profile: BidderProfile | null = null): string => {
  let f = applyTemporalConflict(findings);
  f = applyPreconditionOvertypeFloor(f, { enabled: true });
  f = applyCautionFloor(f, { enabled: true });
  const inp: VerdictInputs = { findings: f, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true };
  return deriveVerdict(inp).verdict;
};

// #3 — the Dillon sole-source bar, real-bound to SPRDL125Q0030.judgment.frozen.json (approved-source mismatch),
// closed-world generic-SB profile that provably is NOT the approved source → firmStatus "fails" → INELIGIBLE.
const dillon: TypedFinding = { requirement: "sole-source to named OEM (Dillon Aero DGMT1002, CAGE 1PN61)", citation: "C.12 x L.6", excerpt: "approved source: Dillon Aero part DGMT1002", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "oem:dillon-approved-source", curableInWindow: false, grounded: true, lens: "gold-key" };

// ── CARD 228 ACCEPTANCE #5 — FULL canonical frozen-gold MEMBERSHIP (key · pole · source path). Read from the
//    registry (single source of truth for liveness) so coverage cannot silently drop a key. N4008526R0065 is a
//    frozen anchor (its enumerator/coverage role lives in tests/fixtures/frozen/n4008-matrix-*.json + the
//    gold-integrity path); its full_verdict pole is graded through that path, not the findings→deriveVerdict
//    replay below, so it appears in the membership table but not the pole-replay rows. ──
const REG = JSON.parse(readFileSync("scripts/audit-ai/gold-sets/gold-set-registry.json", "utf8"));
console.log("═══ CANONICAL FROZEN-GOLD MEMBERSHIP (registry-resolved) ═══");
console.log("key              | pole/type        | source path");
const memberKeys = Object.entries(REG.keys) as Array<[string, { pole?: string; key_type: string; file: string }]>;
for (const [k, v] of memberKeys)
  console.log(`${k.padEnd(16)} | ${(v.pole ?? v.key_type).padEnd(16)} | scripts/audit-ai/gold-sets/${v.file}`);
const hasN4 = memberKeys.some(([k]) => k === "N4008526R0065");
console.log(hasN4
  ? "✓ N4008526R0065 PRESENT — frozen anchor, pole CAUTION, full_verdict; enumerator/coverage role via n4008-matrix-*.json (NOT scoped-out)."
  : "✗ N4008526R0065 ABSENT from the registry — STOP and card back (coverage change needs a ruling).");
console.log("");

const rows: Array<[string, string, string]> = [
  ["#2 1240LP26Q0067", "BID", decideFx(frozen("1240lp-bid.json"))],
  ["#3 SPRDL125Q0030 ", "INELIGIBLE", decideFx([dillon], { satisfiedAttributes: [] })],
  ["#4 AOCSSB26R0023 ", "BID_WITH_CAUTION", decideFx(frozen("aocssb-with-qual.json"))],
  ["#6 FA860126Q0026 ", "BID_WITH_CAUTION", decideFx(frozen("fa8601-complete.json"))],
];
console.log("key                | gold(canonical)  | graded");
let allMatch = hasN4;  // membership must include N4008526R0065 (acceptance #5) — absence is a coverage regression
for (const [k, gold, got] of rows) { const m = gold === got; allMatch = allMatch && m; console.log(`${k} | ${gold.padEnd(16)} | ${got.padEnd(16)} ${m ? "✓" : "✗ REGRESSION"}`); }
console.log(allMatch ? "\n✓ CANONICAL GOLD MATCH — #2 BID · #3 INELIGIBLE · #4/#6 CAUTION, all from FROZEN/tracked sources ($0)." : "\n✗ REGRESSION vs canonical gold");
process.exit(allMatch ? 0 : 1);
