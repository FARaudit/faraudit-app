// $0 regression lock for B1 (Brain card #421 Fork-1) — §L/§M coverage-ledger honors boilerplate. Run:
//   npx tsx src/lib/audit-coverage-ledger-b1.test.ts
//
// RULING: a READ §L/§M whose ONLY ungrounded obligation sentences are administrative boilerplate reads
// covered-with-signal (status covered_boilerplate_signal → in `covered`, out of `missing`). INVARIANT (non-negotiable):
// a genuine ungrounded §L/§M DISQUALIFIER (or ambiguous, or a [truncated] marker) STILL escalates → stays missing.
// Flag set ON before a dynamic import (module-load const). Flag-OFF inertness is structural (`COVERAGE_LEDGER_V2 && …`).
export {};
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { completenessOf } = await import("./audit-orchestrator");
  type Ctx = Parameters<typeof completenessOf>[0];
  const L_BOILERPLATE = "SECTION L INSTRUCTIONS TO OFFERORS. Offerors shall submit the proposal by email to the Contracting Officer. Proposals must remain valid for 90 days. Offerors shall use Arial 12 font with one inch margins.";
  const M_EVAL = "SECTION M EVALUATION FACTORS FOR AWARD. Award will be made on a Lowest Priced Technically Acceptable basis. The Government will evaluate technical acceptability and price. Offerors must submit a technical volume and a price volume.";
  const run = (sections: Record<string, string>) =>
    completenessOf({ fullSource: "x", sections } as unknown as Ctx, ["L", "M"], [], new Set(["L", "M"]));
  const statusOf = (r: ReturnType<typeof run>, sec: string) => r.attestations.find((a) => a.section === sec)?.status;

  // FIX: all-boilerplate §L/§M → covered-with-signal, not missing; ungrounded list retained as the signal.
  const clean = run({ L: L_BOILERPLATE, M: M_EVAL });
  ok("all-boilerplate §L → covered (not missing)", clean.covered.includes("L") && !clean.missing.includes("L"));
  ok("all-boilerplate §M → covered (not missing)", clean.covered.includes("M") && !clean.missing.includes("M"));
  ok("§L status is covered_boilerplate_signal", statusOf(clean, "L") === "covered_boilerplate_signal");
  ok("signal retained: §L attestation still lists its ungrounded obligations", (clean.attestations.find((a) => a.section === "L")?.ungrounded.length ?? 0) > 0);

  // INVARIANT: a genuine disqualifier obligation in §L still escalates → §L stays missing; §M (clean) still covered.
  const withBar = run({ L: L_BOILERPLATE + " Offerors must possess a Top Secret facility clearance for award.", M: M_EVAL });
  ok("INVARIANT: §L w/ a real disqualifier → still missing", withBar.missing.includes("L") && statusOf(withBar, "L") === "obligations_ungrounded");
  ok("INVARIANT: clean §M unaffected → still covered", withBar.covered.includes("M"));

  // A NON-per-obligation section (e.g. §H) is untouched by this §L/§M-only reclassification.
  const withH = run({ L: L_BOILERPLATE, M: M_EVAL, H: "SECTION H SPECIAL CONTRACT REQUIREMENTS. The contractor shall provide monthly status reports." });
  ok("§H (non-per-obligation) not reclassified to covered_boilerplate_signal", statusOf(withH, "H") !== "covered_boilerplate_signal");

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
