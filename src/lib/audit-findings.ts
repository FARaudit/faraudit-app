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
  // VERIFIER RESIDUE (Brain card 285, Fix 1) — set true when the adversarial skeptic could NOT reach this finding
  // after batching + retries AND it is NON-verdict-driving (informational: not bar-class, not knife-edge). Such a
  // finding is kept (never silently dropped — Brain's forbidden fail-safe) but EXCLUDED from report claims and does
  // NOT sink run soundness. An UNRESOLVED VERDICT-DRIVING finding is never marked unverified — it forces NHR instead.
  unverified?: boolean;
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
  // ROUTINE-CLAUSE OVER-TYPE GUARD (Guard 2) — set when the deterministic guard re-typed a ROUTINE federal clause
  // the proposer mis-typed as a bar: an Availability-of-Funds contingency (52.232-18/-19) mis-typed no_one_can_move
  // → bidder_controls (a routine appropriations contingency present in almost every solicitation is NOT a universal
  // impossibility), or a bonding requirement (52.228-1/-15/-16 / bid guarantee / perf & payment bond) mis-typed
  // bidder_cannot_move → bidder_controls (the bidder OBTAINS the bond — a do-the-work gate, never a profile bar).
  // Marker only; deriveVerdict reads controllability, not this field.
  routineClauseGuard?: boolean;
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
  checkboxCorrected?: boolean; // Phase 3 Unit 3 (Brain #551) — set when the checkbox-state fidelity gate corrected a fabricated ☒/checked framing to the true ☐/unchecked matrix state (provenance-only; the obligation + severity are KEPT).
  structuralAssertionCorrected?: boolean; // Phase 3 Unit 4 (Brain #551 boundary) — set when the structural-assertion fidelity gate corrected a finding that attributed a clause/obligation to a SECTION heading absent from the ingested source (e.g. cited "Section I" when the source has no Section I). Provenance-only, VERDICT-INERT: kind/controllability/severity/excerpt are KEPT; only the fabricated structural provenance is caveated so it cannot reach render as verified truth.
  quantityAmbiguityFlagged?: boolean; // Phase 3 Unit 5 — set on a caution finding EMITTED by the quantity-ambiguity fidelity gate when the source poses an explicit, unresolved either/or quantity question (e.g. "Is the total requirement 520 hours or 1,040 hours?"). Additive + non-destructive + cautionFloor (BID_WITH_CAUTION minimum, never a bar); surfaces a material level-of-effort/pricing ambiguity a lens may have laundered into a single confident number.
  perfObligationGuard?: boolean; // Phase 3 Unit 1 — set when the perf-obligation insurance gate re-typed an insurance do-the-work obligation mis-typed bidder_cannot_move → bidder_controls + curable (insurance is self-acquirable, like a bond). Marker only; deriveVerdict reads controllability/curableInWindow.
  findingDedupMerged?: boolean; // Phase 3 Unit 6 — set on the SURVIVOR of a same-clause dedup (two/three concatenated-panel rows for one FAR/DFARS clause collapsed into one). The survivor keeps the MOST-CONSERVATIVE disposition of the group (controllability most-disqualifying, severity=max, curability least, cautionFloor OR) and PRESERVES every distinct requirement facet. Verdict-safe by construction (show-stopper set + logicalShowStopperCount unchanged); deriveVerdict reads controllability/severity, not this marker.
  mergedLensCount?: number;     // Phase 3 Unit 6 — how many lens rows the dedup survivor absorbed (telemetry/render "N lenses concur").
  mergedClause?: string;        // Phase 3 Unit 6 — the FAR/DFARS clause number the dedup grouped on (e.g. "52.217-8").
  crossFleetMerged?: boolean;   // Phase 3 Unit 6 follow-on — set on the SURVIVOR of a same-DATE cross-fleet dedup (the no-clause deadline analogue of findingDedupMerged: plain rows restating one dated deadline across the two paraphrasing panels collapsed into one). Verdict-safe by construction (plain-only + protected-passthrough; survivor is plain); facets preserved. deriveVerdict reads controllability/severity, not this marker.
  mergedDateSig?: string;       // Phase 3 Unit 6 follow-on — the normalized calendar-date signature (YYYY-MM-DD, pipe-joined) the cross-fleet dedup grouped on (e.g. "2026-07-22").
  // ELIGIBILITY-AUTHORITY ALLOW-LIST (Brain card 329) — set when the deterministic allow-list re-typed a hard
  // eligibility/`no_one_can_move` show-stopper whose cited clause is NOT in an enumerated bidder-eligibility / size /
  // set-aside authority (FAR 19 / 52.219-x / 13 CFR 121-128 / 52.204-8 / 52.212-3 / 52.209) → bidder_controls +
  // cautionFloor. Kills the fabricated-WTO/TAA/publicizing-disqualifier class at the taxonomy level: a bidder-directed
  // eligibility bar is VALID only when grounded in a genuine eligibility authority (allow-by-authority, not a Part-25/
  // Part-5 block-list). NEVER fires on a genuine structural bar (clearance/QPL/sole-source), a positive set-aside, a
  // temporal/delivery impossibility, or a verified universal defect — all preserved. Marker only; deriveVerdict reads
  // controllability/cautionFloor, not this field.
  eligibilityAuthorityGuard?: boolean;
  // §M EVIDENCE-FACTOR DEMOTION (Brain card #538 · flag AUDIT_MM_EVIDENCE_FACTOR_DEMOTION, default-OFF) — set when a
  // §M evaluation/technical criterion whose substance is EVIDENCED INSIDE THE SUBMITTED QUOTE (capability statement /
  // past-performance / prior-experience narrative) was re-typed from a would-be non-curable bar to a curable
  // competitive caution (bidder_controls + curableInWindow + cautionFloor). NEVER fires on a coupled true bar
  // (clearance/QPL/ITAR/holder-only), possession-at-offer, or who-may-bid ambiguity (those escalate).
  // LOAD-BEARING on ONE filter (ultra #240 Finding B): the tristate unverifiedGates filter in audit-decide.ts
  // excludes demoted findings on this marker (their kind/requiredAttribute survive the demote, so without it a
  // demoted factor still clamps eligible=null). Verdict routing still reads controllability/cautionFloor/curableInWindow.
  mmEvidenceFactor?: boolean;
  scopeReconciledDemoted?: boolean; // Repair item C (Brain #703/#707, flag AUDIT_SCOPE_OPACITY_RECONCILE) — set when a "scope opacity / no SOW/spec/drawings visible" P0 gate finding was demoted to a P2 attribute/caveat because the document set proved a SOW/spec/drawings attachment WAS read (the ATT10 contradiction). Provenance/telemetry only; deriveVerdict reads severity, not this marker.
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
  // INQUIRY-DEADLINE BENIGN GUARD (Brain card 520, R1) — set when the SHAPE allowlist re-typed a benign
  // information-exchange milestone (a questions/inquiries/RFI-submission window or a Q&A answer-posting date)
  // that a lens mis-typed no_one_can_move → bidder_controls (a routine schedule fact that does NOT gate offer
  // submission or award eligibility). NEVER fires on a participation-prerequisite deadline (mandatory site
  // visit / conference registration, vehicle/BOA enrollment) or a real offer-submission deadline — those stay
  // universal-path candidates. Marker only; deriveVerdict reads controllability, not this field.
  inquiryDeadlineGuard?: boolean;
}

/** KNOWN firm attributes. null = unknown → a bidder_cannot_move bar CANNOT be proven failed → caution,
 *  never INELIGIBLE (the standing facts-vs-analysis / no-blind-INELIGIBLE doctrine). */
export interface BidderProfile {
  satisfiedAttributes: string[]; // qualifications the firm HOLDS (NAICS-small codes, certs, clearances) — matched against requiredAttribute
  // WORLD-ASSUMPTION (Brain card-254 B ruling, 2026-07-04 — FAIL-SAFE DEFAULT FLIP). The DEFAULT (both flags
  // absent) is now OPEN-WORLD: a self-asserted, possibly-incomplete profile where a HELD attribute may CLEAR a
  // bar, but a not-listed attribute is NOT proof the firm fails — it is merely unstated → "unknown" (NHR / human
  // review), NEVER a false INELIGIBLE. CLOSED-WORLD (a trusted/complete profile where a not-held attribute IS
  // proof of failure → INELIGIBLE) is now an EXPLICIT opt-in via `closedWorld:true`, so no profile source can
  // silently arm mass false-INELIGIBLE by omitting a flag. The live builder is open-world (unchanged).
  closedWorld?: boolean;         // explicit opt-in: trusted/complete profile → a not-held attribute is proven-fail
  openWorld?: boolean;           // DEPRECATED (superseded by the open-world default + closedWorld); retained for construction-compat, no longer read
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
  // B3 (Brain card 421 Fork-3) — an UNGROUNDED hard bidder-eligibility / disqualifier bar in the SAM notice body
  // (mandatory site visit / set-aside / clearance) that the attachment-scoped coverage floor never saw. Its OWN gate
  // (not the coverageComplete veto) so it SURVIVES the GATE_V2 remap — a coverageV2 'no-cap' must not wave a real
  // notice-body bar through. Fail-toward-disqualifier → NEEDS_HUMAN_REVIEW, never a committal. Default undefined ⇒ no
  // gate (unchanged); the flag-OFF orchestrator never sets it ⇒ byte-identical.
  noticeBodyBarUngrounded?: boolean;
  // B3-SEVERITY (Brain card 429, flag AUDIT_SITEVISIT_SEVERITY_FLOOR) — when the notice-body eligibility floor
  // routes to NHR, SURFACE any grounded site-visit/eligibility disqualifier sitting in dispositions[] as a
  // bid-deciding showStopper (severity→P0) instead of a P2 advisory. Consumed ONLY inside the noticeBodyBarUngrounded
  // branch (the coherent pole). Default undefined ⇒ that branch passes [] exactly as before ⇒ byte-identical.
  siteVisitSeverityFloor?: boolean;
  // Brain card #320 ruling — an INCOMPLETE verdict must NAME the gap (which doc/section could not be confirmed
  // read/grounded), never a generic "coverage not complete". Populated by the orchestrator from the deterministic
  // signals (uncovered docs + missing binding sections). Optional/absent ⇒ reasons render as before (byte-identical
  // for pure-unit callers). Consumed ONLY to enrich the honest-fail reason strings — never affects the verdict.
  coverageGap?: string;
  // Brain card 284 / I8 — the assembled source, threaded so `firmStatus` can GROUND a closed-world INELIGIBLE bar
  // (an ungrounded/model-named requiredAttribute → NHR, never a false INELIGIBLE). Default undefined ⇒ the grounding
  // gate is SKIPPED (pure-unit callers stay byte-identical); the orchestrator always supplies ctx.fullSource.
  source?: string;
  // GUARD 1 (card 206-A generalized) — a DETERMINISTIC "eligibility cannot be verified" signal sourced from the
  // SEALED construction manifest (a set-aside/socioeconomic element detected in source) under a NULL bidder profile,
  // computed in the orchestrator INDEPENDENT of how the proposer typed its findings. When true (and the tristate is
  // ON), a committal verdict forces eligible=null + a mandatory verify-caution — the engine never asserts a firm is
  // eligible for a set-aside it detected but could not verify, even if the proposer failed to emit a properly-typed
  // eligibility_bar finding. Default undefined ⇒ byte-identical (no clamp); flag-gated at the orchestrator.
  detectedUnverifiableEligibilityGate?: boolean;
  // GATE V2 (AUDIT_GATE_V2, default OFF — ceo/ENGINE-ARCHITECTURE-RESEARCH) — the completeness-gate rewrite's
  // coverage signal, computed in the orchestrator from the section attestations (audit-gate-v2.gradeCoverageV2).
  // When supplied AND the flag is on, deriveVerdict replaces the blanket `!coverageComplete → INCOMPLETE` veto
  // with: INCOMPLETE only on genuine UNREADABILITY, a genuinely-uncovered DISQUALIFIER → NHR, else NO cap
  // (ungrounded boilerplate no longer forces false-INCOMPLETE). Default undefined ⇒ byte-identical (V1 unchanged).
  coverageV2?: { unreadable: string[]; ungroundedRead: string[]; disqualifierUncovered: Array<{ section: string; obligation: string }>; ungroundedNonBarSignal?: Array<{ section: string; obligation: string }>; coverageGrade: number };
  // AMENDMENT A (Brain card-304, F bake-off) — Candidate A (LLM-native judgment) may emit citation-grounded signals of
  // unread/missing material it OBSERVES that the deterministic manifest gate did not catch (e.g. a referenced attachment
  // absent from the input). It carries NO verdict authority: deriveVerdict treats it as manifest-ADJACENT →
  // NEEDS_HUMAN_REVIEW, never a committal verdict over unseen material. Absent/empty ⇒ byte-identical (no effect).
  unreadEvidence?: Array<{ citation: string; note: string }>;
  // Brain #332 — SAM-vs-DOCUMENT set-aside CONFLICT (source-of-truth defect). SAM is the system of record for the
  // set-aside PROGRAM; the doc-grounded findings carry the incorporated set-aside clause. When they name DIFFERENT
  // eligibility programs (live root: SAM=HUBZone `HZC` vs a 52.219-6 Total-Small-Business clause in the doc), adopting
  // EITHER silently INVERTS who is eligible (an ineligible firm bids, OR an eligible firm walks) — a zero-contract-loss
  // failure in both directions. When present this DOMINATES the verdict → NEEDS_HUMAN_REVIEW naming BOTH values for CO
  // clarification; the engine never silently picks a pool (Rule 64: a conflict this material must surface, not be
  // resolved by fiat). Computed in the orchestrator (flag-gated AUDIT_SETASIDE_CONFLICT_GATE); absent ⇒ byte-identical.
  setAsideConflict?: { sam: string; doc: string; note: string };
  // Gauntlet Card #370 RULING 1 — PRIMARY-DOCUMENT INDETERMINATE. On a multi-doc package, primary detection now keys off
  // document IDENTITY (solicitation form / UCF density; amendments disqualified), not write-order. When NO document
  // confidently qualifies as the solicitation (resolvePrimary confident=false), the engine cannot know which doc is the
  // base solicitation vs an attachment/amendment — a manifest/readability failure. It DOMINATES → NEEDS_HUMAN_REVIEW
  // (honest-fail), never a silent first-doc default. Computed in the orchestrator (flag-gated AUDIT_ATTACHMENT_COVERAGE);
  // absent/false ⇒ byte-identical.
  primaryIndeterminate?: boolean;
  // ── VERDICT ARC (move 4, Brain card #668) — verdict-time TEMPORAL disposition inputs ──────────────────
  // All optional; absent (or AUDIT_TEMPORAL_VERDICT off) ⇒ NO temporal reasoning runs ⇒ byte-identical. The
  // orchestrator computes classifyTemporal(deadlines, today) → temporalSnapshot, fetchLiveSamStatus(...) → liveSam,
  // and reconciles the ingested amendment set → ingestedAmendmentComplete; deriveVerdict then calls the PURE
  // deriveTemporalDisposition(snapshot, live, amendmentComplete, today). PANEL NON-NEGOTIABLE: a snapshot date can
  // NEVER drive NO_BID — CLOSED requires live-confirmed currency (liveSam); a missing doc may BE the extending
  // amendment. CLOSED ⇒ NO_BID(closed, recompete-watch); INDETERMINATE ⇒ committal capped to INCOMPLETE; OPEN ⇒ no block.
  temporalSnapshot?: import("./audit-temporal").TemporalSignal;   // classifyTemporal(deadlines, today) over the ingested package
  liveSam?: import("./audit-temporal").LiveSamStatus | null;      // fetchLiveSamStatus(...) at verdict time — CLOSED requires this
  ingestedAmendmentComplete?: boolean;                            // ingested amendment set ⊇ live-advertised inventory (default false = conservative)
  today?: string;                                                 // injected ISO yyyy-mm-dd (the pure engine never calls new Date())
  nowIso?: string | null;                                         // verdict-time INSTANT (full ISO w/ zone). ULTRA B2 F1 / RULING 4:
                                                                  // the live-deadline gate compares INSTANTS ONLY — `today` is a UTC
                                                                  // date and a date-vs-date compare arms a tz off-by-one FALSE-CLOSED.
  // VERDICT ARC (move-4 hard-bar floor) — the SAM-metadata half of PANEL RULING 3's
  // "detectSetAsideNotices(source) ∪ SAM setAside". GAUNTLET R1 BRK-10: this field did not exist, so the union's
  // second half was STRUCTURALLY unreachable from deriveVerdict — an SF1449 package with no applicable clause-matrix
  // row + a lens-miss + set-aside flags OFF produced a clean BID over a pool the offeror may not be in, which is
  // exactly the false-BID class ruling 3 added the set-aside class to close. Absent ⇒ byte-identical.
  samSetAside?: string | null;                                    // raw SAM set-aside code/label (canonicalized in audit-decide)
}
