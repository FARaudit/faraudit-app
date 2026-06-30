// $0 UNIT PROOF for Step 9 (AUDIT_HONESTFAIL_NO_CHARGE) — the honest-fail no-charge billing guard.
// Run: npx tsx src/lib/audit-billing.test.ts
//
// PRINCIPLE under test (Brain ruling 2026-06-29): a customer is charged ONLY for a delivered COMMITTAL verdict.
//   honest-fail (no-charge) set = INCOMPLETE, NEEDS_HUMAN_REVIEW, OUT_OF_SCOPE, panel HONEST_FAILURE.
//   committal (billable) set     = BID, BID_WITH_CAUTION, NO_BID, INELIGIBLE.
// Cases: billable=false for ALL FOUR honest-fail signals when flag ON; billable=true for ALL committal verdicts
//   always; billable=true for EVERYTHING when flag OFF (byte-identical to today). flag is INJECTED (pure) — no
//   process.env mutation, no DB, no engine call.
import { isHonestFail, billable, HONEST_FAIL_VERDICTS, COMMITTAL_VERDICTS } from "./audit-billing";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const FLAG_ON = true, FLAG_OFF = false;
const COMMITTAL = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE"];

// The four honest-fail SIGNALS (two are verdicts; two are out-of-band flags from the not-yet-wired panel-runner).
const HONEST_FAIL_SIGNALS: Array<[string, { verdict: string; outOfScope?: boolean; panelHonestFailure?: boolean }]> = [
  ["verdict INCOMPLETE",            { verdict: "INCOMPLETE" }],
  ["verdict NEEDS_HUMAN_REVIEW",    { verdict: "NEEDS_HUMAN_REVIEW" }],
  ["signal OUT_OF_SCOPE",           { verdict: "BID", outOfScope: true }],          // committal verdict but OOS ⇒ honest-fail
  ["signal panel HONEST_FAILURE",   { verdict: "BID", panelHonestFailure: true }],  // committal verdict but panel-HF ⇒ honest-fail
];

console.log("── isHonestFail: all four signals classify as honest-fail ──");
for (const [name, sig] of HONEST_FAIL_SIGNALS) assert(isHonestFail(sig) === true, `${name} → isHonestFail=true`);

console.log("── isHonestFail: committal verdicts (no OOS/panel flag) are NOT honest-fail ──");
for (const v of COMMITTAL) assert(isHonestFail({ verdict: v }) === false, `${v} → isHonestFail=false`);

console.log("── FLAG ON: every honest-fail signal is NOT billable (no charge) ──");
for (const [name, sig] of HONEST_FAIL_SIGNALS) assert(billable(isHonestFail(sig), FLAG_ON) === false, `${name} + flag ON → billable=false`);

console.log("── FLAG ON: every committal verdict IS billable ──");
for (const v of COMMITTAL) assert(billable(isHonestFail({ verdict: v }), FLAG_ON) === true, `${v} + flag ON → billable=true`);

console.log("── FLAG OFF: EVERYTHING is billable (byte-identical to today) ──");
for (const [name, sig] of HONEST_FAIL_SIGNALS) assert(billable(isHonestFail(sig), FLAG_OFF) === true, `${name} + flag OFF → billable=true`);
for (const v of COMMITTAL) assert(billable(isHonestFail({ verdict: v }), FLAG_OFF) === true, `${v} + flag OFF → billable=true`);

console.log("── set integrity: honest-fail ∩ committal = ∅, and the verdict enum is partitioned ──");
const overlap = [...HONEST_FAIL_VERDICTS].filter((v) => COMMITTAL_VERDICTS.has(v));
assert(overlap.length === 0, `no verdict is both honest-fail and committal (overlap=${JSON.stringify(overlap)})`);
assert(HONEST_FAIL_VERDICTS.has("INCOMPLETE") && HONEST_FAIL_VERDICTS.has("NEEDS_HUMAN_REVIEW"), "honest-fail verdict set = {INCOMPLETE, NEEDS_HUMAN_REVIEW}");
assert(COMMITTAL_VERDICTS.size === 4, "committal verdict set has the 4 committal verdicts");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — Step 9 billing guard.`);
process.exit(failures === 0 ? 0 : 1);
