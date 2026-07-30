import { detectQuantityAmbiguities } from "../../src/lib/audit-decide";

// R11 — confirm R1–R10 locks did NOT regress + genuine control still fires.
const cases: Array<{ tag: string; s: string; wantFire: boolean }> = [
  // R1 declarative + stray ? (must NOT fire)
  { tag: "R1 declarative stray-?", s: "The base is 520 hours or 1,040 hours; questions on this CLIN?", wantFire: false },
  // R2 conditional protasis / date opener
  { tag: "R2 conditional protasis", s: "Should offerors require 520 hours or 1,040 hours, request approval?", wantFire: false },
  { tag: "R2 date opener", s: "May 2026 delivery of 520 hours or 1,040 hours applies?", wantFire: false },
  // R5 declarative-aside (interrogative head, pair not interrogated)
  { tag: "R5 declarative-aside 'reflected'", s: "Are offerors required to price the 520 hours or 1,040 hours reflected in Attachment 3?", wantFire: false },
  // R7 terminal-pivot: trailing main clause
  { tag: "R7 glued apodosis", s: "Is the base 520 hours or 1,040 hours per Attachment 3 notify the CO?", wantFire: false },
  // R8 open-class inflected verb
  { tag: "R8 assumes", s: "Is it clear the schedule assumes 520 hours or 1,040 hours?", wantFire: false },
  // R9 base-form pronoun subj (it-extraposition)
  { tag: "R9 it-extraposition base verb", s: "Is it clear you allocate 520 hours or 1,040 hours?", wantFire: false },
  // R10 noun-headed content clause pronoun 2nd subj
  { tag: "R10 noun-head + pronoun 2nd subj", s: "Is the assumption you bill 520 hours or 1,040 hours?", wantFire: false },
  { tag: "R10 noun-head + 2nd determiner NP", s: "Is the premise the base run 520 hours or 1,040 hours?", wantFire: false },
  // do-support head
  { tag: "R10 do-support", s: "Do the parties bill 520 hours or 1,040 hours?", wantFire: false },
  // GENUINE controls (must fire)
  { tag: "GENUINE bare estimate", s: "Is the estimate 520 hours or 1,040 hours?", wantFire: true },
  { tag: "GENUINE total requirement", s: "Is the total requirement 520 hours or 1,040 hours?", wantFire: true },
  { tag: "GENUINE which-correct pre-colon", s: "Which is correct: 520 hours or 1,040 hours?", wantFire: true },
  { tag: "GENUINE isn't", s: "Isn't the requirement 3 FTEs or 5 FTEs?", wantFire: true },
];
let regress = 0;
for (const c of cases) {
  const fired = detectQuantityAmbiguities(c.s).length > 0;
  const ok = fired === c.wantFire;
  if (!ok) regress++;
  console.log(`${fired ? "FIRE " : "quiet"} ${ok ? "OK   " : "★REGRESS"}  [${c.tag}]  ${JSON.stringify(c.s)}`);
}
console.log(`\nregressions: ${regress}`);
