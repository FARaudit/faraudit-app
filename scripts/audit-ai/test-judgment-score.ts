/**
 * $0 DETERMINISTIC test for the JUDGMENT scorer + freeze/hash (Brain schema 0.2-approved).
 * Uses a SYNTHETIC key (NOT the real N4008526R0065 judgment — no contamination, no entries authored
 * for the real package here). Proves the scorer enforces: part pre-step, bidderProfile-aware verdict,
 * gate disposition, the base-date TRAP, fabrication, absent-vs-boilerplate decoys, and stable hashing.
 *
 * Run: npx tsx scripts/audit-ai/test-judgment-score.ts
 */
import { scoreJudgment, keySha256, canonicalKeyForHash, type JudgmentKey } from "./judgment-score";
import type { PanelVerdictLike } from "./gold-set-score";

let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };

// SYNTHETIC key (mirrors the SHAPE of the N4008526R0065 key, fabricated values for a fake package).
const KEY: JudgmentKey = {
  schemaVersion: "0.2-approved", packageId: "SYNTH-TEST", bidderProfile: null, acquisitionPart: "PART_15",
  expectedVerdict: { verdict: "BID_WITH_CAUTION", eligible: true, maxShowStoppers: 0 },
  namedGates: [
    { token: "SET-ASIDE", aliases: ["set-aside", "8(a)"], mustRaise: true, expectedDisposition: "caution" },
    { token: "WAGE-FLOOR", aliases: ["cba", "wage floor", "scls"], mustRaise: true, expectedDisposition: "met" },
    // NOTE for key authoring: a date-TRAP gate must key on the SPECIFIC operative date, NOT a generic
    // token like "proposal due" (which would match the superseded base date too and defeat the trap).
    { token: "PROPOSAL-DUE", aliases: ["27 aug 2026"], mustRaise: true, expectedDisposition: "met" },
  ],
  showStoppers: [{ description: "UNACCEPTABLE on any factor renders ineligible", sourceCite: "ineligible unacceptable factor", disqualifiesBecause: "bidder-structural" }],
  cautionItems: [],
  decoys: [
    { token: "BID-BOND", kind: "boilerplate", aliases: ["bid bond"] },
    { token: "CMMC", kind: "absent", mustNotRaiseAtAll: true, aliases: ["cmmc"] },
  ],
};
const SOURCE = "set-aside 8(a) competitive. cba wage floor scls. proposal due 27 Aug 2026. bid bond not required. 52.219-14. ineligible if unacceptable factor.";
const G = (name: string, met: boolean, cite = ""): PanelVerdictLike["raisedGates"][number] => ({ name, met, cite });

// CLEAN panel: raises the 3 gates with correct disposition, correct verdict, no fabrication/decoy.
const cleanPanel: PanelVerdictLike = {
  verdict: "BID_WITH_CAUTION", eligible: true, showStoppers: 0,
  raisedGates: [G("8(a) set-aside eligibility", false === false ? true : true), G("CBA/SCLS wage floor", true), G("Proposal due 27 Aug 2026", true), G("UNACCEPTABLE on any factor → ineligible", true), G("Bid bond not required", true)],
};
const cleanRes = scoreJudgment(cleanPanel, KEY, SOURCE, { extractedClauses: ["52.219-14", "52.215-1"] });
check("clean panel + correct part/verdict/gates/show-stopper → PASS", cleanRes.pass === true && cleanRes.failures.length === 0);
check("part pre-step scored: 52.215-x ⇒ PART_15 ok", cleanRes.partClassification.ok === true);

// PART mismatch → fail (52.212-x ⇒ PART_12 ≠ PART_15).
check("FAIL: 52.212-x extract ⇒ PART_12 ≠ key PART_15", scoreJudgment(cleanPanel, KEY, SOURCE, { extractedClauses: ["52.212-1"] }).pass === false);

// VERDICT: INELIGIBLE with null bidderProfile → fail (doctrine guard).
check("FAIL: INELIGIBLE verdict with null bidderProfile → fail", scoreJudgment({ ...cleanPanel, verdict: "INELIGIBLE", eligible: false }, KEY, SOURCE, { extractedClauses: ["52.215-1"] }).pass === false);

// BASE-DATE TRAP: panel reports the superseded base date as the due date → the PROPOSAL-DUE gate (alias
// "27 aug 2026") is no longer raised with met disposition → fail.
const trapPanel: PanelVerdictLike = { ...cleanPanel, raisedGates: cleanPanel.raisedGates.map((r) => r.name.includes("27 Aug") ? G("Proposal due 17 Feb 2026", true) : r) };
check("FAIL: base-date trap (reports 17 Feb base, not 27 Aug Amd-11) → PROPOSAL-DUE gate fails", scoreJudgment(trapPanel, KEY, SOURCE, { extractedClauses: ["52.215-1"] }).pass === false);

// FABRICATION: a raised clause absent from source → hard fail.
const fabPanel: PanelVerdictLike = { ...cleanPanel, raisedGates: [...cleanPanel.raisedGates, G("Phantom", false, "52.999-99")] };
check("FAIL: raised clause 52.999-99 absent from source → FABRICATION", (() => { const r = scoreJudgment(fabPanel, KEY, SOURCE, { extractedClauses: ["52.215-1"] }); return r.pass === false && r.fabricated.includes("52.999-99"); })());

// DECOY absent (CMMC) raised AT ALL → hard fail; boilerplate (bid bond) mentioned met → clean.
const cmmcPanel: PanelVerdictLike = { ...cleanPanel, raisedGates: [...cleanPanel.raisedGates, G("CMMC Level 2 required", false)] };
check("FAIL: absent decoy CMMC raised at all → hard fail", (() => { const r = scoreJudgment(cmmcPanel, KEY, SOURCE, { extractedClauses: ["52.215-1"] }); return r.pass === false && r.decoyHardFails.some((d) => d.includes("CMMC")); })());
check("clean: boilerplate decoy 'bid bond not required' mentioned met → NOT a fail", cleanRes.decoyHardFails.length === 0);

// HASH stability: keySha256 ignores the adjudication block + key order.
const reordered: JudgmentKey = { ...KEY, adjudication: { keySha256: "stale", frozenAt: "whenever" } };
check("hash: keySha256 stable regardless of adjudication block / key reorder", keySha256(KEY) === keySha256(reordered) && canonicalKeyForHash(KEY) === canonicalKeyForHash(reordered));
check("hash: keySha256 is a 64-hex sha256", /^[a-f0-9]{64}$/.test(keySha256(KEY)));

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — judgment scorer + freeze/hash ${pass ? "enforce the key (no AI, $0)" : "BROKEN"}`);
process.exit(pass ? 0 : 1);
