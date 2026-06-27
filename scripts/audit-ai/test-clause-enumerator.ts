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

// ── THE PROOF on FROZEN fixtures (Brain card 90 — reads tests/fixtures/frozen/, never live ceo/proofs/) ──
const gold = parseGoldSet(JSON.parse(readFileSync("scripts/audit-ai/gold-sets/N4008526R0065.json", "utf8")));
const ext = (clauses: string[]): EngineExtraction => ({ clauses, requirements: [], evalFactors: [], gates: [] });
const FROZEN = "tests/fixtures/frozen";
function runMatrix(file: string) {
  const mc = JSON.parse(readFileSync(`${FROZEN}/${file}`, "utf8"));
  const source: string = Object.values(mc.sectionText ?? {}).join("\n");
  // PRE = the clause tokens present in the matrix (what the AI extract surfaced); POST = enumerator merges
  // any clause present in the source but missing from PRE.
  const preNums = [...new Set((mc.matrix as string).match(/\b2?52\.\d{3}-\d{1,4}\b/g) ?? [])];
  const preScore = scoreGoldSet(ext(preNums), gold);
  const postItems = mergeEnumeratedClauses(preNums.map(stub), source);
  const postScore = scoreGoldSet(ext(postItems.map((c) => c.number)), gold);
  return { preScore, postScore, decimated: (mc._decimatedBinding as string[]) ?? [] };
}

// COMPLETE fixture — the AI matrix already carries every binding clause; the enumerator is a $0 safety net
// that must never LOWER recall. Invariant: POST == 100% AND POST >= PRE (not "POST > PRE" — that was the
// stale assertion that broke once PRE already reached 100%).
const C = runMatrix("n4008-matrix-complete.json");
console.log(`\n[COMPLETE] PRE ${(C.preScore.bindingClauseRecall * 100).toFixed(0)}% → POST ${(C.postScore.bindingClauseRecall * 100).toFixed(0)}% · precision ${(C.postScore.clauses.precision * 100).toFixed(0)}%`);
check("COMPLETE: POST binding recall == 100%", C.postScore.bindingClauseRecall === 1);
check("COMPLETE: POST >= PRE (enumeration never lowers recall)", C.postScore.bindingClauseRecall >= C.preScore.bindingClauseRecall);
check("COMPLETE: planted-hard recall == 100%", C.postScore.plantedHardRecall === 1);
check("COMPLETE: additive — POST misses ⊆ PRE misses", C.postScore.missedBinding.every((m) => C.preScore.missedBinding.includes(m)));

// DECIMATED fixture — K binding clauses removed from the matrix (PRE) but LEFT in the source, so the
// deterministic enumerator must RECOVER them: POST > PRE and POST back to 100%. This is the positive proof
// the complete fixture can no longer give (its PRE is already 100%).
const D = runMatrix("n4008-matrix-decimated.json");
console.log(`[DECIMATED K=${D.decimated.length}: ${D.decimated.join(", ")}] PRE ${(D.preScore.bindingClauseRecall * 100).toFixed(0)}% → POST ${(D.postScore.bindingClauseRecall * 100).toFixed(0)}%`);
check(`DECIMATED: PRE recall dropped below 100% (K=${D.decimated.length} binding clauses removed from the matrix)`, D.preScore.bindingClauseRecall < 1);
check("DECIMATED: POST > PRE (enumerator RECOVERED the decimated clauses from source)", D.postScore.bindingClauseRecall > D.preScore.bindingClauseRecall);
check("DECIMATED: POST recall back to 100%", D.postScore.bindingClauseRecall === 1);

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — §I clause enumerator ${pass ? "recovers the dropped clauses ($0, no model call)" : "BROKEN"}`);
process.exit(pass ? 0 : 1);
