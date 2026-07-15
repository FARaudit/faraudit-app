// PANEL WIRING ARC (card #523, P2a) — the BRIDGE: VERIFIED panel findings → TypedFinding[].
//
// Architecture of record (permanent, recon #523): the panel is a FINDINGS PRODUCER, not a decider. Its
// lenses raise claims, the adversarial verifier 3-states each (VERIFIED / UNVERIFIABLE / REFUTED), and
// ONLY the VERIFIED facts cross this seam into `VerdictInputs.findings`. `deriveVerdict` stays the SOLE
// verdict authority and the LAST step — this module produces no verdict, no disposition, no pole; it only
// TYPES grounded facts the way every other producer (candidate-a, the lossless sweep) does.
//
// TWO honesty invariants this seam enforces (Brain doctrine, no exceptions):
//   • 2b — UNVERIFIABLE / REFUTED claims NEVER become facts. They may still feed the chief-judge narrative
//     (that happens in the runner), but they carry NO verdict weight here. Only VERIFIED crosses.
//   • NO BLIND BAR — a VERIFIED *unmet* hard gate is a real bar the panel confirmed, but the panel cannot
//     prove it is universal (no_one_can_move) or that THIS firm fails it (profile check). So it FAILS CLOSED
//     to human review: `bidder_cannot_move` with `curableInWindow` UNDEFINED, which deriveVerdict routes to
//     NEEDS_HUMAN_REVIEW (never a silent caution, never a blind INELIGIBLE/NO_BID). A committal NO_BID still
//     requires the positively-marked universalDefect + verifiedBy shape, which this seam does NOT synthesize.
//
// Pure & deterministic → $0 gate-testable / bankable (a proof driver can replay it without a paid call).
//
// ⚠ TYPING MAP = a Brain-bound semantic (who gets barred). The choices below are the CONSERVATIVE fail-safe;
// they are a REVIEW POINT for the pre-arm Gauntlet + Brain ruling, not a Code-final decision.
import type { TypedFinding } from "./audit-findings";
import type { PanelistOutput } from "./agentic-panel-runner";

export type VerifierState = "VERIFIED" | "UNVERIFIABLE" | "REFUTED";

export interface PanelStructuredInput {
  /** the panelists exactly as runPanelJudge holds them (structured output, null on lens failure). */
  panelists: Array<{ key: string; name: string; output: PanelistOutput | null }>;
  /** ref → verifier verdict, keyed "<lensKey>:G<n>" / "<lensKey>:R<n>" (the same ref scheme the runner
   *  builds its claims with). A ref absent from the map defaults to UNVERIFIABLE → excluded. */
  stateByRef: Map<string, { state: VerifierState; evidence: string }>;
}

/** P2a — map the panel's VERIFIED structured findings to grounded TypedFindings for `VerdictInputs.findings`.
 *  Pure. Emits ONLY VERIFIED facts (2b); an unmet hard gate fails closed to NHR (no blind bar). */
export function panelFindingsToTyped(inp: PanelStructuredInput): TypedFinding[] {
  const findings: TypedFinding[] = [];
  for (const p of inp.panelists) {
    if (!p.output) continue; // a failed lens produced no facts — coverage-honest, never assume clear

    // ── named hard gates (the lens's strongest signal) ──────────────────────────
    (p.output.named_hard_gates ?? []).forEach((g, i) => {
      const ref = `${p.key}:G${i + 1}`;
      if ((inp.stateByRef.get(ref)?.state ?? "UNVERIFIABLE") !== "VERIFIED") return; // 2b — only VERIFIED cross
      const excerpt = (g.excerpt ?? "").trim();
      if (!excerpt) return; // a VERIFIED gate without its grounding span is not a fact we can stand behind
      findings.push({
        id: `panel:${ref}`,
        requirement: g.gate,
        citation: g.citation ?? "",
        excerpt,
        // A named hard gate is eligibility-class. MET → structurally satisfied now (already_satisfied, non-
        // blocking). UNMET + VERIFIED → a confirmed bar, but the panel cannot certify universality or a profile
        // failure → FAIL CLOSED: bidder_cannot_move + curableInWindow UNDEFINED ⇒ deriveVerdict → NHR.
        kind: "eligibility_bar",
        controllability: g.met ? "already_satisfied" : "bidder_cannot_move",
        grounded: true, // VERIFIED ⇒ the excerpt passed the runner's structural grounding pre-filter
        lens: p.name,
        // curableInWindow deliberately LEFT UNDEFINED on the unmet-gate branch — that undefined IS the
        // fail-closed-to-NHR signal (audit-findings.ts curableInWindow contract). Do not default it.
      });
    });

    // ── residual risks (advisory materiality — NEVER a bar) ─────────────────────
    (p.output.risks ?? []).forEach((r, i) => {
      const ref = `${p.key}:R${i + 1}`;
      if ((inp.stateByRef.get(ref)?.state ?? "UNVERIFIABLE") !== "VERIFIED") return; // 2b
      const excerpt = (r.excerpt ?? "").trim();
      if (!excerpt) return;
      findings.push({
        id: `panel:${ref}`,
        requirement: r.risk,
        citation: r.citation ?? "",
        excerpt,
        // A residual risk is a do-the-work materiality, never an eligibility bar → bidder_controls (gate-to-
        // clear, can never be disqualifying). Severity carries its materiality to the report / caution floor.
        kind: "other",
        controllability: "bidder_controls",
        grounded: true,
        lens: p.name,
        severity: r.severity,
      });
    });
  }
  return findings;
}
