// FLIP-SET COMPLETENESS ASSERTION (Brain card #474 ruling #4b) — the WIDENED guardrail. The card #467 pre-fire
// checklist asserted only the four INGEST-INTEGRITY flags; that narrow scope is how DEADLINE_RECONCILE (live-proven at
// #455 / exercised #457) silently dropped out of the 8f56ecc4 run, leaving the date-harvest defects live. This asserts
// that a proposed flip-set contains EVERY live-proven flag OR carries a written justification for its absence.
//
// $0. Run:  npx tsx scripts/audit-ai/_flipset-completeness-assert.ts   (edit PROPOSED below, or pass a comma-list arg)
// Exit 0 = complete; exit 1 = a live-proven member is missing WITHOUT a justification (the #463 defect class — do NOT fire).

// REGISTRY — every flag PROVEN on a live paid run (or its explicit Gate-2 proof-point). Extend when a new flag earns
// live proof; NEVER remove a member without moving it to a justified-absence with a reason.
const LIVE_PROVEN: Record<string, string> = {
  // committal set (proven live, run 6439ac27 / 8f56ecc4)
  AUDIT_CLARIFICATION_ALLOWLIST: "run 6439ac27", AUDIT_AMBIGUOUS_SIGNAL_DEMOTION: "run 6439ac27",
  AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE: "run 6439ac27", AUDIT_NOTICE_BODY_BOA_EMIT: "run 6439ac27",
  AUDIT_BOA_IDIQ_HOLDER_KEEP: "run 6439ac27", AUDIT_COVERAGE_LEDGER_V2: "run 6439ac27",
  AUDIT_NOTICE_BODY_ELIG_FLOOR: "run 6439ac27", AUDIT_SITEVISIT_SEVERITY_FLOOR: "run 8f56ecc4 (showStoppers populated)",
  AUDIT_DEBRIEF_ALLOWLIST: "run 6439ac27", AUDIT_NOOP_REP_ALLOWLIST: "run 6439ac27",
  AUDIT_PRECEDENCE_ALLOWLIST: "run 6439ac27", AUDIT_PROTEST_CLAUSE_ALLOWLIST: "run 6439ac27",
  // ingest-integrity (the original card #467 registry)
  AUDIT_DEDUPE_PRIMARY_GUARD: "run 6439ac27 (base retained)", AUDIT_WORKER_OCR: "run 6439ac27",
  AUDIT_TXT_INGEST: "run 6439ac27", AUDIT_SIGNIN_NONBINDING: "run 6439ac27",
  // batch-new, proven live on 8f56ecc4
  AUDIT_CONDITIONAL_TINA_DEMOTION: "run 8f56ecc4 (§L family cycled off TINA)",
  AUDIT_OCR_HELD_REGISTER: "run 8f56ecc4 (inert — WD no-text; path safe)",
  AUDIT_COVERAGE_NHR_STOPPER_FILL: "run 8f56ecc4 (2 bars populated the band — LIVE-PROVEN)",
  // Gate-2-proven, must not silently drop (the ruling #4 driver)
  AUDIT_DEADLINE_RECONCILE: "Gate-2 A at card #455, exercised #457 — REJOINS the set (ruling #4)",
  // batch-new, Gate-2-proven this batch (flag-OFF byte-identical + pins)
  AUDIT_FORM_KEYED_CITATION: "card #474 ROOT-5 fix — Gate-2 pending; pin 10/10",
  AUDIT_LEDGER_BROAD_AMBIGUOUS: "card #474 ruling #3 — Gate-2 A, merged #212, pin 7/7",
  AUDIT_BID_GUARANTEE_EMIT: "card #475 ruling #1 — Gate-2 A/SHIP, merged #213, pin 8/8 (§L residual clears)",
  // card #477 arc — Gate-2 A/SHIP + security clean, merged #215 (main b1c4477); live-proof owed at the re-attempt run
  AUDIT_OCR_TABLE_CONFIRM: "card #477 arc-B — table-aware WD confirm; Gauntlet 18/18 WRONG_VERDICT=0; merged #215",
  AUDIT_DEADLINE_UPDATE_STACK: "card #477 ruling #2 — notice-body UPDATE-stack resolver; pin 10/10; merged #215",
  AUDIT_REASON_LINE_NAMED: "card #477 ruling #3 — named NHR reason-line; pin 8/8; merged #215",
  AUDIT_MAGNITUDE_LD_EMIT: "card #479 bundle — magnitude $500K-$1M + LDs $227.15 additive pricing capture; pin 9/9",
  AUDIT_BAND_DEDUP: "card #480 — collapse duplicative MAC-BOA/vehicle-holder show-stopper pair; pin green",
  AUDIT_SETASIDE_REFRAME: "card #481 ruling-4 — reframe no-set-aside finding vs authoritative masthead set_aside; pin green",
  // card #578 registry reconciliation (Brain ruling #578-(3)) — the SELF-DETERMINABLE eligibility class + size-standard
  // self-cert are the Brain-ruled ARMED BASELINE (a set-aside/size notice-metadata recital demotes to a bidder-self-
  // cert caveat, never NHR). Both live =true on audit-worker; cert = the audit-orchestrator self-cert suites (grade A).
  AUDIT_SELF_DETERMINABLE_ELIG_CLASS: "cards #509/#516 — Gate-2 A; Brain-ruled armed baseline (card #578)",
  AUDIT_SIZE_STANDARD_SELF_CERT: "card #509 — Gate-2 A; Brain-ruled armed baseline (card #578)",
};

// ARMED, CERT-DRY, LIVE-EXERCISED, ISOLATED-PROOF PENDING (card #578 §3b reconciliation) — verdict-affecting flags LIVE
// =true on audit-worker but armed AD-HOC (no committed worker-flip script; registry froze at card #481 / commit
// 474f644) with cert-DRY only, NO isolated live-run proof. They HAVE run on the customer path (LBJ seq-2 + customer
// audits since arming) with no reported wrong-verdict, but that is EXPOSURE, not proof. NOT promoted to LIVE_PROVEN —
// CEO keep/revert ruling pending. Documentation only; the assert does not gate on this list.
const ARMED_CERT_DRY_UNPROVEN: Record<string, string> = {
  // "MAKE LBJ USEFUL" ARC — RE-ARMED 2026-07-19 for the LBJ re-fire (card #590 Modified-B). Fire #1 (45f9bacd) NHR'd via a
  // multi-driver treadmill: line-wrap (#587), bond-paper collision (#587), then stacked honest-fail gates → the
  // SELF_CLEARABLE_PACKAGE recognizer (#590). All merged; atomic re-arm; live-proof owed at the CEO re-fire.
  AUDIT_FABRICATION_INVARIANT: "#574 DRY (7ab0df4) — ARMED for LBJ re-fire (card #590 arc)",
  AUDIT_PERFORMANCE_UPKEEP_CAVEAT: "#576 DRY (96caed1) — ARMED for LBJ re-fire; #587 line-wrap unblocks it",
  AUDIT_BENIGN_RECITAL_COVERED: "#572 DRY (4795c71) — ARMED for LBJ re-fire (card #590 arc)",
  AUDIT_CREDENTIAL_CONDITIONAL_REASON: "#575b DRY (72a51d8) — ARMED for LBJ re-fire; reason-only",
  AUDIT_RECITAL_LINEWRAP_BRIDGE: "#587 DRY (e3d9e34) — ARMED; soft-wrap continuation bridge (LBJ insurance recital)",
  AUDIT_BOND_PAPER_NONBAR: "#587 DRY (e3d9e34) — ARMED; 'bond paper' ≠ surety bond token-collision fix",
  AUDIT_SELF_CLEARABLE_PACKAGE: "#590 Modified-B DRY (87cf313) — ARMED; verifier-sovereign self-clearable BWC floor",
  AUDIT_COVERED_DIRECT_BAR_FLOOR: "#557 DRY-A (cead8a0)", AUDIT_FINDING_DEDUP: "#555→#604 — 44c6f44 SUPERSEDED (synthesis, stale/pre-#590) → disposition-homogeneous core (PR #256, main c50830a); cert _cert-unit6-clause-homogeneous-DRY.ts",
  AUDIT_OBLIGATION_GARBLE_FLOOR: "#556 DRY-A (941e951)", AUDIT_QUANTITY_AMBIGUITY_FIDELITY: "#553/#554 DRY-A (7568761)",
  AUDIT_STRUCTURAL_ASSERTION_FIDELITY: "#552 DRY-A (e4c0481)", AUDIT_ELIG_BAR_PASSIVE_FRAME: "#560 Gate-2 DRY (PR #243)",
  AUDIT_SETASIDE_SUBSET_AWARE: "#534 DRY", AUDIT_SETASIDE_OVERTYPE_GUARD: "set-aside over-type guard, cert green",
  AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS: "#538 DRY (PR #227)", AUDIT_MM_EVIDENCE_FACTOR_DEMOTION: "#538 DRY (PR #238)",
  AUDIT_PERF_OBLIGATION_INSURANCE: "perf-obligation insurance cert", AUDIT_INQUIRY_DEADLINE_BENIGN: "inquiry-deadline benign cert",
  AUDIT_ELIGIBLE_TRISTATE: "tristate eligibility cert", AUDIT_CHECKBOX_STATE_FIDELITY: "checkbox-state cert",
  AUDIT_PROCUREMENT_TYPE_SECTIONS: "commercial honest-fail cert", AUDIT_NMR_FIRMSTATUS_GATE: "NMR firm-status cert",
  AUDIT_NMR_NAICS_DORMANCY: "NMR NAICS dormancy cert", AUDIT_CLAUSE_SOURCE_FULLTEXT: "#539 (armed w/ seq-2 pre-fire)",
  // Phase-1 SHADOW verdict pole (fc16d41, PR #254) — VERDICT-INERT: deriveShadowVerdict computed BESIDE the real
  // verdict and BANKED, never authoritative. ARMED on audit-worker for the LBJ 12318726Q0165 re-fire to capture the
  // Phase-1 shadow beside the live verdict (Phase-2 design evidence). Gold-set v1 16/16 + FALSE-BIDs=0. Atomic-arm.
  AUDIT_POSITIVE_VERDICT_POLE: "#600-2 (fc16d41, PR #254) — verdict-inert shadow; ARMED for LBJ re-fire; gold-set 16/16",
};

// STANDING INVARIANT (Brain ruling #578-(2), card #467 lineage): ARMING AND REGISTRATION ARE ONE ATOMIC ACT. No flag is
// flipped =true on any surface without a same-turn entry here (LIVE_PROVEN with a proof pointer, or ARMED_CERT_DRY_
// UNPROVEN with a card ref). An armed flag absent from BOTH maps is the #463 defect class — the registry froze at #481
// while ad-hoc arming continued, producing the 64-live vs 29-registered drift this reconciliation repairs.
void ARMED_CERT_DRY_UNPROVEN;

// JUSTIFIED ABSENCES — a live-proven flag intentionally left OUT, WITH a reason (satisfies the assertion).
const JUSTIFIED_ABSENT: Record<string, string> = {
  // (none this package — all live-proven members are IN)
};

// The proposed flip-set for the next run (the 22-flag package: 19 prior + DEADLINE_RECONCILE + the 2 batch fixes).
const PROPOSED = (process.argv[2]?.split(",").map((s) => s.trim()).filter(Boolean)) ?? [
  "AUDIT_CLARIFICATION_ALLOWLIST", "AUDIT_AMBIGUOUS_SIGNAL_DEMOTION", "AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE",
  "AUDIT_NOTICE_BODY_BOA_EMIT", "AUDIT_BOA_IDIQ_HOLDER_KEEP", "AUDIT_COVERAGE_LEDGER_V2",
  "AUDIT_NOTICE_BODY_ELIG_FLOOR", "AUDIT_SITEVISIT_SEVERITY_FLOOR", "AUDIT_DEBRIEF_ALLOWLIST",
  "AUDIT_NOOP_REP_ALLOWLIST", "AUDIT_PRECEDENCE_ALLOWLIST", "AUDIT_PROTEST_CLAUSE_ALLOWLIST",
  "AUDIT_DEDUPE_PRIMARY_GUARD", "AUDIT_WORKER_OCR", "AUDIT_TXT_INGEST", "AUDIT_SIGNIN_NONBINDING",
  "AUDIT_CONDITIONAL_TINA_DEMOTION", "AUDIT_OCR_HELD_REGISTER", "AUDIT_COVERAGE_NHR_STOPPER_FILL",
  "AUDIT_DEADLINE_RECONCILE", "AUDIT_FORM_KEYED_CITATION", "AUDIT_LEDGER_BROAD_AMBIGUOUS", "AUDIT_BID_GUARANTEE_EMIT",
  // card #477 arc (merged #215) — the WD/deadline/reason-line re-attempt additions
  "AUDIT_OCR_TABLE_CONFIRM", "AUDIT_DEADLINE_UPDATE_STACK", "AUDIT_REASON_LINE_NAMED",
  // card #479 bundle — additive pricing capture
  "AUDIT_MAGNITUDE_LD_EMIT",
  // card #480 — band dedup
  "AUDIT_BAND_DEDUP",
  // card #481 — no-set-aside reframe
  "AUDIT_SETASIDE_REFRAME",
  // card #578 — Brain-ruled armed baseline (set-aside/size self-cert; live =true on worker)
  "AUDIT_SELF_DETERMINABLE_ELIG_CLASS", "AUDIT_SIZE_STANDARD_SELF_CERT",
];

const proposedSet = new Set(PROPOSED);
const missing = Object.keys(LIVE_PROVEN).filter((f) => !proposedSet.has(f) && !(f in JUSTIFIED_ABSENT));
const justified = Object.keys(LIVE_PROVEN).filter((f) => !proposedSet.has(f) && f in JUSTIFIED_ABSENT);

console.log(`FLIP-SET COMPLETENESS — proposed ${PROPOSED.length} flags · registry ${Object.keys(LIVE_PROVEN).length} live-proven`);
if (justified.length) { console.log("\nJUSTIFIED ABSENCES:"); justified.forEach((f) => console.log(`  ~ ${f} — ${JUSTIFIED_ABSENT[f]}`)); }
if (missing.length) {
  console.log(`\n❌ INCOMPLETE — ${missing.length} live-proven flag(s) MISSING without justification (the #463 defect class — DO NOT FIRE):`);
  missing.forEach((f) => console.log(`  ✗ ${f} — proven: ${LIVE_PROVEN[f]}`));
  process.exit(1);
}
// also surface any proposed flag NOT in the registry (a new/unproven member rides the set — allowed, just flagged)
const unregistered = PROPOSED.filter((f) => !(f in LIVE_PROVEN));
if (unregistered.length) { console.log("\nNOTE — proposed but not yet in the live-proven registry (rides the set):"); unregistered.forEach((f) => console.log(`  · ${f}`)); }
console.log(`\n✅ COMPLETE — every live-proven flag is present or justified.`);
process.exit(0);
