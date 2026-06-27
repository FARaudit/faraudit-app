// ── AGENTIC VERIFICATION ENGINE · Layer-1 contract: TYPED, GROUNDED FINDINGS ───────────────────────
// Brain card 43 (CEO-greenlit re-architecture). The single-shot stochastic panel is RETIRED as a
// decision mechanism. An agentic expert (react loop + tools, built in a later stage) reads the ACTUAL
// source, grounds every claim in a verbatim excerpt, and emits these typed FACTS — it does NOT emit a
// verdict. The verdict + dispositions are DERIVED IN CODE from these facts (audit-decide.ts). This file
// is the seam: it is the only thing the deterministic decision layer reads.
//
// Baseline doctrine (CEO, no exceptions): Anthropic's agentic loop (gather → act-with-tools → verify →
// iterate) is the FLOOR for how the experts are built; the moat is the domain phases on top (planned
// completeness, adversarial convergence, deterministic decision, outcome flywheel). See card 43 / DoD.

/** What KIND of obligation a requirement is — drives disposition + which decision branch it can reach. */
export type RequirementKind =
  | "eligibility_bar"   // a bar to even compete: set-aside category, SAM registration, size standard, a certification the firm must HOLD
  | "technical_spec"    // a spec the offered product/approach must meet
  | "pricing"           // a pricing / CLIN / cost obligation
  | "submission"        // something to submit: form, cert, brochure, sample, page-limit
  | "past_performance"  // a past-performance requirement
  | "clause_flowdown"   // an incorporated clause obligation (FAR/DFARS by reference)
  | "boilerplate"       // routine standard FAR boilerplate (EEO/DEI, standard commercial T&C) — NOT a gate
  | "other";

/** WHO controls satisfaction — the single field that decides gate-to-clear vs disqualifying (Brain card 41).
 *  This is the genuine LLM judgment the expert asserts; the verdict is then a pure function of it. */
export type Controllability =
  | "bidder_controls"     // bidder satisfies it by doing the work (source / price / configure / document) → GATE-TO-CLEAR, never disqualifying
  | "bidder_cannot_move"  // PROFILE-DEPENDENT bar — THIS firm may or may not satisfy it (failed eligibility, a cert/clearance it must HOLD, exclusivity). Disqualifying only if the firm provably fails OR (unknown) it is non-curable; needs requiredAttribute + curableInWindow (Brain card-44)
  | "no_one_can_move"     // UNIVERSAL impossibility — disqualifies EVERY bidder regardless of attribute (e.g. 5-day delivery vs a 90-day irreducible lead time, an already-passed deadline). A proven show-stopper → NO_BID regardless of profile (Brain card-45 typing guard)
  | "already_satisfied";  // structurally true RIGHT NOW (set-aside the firm qualifies under, existing registration/size) → MET

/** One grounded fact an agentic expert produces. Facts only — no verdict, no disposition (that's derived). */
export interface TypedFinding {
  id?: string;                // stable id (assigned by the orchestrator, e.g. "proposal_manager#3") — so a
                              // completeness attestation can CITE the specific findings that ground a section (Brain card-48 guard 3)
  requirement: string;        // the obligation, plain language
  citation: string;           // FAR/DFARS/section reference — must be literally in source (fabrication-gated, Rule 64)
  excerpt: string;            // VERBATIM source span proving it exists (the grounding)
  kind: RequirementKind;
  controllability: Controllability;
  grounded: boolean;          // excerpt verified present in the source (deterministic grounding check)
  lens: string;               // which expert produced it
  requiredAttribute?: string; // for an eligibility bar: the qualification the firm must HOLD (NAICS-small code, cert) — matched against the bidder profile
  // CURABILITY (Brain card-44 §2) — a property of the GATE, independent of the bidder profile: can a firm
  // that lacks the requiredAttribute obtain/satisfy it WITHIN the solicitation's response window?
  //   false → structural / non-curable (facility clearance lead-time > window, QPL listing, special tooling
  //           cert that can't be earned in time) → cannot be soft-cautioned; routes to human review / NO_BID.
  //   true  → curable in-window (a registration/cert obtainable in time) → a genuine residual caution.
  //   undefined on a bidder_cannot_move / eligibility bar → UNTYPED → the decision FAILS CLOSED to human
  //   review (never a silent caution). REQUIRED for every disqualifying bar.
  curableInWindow?: boolean;
  severity?: "P0" | "P1" | "P2"; // for a residual RISK (not a hard requirement) — its materiality
}

/** KNOWN firm attributes. null = unknown → a bidder_cannot_move bar CANNOT be proven failed → caution,
 *  never INELIGIBLE (the standing facts-vs-analysis / no-blind-INELIGIBLE doctrine). */
export interface BidderProfile {
  satisfiedAttributes: string[]; // qualifications the firm HOLDS (NAICS-small codes, certs, clearances) — matched against requiredAttribute
}

/** Everything the deterministic decision layer reads. Each field is a FACT (LLM-asserted, grounded) or a
 *  deterministic engine signal (coverage/verification) — never a sampled verdict. */
export interface VerdictInputs {
  findings: TypedFinding[];
  bidderProfile: BidderProfile | null;
  coverageComplete: boolean; // P4: every section / incorporated clause / obligation in the manifest was read + grounded
  verifierSound: boolean;    // P2/P3: adversarial verification succeeded (findings are trustworthy)
  conflict: boolean;         // an unresolved MATERIAL conflict between experts the loop could not reconcile
}
