// ── JUDGMENT-FIRST PROOF-GATE SCORING (Brain card 276, ASYMMETRIC criteria) ───────────────────────────
// Scores a judgment-first (PROPOSE/DISPOSE) verdict against the current ladder baseline per Brain's frozen
// asymmetric proof criteria:
//   • CONSERVATIVE divergence is OK — judgment-first fails safer than the ladder (moves toward honest-fail).
//   • ANY NEW COMMITTAL-DIRECTION divergence is a BLOCKER — a new NO_BID / INELIGIBLE / plain BID where the
//     ladder said caution or honest-fail, an upgrade CAUTION→BID, or a switch to a DIFFERENT committal pole.
//   • HONEST-FAIL PARITY is a HARD GATE — judgment-first must fire an honest-fail (NHR/INCOMPLETE) at least as
//     often as the ladder over the proof set.
// Pure, no model call → $0. Used by the replay proof harness over gold + stress-v2 + W9126G26RA087.

import type { Verdict } from "./audit-decide";

/** Safety rank — higher = safer (commits the customer to less). The honest-fail middle is safest; the three
 *  committal poles are least safe; BID_WITH_CAUTION sits between plain BID and the middle. */
const SAFETY_RANK: Record<Verdict, number> = {
  NEEDS_HUMAN_REVIEW: 3, INCOMPLETE: 3,   // honest-fail middle — commit to nothing
  BID_WITH_CAUTION: 2,                     // biddable but flagged
  BID: 1, NO_BID: 1, INELIGIBLE: 1,        // committal poles
};
const isHonestFail = (v: Verdict): boolean => v === "NEEDS_HUMAN_REVIEW" || v === "INCOMPLETE";
const isPole = (v: Verdict): boolean => SAFETY_RANK[v] === 1;

export type DivergenceClass = "same" | "conservative" | "committal_blocker";

/** Classify one (ladder → judgment-first) verdict pair. */
export function classifyDivergence(ladder: Verdict, judgment: Verdict): DivergenceClass {
  if (ladder === judgment) return "same";
  const lr = SAFETY_RANK[ladder], jr = SAFETY_RANK[judgment];
  // Strictly safer → conservative (allowed). e.g. BID→NHR, BID→CAUTION, NO_BID→NHR.
  if (jr > lr) return "conservative";
  // Strictly less safe → moved toward a committal pole → BLOCKER. e.g. NHR→BID, CAUTION→BID, NHR→NO_BID.
  if (jr < lr) return "committal_blocker";
  // Same rank, different verdict. Only rank-1 poles can differ at equal rank (BID vs NO_BID, NO_BID vs
  // INELIGIBLE) — a NEW committal claim the ladder did not hold → BLOCKER. (Both honest-fail at rank 3 would
  // have matched the "same" or "conservative" branches; NHR vs INCOMPLETE is honest-fail↔honest-fail, treat as
  // conservative-equivalent, never a blocker.)
  if (isPole(ladder) && isPole(judgment)) return "committal_blocker";
  return "conservative"; // honest-fail ↔ honest-fail (NHR↔INCOMPLETE) — not a committal divergence
}

export interface ProofPair { id: string; ladder: Verdict; judgment: Verdict; }
export interface ProofGateResult {
  total: number;
  same: number;
  conservative: number;
  blockers: ProofPair[];                 // committal-direction divergences — ANY is a hard fail
  ladderHonestFails: number;
  judgmentHonestFails: number;
  honestFailParityOk: boolean;           // judgment-first fires honest-fail ≥ as often as the ladder
  pass: boolean;                         // no blockers AND honest-fail parity holds
}

/** Score a full proof set. PASS iff zero committal-direction blockers AND honest-fail parity holds. */
export function summarizeProofGate(pairs: ProofPair[]): ProofGateResult {
  const blockers: ProofPair[] = [];
  let same = 0, conservative = 0, ladderHonestFails = 0, judgmentHonestFails = 0;
  for (const p of pairs) {
    const cls = classifyDivergence(p.ladder, p.judgment);
    if (cls === "same") same++; else if (cls === "conservative") conservative++; else blockers.push(p);
    if (isHonestFail(p.ladder)) ladderHonestFails++;
    if (isHonestFail(p.judgment)) judgmentHonestFails++;
  }
  const honestFailParityOk = judgmentHonestFails >= ladderHonestFails;
  return { total: pairs.length, same, conservative, blockers, ladderHonestFails, judgmentHonestFails, honestFailParityOk, pass: blockers.length === 0 && honestFailParityOk };
}
