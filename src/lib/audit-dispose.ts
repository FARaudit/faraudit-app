// ── PROPOSE / DISPOSE RECONCILIATION (Brain cards 276 + 279) ──────────────────────────────────────────
// The judgment-first pivot: the judgment layer PROPOSES a verdict (whole-doc, grounded, panel-checked); the
// deterministic rail DISPOSES. The rail = `deriveVerdict` over the SAME grounded findings the proposer produced —
// it already enforces the eight frozen invariants I1–I8 internally (four-walls NO_BID, honest-fail gate, Rule 64
// grounding, materially-empty→NHR, structural cert bars, ratchet, downgrade-only, open-world INELIGIBLE bar).
//
// disposeVerdict() adds the GATE-AUTHORITY reconciliation on top of that rail derivation:
//   • The rail may CONFIRM a committal verdict (BID, BID_WITH_CAUTION, NO_BID, INELIGIBLE) ONLY when the model's
//     PROPOSAL and the rail's INDEPENDENT derivation agree on it. Agreement is the sole path to a committal pole.
//   • The rail may DOWNGRADE toward the honest-fail middle (NEEDS_HUMAN_REVIEW / INCOMPLETE).
//   • The rail may NEVER fabricate or UPGRADE — a disagreement can never produce a committal verdict the two did
//     not jointly hold. Per I7 (card 279) BOTH poles are unsafe: NHR/CAUTION never becomes plain BID, CAUTION
//     never becomes NO_BID, silence never becomes INELIGIBLE.
// The model can never force a committal verdict past the rail: it can only supply findings + a proposed verdict;
// the rail's independent derivation gates it. Pure → $0 gate-testable, no model call.

import type { Verdict, Decision } from "./audit-decide";

/** A committal verdict commits the customer to an action (bid / walk away). The honest-fail middle
 *  (NEEDS_HUMAN_REVIEW, INCOMPLETE) commits to nothing — it is the SAFE zone both poles fall back to. */
const POSITIVE_COMMITTAL: ReadonlySet<Verdict> = new Set<Verdict>(["BID", "BID_WITH_CAUTION"]);
const NEGATIVE_COMMITTAL: ReadonlySet<Verdict> = new Set<Verdict>(["NO_BID", "INELIGIBLE"]);
export const isCommittal = (v: Verdict): boolean => POSITIVE_COMMITTAL.has(v) || NEGATIVE_COMMITTAL.has(v);

export type DispositionOutcome = "confirmed" | "downgraded" | "conflict_nhr" | "incomplete";
export interface DisposeResult {
  verdict: Verdict;
  eligible: boolean | null;   // never false on an undetermined verdict (doctrine #6)
  reason: string;
  outcome: DispositionOutcome;
  proposed: Verdict;          // what the judgment layer proposed (telemetry / proof)
  railDerived: Verdict;       // what the deterministic rail independently derived (telemetry / proof)
}

/** Reconcile the model's PROPOSED verdict against the rail's INDEPENDENT derivation. `railDerived` MUST be the
 *  output of deriveVerdict over the grounded proposed findings (so I1–I8 are already enforced within it). */
export function disposeVerdict(
  proposed: Pick<Decision, "verdict" | "eligible" | "reason">,
  railDerived: Pick<Decision, "verdict" | "eligible" | "reason">,
): DisposeResult {
  const p = proposed.verdict, r = railDerived.verdict;
  const base = { proposed: p, railDerived: r };

  // 1. AGREEMENT — the sole path to a committal pole. The rail already confirmed r under I1–I8, and the proposer
  //    independently reached the same verdict → confirm it, carrying the rail's determination. eligible is clamped
  //    to null on a NON-committal verdict (NHR/INCOMPLETE): doctrine #6 — an undetermined verdict may never carry
  //    eligible=false. (Defense-in-depth beneath deriveVerdict; a rail that ever returned NHR+false can't leak it.)
  if (p === r) {
    return { verdict: r, eligible: isCommittal(r) ? railDerived.eligible : null, reason: railDerived.reason, outcome: "confirmed", ...base };
  }

  // 2. INCOMPLETE dominates. An incomplete read (ingest could not be completed) can never carry a confirmed
  //    verdict of any kind — honest-fail, no charge. Fires if EITHER side saw incompleteness.
  if (p === "INCOMPLETE" || r === "INCOMPLETE") {
    return { verdict: "INCOMPLETE", eligible: null, reason: `DISPOSE: incomplete read dominates (proposed ${p} · rail ${r}) — cannot confirm any verdict on an incomplete audit.`, outcome: "incomplete", ...base };
  }

  // 3. BOTH biddable but DIFFERING (BID vs BID_WITH_CAUTION) — the two agree it is biddable, disagree only on
  //    whether a caution attaches. Keep the CAUTION (a downgrade from clean BID; the rail may never upgrade
  //    CAUTION→BID). This is the only "created" verdict, and it is strictly safer than plain BID.
  if (POSITIVE_COMMITTAL.has(p) && POSITIVE_COMMITTAL.has(r)) {
    // eligible carries through from the RAIL (Guard 1) — the rail is the eligibility AUTHORITY here, exactly as the
    // agreement branch above (line 49) trusts railDerived.eligible and ignores the proposer's. `r` is positive-committal
    // so railDerived.eligible is `true | null` (never false). This propagates the rail's null-profile set-aside clamp
    // (eligible=null) WITHOUT re-asserting a clean eligible=true, and — unlike keying on proposed.eligible — never
    // spuriously downgrades a rail-VERIFIED eligible=true just because the proposer omitted its (optional) eligible
    // field. Previously hardcoded `true`, which defeated the clamp. (Adversarial-review card: proposer eligible is
    // routinely null via `parsed.eligible ?? null`, so keying on it broke flag-OFF byte-identity + verified firms.)
    return { verdict: "BID_WITH_CAUTION", eligible: railDerived.eligible, reason: `DISPOSE: proposer(${p}) and rail(${r}) agree biddable but differ on caution → BID_WITH_CAUTION (keep the caution; never upgrade to clean BID).`, outcome: "downgraded", ...base };
  }

  // 4. ANY OTHER DISAGREEMENT → NEEDS_HUMAN_REVIEW. Covers: safe-vs-committal (rail did not confirm the model's
  //    committal, or vice-versa), positive-vs-negative (hard conflict), and negative-side mismatch (NO_BID vs
  //    INELIGIBLE — different committal claims not jointly confirmed). Never fabricate a committal the two did
  //    not agree on; the safe zone is NHR. (INCOMPLETE already handled above.)
  return { verdict: "NEEDS_HUMAN_REVIEW", eligible: null, reason: `DISPOSE: proposer(${p}) and rail(${r}) disagree across the committal boundary → NEEDS_HUMAN_REVIEW (a committal verdict is emitted only on agreement; the rail never forces or fabricates one).`, outcome: "conflict_nhr", ...base };
}
