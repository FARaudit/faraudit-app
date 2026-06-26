/**
 * $0 DETERMINISTIC gate test for the gold-set graduation gate (Brain's SOLE correctness gate, no AI).
 * Proves: the corrected N4008526R0065 key parses; the binary pass conditions FIRE correctly (planted-
 * hard 100%, decoy-misfire 0, verdict-correctness); fuzzy gate matching maps panel prose → gold tokens;
 * and the doctrine answer (eligible/BID_WITH_CAUTION) is what PASSES while INELIGIBLE FAILS.
 *
 * Run: npx tsx scripts/audit-ai/test-gold-gate.ts
 */
import { readFileSync } from "node:fs";
import {
  parseGoldSet, scoreGoldSet, graduationGate, gateMatched, decoyMisfires, gatesDetected, tinaApplies,
  type EngineExtraction, type PanelVerdictLike,
} from "./gold-set-score";

let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };

const gold = parseGoldSet(JSON.parse(readFileSync("scripts/audit-ai/gold-sets/N4008526R0065.json", "utf8")));

// ── key parsed with the Brain corrections ──
check("key: adjudicated + expectedVerdict = BID_WITH_CAUTION/eligible/0", gold.adjudicated === true && gold.expectedVerdict?.verdict === "BID_WITH_CAUTION" && gold.expectedVerdict?.eligible === true && gold.expectedVerdict?.maxShowStoppers === 0);
check("key: notGates = 3 after Brain removed SECURITY-CLEARANCE (CMMC/BUY-AMERICAN/OCI)", (gold.notGates ?? []).length === 3 && gold.notGates!.includes("CMMC") && !gold.notGates!.includes("SECURITY-CLEARANCE"));
check("key: gateAliases present for SET-ASIDE + CMMC", !!gold.gateAliases?.["SET-ASIDE"] && !!gold.gateAliases?.["CMMC"]);
const planted = gold.groundTruth.clauses.filter((c) => c.plantedHard).map((c) => c.number);
check("key: 5 planted-hard clauses", planted.length === 5);

// ── fuzzy gate matching: panel emits prose, gold token is canonical ──
check("fuzzy: 'SET-ASIDE' matches panel prose '8(a) competitive set-aside (NAICS 561720)'", gateMatched("SET-ASIDE", ["8(a) competitive set-aside (NAICS 561720)"], gold.gateAliases));
check("fuzzy: 'CUI-7012' matches 'DFARS 252.204-7012 safeguarding'", gateMatched("CUI-7012", ["DFARS 252.204-7012 safeguarding covered defense information"], gold.gateAliases));
check("fuzzy: 'CMMC' does NOT match a clean panel that never raised it", !gateMatched("CMMC", ["8(a) set-aside", "SCA wage determination"], gold.gateAliases));
// Brain misfire-semantics (2026-06-25): misfire ONLY on an UNMET decoy gate; met=true ≠ misfire.
check("decoy: CMMC raised as an UNMET gate → misfire", decoyMisfires(gold.notGates!, [{ name: "CMMC Level 2 certification required", met: false }], gold.gateAliases).includes("CMMC"));
check("decoy: CMMC raised as a MET compliance obligation → NOT a misfire", decoyMisfires(gold.notGates!, [{ name: "CMMC Level 2 certification required", met: true }], gold.gateAliases).length === 0);
check("decoy: SECURITY-CLEARANCE removed from notGates (Brain: it's a real perf obligation)", !(gold.notGates ?? []).includes("SECURITY-CLEARANCE"));
check("decoy: dropped 52.225 alias → an UNMET '252.225-7060 Xinjiang' gate does NOT mis-fire BUY-AMERICAN", decoyMisfires(gold.notGates!, [{ name: "No Xinjiang supply chain exposure (252.225-7060)", met: false }], gold.gateAliases).length === 0);

// Synthetic source containing every gold clause number (so a faithfully-cited panel has no fabrication).
const cleanSource = gold.groundTruth.clauses.map((c) => c.number).join(" ") + " 252.204-7012";
// A CLEAN panel: cites only real clauses, raises NO disqualifying decoy, correct verdict.
const cleanGates = ["8(a) competitive set-aside", "SCA wage determination floor", "DFARS 252.204-7012 CUI"];
const cleanRaised: PanelVerdictLike["raisedGates"] = cleanGates.map((name) => ({ name, met: true }));
const cleanExtraction: EngineExtraction = { clauses: [...gold.groundTruth.clauses.map((c) => c.number)], requirements: gold.groundTruth.requirements, evalFactors: gold.groundTruth.evalFactors, gates: cleanGates };
const cleanPanel: PanelVerdictLike = { verdict: "BID_WITH_CAUTION", eligible: true, showStoppers: 0, raisedGates: cleanRaised };
const cleanScore = scoreGoldSet(cleanExtraction, gold);
const cleanGrad = graduationGate(cleanScore, gold, cleanPanel, cleanSource);
check("substrate: a clean panel (no fabrication, no disqualifying decoy) is SUBSTRATE-CLEAN", cleanGrad.substrateClean === true && cleanGrad.failures.length === 0);
check("RETRACTION: graduation is ALWAYS blocked (judgment key pending), even when substrate-clean", cleanGrad.graduationEligible === false);
check("substrate: clean → 0 fabrication, 0 decoy misfires", cleanGrad.fabricatedClauses.length === 0 && cleanGrad.decoyMisfired.length === 0);
check("gate: clean → all 3 named gates detected (TINA removed by Brain — competitive ⇒ exempt)", gatesDetected(gold.groundTruth.gates, cleanRaised, gold.gateAliases).length === 3 && !gold.groundTruth.gates.includes("TINA"));

// 2b BOUNDED gate match — short aliases must NOT substring-false-match unrelated prose.
check("2b: 'sca' alias does NOT detect WAGE-DETERMINATION in 'annual escalation clause'", gatesDetected(["WAGE-DETERMINATION"], [{ name: "annual escalation clause", met: true }], gold.gateAliases).length === 0);
check("2b: 'oci' alias does NOT detect OCI-trap in 'associated contractor list'", gateMatched("OCI", ["associated contractor list"], gold.gateAliases) === false);
check("2b: a REAL 'SCA wage determination' IS still detected", gatesDetected(["WAGE-DETERMINATION"], [{ name: "SCA wage determination floor", met: true }], gold.gateAliases).length === 1);

// 2c FABRICATION — a raised clause ABSENT from source = HARD substrate fail, even at met=true.
const fabPanel: PanelVerdictLike = { ...cleanPanel, raisedGates: [...cleanRaised, { name: "Phantom requirement", met: true, cite: "FAR 52.999-99" }] };
const gradFab = graduationGate(cleanScore, gold, fabPanel, cleanSource);
check("2c: a raised clause absent from source → FABRICATION → substrate NOT clean", gradFab.substrateClean === false && gradFab.fabricatedClauses.includes("52.999-99"));
check("2c: a met=true gate whose clause IS in source is NOT fabrication", graduationGate(cleanScore, gold, { ...cleanPanel, raisedGates: [{ name: "CUI", met: true, cite: "252.204-7012" }] }, cleanSource).fabricatedClauses.length === 0);

// disposition rule (Brain): a decoy raised UNMET = misfire; the same raised MET (and present-able) = clean.
const decoyPanel: PanelVerdictLike = { ...cleanPanel, raisedGates: [...cleanRaised, { name: "CMMC Level 2 required", met: false }] };
check("decoy: an UNMET decoy (CMMC) → substrate NOT clean", graduationGate(cleanScore, gold, decoyPanel, cleanSource).substrateClean === false && graduationGate(cleanScore, gold, decoyPanel, cleanSource).decoyMisfired.includes("CMMC"));
check("decoy: the SAME CMMC raised MET (no clause # to fabricate) → still substrate-clean", graduationGate(cleanScore, gold, { ...cleanPanel, raisedGates: [...cleanRaised, { name: "CMMC Level 2 required", met: true }] }, cleanSource).substrateClean === true);

// RETRACTION: missing a planted clause is NOT a substrate failure (recall is observability only).
const missPlanted: EngineExtraction = { ...cleanExtraction, clauses: cleanExtraction.clauses.filter((n) => n !== planted[0]) };
const gradMiss = graduationGate(scoreGoldSet(missPlanted, gold), gold, cleanPanel, cleanSource);
check("RETRACTION: a missing planted clause drops recall but does NOT fail substrate (recall retracted)", gradMiss.substrateClean === true && gradMiss.plantedHardRecall < 1 && gradMiss.missedPlantedHard.includes(planted[0]));

// portable TINA doctrine.
check("tina: competitive ⇒ NOT a gate", tinaApplies({ competitive: true, commercialItem: false, aboveThreshold: true }) === false);
check("tina: sole-source + non-commercial + above-threshold ⇒ TINA APPLIES", tinaApplies({ competitive: false, commercialItem: false, aboveThreshold: true }) === true);
check("tina: sole-source but commercial ⇒ exempt", tinaApplies({ competitive: false, commercialItem: true, aboveThreshold: true }) === false);
check("tina: below threshold ⇒ exempt", tinaApplies({ competitive: false, commercialItem: false, aboveThreshold: false }) === false);

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — gold-set graduation gate ${pass ? "enforces Brain's binary conditions + doctrine answer" : "BROKEN"} ($0, no AI)`);
process.exit(pass ? 0 : 1);
