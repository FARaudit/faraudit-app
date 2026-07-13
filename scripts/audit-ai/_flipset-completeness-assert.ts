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
};

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
