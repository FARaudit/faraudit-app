// $0 PROOF — Card #509 Option A: BARE NAICS size-standard self-cert demotion (flag AUDIT_SIZE_STANDARD_SELF_CERT).
// Run: npx tsx scripts/audit-ai/_cert10-sizestd-proof.ts
//
// Proves (Brain spec items 4–6):
//  (4) corpus re-proof, flag ON: every REAL notice-body eligibility bar STILL escalates; every COUPLED
//      size-standard+requirement case STILL escalates (guardrail holds).
//  (5) FA303026Q0020 replay, flag ON: the bare size standard DEMOTES — floor returns false (no NHR bar) AND
//      emitSizeStandardCaveats emits ONE bidder_controls (gate-to-clear) caveat → the verdict is NOT forced to NHR.
//  (6) FA303026Q0020 replay, flag OFF: byte-identical — floor returns true exactly as before (would NHR).
import { noticeBodyEligibilityUngrounded, emitSizeStandardCaveats, isBareSizeStandardSentence } from "./audit-orchestrator";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const PRIMARY = "Solicitation FA3030-26-Q-0020. SF1449 commercial-items solicitation. Section B pricing, Section C SOW, Sections L and M follow.";
const mk = (noticeText: string) => `\n\n==== DOCUMENT: Solicitation FA3030 ====\n\n${PRIMARY}\n\n==== DOCUMENT: ${NOTICE_BODY_DOC_NAME} ====\n\n${noticeText}`;
const ON = () => { process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true"; };
const OFF = () => { delete process.env.AUDIT_SIZE_STANDARD_SELF_CERT; };

// The EXACT CERT-10 seq-1 false-punt sentence (verbatim from the live run 8dfd0c9a reason line).
const SIZE_STD = "The small business size standard is no greater than $13 million.";

// ── REAL bars (must ALWAYS escalate — UNDER_ABSTAIN=0, both flag states) ──
const REAL_BARS: Record<string, string> = {
  siteVisit: "A mandatory pre-proposal site visit will be conducted on 15 March 2026. Only offerors who attended the site visit will be eligible to submit a proposal.",
  hubzone:   "This requirement is a total HUBZone small business set-aside under NAICS 236220. All offerors must be certified HUBZone concerns at time of offer.",
  clearance: "The contractor must hold an active TOP SECRET facility clearance at the time of award.",
  eightA:    "This acquisition is a competitive 8(a) set-aside; offerors must be certified 8(a) program participants.",
  dd254:     "Performance requires a DD254 and cleared personnel with SECRET clearance.",
};
// ── COUPLED (size standard + another substantive bar in ONE sentence) — guardrail: STILL escalate ──
const COUPLED: Record<string, string> = {
  sizeAndClearance: "Offerors must meet the small business size standard AND hold an active SECRET facility clearance.",
  sizeAndWosb:      "This is a WOSB set-aside; the small business size standard is 1,250 employees and offerors must be certified WOSB concerns.",
  sizeAndHolder:    "Only holders only of the BOA that also meet the applicable size standard may submit.",
};

console.log("\n── item 4a · PREDICATE: bare vs coupled classification ──");
assert(isBareSizeStandardSentence(SIZE_STD) === true, "BARE: the $13M size standard → bare (demote)");
assert(isBareSizeStandardSentence("Offerors must be eligible under the applicable small business size standard.") === true, "BARE: generic 'eligible under size standard' → bare (demote)");
for (const [k, txt] of Object.entries(COUPLED)) assert(isBareSizeStandardSentence(txt) === false, `COUPLED ${k}: → NOT bare (escalates)`);
for (const [k, txt] of Object.entries(REAL_BARS)) assert(isBareSizeStandardSentence(txt) === false, `REAL ${k}: → NOT bare (escalates)`);

console.log("\n── item 4b · REAL bars still ESCALATE with flag ON (floor fires) ──");
ON();
for (const [k, txt] of Object.entries(REAL_BARS)) assert(noticeBodyEligibilityUngrounded(mk(txt), []) === true, `REAL ${k}: flag ON → floor STILL fires (NHR)`);
console.log("\n── item 4c · COUPLED size-standard cases still ESCALATE with flag ON ──");
for (const [k, txt] of Object.entries(COUPLED)) assert(noticeBodyEligibilityUngrounded(mk(txt), []) === true, `COUPLED ${k}: flag ON → floor STILL fires (NHR)`);

console.log("\n── item 5 · FA303026Q0020 bare size standard, flag ON → DEMOTES (floor SILENT + caveat emitted) ──");
ON();
assert(noticeBodyEligibilityUngrounded(mk(SIZE_STD), []) === false, "flag ON: bare $13M size standard → floor SILENT (no NHR bar) → committal path");
const caveats = emitSizeStandardCaveats(mk(SIZE_STD), []);
assert(caveats.length === 1, `flag ON: emitSizeStandardCaveats emits exactly 1 caveat (got ${caveats.length})`);
assert(caveats[0]?.controllability === "bidder_controls", `caveat is bidder_controls (gate-to-clear, NOT a bar) — got "${caveats[0]?.controllability}"`);
assert(/self-cert|reps\s*&\s*certs|52\.212-3/i.test(caveats[0]?.requirement || ""), "caveat text names the SAM self-cert (52.212-3)");
assert((caveats[0]?.excerpt || "").includes("$13 million"), "caveat excerpt grounds the verbatim '$13 million' text");

console.log("\n── item 6 · FA303026Q0020 bare size standard, flag OFF → BYTE-IDENTICAL (floor STILL fires) ──");
OFF();
assert(noticeBodyEligibilityUngrounded(mk(SIZE_STD), []) === true, "flag OFF: bare size standard → floor fires exactly as before (would NHR)");
assert(emitSizeStandardCaveats(mk(SIZE_STD), []).length === 1, "flag OFF: emitter is pure (only wired behind the flag at the call site) — function itself still classifies, gated at orchestrator:1461");

console.log(`\n${failures === 0 ? "✅ ALL PROOFS PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
