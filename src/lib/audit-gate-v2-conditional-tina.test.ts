// $0 GAUNTLET for the CONDITIONAL-FRAME TINA demotion (Brain card #468, flag AUDIT_CONDITIONAL_TINA_DEMOTION).
// Run: npx tsx src/lib/audit-gate-v2-conditional-tina.test.ts
//
// #460 boundary encoded EXPLICITLY: a certified-cost-or-pricing-DATA sentence that invokes the FAR 15.403-1 EXCEPTION
// framework is CONDITIONAL boilerplate → DEMOTE; an UNCONDITIONAL "shall submit certified cost or pricing data" duty
// (no 15.403-1 citation) STAYS ESCALATED (ruling #3 not reversed); a compound sentence carrying a real bar STAYS
// ESCALATED (guard); flag-OFF ⇒ byte-identical (escalates, as before this build).
process.env.GATE_V2 = "true";
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true"; // the demotion arc must be on for the refinement to apply

import { isConditionalTinaBoilerplate, gradeCoverageV2, importanceOf, hasBarSignal } from "./audit-gate-v2";
import type { SectionAttestation } from "./audit-orchestrator";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const att = (section: string, ungrounded: string[]): SectionAttestation =>
  ({ section, status: "obligations_ungrounded", obligations: ungrounded, citedFindingIds: [], ungrounded } as SectionAttestation);
const inDisq = (cov: ReturnType<typeof gradeCoverageV2>, ob: string) => cov.disqualifierUncovered.some((d) => d.obligation === ob);
const inDemoted = (cov: ReturnType<typeof gradeCoverageV2>, ob: string) => (cov.ungroundedNonBarSignal ?? []).some((d) => d.obligation === ob);

// ── the FIXTURES ──
const F = {
  // the ACTUAL 6439ac27 NHR driver (verbatim) + the full §3.8 conditional it was truncated from → BOTH conditional → DEMOTE
  verbatim6439: "403-1 apply, the offeror shall be required to submit certified cost or pricing data.",
  fullConditional: "If, after receipt of proposals, the PCO determines that there is insufficient information available to determine price reasonableness and none of the exceptions in FAR 15.403-1 apply, the offeror shall be required to submit certified cost or pricing data.",
  // #460 ruling #3 — UNCONDITIONAL offeror duty, NO 15.403-1 citation → STAYS ESCALATED
  unconditionalDuty: "The offeror shall be required to submit certified cost or pricing data prior to award.",
  // a genuine 15.403-4 REQUIRING duty (not the -1 exception clause) → STAYS ESCALATED
  requiringClause: "Certified cost or pricing data shall be submitted in accordance with FAR 15.403-4.",
  // COMPOUND real bar joined with the conditional-TINA recital → guard keeps it ESCALATED. Phrased to reach the demotion
  // path (importanceOf=ambiguous): NO bare "shall submit" (that trips BOILERPLATE_RE and drops the whole sentence), a
  // clearance bar carries the eligibility signal that must survive the strip.
  compoundBar: "An active facility clearance is required to perform; and if the exceptions at FAR 15.403-1 do not apply, certified cost or pricing data is required.",
  // govt-eval-framed DATA (card #460 ruling #2, separate predicate) — not our path but must still demote via its own predicate
  govtEval: "Information other than certified cost or pricing data shall be evaluated to support a determination of price reasonableness.",
};

console.log("── pure predicate isConditionalTinaBoilerplate ──");
assert(isConditionalTinaBoilerplate(F.verbatim6439), "6439ac27 verbatim driver → conditional-TINA boilerplate (demote)");
assert(isConditionalTinaBoilerplate(F.fullConditional), "full §3.8 conditional sentence → conditional-TINA boilerplate (demote)");
assert(!isConditionalTinaBoilerplate(F.unconditionalDuty), "unconditional duty (no 15.403-1) → NOT boilerplate (stays escalated, ruling #3)");
assert(!isConditionalTinaBoilerplate(F.requiringClause), "15.403-4 requiring clause → NOT boilerplate (only -1 is the exception marker)");
assert(!isConditionalTinaBoilerplate(F.compoundBar), "compound w/ facility-clearance bar → NOT boilerplate (guard: real bar survives strip)");

console.log("\n── end-to-end gradeCoverageV2 (flag ON) ──");
process.env.AUDIT_CONDITIONAL_TINA_DEMOTION = "true";
{
  const cov = gradeCoverageV2([att("L", [F.verbatim6439]), att("L", [F.unconditionalDuty]), att("M", [F.compoundBar])]);
  assert(inDemoted(cov, F.verbatim6439) && !inDisq(cov, F.verbatim6439), "flag ON: 6439ac27 driver DEMOTES (ungroundedNonBarSignal, not disqualifierUncovered)");
  assert(inDisq(cov, F.unconditionalDuty), "flag ON: unconditional duty STILL ESCALATES (disqualifierUncovered)");
  assert(inDisq(cov, F.compoundBar), "flag ON: compound facility-clearance bar STILL ESCALATES");
}

console.log("\n── flag OFF ⇒ byte-identical (the pre-build behavior: 6439ac27 escalates) ──");
process.env.AUDIT_CONDITIONAL_TINA_DEMOTION = "false";
{
  const cov = gradeCoverageV2([att("L", [F.verbatim6439])]);
  assert(inDisq(cov, F.verbatim6439) && !inDemoted(cov, F.verbatim6439), "flag OFF: 6439ac27 driver ESCALATES (disqualifierUncovered) — byte-identical to prior");
}

console.log("\n── invariants: govt-eval predicate + bar-signal sanity ──");
assert(hasBarSignal(F.verbatim6439), "sanity: 6439ac27 string trips BAR_SIGNAL ('certified') — why a NOOP_REP_FAMILY entry could NOT fire, needs the strip-predicate");
assert(importanceOf(F.compoundBar) === "ambiguous" || importanceOf(F.compoundBar) === "disqualifier", "compound bar is ambiguous/disqualifier class (never boilerplate)");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — conditional-TINA demotion gauntlet`);
process.exit(failures === 0 ? 0 : 1);
