// ── JUDGMENT-FIRST PATH (Brain cards 276/279) — PROPOSE → rail → DISPOSE ──────────────────────────────
// The pivot the CEO asked for: read the WHOLE solicitation and reason to a verdict + boardroom analysis the way
// pasting it into Claude does, then let the deterministic rail GATE it. This module is the deterministic wiring;
// both model-touching seams are INJECTED so the wiring is $0 unit-testable with stubs and paid-ready with the
// real callers. It adds NO new ladder guards — the rail (`rail` below = deriveVerdict over the proposed grounded
// findings, already enforcing I1–I8) is reused verbatim; this only sequences PROPOSE → rail → DISPOSE.
//
// Flag-gated: AUDIT_JUDGMENT_FIRST (default OFF ⇒ the ladder path is byte-identical). The proposer is PAID; the
// rail + DISPOSE are $0 deterministic.

import type { Verdict, Decision } from "./audit-decide";
import type { TypedFinding, BidderProfile } from "./audit-findings";
import { disposeVerdict, type DisposeResult } from "./audit-dispose";

export function judgmentFirstEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUDIT_JUDGMENT_FIRST === "true";
}

/** What the holistic proposer returns: a top-line verdict + the GROUNDED findings that support it + the boardroom
 *  analysis. The findings are the SAME TypedFinding contract the lenses emit, so the rail consumes them unchanged
 *  (and re-grounds them — a proposed finding whose excerpt isn't verbatim in source never survives, Rule 64/I3). */
export interface ProposedJudgment {
  verdict: Verdict;
  eligible: boolean | null;
  analysis: string;            // the boardroom-grade narrative (the product surface)
  reason: string;              // one-line verdict rationale
  findings: TypedFinding[];    // grounded findings the rail derives over
}

/** The PAID holistic proposer seam — reads the whole assembled source and proposes. Injected (stub in tests). */
export type ProposeFn = (input: JudgmentFirstInput) => Promise<ProposedJudgment>;

/** The deterministic RAIL seam — deriveVerdict over the proposed grounded findings (the full orchestrator rail
 *  pipeline in prod: re-ground → adversarial verify → completeness → deriveVerdict, enforcing I1–I8). Injected so
 *  the wiring is testable; in prod the caller passes the real rail. */
export type RailFn = (findings: TypedFinding[], input: JudgmentFirstInput) => Promise<Decision> | Decision;

export interface JudgmentFirstInput {
  fullSource: string;
  sections?: Record<string, string>;
  bidderProfile?: BidderProfile | null;
  noticeType?: string | null;
  naics?: string | null;
  setAside?: string | null;
}

export interface JudgmentFirstResult {
  disposed: DisposeResult;        // the FINAL verdict the customer sees — the rail's gated reconciliation
  proposed: ProposedJudgment;     // what the model proposed (telemetry / report analysis / proof)
  railDerived: Decision;          // the rail's independent derivation (telemetry / proof)
  analysis: string;               // the boardroom narrative (carried through from the proposer)
}

/** Run the judgment-first path: PROPOSE (holistic, paid) → rail (deterministic, I1–I8) → DISPOSE (gate authority).
 *  The disposed verdict is the customer-facing result; a committal pole survives ONLY on proposer↔rail agreement,
 *  every disagreement falls to honest-fail. Pure orchestration over the two injected seams. */
export async function runJudgmentFirst(input: JudgmentFirstInput, propose: ProposeFn, rail: RailFn): Promise<JudgmentFirstResult> {
  const proposed = await propose(input);
  const railDerived = await rail(proposed.findings, input);
  const disposed = disposeVerdict(
    { verdict: proposed.verdict, eligible: proposed.eligible, reason: proposed.reason },
    { verdict: railDerived.verdict, eligible: railDerived.eligible, reason: railDerived.reason },
  );
  return { disposed, proposed, railDerived, analysis: proposed.analysis };
}
