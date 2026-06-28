// $0 LOAD-BEARING REPLAY for the NO_BID key (doctrine: "build to doctrine first; prove with a load-bearing
// negative + replay"). Proves the frozen key (a) PASSES a correct NO_BID panel (gradeability — it is NOT a
// circular un-passable key like #4 v2 was) and (b) FAILS four distinct wrong engine outputs (discrimination).
// Pure scoreJudgment, NO model calls, NO paid run.
//   npx tsx scripts/audit-ai/test-nobid-key-replay.ts
import { readFileSync } from "node:fs";
import { scoreJudgment, type JudgmentKey } from "./judgment-score";
import type { PanelVerdictLike } from "./gold-set-score";

const GOLD = "scripts/audit-ai/gold-sets";
const key = JSON.parse(readFileSync(`${GOLD}/FA860126Q00260001.judgment.frozen.SYNTHETIC.json`, "utf8")) as JudgmentKey;
const source = readFileSync(`${GOLD}/FA860126Q00260001-FULL-SOURCE.complete.txt`, "utf8");
const PART12 = ["52.212-1", "52.212-2", "52.212-4"]; // → classifyAcquisitionPart = PART_12 (matches key)

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };

// The gate the engine SHOULD raise: cites the synthetic FAR anchors (in source → not fabricated) and contains
// the showStopper probe words (first/article/testing/non-waivable) so the show-stopper surfaces.
const impossibilityGate = {
  name: "First article testing is non-waivable and makes the 30-day-ARO production delivery universally unmeetable",
  met: false,
  cite: "FAR 52.209-4 (adapted): NON-WAIVABLE 60-day first article precondition; FAR 52.211-8 (adapted): 30 days ARO. 60 > 30.",
};
const correctAnalysis =
  "The delivery window is physically unmeetable from award: a non-waivable 60-day first article testing period must elapse before any production delivery, yet production delivery is mandated within 30 days ARO. No offeror can comply. This is a universal solicitation-side impossibility, not an eligibility bar — the offeror remains eligible. Verdict: NO_BID.";

// ── POSITIVE: a correct NO_BID engine output PASSES (gradeability) ──
const correct: PanelVerdictLike = { verdict: "NO_BID", eligible: true, showStoppers: 1, raisedGates: [impossibilityGate], showStopperTexts: [impossibilityGate.name] };
const rPos = scoreJudgment(correct, key, source, { extractedClauses: PART12, analysisText: correctAnalysis });
ok(rPos.pass, `POSITIVE — correct NO_BID panel PASSES (key is gradeable, not circular). ${rPos.pass ? "" : "failures: " + rPos.failures.join(" | ")}`);

// ── NEGATIVE 1: engine MISSES the impossibility, returns BID → must FAIL on verdict ──
const nBid: PanelVerdictLike = { verdict: "BID", eligible: true, showStoppers: 0, raisedGates: [], showStopperTexts: [] };
const r1 = scoreJudgment(nBid, key, source, { extractedClauses: PART12, analysisText: "Looks biddable; deliver within standard lead time." });
ok(!r1.pass && r1.failures.some((f) => /verdict/.test(f)), `NEGATIVE 1 — wrong verdict BID FAILS (verdict + unsurfaced impossibility). failures: ${r1.failures.length}`);

// ── NEGATIVE 2: engine raises the SET-ASIDE eligibility decoy → must HARD FAIL (mis-types as eligibility) ──
const nDecoy: PanelVerdictLike = {
  verdict: "NO_BID", eligible: true, showStoppers: 1,
  raisedGates: [impossibilityGate, { name: "small business set-aside eligibility not met by offeror", met: false, cite: "" }],
  showStopperTexts: [impossibilityGate.name],
};
const r2 = scoreJudgment(nDecoy, key, source, { extractedClauses: PART12, analysisText: correctAnalysis });
ok(!r2.pass && r2.decoyHardFails.length > 0, `NEGATIVE 2 — eligibility/set-aside decoy raised HARD-FAILS (mustNotRaiseAtAll). decoyHardFails: ${r2.decoyHardFails.join(", ") || "none"}`);

// ── NEGATIVE 3: engine MIS-TYPES the universal walk-away as bidder-specific INELIGIBLE → must FAIL ──
const nInelig: PanelVerdictLike = { verdict: "INELIGIBLE", eligible: false, showStoppers: 1, raisedGates: [impossibilityGate], showStopperTexts: [impossibilityGate.name] };
const r3 = scoreJudgment(nInelig, key, source, { extractedClauses: PART12, analysisText: correctAnalysis });
ok(!r3.pass && r3.failures.some((f) => /verdict/.test(f)), `NEGATIVE 3 — INELIGIBLE mis-type FAILS (null bidderProfile may not return INELIGIBLE). failures: ${r3.failures.length}`);

// ── NEGATIVE 4: NO_BID verdict but the impossibility is NOT surfaced anywhere → must FAIL (unsupported) ──
const nUnsupported: PanelVerdictLike = { verdict: "NO_BID", eligible: true, showStoppers: 1, raisedGates: [{ name: "general risk", met: false, cite: "" }], showStopperTexts: ["general risk"] };
const r4 = scoreJudgment(nUnsupported, key, source, { extractedClauses: PART12, analysisText: "We recommend walking away due to unspecified concerns." });
ok(!r4.pass && (r4.failures.some((f) => /not surfaced/.test(f))), `NEGATIVE 4 — NO_BID without the impossibility surfaced FAILS (right call, wrong/no reason). failures: ${r4.failures.length}`);

// ── NEGATIVE 5 (correctness): fabricated clause absent from source → must HARD FAIL ──
const nFab: PanelVerdictLike = { verdict: "NO_BID", eligible: true, showStoppers: 1, raisedGates: [{ ...impossibilityGate, cite: impossibilityGate.cite + " see also 52.999-99" }], showStopperTexts: [impossibilityGate.name] };
const r5 = scoreJudgment(nFab, key, source, { extractedClauses: PART12, analysisText: correctAnalysis });
ok(!r5.pass && r5.fabricated.includes("52.999-99"), `NEGATIVE 5 — fabricated clause 52.999-99 HARD-FAILS. fabricated: ${r5.fabricated.join(", ") || "none"}`);

console.log("");
if (fail) { console.error(`✗ ${fail} replay check(s) FAILED — key does not discriminate as intended.`); process.exit(1); }
console.log("✓ LOAD-BEARING REPLAY GREEN — the NO_BID key PASSES a correct panel and FAILS all 5 wrong outputs (missed verdict · eligibility decoy · INELIGIBLE mis-type · unsupported NO_BID · fabrication). Gradeable + discriminating. $0, no paid run.");
