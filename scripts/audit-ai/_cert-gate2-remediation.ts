// GATE-2 REMEDIATION REGRESSION CERT (2026-07-19) — locks the 4 P0/P1 fixes to the Phase-5 passive-frame detector +
// covered_direct belt from the pre-live ultracode review, PLUS the P1-1 revert guard. $0, pure-function (no network).
//   P0-1  'prerequisite for award / to submitting a proposal' synonym of the covered 'precondition' now FLAGs.
//   P0-2  reversed-participle offeror bar ("offerors certified to ISO 9001") no longer laundered to covered_direct.
//   P1-2  a bid/award CONSEQUENCE vetoes the post-award-cure release (FCL "maintained throughout performance" that ALSO
//         says "will not be considered" is still a pre-award bar).
//   P1-3  incumbent/predecessor NARRATIVE release is now offeror-aware (a comparative bar naming the incumbent still FLAGs).
//   P1-1  ASSESSED + DELIBERATELY LEFT as an accepted over-fire — every proximity/same-clause narrowing regressed real
//         split-clause bars (QPL "must appear at bid opening; non-listed items are not acceptable") into the catastrophic
//         under-fire direction. This cert pins that QPL bar as a MUST-FLAG guard so the seam is never re-narrowed.
// NOTE (accepted safe-direction cost): the P1-2 fix adds ONE gauntlet over-fire (r2-11, a performance-renewal ITAR
//   contingency) — over-fire is human-review-safe; the trade closes 2 catastrophic under-fires. Full battery: gauntlet
//   UNDER-FIRE=5 (baseline, zero new), covered_direct over/under = 0/0, passive-corpus 31/31, tsc clean.
import { readFileSync } from "fs";
import { passiveFrameEligBarSentence } from "../../src/lib/audit-orchestrator";

// Reconstruct the covered_direct belt regexes for the isNonBidderEligibilitySentence repro (module-internal).
const src = readFileSync("src/lib/audit-orchestrator.ts", "utf8");
function grab(name: string): RegExp {
  const m = src.match(new RegExp(`const ${name} = (/[\\s\\S]*?/[a-z]*);`));
  if (!m) throw new Error("not found: " + name);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}
const FIRM_CREDENTIAL_RE = grab("FIRM_CREDENTIAL_RE");
const THING_LEAD_RE = grab("THING_LEAD_RE");
const FORM_FIELD_8A_RE = grab("FORM_FIELD_8A_RE");
const ACCEPTANCE_OBJECT_RE = grab("ACCEPTANCE_OBJECT_RE");
// OFFEROR_ELIG_BOUND_RE is built via new RegExp(`...`) — extract _OFF + the template
const offM = src.match(/const _OFF = "([^"]+)";/)!;
const _OFF = offM[1];
const tmplM = src.match(/const OFFEROR_ELIG_BOUND_RE = new RegExp\(`([\s\S]*?)`, "i"\);/)!;
// The template is JS source (\\b, \\s escapes); substitute _OFF then collapse the source-level double-backslashes.
const OFFEROR_ELIG_BOUND_RE = new RegExp(tmplM[1].replace(/\$\{_OFF\}/g, _OFF).replace(/\\\\/g, "\\"), "i");
function isNonBidderEligibilitySentence(s: string): boolean {
  if (FIRM_CREDENTIAL_RE.test(s)) return false;
  if (OFFEROR_ELIG_BOUND_RE.test(s)) return false;
  return THING_LEAD_RE.test(s) || FORM_FIELD_8A_RE.test(s) || ACCEPTANCE_OBJECT_RE.test(s);
}

let fails = 0;
function want(label: string, got: boolean, exp: boolean) {
  const ok = got === exp;
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "REPRO"} [${label}] got=${got} want=${exp}`);
}
console.log("=== P0-1: prerequisite synonym (want passive detector TRUE) ===");
want("P0-1a facility-clearance prereq", passiveFrameEligBarSentence("An active facility clearance is a prerequisite for award of this contract."), true);
want("P0-1b TS/SCI prereq submit", passiveFrameEligBarSentence("Possession of a TS/SCI clearance is a prerequisite to submitting a proposal."), true);
want("P0-1c FCL prereq award", passiveFrameEligBarSentence("An FCL at the Secret level is a prerequisite for award."), true);

console.log("=== P0-2: reversed-participle offeror bar → isNonBidder should be FALSE (keep/floor) ===");
want("P0-2a offerors certified ISO9001", isNonBidderEligibilitySentence("Products shall be supplied only by offerors certified to ISO 9001."), false);
want("P0-2b firms certified ISO9001", isNonBidderEligibilitySentence("Products shall be supplied only by firms certified to ISO 9001."), false);
want("P0-2c vendors accredited AS9100", isNonBidderEligibilitySentence("Goods shall be furnished by vendors accredited to AS9100."), false);
want("P0-2d contractors qualified ISO9001", isNonBidderEligibilitySentence("Materials must be supplied by contractors qualified to ISO 9001."), false);

console.log("=== P1-1: accepted over-fire (narrowing regressed real bars — see header) ===");
// The worksite co-residence sentence over-fires (safe direction). Documented, NOT narrowed.
want("P1-1 worksite over-fire ACCEPTED (true)", passiveFrameEligBarSentence("Failure to submit the pricing narrative will not be considered; welding is performed in the secret clearance annex."), true);
// P1-1 REVERT GUARD — a real split-clause bar (noun in clause 1, operative consequence in clause 2) MUST still FLAG.
// Any future same-clause/proximity narrowing that breaks this reintroduces the catastrophic under-fire; keep this green.
want("P1-1 QPL split-clause bar MUST FLAG", passiveFrameEligBarSentence("Items offered must appear on the applicable Qualified Products List (QPL) at the time of bid opening; non-listed items are not acceptable."), true);

console.log("=== P1-2: cure-release preempts bid consequence (want TRUE) ===");
want("P1-2a FCL maintained+will-not-consider", passiveFrameEligBarSentence("Offerors must possess a favorably adjudicated FCL, which shall be maintained throughout performance; a firm lacking the clearance will not be considered."), true);
want("P1-2b only-firms-FCL maintained", passiveFrameEligBarSentence("Only firms holding an active FCL may propose; the clearance must be maintained during performance."), true);

console.log("=== P1-3: incumbent bare-token release suppresses offeror bar (want TRUE) ===");
want("P1-3a incumbent;offeror-nonresponsive", passiveFrameEligBarSentence("The incumbent holds a TS/SCI clearance; the offeror must possess an FCL and will be found nonresponsive without it."), true);
want("P1-3b unlike-incumbent offeror-ineligible", passiveFrameEligBarSentence("Unlike the incumbent, any new offeror lacking a facility clearance is ineligible for award."), true);

console.log(`\n${fails === 0 ? "ALL REPROS CLOSED" : `${fails} REPRO (open failures — pre-fix expected)`}`);
process.exit(0);
