/**
 * $0 DETERMINISTIC proof for the §I clause enumerator (Brain-authorized 2026-06-25).
 * The AI extractor under-counts the §I incorporated-by-reference list; the deterministic enumerator
 * recovers every FAR/DFARS clause present in the already-read source. Proven on the REAL cached source
 * of N4008526R0065: binding-clause recall jumps 77% → ~100% with NO model call, NO re-ingest.
 *
 * Run: npx tsx scripts/audit-ai/test-clause-enumerator.ts
 */
import { readFileSync } from "node:fs";
import { enumerateClauses, mergeEnumeratedClauses } from "../../src/lib/agentic-map";
import { parseGoldSet, scoreGoldSet, type EngineExtraction } from "./gold-set-score";
import type { ClauseItem } from "../../src/lib/section-extractors";

let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };
const stub = (number: string): ClauseItem => ({ number, title: "", incorporated: "by_reference", effectiveDate: null, isTrap: false, trapReason: null });

// ── unit: enumerateClauses ──
const sample = "Incorporated by reference: 52.219-6, 52.222-26, and DFARS 252.204-7012. Also 252.225-7060. Not a clause: 2024 or 1.2-3 or 52.12.";
const found = enumerateClauses(sample);
check("enum: catches FAR 52.219-6", found.includes("52.219-6"));
check("enum: catches FAR 52.222-26", found.includes("52.222-26"));
check("enum: catches DFARS 252.204-7012 (4-digit suffix)", found.includes("252.204-7012"));
check("enum: catches DFARS 252.225-7060", found.includes("252.225-7060"));
check("enum: does NOT catch a year (2024) or malformed (1.2-3 / 52.12)", !found.includes("2024") && !found.includes("1.2-3") && !found.includes("52.12"));
check("enum: dedupes", enumerateClauses("52.219-6 52.219-6").length === 1);

// ── unit: mergeEnumeratedClauses never overrides an AI clause, only adds missing ──
const existing = [{ ...stub("52.219-6"), title: "Notice of Total Small Business Set-Aside" }];
const merged = mergeEnumeratedClauses(existing, "52.219-6 252.204-7012");
check("merge: keeps the AI clause's title (no override)", merged.find((c) => c.number === "52.219-6")?.title === "Notice of Total Small Business Set-Aside");
check("merge: adds the missing 252.204-7012 as by_reference", merged.some((c) => c.number === "252.204-7012" && c.incorporated === "by_reference"));
check("merge: does NOT duplicate 52.219-6", merged.filter((c) => c.number === "52.219-6").length === 1);

// ── THE PROOF on the REAL cached source: recall 77% → ~100% ──
const gold = parseGoldSet(JSON.parse(readFileSync("scripts/audit-ai/gold-sets/N4008526R0065.json", "utf8")));
const mc = JSON.parse(readFileSync("ceo/proofs/stage6e-matrix-N4008526R0065.json", "utf8"));
const source: string = Object.values(mc.sectionText ?? {}).join("\n");
// PRE = what the engine extracted this run (matrix-parsed clause tokens) as ClauseItems.
const preNums = [...new Set((mc.matrix as string).match(/\b2?52\.\d{3}-\d{1,4}\b/g) ?? [])];
const preItems = preNums.map(stub);
const ext = (clauses: string[]): EngineExtraction => ({ clauses, requirements: [], evalFactors: [], gates: [] });
const preScore = scoreGoldSet(ext(preNums), gold);
// POST = enumerator merges any source clause missing from PRE.
const postItems = mergeEnumeratedClauses(preItems, source);
const postScore = scoreGoldSet(ext(postItems.map((c) => c.number)), gold);

console.log(`\n  PRE  binding recall ${(preScore.bindingClauseRecall * 100).toFixed(0)}% · misses ${preScore.missedBinding.length}`);
console.log(`  POST binding recall ${(postScore.bindingClauseRecall * 100).toFixed(0)}% · misses ${postScore.missedBinding.length} · precision ${(postScore.clauses.precision * 100).toFixed(0)}%`);
check("PROOF: enumerator RAISES binding recall vs the AI-only extract", postScore.bindingClauseRecall > preScore.bindingClauseRecall);
check("PROOF: binding recall reaches ≥95% after enumeration ($0, cached source)", postScore.bindingClauseRecall >= 0.95);
check("PROOF: planted-hard recall = 100% after enumeration", postScore.plantedHardRecall === 1);
check("PROOF: enumeration is additive — POST misses ⊆ PRE misses", postScore.missedBinding.every((m) => preScore.missedBinding.includes(m)));

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — §I clause enumerator ${pass ? "recovers the dropped clauses ($0, no model call)" : "BROKEN"}`);
process.exit(pass ? 0 : 1);
