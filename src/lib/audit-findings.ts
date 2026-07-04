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
  | "procedural_obligation" // Part-12 §L/§M submission-mechanics + evaluation-methodology obligation, grounded by the
                            // procedural-coverage pass (card 208-B). COVERAGE-ONLY: always bidder_controls, never a bar/
                            // showstopper, never an eligibility gate — invisible to the verdict + the 206-A eligibility logic.
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
  // BRAIN CARD 226 FORK 2 — POSITIVE universal-defect classification. A committal NO_BID is reachable ONLY when
  // a finding is positively marked here: the solicitation is internally CONTRADICTORY, or literally UNMEETABLE
  // by ANY offeror. Absent/undefined ⇒ the finding is WHO-CAN-WIN (or curable) and can NEVER drive NO_BID
  // (default-deny). No producer emits this yet — it is the hook a future universal-defect detector sets.
  universalDefect?: "contradictory_mandatory_terms" | "unmeetable_by_any_offeror";
  // BRAIN CARD 240 FORK 5 — VERIFICATION EVIDENCE for a committal NO_BID. A `universalDefect` mark drives NO_BID
  // ONLY when it also carries this record: a verifier affirmed the defect FOLLOWS from the cited excerpt against
  // document truth (Rule 64 — never a model prior). `excerptHash` = sha256(excerpt) binds the affirmation to the
  // grounded source span, so a mark cannot rest on fabricated text. Absent (or a hash that doesn't match the
  // excerpt) ⇒ the mark is UNVERIFIED and can NEVER reach NO_BID → NHR + logged invariant breach. No producer
  // emits this yet — it is the shape J-1/J-2 (the judgment/verifier layer) builds INTO.
  verifiedBy?: {
    verifierId: string;    // the verifier that affirmed the defect (e.g. "adversarial-verifier@v3")
    excerptHash: string;   // sha256(excerpt) — binds the affirmation to the grounded source span
    affirmation: string;   // the affirmation that the defect follows from the cited excerpt
  };
  severity?: "P0" | "P1" | "P2"; // for a residual RISK (not a hard requirement) — its materiality
  // CAUTION-FLOOR (Brain card 75-R2 / 78-R1) — set by the deterministic caution-floor pass (default-off
  // flag) when a finding matches a caution archetype (named role + quantified experience-years, specialized
  // professional cert/license of performing personnel, QPL/QML membership, or an "or-equal" burden). It
  // FLOORS the verdict to BID_WITH_CAUTION minimum in deriveVerdict WITHOUT re-typing the finding into a
  // profile-checked bar — so it can never create a show-stopper (never upgrades to INELIGIBLE) and, being
  // checked only after the disqualifying/human-review branches, never downgrades a NO_BID/INELIGIBLE.
  cautionFloor?: boolean;
  // GROUNDING SWEEP (Brain card 81 Step 1) — set when a finding was grounded by the deterministic
  // high-signal sweep (not a lens). Tags the archetype (personnel_qual | fat_precondition |
  // delivery_window | qpl | or_equal) so Step 2 (cross-clause temporal-conflict check) can consume the
  // FAT + delivery findings deterministically.
  sweepArchetype?: string;
  // PRECONDITION OVER-TYPE FLOOR (Brain card 92) — set when the deterministic guard re-typed a
  // time-curable precondition (FAT/source-approval/qualification-testing) that a lens had mis-typed
  // no_one_can_move with NO co-stated window conflict → bidder_controls (so a feasible precondition is
  // not a false universal bar). Marker only; deriveVerdict reads controllability, not this field.
  preconditionOvertypeFloored?: boolean;
  // AWARD-BASIS OVER-TYPE GUARD (Brain card 108) — set when the deterministic guard either (a) re-typed an
  // award-basis / evaluation-methodology / source-selection finding mis-typed no_one_can_move → bidder_controls
  // (the award basis is never a universal bar — a false NO_BID), or (b) marked a SPECIFIC socioeconomic
  // set-aside (8(a)/HUBZone/SDVOSB/WOSB) under a NULL profile as cautionFloor (verify-eligibility caution, not
  // an assumed already_satisfied). Marker only; deriveVerdict reads controllability/cautionFloor, not this field.
  awardBasisGuard?: boolean;
  // STRUCTURAL-BAR WHITELIST (Brain card 114) — set when the deterministic guard downgraded a non-curable
  // bidder_cannot_move finding under a NULL profile that is NOT a recognized genuine structural impossibility
  // (a bidder-resolvable compliance / representation / clarification — size-standard, OCI, reps&certs,
  // registration) → bidder_controls + cautionFloor. Marker only.
  structuralWhitelistGuard?: boolean;
  // KNOWN-CLAUSE SEMANTICS GUARD (Brain card 135, Step 5a) — set when the deterministic clause→disposition map
  // re-typed a finding mis-typed as a bar for a clause whose legal meaning is settled (52.204-7 SAM = curable
  // caution; 52.246-15 Certificate of Conformance = non-blocking). Keyed on the finding's own grounded `citation`
  // field (exact clause-number match), CAP-ONLY. Marker only; deriveVerdict reads controllability/cautionFloor.
  clauseSemanticsGuard?: boolean;
  // OR-EQUAL CARVE-OUT (Brain card 139, Step 6) — set when the deterministic carve-out re-typed a "brand name OR
  // EQUAL" / salient-characteristics finding (mis-typed a structural bar via bare "brand name") → bidder_controls
  // + cautionFloor (furnish an approved equal). NEVER fires when a restrictive qualifier (only / no substitution /
  // sole source) is co-stated. Marker only; deriveVerdict reads controllability/cautionFloor.
  orEqualCarveout?: boolean;
  nmrGuard?: boolean; // FORK-7 (Brain card 240) — set when the NMR firm-status gate re-typed this finding onto the who-can-win path (marker only; deriveVerdict reads controllability/kind).
  // TEMPORAL SHARED-ARO / SEQUENTIAL-GATE NARROWING (Brain card 140, Step 7) — set on the FAT precondition
  // finding when the Step-2 universal-impossibility (no_one_can_move → NO_BID) was DECLINED under the Option-B
  // four-prong gate and the finding was floored to a KO-clarify caution instead (cautionFloor) — i.e. a temporal
  // tension is present (FAT precondition + delivery window grounded) but it is NOT a proven order-referenced
  // sequential gate. Marker only; deriveVerdict reads controllability/cautionFloor, not this field.
  temporalSharedAroGuard?: boolean;
  // TEMPORAL EVIDENCE (Brain card 226 Fork-1) — the parsed arithmetic behind a temporal KO-clarify CAUTION,
  // surfaced as a structured field so the human adjudicates the FAT-gate-vs-window tension from the numbers, not
  // prose. Populated on BOTH temporal outputs: the fired four-prong caution (all prongs hold) AND the soft-floor
  // FAT finding (tension present but not proven) — gate duration (days, post-order-anchored), delivery window
  // (days, order-anchored), and whether the gate provably exceeds the window. The temporal arm NEVER emits NO_BID.
  temporalEvidence?: { gateDays: number | null; windowDays: number | null; gateExceedsWindow: boolean };
}

/** KNOWN firm attributes. null = unknown → a bidder_cannot_move bar CANNOT be proven failed → caution,
 *  never INELIGIBLE (the standing facts-vs-analysis / no-blind-INELIGIBLE doctrine). */
export interface BidderProfile {
  satisfiedAttributes: string[]; // qualifications the firm HOLDS (NAICS-small codes, certs, clearances) — matched against requiredAttribute
  // OPEN-WORLD profile (limit N5). A self-asserted, possibly-incomplete profile (e.g. a
  // capability statement): a HELD attribute may CLEAR a bar, but a not-listed attribute is
  // NOT proof the firm fails — it may simply be unstated → "unknown" (caution / human
  // review), NEVER a false INELIGIBLE. Default/absent = false = CLOSED-WORLD trusted
  // profile (the gold path), where a not-held attribute IS proof of failure.
  openWorld?: boolean;
}

/** Everything the deterministic decision layer reads. Each field is a FACT (LLM-asserted, grounded) or a
 *  deterministic engine signal (coverage/verification) — never a sampled verdict. */
export interface VerdictInputs {
  findings: TypedFinding[];
  bidderProfile: BidderProfile | null;
  coverageComplete: boolean; // P4: every section / incorporated clause / obligation in the manifest was read + grounded
  verifierSound: boolean;    // P2/P3: adversarial verification succeeded (findings are trustworthy)
  conflict: boolean;         // an unresolved MATERIAL conflict between experts the loop could not reconcile
  // Brain card-58 ASYMMETRY: a "no-bar" verdict (BID/CAUTION) is only valid if the read was COMPLETE. When a
  // manifest-named attachment went unfetched, a clean verdict is the §C content-loss failure wearing a clean
  // label → cap BID/CAUTION to INCOMPLETE. INELIGIBLE/NO_BID are NOT capped (a real bar can't be un-found by
  // adding documents). Default true (complete) when not supplied.
  manifestComplete?: boolean;
  // C-1 (Brain C.e) — the SINGLE document-completeness truth, computed ONCE in the executor
  // (agenticManifestComplete: truncation + manifest reconciliation + binding-content-loss) and threaded here so
  // the VERDICT caps on the same signal the export gate + persisted payload read (no dual-axis drift). false ⇒
  // the engine could not confirm it read every posted binding document ⇒ INCOMPLETE, even over a committal pole
  // (an unread binding doc could carry OR waive a bar — you cannot certify any verdict on a partial read).
  // Default undefined ⇒ no cap (unchanged), so callers that don't supply it stay byte-identical.
  documentsComplete?: boolean;
}
