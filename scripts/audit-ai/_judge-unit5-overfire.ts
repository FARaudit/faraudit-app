// INDEPENDENT JUDGE probe — adversarial OVER-FIRE spot-check.
// My OWN benign SAM-realistic sentences. The cardinal sin is crying wolf (a benign either/or flips clean BID->CAUTION).
// A benign sentence MUST NOT fire. A genuine unresolved either/or QUESTION SHOULD fire.
import { detectQuantityAmbiguities } from "../../src/lib/audit-decide";

const fires = (s: string): boolean => detectQuantityAmbiguities(s).length > 0;

let overfire = 0, underfire = 0;
const BENIGN = (s: string) => { const f = fires(s); if (f) { overfire++; console.log("  OVER-FIRE (bad):", JSON.stringify(s)); } else console.log("  ok (silent):", s.slice(0, 70)); };
const GENUINE = (s: string) => { const f = fires(s); if (!f) { underfire++; console.log("  UNDER-FIRE:", JSON.stringify(s)); } else console.log("  ok (fires):", s.slice(0, 70)); };

console.log("--- BENIGN (must NOT fire) ---");
// interrogative-headed but the pair is a declarative aside / different focus
BENIGN("Will the Government provide GFE, given the base requires 520 hours or 1,040 hours of ramp-up? Yes.");
// conditional protasis fronted by 'should'
BENIGN("Should the base run 520 hours or 1,040 hours, the CO will issue a modification.");
// directive option-menu (no interrogative)
BENIGN("Offerors shall price 520 hours or 1,040 hours as directed in Attachment 3.");
// wage-table hours (no interrogative)
BENIGN("The wage determination lists 40 hours or 44 hours per week for certain classifications.");
// option-year schedule (declarative)
BENIGN("The base period is 520 hours; each option year is 1,040 hours per the schedule.");
// embedded declarative clarity Q with a NATURAL 'that'
BENIGN("Is it correct that the schedule assumes 520 hours or 1,040 hours for the base?");
// embedded declarative with inflected verb
BENIGN("Does the offeror understand the estimate reflects 520 hours or 1,040 hours annually?");
// interrogative but a trailing clause (not terminal)
BENIGN("Is the requirement 520 hours or 1,040 hours, and if so how should we phase it?");
// cross-unit (2 hours or 2 days) — not same family
BENIGN("Is the response time 2 hours or 2 days after award?");
// equal values
BENIGN("Is the base 520 hours or 520 hours after the amendment?");
// a KO answer statement that mentions the pair declaratively
BENIGN("Answer: The requirement is 520 hours, not 1,040 hours; the earlier figure was an error.");
// interrogative aside with 'the' object marker
BENIGN("Are offerors required to price the 520 hours or 1,040 hours reflected in Attachment 3?");
// rhetorical FAQ-style with trailing question mark on unrelated clause
BENIGN("The base is 520 hours or 1,040 hours as noted; any questions on this CLIN?");
// natural elided-that but INFLECTED verb (should be caught by morphology)
BENIGN("Is the concern the PWS states 520 hours or 1,040 hours somewhere?");

console.log("\n--- GENUINE unresolved either/or QUESTION (SHOULD fire) ---");
GENUINE("Is the total requirement 520 hours or 1,040 hours?");
GENUINE("Which is correct: 520 hours or 1,040 hours?");
GENUINE("Are the requirements 3 FTEs or 5 FTEs?");
GENUINE("Isn't the base 520 hours or 1,040 hours?");
GENUINE("Question 4: Is the estimate 520 hours or 1,040 hours?");

// THE contrived residual the generator flagged P3 (elided 'that' + uninflected non-'-s' 2nd subject)
console.log("\n--- CONTRIVED residual (generator's P3, expected to fire = known safe-ish) ---");
const contrived = "Is the assumption staff bill 520 hours or 1,040 hours?";
console.log(`  contrived '${contrived}' fires=${fires(contrived)}`);

console.log(`\n=== JUDGE over-fire: ${overfire} over-fire / ${underfire} under-fire (benign) ===`);
process.exit(overfire ? 1 : 0);
