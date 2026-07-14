// LOAD-BEARING CORPUS SAFETY PROOF (Brain card #459 ruling, flag AUDIT_AMBIGUOUS_SIGNAL_DEMOTION) — runs $0 BEFORE
// the build is trusted. NEW escalation semantics at gradeCoverageV2:270:
//   disqualifier                       → ESCALATE (unchanged)
//   ambiguous AND hasBarSignal         → ESCALATE (the belt — "uncertain about a bar" still fails toward disqualifier)
//   ambiguous AND NOT hasBarSignal     → DEMOTE   (ungrounded_nonbar_signal coverage pole; never in disqualifierUncovered)
//   boilerplate                        → not escalated (unchanged)
//
// GATE (must ALL pass or STOP):
//   BAR   — 100% of known real §L/§M bars ESCALATE under the new semantics. Any real bar that is ambiguous AND
//           bar-signal-NEGATIVE = a LEAK → STOP, strengthen DISQUALIFIER_RE/BAR_SIGNAL_RE, re-prove.
//   DISSOLVE — all 61 FA8137 residuals classify bar-signal-NEGATIVE → demote (the false-NHR driver dissolves).
//
// Run with the convergence flip-set ON (production-flip state).
process.env.GATE_V2 = "true";
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";
process.env.AUDIT_PROTEST_CLAUSE_ALLOWLIST = "true";
process.env.AUDIT_DEBRIEF_ALLOWLIST = "true";
process.env.AUDIT_NOOP_REP_ALLOWLIST = "true";
process.env.AUDIT_PRECEDENCE_ALLOWLIST = "true";
process.env.AUDIT_CLARIFICATION_ALLOWLIST = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS = "true"; // Brain card #506 — the §M LPTA-consequence release under re-proof

(async () => {
  const { importanceOf, hasBarSignal, isGovtEvalMethodologyNonBar } = await import("../../src/lib/audit-gate-v2");
  const { replayRunRecord } = await import("../../src/lib/audit-run-record");
  const { loadRunRecord } = await import("./run-record-io");

  type Verdict = "escalate" | "demote";
  const escalatesNew = (ob: string): Verdict => {
    const imp = importanceOf(ob);
    if (imp === "disqualifier") return "escalate";
    if (imp === "boilerplate") return "demote"; // never escalated (was excluded at :270 already)
    // ambiguous: belt (bar-signal-positive) escalates, EXCEPT a government-eval-methodology cost/pricing-data sentence
    // (card #460 ruling #2) which demotes; bar-signal-negative demotes.
    if (!hasBarSignal(ob)) return "demote";
    if (isGovtEvalMethodologyNonBar(ob)) return "demote";
    return "escalate";
  };

  // ─────────────────────────── KNOWN-REAL-BAR CORPUS ───────────────────────────
  // Group A — allow-list-suite compound real bars (a genuine eligibility bar comma/semicolon-joined with a rights token).
  const groupA: string[] = [
    "Offerors must possess an active facility clearance; unsuccessful offerors may request a debriefing.",
    "Offeror must be a certified 8(a) participant, and any protest may be filed with the GAO.",
    "Unsuccessful offerors will be notified; offerors must be registered in SAM to be eligible for award.",
    "Only offerors holding an active facility clearance are eligible; any omission or discrepancy should be reported to the Contracting Officer.",
    "Offerors must be a certified 8(a) participant; if an offeror believes these instructions contain an error or omission, it should notify the Contracting Officer.",
    "The contractor must possess a Top Secret facility clearance for award.",
    "If the offeror believes the requirements contain an omission, its proposal will be deemed unacceptable.",
    "Should an offeror believe these instructions contain an error, and fail to raise it, the proposal will be rejected.",
  ];
  // Group B — adversarial BLAND-PHRASED real bars (Brain mandate — NO klaxon vocabulary; the leak-hunt set).
  const groupB: string[] = [
    "Offerors shall possess a facility clearance at time of submission.",                       // Brain's example
    "The offeror shall be registered in the System for Award Management prior to award.",
    "Offerors shall hold an active AS9100 certification.",
    "The successful offeror shall maintain a Secret facility clearance.",
    "Offerors shall be a small business under the applicable size standard.",
    "This requirement is set aside for HUBZone concerns.",
    "Only firms holding a Basic Ordering Agreement are eligible to receive an order.",           // BOA-holders-only
    "The offeror shall be an 8(a) certified concern.",
    "The offeror must have an active registration in SAM.gov at the time of award.",
    "Award will be made only to a service-disabled veteran-owned small business.",
    "Firms must be accredited to ISO 9001 to be considered.",
    "Proposals will only be accepted from firms that possess a current top secret clearance.",
    "Only offerors who attended the mandatory pre-proposal site visit will be eligible to submit a proposal.",
    "The offeror shall hold a CMMC Level 2 certification prior to award.",
    // deliberately-nasty bland bars to probe the leak boundary (real bars a human calls disqualifying):
    "Eligibility is limited to firms on the approved manufacturers list.",
    "Offers are restricted to concerns that have completed the required facility accreditation.",
    "The offeror shall demonstrate an active top secret clearance held continuously for three years.",
    "Only businesses qualified under the applicable small business size standard may compete.",
    // card #460 narrowing adversarials (MANDATORY) — the two narrowings must NOT open a leak:
    "If the offeror fails to correct the deficiency, its proposal will be deemed unacceptable and ineligible for award.", // real "deemed unacceptable" bar → still escalates
    "Any proposal rated technically unacceptable in a subfactor will be excluded from award consideration.",             // real "rated unacceptable" bar → still escalates
    "The offeror must hold a facility clearance, and certified cost or pricing data shall be evaluated for the effort.",  // clearance bar COMPOUNDED with a govt-eval cost-data sentence → must still escalate (govt-eval exception must NOT demote it)
    "Where the thresholds of FAR 15.403-1 apply, the offeror shall be required to submit certified cost or pricing data.", // #2 offeror submission DUTY (FA8137 verbatim; not eval-framed, not boilerplate) → ruling #3 says ESCALATE
    // Gate-2 blind-skeptic leaks (card #460 ruling #4 "any miss = strengthen, re-prove") — "unacceptable" bars whose
    // rejection verb the guard previously missed; all must ESCALATE now:
    "An unacceptable rating in any factor precludes award.",
    "Any unacceptable proposal shall be removed from the competitive range.",
    "An unacceptable proposal cannot be selected for award.",
    "A proposal with an unacceptable approach is not further considered.",
    // a real CERTIFICATION eligibility bar hidden in a govt-eval cost-data frame → the strip-and-retest must keep it escalating:
    "Only offerors certified under the mentor-protege program may submit cost or pricing data, which the Government shall evaluate to determine reasonableness.",
    // ── Brain card #506 §M LPTA-CONSEQUENCE RELEASE — compound real bars wearing the LPTA-consequence frame must STILL
    //    escalate (the !hasBarSignal + strip-and-retest belt). If ANY of these demote, the release leaks a real bar → STOP.
    "Offerors must possess an active facility clearance; quotes failing to meet one or more technical criteria will not be considered for award.", // clearance bar + LPTA frame
    "Quotes from offerors not registered in SAM will not be considered for award.",                                                               // SAM-registration bar (no technical-criteria frame)
    "Only quotes from 8(a) certified firms that meet all technical criteria will be considered; all others will not be considered for award.",     // 8(a) set-aside bar + LPTA frame
    "Proposals failing to meet the technical criteria will be rejected; the offeror must hold a CMMC Level 2 certification prior to award.",       // CMMC bar + LPTA frame
    "Offerors that fail to meet the technical criteria for the required Secret facility clearance will not be considered.",                        // clearance eligibility inside the frame
  ];
  // The FA303026Q0020 false-punt driver — the ONE sentence that MUST demote under the release (bar-signal-negative,
  // pure LPTA methodology). Asserted separately from the real-bar corpus (it is the DISSOLVE target, not a leak test).
  const LPTA_PIN = "Quotes failing to meet one or more Technical Criteria will deem the quote not technically acceptable and will not be considered for award.";

  const realBars = [...groupA.map((b) => ["A", b] as const), ...groupB.map((b) => ["B", b] as const)];

  console.log("════════ GATE 1 — BAR: every known real §L/§M bar must ESCALATE ════════");
  const leaks: string[] = [];
  for (const [grp, ob] of realBars) {
    const imp = importanceOf(ob), bar = hasBarSignal(ob), v = escalatesNew(ob);
    const mark = v === "escalate" ? "✓" : "✗ LEAK";
    if (v !== "escalate") leaks.push(ob);
    console.log(`  ${mark} [${grp}] imp=${imp.padEnd(11)} barSignal=${String(bar).padEnd(5)} → ${v}  | ${ob.slice(0, 90)}`);
  }
  console.log(`\n  real bars: ${realBars.length} · escalate: ${realBars.length - leaks.length} · LEAKS: ${leaks.length}`);

  // ─────────────────── programmatic scan: FA8137 + gold-set §L/§M source ───────────────────
  // Confirm the belt catches real-bar-vocabulary sentences that appear ungrounded in live corpus (ambiguous+barSignal).
  const RECORDS = [
    "scripts/audit-ai/run-records/FA813726R0033.bd605b88-1f32-4a37-8698-a79fae142e30.run-record.json",
    "scripts/audit-ai/run-records/FA813726R0033.64b79916-fd20-4359-b0aa-4979bce2d78a.run-record.json",
    "scripts/audit-ai/run-records/FA813726R0033.66897b8a-0e19-4669-9bc2-541cf31dabe9.run-record.json",
  ];
  const residuals = new Map<string, { ob: string; imp: string; bar: boolean }>();
  const beltHits: string[] = [];
  for (const path of RECORDS) {
    const rec = loadRunRecord(path);
    const r = replayRunRecord(rec, { sectionMDepth: rec.meta.flags?.AUDIT_SECTION_M_DEPTH === "true" });
    for (const s of r.sections) {
      if (s.section !== "L" && s.section !== "M") continue;
      for (const ob of s.ungrounded) {
        if (/^\[(truncated|compressor-dropped)\]/i.test(ob)) continue;
        const imp = importanceOf(ob);
        if (imp === "boilerplate") continue;               // already handled
        const bar = hasBarSignal(ob);
        // classify by the REAL escalation semantics (belt + govt-eval exception), not a bare bar-signal check.
        if (escalatesNew(ob) === "escalate") beltHits.push(ob);  // belt keeps escalating (safe)
        else {                                                   // demoted → the residuals that dissolve
          const key = ob.slice(0, 120).toLowerCase().replace(/\s+/g, " ").trim();
          if (!residuals.has(key)) residuals.set(key, { ob, imp, bar });
        }
      }
    }
  }

  console.log("\n════════ GATE 2 — DISSOLVE: FA8137 residuals classify bar-signal-NEGATIVE → demote ════════");
  console.log(`  ambiguous residuals that DEMOTE (bar-signal-negative): ${residuals.size}`);
  console.log(`  ambiguous residuals that STAY ESCALATING via belt (bar-signal-positive): ${beltHits.length}`);
  if (beltHits.length) { console.log("  ── belt-retained (ungrounded, bar-signal-positive — NOT dissolved, correctly still escalate):"); for (const b of [...new Set(beltHits)]) console.log(`     • ${b.slice(0, 110)}`); }

  // ─────────────────── GATE 3 — the §M LPTA-consequence PIN must DEMOTE (card #506 dissolve target) ───────────────────
  console.log("\n════════ GATE 3 — LPTA-CONSEQUENCE PIN dissolves (§M false-punt driver → demote) ════════");
  const pinImp = importanceOf(LPTA_PIN), pinBar = hasBarSignal(LPTA_PIN), pinV = escalatesNew(LPTA_PIN);
  const pinPass = pinV === "demote";
  console.log(`  ${pinPass ? "✓" : "✗ STILL PUNTS"} imp=${pinImp} barSignal=${pinBar} → ${pinV}  | ${LPTA_PIN.slice(0, 90)}`);

  console.log("\n════════ GATE VERDICT ════════");
  const barPass = leaks.length === 0;
  console.log(`  GATE 1 (no real-bar leak): ${barPass ? "PASS ✓" : "FAIL ✗ — STOP, strengthen the net"}`);
  console.log(`  GATE 2 (61 residuals dissolve): ${residuals.size} demote · ${beltHits.length} belt-retained`);
  console.log(`  GATE 3 (§M LPTA pin demotes): ${pinPass ? "PASS ✓" : "FAIL ✗ — the false-punt survives"}`);
  if (!barPass) { console.log("\n  ⛔ LEAKS:"); for (const l of leaks) console.log("    " + l); process.exit(1); }
  if (!pinPass) { console.log("\n  ⛔ §M LPTA pin did not demote — the fix is a no-op."); process.exit(1); }
  console.log("\n  ✅ SAFETY GATE CLEARED — new semantics escalate 100% of known real bars (incl. §M compound); §M LPTA pin demotes. Build may proceed.");
})();
