// $0 gate for the judgment-first PROOF-GATE scoring (Brain card 276 asymmetric criteria).
// Proves: conservative divergence passes; ANY committal-direction divergence blocks; honest-fail parity is a
// hard gate. This is the scorer the replay harness runs over gold + stress-v2 + W9126G26RA087.
import { classifyDivergence, summarizeProofGate, type ProofPair } from "@/lib/audit-judgment-proof";
import type { Verdict } from "@/lib/audit-decide";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };

console.log("classifyDivergence — conservative OK · committal-direction = BLOCKER");
// Conservative (allowed) — judgment fails safer.
check("BID → NHR = conservative", classifyDivergence("BID", "NEEDS_HUMAN_REVIEW") === "conservative");
check("BID → BID_WITH_CAUTION = conservative", classifyDivergence("BID", "BID_WITH_CAUTION") === "conservative");
check("NO_BID → NHR = conservative", classifyDivergence("NO_BID", "NEEDS_HUMAN_REVIEW") === "conservative");
check("INELIGIBLE → INCOMPLETE = conservative", classifyDivergence("INELIGIBLE", "INCOMPLETE") === "conservative");
check("BID_WITH_CAUTION → NHR = conservative", classifyDivergence("BID_WITH_CAUTION", "NEEDS_HUMAN_REVIEW") === "conservative");
check("NHR ↔ INCOMPLETE (honest-fail↔honest-fail) = conservative, never a blocker", classifyDivergence("NEEDS_HUMAN_REVIEW", "INCOMPLETE") === "conservative");
check("same verdict = same", classifyDivergence("BID", "BID") === "same");

// BLOCKERS — judgment moved toward a committal pole the ladder did not hold.
check("NHR → BID = BLOCKER (new plain BID)", classifyDivergence("NEEDS_HUMAN_REVIEW", "BID") === "committal_blocker");
check("NHR → NO_BID = BLOCKER (new NO_BID)", classifyDivergence("NEEDS_HUMAN_REVIEW", "NO_BID") === "committal_blocker");
check("NHR → INELIGIBLE = BLOCKER (new INELIGIBLE)", classifyDivergence("NEEDS_HUMAN_REVIEW", "INELIGIBLE") === "committal_blocker");
check("BID_WITH_CAUTION → BID = BLOCKER (upgrade caution→plain BID)", classifyDivergence("BID_WITH_CAUTION", "BID") === "committal_blocker");
check("INCOMPLETE → BID = BLOCKER", classifyDivergence("INCOMPLETE", "BID") === "committal_blocker");
check("BID → NO_BID = BLOCKER (switch to opposite pole)", classifyDivergence("BID", "NO_BID") === "committal_blocker");
check("NO_BID → INELIGIBLE = BLOCKER (different committal pole)", classifyDivergence("NO_BID", "INELIGIBLE") === "committal_blocker");

console.log("\nsummarizeProofGate — pass iff no blockers AND honest-fail parity");
// All conservative/same, parity holds → pass.
const clean: ProofPair[] = [
  { id: "g1", ladder: "BID", judgment: "BID" },
  { id: "g2", ladder: "BID", judgment: "BID_WITH_CAUTION" },
  { id: "g3", ladder: "NO_BID", judgment: "NEEDS_HUMAN_REVIEW" },   // ladder honest-fail 0→ judgment 1 (more)
  { id: "g4", ladder: "NEEDS_HUMAN_REVIEW", judgment: "INCOMPLETE" }, // honest-fail↔honest-fail
];
let r = summarizeProofGate(clean);
check("clean set → pass", r.pass === true, JSON.stringify(r));
check("clean set → 0 blockers", r.blockers.length === 0);
check("clean set → honest-fail parity ok (judgment ≥ ladder)", r.honestFailParityOk && r.judgmentHonestFails >= r.ladderHonestFails);

// One committal blocker → fail regardless of parity.
r = summarizeProofGate([{ id: "b1", ladder: "NEEDS_HUMAN_REVIEW", judgment: "BID" }]);
check("one committal blocker → gate FAILS", r.pass === false && r.blockers.length === 1);

// Parity violation (judgment fires FEWER honest-fails than ladder) → fail even with no blocker.
r = summarizeProofGate([{ id: "p1", ladder: "NEEDS_HUMAN_REVIEW", judgment: "BID_WITH_CAUTION" }]);
check("judgment drops an honest-fail to a soft bid → parity FAILS the gate", r.pass === false && r.honestFailParityOk === false);

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
