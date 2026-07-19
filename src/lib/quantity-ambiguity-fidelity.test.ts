// PHASE 3 UNIT 5 — QUANTITY-AMBIGUITY FIDELITY GATE ($0 suite, flag AUDIT_QUANTITY_AMBIGUITY_FIDELITY).
// Driver: seq-2 dccce793 Q&A poses "Is the total requirement 520 hours or 1,040 hours?" (Schedule says 520; 20 hrs/wk
// × 52 wks = 1,040 — a 2× LOE/pricing spread the CO did not resolve); a lens LAUNDERED it into "estimated at 520 hours".
// The gate is the DETERMINISTIC BACKSTOP: on the positive shape of a source-posed either/or quantity QUESTION, emit ONE
// caution finding surfacing the unresolved pair, floored to BID_WITH_CAUTION (cautionFloor — never a bar), additive +
// non-destructive. The cardinal sin for an EMITTER is over-fire (crying wolf) → the interrogative requirement + same-
// unit-differing-values are the guards; latent numeric conflicts (no explicit question) are OUT of scope.
// Run: npx tsx src/lib/quantity-ambiguity-fidelity.test.ts
import { applyQuantityAmbiguityFidelity, detectQuantityAmbiguities, disposeFinding } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_QUANTITY_AMBIGUITY_FIDELITY;
  if (on) process.env.AUDIT_QUANTITY_AMBIGUITY_FIDELITY = "true"; else delete process.env.AUDIT_QUANTITY_AMBIGUITY_FIDELITY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_QUANTITY_AMBIGUITY_FIDELITY; else process.env.AUDIT_QUANTITY_AMBIGUITY_FIDELITY = prev; }
};
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "x", excerpt: "x", kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "test", ...o,
});
const on = (findings: TypedFinding[], src: string) => withFlag(true, () => applyQuantityAmbiguityFidelity(findings, src, { enabled: true }));
const emittedCaution = (out: TypedFinding[], n: number) => out.filter((f) => f.quantityAmbiguityFlagged);

// ── DRIVER — the real dccce793 Q&A interrogative fires (positive) ──
const DRIVER = 'ANSWERS TO QUESTIONS. 1. The Schedule of Items references "520 hrs" but the description states "20 hrs/week for August 1, 2026 – July 31, 2027" (52 weeks = 1,040 hours). Is the total requirement 520 hours or 1,040 hours? Please follow the instructions.';
{
  const d = detectQuantityAmbiguities(DRIVER);
  assert(d.length === 1 && d[0].a === 520 && d[0].b === 1040 && d[0].unit === "hour", "P1 DRIVER: detects the 520-or-1,040 hour question exactly once");
  const out = on([base({ requirement: "base period estimated at 520 hours" })], DRIVER);
  const c = emittedCaution(out, 1);
  assert(c.length === 1, "P1 DRIVER: emits exactly one caution");
  assert(c[0].cautionFloor === true && c[0].controllability === "bidder_controls" && disposeFinding(c[0]) !== "disqualifying", "P1 DRIVER: caution floors to BID_WITH_CAUTION, never a bar");
  assert(DRIVER.includes(c[0].excerpt) && /520 hour\(s\) OR 1040 hour\(s\)/.test(c[0].requirement), "P1 DRIVER: caution is grounded + names the pair");
}

// ── OVER-FIRE GUARDS (the cardinal sin — must NOT fire) ──
// P2 — option-year schedule: differing same-unit hours across periods, DECLARATIVE (no question) → benign.
assert(detectQuantityAmbiguities("Base year: 520 hours. Option Year 1: 1,040 hours. Option Year 2: 1,040 hours.").length === 0,
  "P2 OVER-FIRE: option-year schedule (declarative differing hours, no question) does NOT fire");
// P3 — wage-determination "up to 40 hours per week" tables (many same-unit numbers, no either/or question).
assert(detectQuantityAmbiguities("HEALTH & WELFARE: $5.55 per hour, up to 40 hours per week. EO 13706: up to 40 hours per week, 56 hours of sick leave.").length === 0,
  "P3 OVER-FIRE: wage-determination hour tables do NOT fire");
// P4 — DIRECTIVE option-menu: "price 520 or 1,040 hours as directed" is a CHOICE the CO offers, not an unanswered ambiguity (no "?").
assert(detectQuantityAmbiguities("Offerors shall price either 520 hours or 1,040 hours as directed in the schedule.").length === 0,
  "P4 OVER-FIRE: a directive either/or option-menu (declarative) does NOT fire — only an unresolved QUESTION does");
// P5 — cross-unit "2 hours or 2 days" is not a same-quantity ambiguity.
assert(detectQuantityAmbiguities("Is the response time 2 hours or 2 days?").length === 0,
  "P5 OVER-FIRE: cross-unit question (hours vs days) does NOT fire (not a same-quantity ambiguity)");
// P6 — equal values in a question are not an ambiguity.
assert(detectQuantityAmbiguities("Is the requirement 40 hours or 40 hours per week for both roles?").length === 0,
  "P6 OVER-FIRE: equal-value question does NOT fire");
// P7 — a stray "?" elsewhere in the paragraph must not make a declarative either/or count as a question.
assert(detectQuantityAmbiguities("Did you register in SAM? The base period is 520 hours. Option year is 1,040 hours.").length === 0,
  "P7 OVER-FIRE: an unrelated question elsewhere does NOT pull a declarative schedule into the gate");

// ── UNDER-FIRE / SCOPE (safe direction — documented out-of-scope) ──
// P8 — a LATENT conflict with no explicit question is deliberately out of scope (latent detector = the over-fire treadmill).
assert(detectQuantityAmbiguities('The Schedule says 520 hours. Elsewhere the PWS implies 1,040 hours.').length === 0,
  "P8 SCOPE: a latent (unasked) numeric conflict is OUT of scope by design — no false emission, no silent claim of coverage");

// ── DEDUP — a lens that already flagged the pair AS unresolved suppresses the emission (no double) ──
{
  const already = base({ requirement: "The 520 vs 1,040 hours quantity is ambiguous and unresolved in the Q&A." });
  const out = on([already], DRIVER);
  assert(emittedCaution(out, 0).length === 0 && out.length === 1, "P9 DEDUP: an existing 'unresolved/ambiguous' finding naming both numbers suppresses a duplicate emission");
}

// ── ADDITIVE + NON-DESTRUCTIVE + FLAG-OFF ──
{
  const pre = [base({ requirement: "estimated at 520 hours", severity: "P1" }), base({ requirement: "other unrelated obligation" })];
  const out = on(pre, DRIVER);
  assert(out.length === pre.length + 1 && out.slice(0, pre.length).every((f, i) => f === pre[i]), "P10 ADDITIVE: existing findings are byte-identical; exactly one caution appended (the laundered #3 is NOT mutated)");
  const off = withFlag(false, () => applyQuantityAmbiguityFidelity(pre, DRIVER, { enabled: false }));
  assert(off === pre, "P11 FLAG-OFF: default-OFF ⇒ same array ref (byte-identical)");
}

// ── VERDICT INTENT — on a CLEAN doc the caution is the only material finding → BID_WITH_CAUTION floor, never NHR/NO_BID ──
{
  const out = on([base({ requirement: "routine boilerplate", kind: "boilerplate" })], DRIVER);
  const c = emittedCaution(out, 1)[0];
  assert(!!c && c.severity === "P1" && c.curableInWindow === true && c.kind === "pricing", "P12 VERDICT: caution is a P1 curable pricing caution (floors clean BID → BID_WITH_CAUTION; cannot bar)");
}

// ── ROBUSTNESS — ReDoS-safe on pathological input (bounded number width, no catastrophic backtracking) ──
{
  const t0 = Date.now();
  detectQuantityAmbiguities(("1234567 hours or ".repeat(4000)) + "?");
  assert(Date.now() - t0 < 1000, "P13 ReDoS: pathological repeated-quantity input completes < 1s");
}

// ── R1 REGRESSION LOCKS — the cardinal-sin OVER-FIRE class: a DECLARATIVE either/or that shares a clause with an
//    unrelated trailing "?" (FAQ / rhetorical / parenthetical / "— which…?" tail). The clause is NOT a question in FORM
//    (does not OPEN with an interrogative marker) → must NOT fire. All seven break the pre-R1 punctuation-scan guard. ──
const R1_OVERFIRE: [string, string][] = [
  ["R1-A1 declarative + '— which…?' tail", "The estimate is 520 hours or 1,040 hours, depending on funding — which will the Government confirm?"],
  ["R1-A2 'Estimated quantities:' + unrelated SAM question", "Estimated quantities: 520 hours or 1,040 hours across the base; have you registered in SAM?"],
  ["R1-A6 'shall price' menu + ARO question", "Offerors shall price 520 hours or 1,040 hours (see Attachment 2) and confirm — can you meet the ARO?"],
  ["R1-B2 CLIN funding-menu + FAQ 'questions on this CLIN?'", "CLIN 0001 is priced at 520 hours or 1,040 hours per the two funding profiles; questions on this CLIN?"],
  ["R1-B5 stated LOE range + rhetorical 'correct?'", "Estimated level of effort ranges 520 hours or 1,040 hours annually, funding permitting; correct?"],
  ["R1-C1 declarative + 'pending funding?' (no interrog word)", "The estimate is 520 hours or 1,040 hours pending funding?"],
  ["R1-F5 declarative + parenthetical aside", "The Government estimates 520 hours or 1,040 hours (is this the base or the option?) for planning."],
];
for (const [label, src] of R1_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R1 LOCK — ${label}: declarative either/or + stray '?' does NOT fire (question-in-form guard)`);
}
// ── R1 TRUE-POSITIVE LOCKS — genuine questions in FORM still fire (no regression from the fix) ──
assert(detectQuantityAmbiguities("Question 4: Is the total requirement 520 hours or 1,040 hours?").length === 1,
  "R1 LOCK — 'Question 4:' prefix + genuine question still fires (clause head skips the prefix)");
assert(detectQuantityAmbiguities("Isn't the requirement 3 FTEs or 5 FTEs?").length === 1,
  "R1 LOCK — genuine 'Isn't the requirement X or Y?' fires (interrogative head; terminal)");
assert(detectQuantityAmbiguities("Which is correct: 520 hours or 1,040 hours?").length === 1,
  "R1 LOCK — 'Which is correct: X or Y?' fires (pre-colon interrogative head)");

// ── R2 REGRESSION LOCKS — the "first-token-only" head over-fire: a fronted auxiliary that is NOT a question mood.
//    (a) CONDITIONAL/subjunctive PROTASIS (Should/Were/Will/Had/Could … = "If…") + a stray "?"; (b) DATE / HYPHEN-COMPOUND
//    openers whose first token merely spells an auxiliary (May 2026, Should-cost, Will-call, Would-be). Must NOT fire. ──
const R2_OVERFIRE: [string, string][] = [
  ["R2 protasis 'Should …, they must…?'", "Should offerors require 520 hours or 1,040 hours of surge, they must request approval from the KO?"],
  ["R2 protasis 'Were …, the ceiling would…?'", "Were the option exercised at 520 hours or 1,040 hours, the ceiling would adjust accordingly?"],
  ["R2 protasis 'Will …, the base remains…?'", "Will the Government furnish GFE, the base remains 520 hours or 1,040 hours as scoped?"],
  ["R2 protasis 'Had …, the CO would…?'", "Had funding permitted 520 hours or 1,040 hours, the CO would have said so — has it?"],
  ["R2 protasis 'Could …, offerors should…?'", "Could the effort be 520 hours or 1,040 hours under either profile, offerors should plan for both?"],
  ["R2 comma-aside 'Will …, given the base of…?'", "Will the option be exercised, given the base of 520 hours or 1,040 hours?"],
  ["R2 date-opener 'May 2026 …'", "May 2026 funding could support either 520 hours or 1,040 hours of effort; will the option be exercised?"],
  ["R2 compound 'Should-cost analysis …'", "Should-cost analysis assumed 520 hours or 1,040 hours across the two profiles; is Attachment 3 attached?"],
  ["R2 compound 'Will-call pickups …'", "Will-call pickups may total 520 units or 1,040 units per the delivery schedule; correct?"],
  ["R2 compound 'Would-be offerors …'", "Would-be offerors should note the ceiling is 520 hours or 1,040 hours depending on funding; questions?"],
];
for (const [label, src] of R2_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R2 LOCK — ${label}: fronted-aux-but-not-a-question does NOT fire`);
}
// ── R2/R7 — a genuine question with a trailing SUBORDINATE clause now SAFELY under-fires (R7 terminal-pair pivot: separating a
//    genuine subordinate tail from a glued apodosis by shape is an irreducible treadmill → require the pair terminal; the
//    trailing-clause recall is a sanctioned safe under-fire). ──
assert(detectQuantityAmbiguities("Isn't the requirement 3 FTEs or 5 FTEs, since the PWS is unclear?").length === 0,
  "R2/R7 — genuine question + trailing subordinate clause under-fires safely (terminal-pair pivot)");

// ── R3 REGRESSION LOCKS — conditional APODOSIS that evaded the R2 comma-gated reject: (a) apodosis OPENING with a
//    subordinator-list word ("…, as the CO directs, proceed?"), (b) COMMA-LESS fronted conditional ("Should X the CO
//    will confirm?"). A conditional protasis is not a which-quantity question → must NOT fire. ──
const R3_OVERFIRE: [string, string][] = [
  ["R3 apodosis 'as the CO directs, proceed'", "Should the base be 520 hours or 1,040 hours, as the CO directs, proceed with pricing?"],
  ["R3 apodosis 'where funded, offerors must comply'", "Should the base be 520 hours or 1,040 hours, where funded, offerors must comply?"],
  ["R3 apodosis 'when directed, proceed'", "Should the base be 520 hours or 1,040 hours, when directed, proceed accordingly?"],
  ["R3 apodosis 'per the CO, offerors shall comply'", "Should the base be 520 hours or 1,040 hours, per the CO, offerors shall comply?"],
  ["R3 apodosis 'while funding permits, remains open'", "Will the option be 520 hours or 1,040 hours, while funding permits, remains open?"],
  ["R3 apodosis 'given the budget, offerors proceed'", "Should the level be 520 hours or 1,040 hours, given the budget, offerors proceed?"],
  ["R3 comma-less 'the CO will confirm'", "Should the base be 520 hours or 1,040 hours the CO will confirm at award?"],
  ["R3 comma-less 'the ceiling would adjust'", "Were the effort 520 hours or 1,040 hours the ceiling would adjust upward?"],
];
for (const [label, src] of R3_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R3 LOCK — ${label}: conditional protasis w/ apodosis does NOT fire`);
}
// ── R3 TRUE-POSITIVE LOCKS — genuine fronted-auxiliary QUESTIONS (pair terminal, no apodosis) still fire ──
assert(detectQuantityAmbiguities("Should the estimate be 520 hours or 1,040 hours?").length === 1,
  "R3 LOCK — genuine 'Should the estimate be X or Y?' (terminal, no apodosis) still fires");
assert(detectQuantityAmbiguities("Is the total 520 hours or 1,040 hours, since the PWS is unclear?").length === 0,
  "R3/R7 — genuine question + subordinate tail now under-fires safely (terminal-pair pivot)");

// ── R4 REGRESSION LOCKS (P0) — IMPERATIVE-apodosis conditionals (verb NOT in any modal/copula list). A conditional-capable
//    fronted auxiliary + any non-terminal instruction tail → must NOT fire (verb-vocabulary-independent terminal gate). ──
const R4_OVERFIRE: [string, string][] = [
  ["R4 imp 'then submit'", "Should the base be 520 hours or 1,040 hours, then submit your revised price?"],
  ["R4 imp 'notify the KO'", "Should the base be 520 hours or 1,040 hours, notify the KO immediately?"],
  ["R4 imp 'provide a breakdown'", "Should the base be 520 hours or 1,040 hours, provide a full breakdown?"],
  ["R4 imp 'resubmit'", "Should the base be 520 hours or 1,040 hours, resubmit within five days?"],
  ["R4 imp 'contact the CO'", "Should the base be 520 hours or 1,040 hours, contact the Contracting Officer?"],
  ["R4 imp 'plan for both'", "Should the base be 520 hours or 1,040 hours, plan for both profiles?"],
  ["R4 imp 'price accordingly'", "Should the base be 520 hours or 1,040 hours, price accordingly?"],
  ["R4 imp 'otherwise stop'", "Should the base be 520 hours or 1,040 hours, otherwise stop and query the CO?"],
  ["R4 subord+imperative 'as directed, submit'", "Should the base be 520 hours or 1,040 hours, as directed, submit revised pricing?"],
];
for (const [label, src] of R4_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R4 LOCK — ${label}: imperative-apodosis conditional does NOT fire`);
}
// ── R4/R5 — 'How many — X or Y — are required?' now SAFELY under-fires: R5 tightened to require the pair be the
//    interrogated content (terminal, no trailing main-clause predicate). A postposed predicate ("are required") is
//    indistinguishable from an apodosis by shape, so this niche appositive form is dropped (SAFE under-fire, documented). ──
assert(detectQuantityAmbiguities("How many — 520 hours or 1,040 hours — are required?").length === 0,
  "R4/R5 — 'How many … are required?' under-fires safely (postposed predicate ≈ apodosis; pair not terminal)");

// ── R4 REGRESSION LOCKS (P1, DANGEROUS) — false dedup-suppression must NOT silence a REAL emission ──
const DRV = "Is the total requirement 520 hours or 1,040 hours?";
const unrelated = (o: Partial<TypedFinding>) => on([base(o)], DRV);
assert(unrelated({ requirement: "Prior experience: 520 or more staff-hours; have you performed 1,040 similar hours? See §L." }).some((f) => f.quantityAmbiguityFlagged),
  "R4 LOCK — an unrelated staff-hours finding does NOT suppress the real 520/1,040 emission (no bare 'or…?' dedup)");
assert(unrelated({ requirement: "Page limits: 520 or fewer pages, or up to 1,040 KB per file?" }).some((f) => f.quantityAmbiguityFlagged),
  "R4 LOCK — an unrelated page/KB question does NOT suppress the real emission");
assert(unrelated({ requirement: "FAR 52.219-1040 applies; CAGE 5W520; is the reps-cert current or expired?" }).some((f) => f.quantityAmbiguityFlagged),
  "R4 LOCK — clause/CAGE digit-substrings (52.219-1040, 5W520) do NOT satisfy hasNum → no false suppression");
assert(unrelated({ requirement: "Is the offer certified or not?", citation: "PWS 5.2.520 / SOW 1040.3", excerpt: "x" }).some((f) => f.quantityAmbiguityFlagged),
  "R4 LOCK — citation section digits (5.2.520, 1040.3) do NOT satisfy hasNum → no false suppression");
// dedup STILL holds where it should — a finding that genuinely names the pair as unresolved suppresses the duplicate:
assert(!unrelated({ requirement: "The 520 vs 1,040 hours quantity is ambiguous and unresolved." }).some((f) => f.quantityAmbiguityFlagged),
  "R4 LOCK — a genuine '520 vs 1,040 … ambiguous/unresolved' finding STILL suppresses the duplicate (dedup intact)");

// ── R5 REGRESSION LOCKS (P0) — INTERROGATIVE-headed sentence whose either/or pair is a DECLARATIVE ASIDE (the question is
//    about something else). Must NOT fire (the pair is not the interrogated content). ──
const R5_OVERFIRE: [string, string][] = [
  ["R5 'Is your firm ready — the base is X…, correct?'", "Is your firm ready — the base is 520 hours or 1,040 hours, correct?"],
  ["R5 'Are there questions on the X estimate?'", "Are there questions on the 520 hours or 1,040 hours estimate shown in the schedule?"],
  ["R5 'Does the offeror understand the estimate is X?'", "Does the offeror understand the estimate is 520 hours or 1,040 hours as scoped?"],
  ["R5 'Which attachment applies: the schedule lists X?'", "Which attachment applies: the schedule lists 520 hours or 1,040 hours across the two profiles?"],
  ["R5 'Do note the base is X, right?'", "Do note the base is 520 hours or 1,040 hours in the schedule, right?"],
  ["R5 'Does the page limit apply to the X table?'", "Does the page limit apply to the 520 hours or 1,040 hours staffing table in Volume II?"],
  ["R5 'Are offerors required to price the X?'", "Are offerors required to price the 520 hours or 1,040 hours reflected in Attachment 3?"],
  ["R5 'Is it clear that the base is X?'", "Is it clear that the base is 520 hours or 1,040 hours depending on funding availability?"],
  ["R5 'How many volumes cover the X?'", "How many volumes cover the 520 hours or 1,040 hours of effort described in the PWS?"],
  ["R5 'Which section governs: the PWS states X?'", "Which section governs: the PWS states 520 hours or 1,040 hours by option year?"],
];
for (const [label, src] of R5_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R5 LOCK — ${label}: interrogative-headed declarative-aside pair does NOT fire`);
}
// ── R5 TRUE-POSITIVE LOCKS — the pair IS the interrogated content (subject region a bare NP; tail terminal/subordinate) ──
const R5_TRUEPOS: [string, string][] = [
  ["genuine 'Is the total requirement X or Y?'", "Is the total requirement 520 hours or 1,040 hours?"],
  ["genuine copula 'Is the estimate X or Y?'", "Is the estimate 520 hours or 1,040 hours?"],
  ["genuine modal 'Should the LOE be X or Y?'", "Should the LOE be 520 hours or 1,040 hours?"],
];
for (const [label, src] of R5_TRUEPOS) {
  assert(detectQuantityAmbiguities(src).length === 1, `R5 LOCK — ${label} STILL fires (pair is the interrogated content)`);
}
// ── R5 dedup P2 — a genuine prior finding naming the pair with trailing punctuation ('1,040-hour', '1,040.') STILL suppresses
//    (no double emission), while the R4 substring-collision guard is preserved. ──
assert(!on([base({ requirement: "the unresolved 520-hour or 1,040-hour ambiguity persists" })], "Is the total requirement 520 hours or 1,040 hours?").some((f) => f.quantityAmbiguityFlagged),
  "R5 LOCK — hyphenated adjectival '1,040-hour' in a genuine unresolved finding STILL dedups (no double emission)");

// ── R6 REGRESSION LOCKS (P1) — a subordinator/preposition GLUED (no comma) to a main-clause apodosis/directive. The tail
//    strip must NOT swallow the glued main clause → must NOT fire. ──
const R6_OVERFIRE: [string, string][] = [
  ["R6 glued 'per Attachment 3 notify the CO'", "Is the base 520 hours or 1,040 hours per Attachment 3 notify the CO?"],
  ["R6 glued 'per Attachment 3 confirm'", "Is the base 520 hours or 1,040 hours per Attachment 3 confirm before pricing?"],
  ["R6 glued 'as directed the offeror shall price'", "Is the base 520 hours or 1,040 hours, as directed the offeror shall price both?"],
  ["R6 glued 'as shown the CO will confirm'", "Is the base 520 hours or 1,040 hours as shown the CO will confirm at award?"],
  ["R6 glued 'where applicable submit'", "Is the base 520 hours or 1,040 hours, where applicable submit revised pricing?"],
  ["R6 glued 'when the CO directs award'", "Is the base 520 hours or 1,040 hours when the CO directs award?"],
  ["R6 glued 'as the option is unfunded assume'", "Is the base 520 hours or 1,040 hours as the option is unfunded assume the base only?"],
];
for (const [label, src] of R6_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R6 LOCK — ${label}: glued main-clause apodosis does NOT fire`);
}
// comma-ful natural forms (already rejected) stay rejected:
assert(detectQuantityAmbiguities("Is the base 520 hours or 1,040 hours, as shown, the CO will confirm at award?").length === 0,
  "R6 LOCK — comma-ful subordinate + main clause stays rejected");
// ── R6 TRUE-POSITIVE — multi-colon label-prefixed genuine question now fires (P2-1 fix) ──
assert(detectQuantityAmbiguities("Section L: Which is correct: 520 hours or 1,040 hours?").length === 1,
  "R6 LOCK — 'Section L: Which is correct: X or Y?' fires (multi-colon label prefix resolved)");
assert(detectQuantityAmbiguities("Q&A: Which is correct: 520 hours or 1,040 hours?").length === 1,
  "R6 LOCK — 'Q&A: Which is correct: X or Y?' fires");
// causal-subordinate tail now under-fires (R7 terminal-pair pivot — sanctioned safe recall trade):
assert(detectQuantityAmbiguities("Is the total 520 hours or 1,040 hours, because the PWS is unclear?").length === 0,
  "R6/R7 — causal 'because …' subordinate tail now under-fires safely (terminal-pair pivot)");

// ── R7 REGRESSION LOCKS (P1) — a main-clause apodosis GLUED (no comma) to a CAUSAL/CONCESSIVE subordinator (the set R6 kept).
//    The R7 terminal-pair pivot removes the tail allowance entirely → all reject (no greedy-strip surface). ──
const R7_OVERFIRE: [string, string][] = [
  ["R7 glued causal 'since funding lapsed proceed'", "Is the base 520 hours or 1,040 hours since funding lapsed proceed with the base only?"],
  ["R7 glued causal 'because the option is unfunded notify'", "Is the base 520 hours or 1,040 hours because the option is unfunded notify the CO?"],
  ["R7 glued concessive 'although uncertain price both'", "Is the base 520 hours or 1,040 hours although uncertain price both scenarios?"],
  ["R7 glued concessive 'though pending submit'", "Is the base 520 hours or 1,040 hours though pending submit revised pricing?"],
  ["R7 glued 'whereas the CO decides award'", "Is the base 520 hours or 1,040 hours whereas the CO decides award the base?"],
  ["R7 temporal 'since award the CO will confirm'", "Is the base 520 hours or 1,040 hours since award the CO will confirm both?"],
];
for (const [label, src] of R7_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R7 LOCK — ${label}: glued apodosis does NOT fire (terminal-pair pivot)`);
}
// R7 pivot — a genuine NO-comma causal tail also now under-fires (documented safe recall trade), while every TERMINAL genuine
// which-quantity question (the real defect shape) still fires:
assert(detectQuantityAmbiguities("Is the requirement 520 hours or 1,040 hours since the schedule and PWS disagree?").length === 0,
  "R7 — genuine no-comma causal tail now under-fires safely (terminal-pair pivot)");
assert(detectQuantityAmbiguities("Is the total requirement 520 hours or 1,040 hours?").length === 1,
  "R7 LOCK — the real terminal DRIVER shape still fires (the alternatives at the end)");

// ── R8 REGRESSION LOCKS (P1, doctrine-decisive) — an embedded-declarative CLARITY question whose second-clause verb is an
//    OPEN-CLASS finite verb (NOT in any report-verb list). Detected structurally by verb MORPHOLOGY → must NOT fire. ──
const R8_OVERFIRE: [string, string][] = [
  ["R8 open-verb 'clear … assumes'", "Is it clear the schedule assumes 520 hours or 1,040 hours?"],
  ["R8 open-verb 'true … projects'", "Is it true the model projects 520 hours or 1,040 hours?"],
  ["R8 open-verb 'correct … allocates'", "Is it correct the base allocates 520 hours or 1,040 hours?"],
  ["R8 open-verb 'position … carries'", "Is it the government's position the base carries 520 hours or 1,040 hours?"],
  ["R8 open-verb 'accurate … yields'", "Is it accurate the model yields 520 hours or 1,040 hours?"],
  ["R8 open-verb 'right … spans'", "Is it right the effort spans 520 hours or 1,040 hours?"],
  ["R8 open-verb 'settled … runs'", "Is it settled the option runs 520 hours or 1,040 hours?"],
  ["R8 open-verb 'clear … comprises'", "Is it clear the base comprises 520 hours or 1,040 hours?"],
  ["R8 open-verb 'true … anticipates'", "Is it true the schedule anticipates 520 hours or 1,040 hours?"],
  ["R8 open-verb 'clear … encompasses'", "Is it clear the scope encompasses 520 hours or 1,040 hours?"],
  ["R8 open-verb 'right … tallies'", "Is it right the sheet tallies 520 hours or 1,040 hours?"],
  ["R8 do-support 'Does … understand … allocates'", "Does the offeror understand the estimate allocates 520 hours or 1,040 hours?"],
];
for (const [label, src] of R8_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R8 LOCK — ${label}: open-class embedded finite verb does NOT fire (morphological bare-NP check)`);
}
// R8 controls — the R5 LISTED-verb declarative-asides (now caught by morphology, not the list) still reject:
assert(detectQuantityAmbiguities("Is it clear the schedule covers 520 hours or 1,040 hours?").length === 0,
  "R8 LOCK — a LISTED-verb ('covers') declarative-aside still rejects (via morphology now)");
// R8 fixes the R5 P2 'these' under-fire — a bare demonstrative subject is a genuine terminal which-qty question:
assert(detectQuantityAmbiguities("Are these 520 hours or 1,040 hours?").length === 1,
  "R8 LOCK — 'Are these X or Y?' fires (bare demonstrative subject, no finite verb)");
// R8 true-positives — genuine terminal questions with bare-NP / gerund / possessive subjects still fire:
for (const [label, src] of [
  ["gerund subject 'Is staffing X or Y?'", "Is staffing 520 hours or 1,040 hours?"],
  ["possessive subject \"Is the offeror's base X or Y?\"", "Is the offeror's base 520 hours or 1,040 hours?"],
  ["CLIN-number subject 'Is CLIN 0001 X or Y?'", "Is CLIN 0001 520 hours or 1,040 hours?"],
] as [string, string][]) {
  assert(detectQuantityAmbiguities(src).length === 1, `R8 LOCK — ${label} still fires (bare-NP subject)`);
}

// ── R9 REGRESSION LOCKS (P1) — an embedded finite verb with NO -s/-es/-ed morphology: a BASE-FORM verb (I/you/we/they/plural
//    subject) or a no-morphology IRREGULAR (ran/set/put/cost). Closed positionally by the extraposition / do-support frame. ──
const R9_OVERFIRE: [string, string][] = [
  ["R9 base-verb 'you allocate'", "Is it clear you allocate 520 hours or 1,040 hours?"],
  ["R9 base-verb 'we assume'", "Is it clear we assume 520 hours or 1,040 hours?"],
  ["R9 base-verb 'they require'", "Is it clear they require 520 hours or 1,040 hours?"],
  ["R9 base-verb 'they yield'", "Is it true they yield 520 hours or 1,040 hours?"],
  ["R9 base-verb 'you price'", "Is it clear you price 520 hours or 1,040 hours?"],
  ["R9 base-verb 'we plan'", "Is it clear we plan 520 hours or 1,040 hours?"],
  ["R9 irregular 'the base ran'", "Is it clear the base ran 520 hours or 1,040 hours?"],
  ["R9 irregular 'the estimate set'", "Is it clear the estimate set 520 hours or 1,040 hours?"],
  ["R9 irregular 'the option cost'", "Is it clear the option cost 520 hours or 1,040 hours?"],
  ["R9 irregular 'you put'", "Is it clear you put 520 hours or 1,040 hours?"],
  ["R9 do-support 'Does … understand … set'", "Does the offeror understand the estimate set 520 hours or 1,040 hours?"],
];
for (const [label, src] of R9_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R9 LOCK — ${label}: base/irregular embedded verb does NOT fire (extraposition/do-support frame)`);
}
// R9 true-positive controls — the bare-expletive genuine question ("Is it 520 or 1,040 hours?") and genuine bare-NP subjects
// still fire (the frame guards only reject expletive+content / do-support, not a legitimate copula complement):
assert(detectQuantityAmbiguities("Is it 520 hours or 1,040 hours?").length === 1,
  "R9 LOCK — bare expletive 'Is it X or Y?' still fires (nothing after 'it' → pair IS the complement)");
assert(detectQuantityAmbiguities("Is the total requirement 520 hours or 1,040 hours?").length === 1,
  "R9 LOCK — genuine bare-NP DRIVER shape still fires");

// ── R10 REGRESSION LOCKS (P1) — a NOUN-HEADED zero-'that' content clause (neither expletive 'it/there' nor do-support): the
//    embedded clause introduces a SECOND clause-subject (a personal pronoun-with-content, or a second determiner-headed NP).
//    Closed positionally → must NOT fire. ──
const R10_OVERFIRE: [string, string][] = [
  ["R10 'the assumption you bill'", "Is the assumption you bill 520 hours or 1,040 hours?"],
  ["R10 'the reading we owe'", "Is the reading we owe 520 hours or 1,040 hours?"],
  ["R10 'the premise they staff'", "Is the premise they staff 520 hours or 1,040 hours?"],
  ["R10 'the premise the base run'", "Is the premise the base run 520 hours or 1,040 hours?"],
  ["R10 'the premise the plan put'", "Is the premise the plan put 520 hours or 1,040 hours?"],
  ["R10 'the premise the crew set'", "Is the premise the crew set 520 hours or 1,040 hours?"],
  ["R10 'the premise the base cost'", "Is the premise the base cost 520 hours or 1,040 hours?"],
  ["R10 'the men we hire'", "Are the men we hire 520 hours or 1,040 hours?"],
  ["R10 'Shall the estimate you keep'", "Shall the estimate you keep 520 hours or 1,040 hours?"],
  ["R10 'your understanding we bill'", "Is your understanding we bill 520 hours or 1,040 hours?"],
  ["R10 'Which do the parties bill'", "Which do the parties bill: 520 hours or 1,040 hours?"],
];
for (const [label, src] of R10_OVERFIRE) {
  assert(detectQuantityAmbiguities(src).length === 0, `R10 LOCK — ${label}: noun-headed embedded content clause does NOT fire (positional bare-NP)`);
}
// R10 true-positive controls — genuine single-determiner bare-NP subjects (incl. a sole subject pronoun) still fire:
for (const [label, src] of [
  ["genuine sole-pronoun 'Are they X or Y?'", "Are they 520 hours or 1,040 hours?"],
  ["genuine possessive 'Is your estimate X or Y?'", "Is your estimate 520 hours or 1,040 hours?"],
  ["genuine single-det DRIVER", "Is the total requirement 520 hours or 1,040 hours?"],
] as [string, string][]) {
  assert(detectQuantityAmbiguities(src).length === 1, `R10 LOCK — ${label} still fires`);
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILED`} — Unit 5 quantity-ambiguity fidelity ($0 suite)`);
process.exit(failures === 0 ? 0 : 1);
