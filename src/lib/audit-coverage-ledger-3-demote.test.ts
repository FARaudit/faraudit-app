// $0 regression lock for #3 (Brain card #472, residual batch #3) — the §L/§M coverage-ledger accepts #1's DEMOTED
// classes (govt-eval methodology + conditional-frame TINA non-bar) via the SHARED isLedgerDemotableNonBar truth. Run:
//   npx tsx src/lib/audit-coverage-ledger-3-demote.test.ts
//
// RULING: a fully-READ §L/§M whose ungrounded residuals are all boilerplate OR a demotable non-bar (conditional-15.403-1
// recital · govt-eval methodology) reads covered-with-signal — the 6439ac27 §L false-missing driver. INVARIANTS (both
// non-negotiable, card #472):
//   (1) MIXED-SECTION / laundering-behind-a-crowd: ONE real ungrounded disqualifier AMONG many demotable strings →
//       section STAYS missing, the bar STILL escalates, even while every other sentence demotes.
//   (2) FLAG-OFF byte-identical: with the demotion gates OFF, a conditional-TINA §L stays missing (escalates) exactly
//       as B1 — the extension adds nothing until AMBIGUOUS_SIGNAL_DEMOTION (+ CONDITIONAL_TINA_DEMOTION) are ON.
export {};
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true"; // module-load const on the orchestrator; set BEFORE the dynamic import.

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }
const demoteOn = () => { process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true"; process.env.AUDIT_CONDITIONAL_TINA_DEMOTION = "true"; };
const demoteOff = () => { process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "false"; process.env.AUDIT_CONDITIONAL_TINA_DEMOTION = "false"; };

(async () => {
  const { completenessOf } = await import("./audit-orchestrator");
  type Ctx = Parameters<typeof completenessOf>[0];

  const BOILERPLATE = "Offerors shall submit the proposal by email to the Contracting Officer. Proposals must remain valid for 90 days.";
  // The 6439ac27 driver — a conditional 15.403-1 recital: the "shall submit" duty fires ONLY in the residual PCO path.
  const CONDITIONAL_TINA = "If none of the exceptions in FAR 15.403-1 apply, the offeror shall be required to submit certified cost or pricing data.";
  // A government-evaluation-methodology sentence over cost/pricing DATA (card #460 ruling #2) — states what the govt does.
  const GOVT_EVAL = "The certified cost or pricing data shall be evaluated to support a determination of price reasonableness.";
  // A genuine ungrounded eligibility bar — must NEVER demote.
  const REAL_BAR = "Offerors must possess a Top Secret facility clearance for award.";

  const run = (sections: Record<string, string>) =>
    completenessOf({ fullSource: "x", sections } as unknown as Ctx, ["L", "M"], [], new Set(["L", "M"]));
  const statusOf = (r: ReturnType<typeof run>, sec: string) => r.attestations.find((a) => a.section === sec)?.status;

  // ── PIN 1: demote ON — §L = boilerplate + conditional-TINA + govt-eval (ALL demotable) → covered-with-signal.
  demoteOn();
  const clean = run({ L: BOILERPLATE + " " + CONDITIONAL_TINA + " " + GOVT_EVAL, M: BOILERPLATE });
  ok("PIN1 §L (boilerplate+condTINA+govtEval) → covered (not missing)", clean.covered.includes("L") && !clean.missing.includes("L"));
  ok("PIN1 §L status is covered_boilerplate_signal", statusOf(clean, "L") === "covered_boilerplate_signal");
  ok("PIN1 signal retained: §L ungrounded residuals still listed", (clean.attestations.find((a) => a.section === "L")?.ungrounded.length ?? 0) > 0);

  // ── PIN 2 (6439ac27): a §L whose ONLY non-boilerplate residual is the conditional-TINA recital → covered once TINA demotes.
  const tinaOnly = run({ L: BOILERPLATE + " " + CONDITIONAL_TINA, M: BOILERPLATE });
  ok("PIN2 §L (boilerplate + conditional-TINA) → covered once TINA demotes", tinaOnly.covered.includes("L") && !tinaOnly.missing.includes("L"));

  // ── PIN 3 MIXED-SECTION INVARIANT: one REAL bar buried among demotable strings → §L STAYS missing, bar escalates.
  const mixed = run({ L: BOILERPLATE + " " + CONDITIONAL_TINA + " " + GOVT_EVAL + " " + REAL_BAR, M: BOILERPLATE });
  ok("PIN3 MIXED: §L w/ 1 real bar among a crowd of demotables → STILL missing", mixed.missing.includes("L"));
  ok("PIN3 MIXED: §L status stays obligations_ungrounded (escalates)", statusOf(mixed, "L") === "obligations_ungrounded");
  ok("PIN3 MIXED: the real bar is retained in §L ungrounded (not laundered away)",
     (mixed.attestations.find((a) => a.section === "L")?.ungrounded.some((u) => /clearance/i.test(u))) === true);

  // ── PIN 4 FLAG-OFF byte-identical: demote gates OFF → the conditional-TINA §L escalates (missing), exactly like B1.
  demoteOff();
  const off = run({ L: BOILERPLATE + " " + CONDITIONAL_TINA, M: BOILERPLATE });
  ok("PIN4 FLAG-OFF: conditional-TINA §L → missing (extension is gated, no demote)", off.missing.includes("L") && statusOf(off, "L") === "obligations_ungrounded");

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
