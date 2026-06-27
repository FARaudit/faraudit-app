/**
 * Brain card 90 — ONE-TIME freeze generator. Snapshots the live ceo/proofs/* into
 * tests/fixtures/frozen/ (+ decimations) so the 4 deterministic tests stop reading
 * live, run-regenerated proofs. NOT run by tests/CI — the FIXTURES are the frozen
 * source of truth; this script only documents how they were derived. Re-running it
 * re-snapshots from whatever ceo/proofs/ currently holds (use deliberately only).
 *
 * Run: npx tsx scripts/audit-ai/freeze-fixtures.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isCautionArchetype } from "../../src/lib/audit-decide";
import { parseGoldSet } from "./gold-set-score";
import { normClause } from "../../src/lib/section-extractors";
import type { TypedFinding } from "../../src/lib/audit-findings";

const OUT = "tests/fixtures/frozen";
const readProof = (f: string) => JSON.parse(readFileSync(`ceo/proofs/${f}`, "utf8"));
const write = (name: string, obj: unknown) => { writeFileSync(`${OUT}/${name}`, JSON.stringify(obj, null, 2)); console.log(`  wrote ${name}`); };
const findings = (proof: { findings: TypedFinding[] }) => proof.findings as TypedFinding[];

console.log("── A. #4 AOCSSB26R0023 (caution-floor / sweep) ──");
const p4 = readProof("v3-AOCSSB26R0023-result.json");
const f4 = findings(p4);
const archIdx = f4.map((f, i) => (isCautionArchetype(f).fires ? i : -1)).filter((i) => i >= 0);
console.log(`  archetype-firing findings (the conservator quals): [${archIdx.join(", ")}] →`,
  archIdx.map((i) => (f4[i].requiredAttribute || f4[i].requirement || "").slice(0, 50)));
const f4NoQual = f4.filter((_, i) => !archIdx.includes(i));
write("aocssb-with-qual.json", { ...p4, findings: f4 });                 // as-is → floor fires ≥1 → CAUTION
write("aocssb-no-qual.json", { ...p4, findings: f4NoQual });             // quals removed → floor fires 0 → BID
write("aocssb-sweep-novel.json", { ...p4, findings: f4NoQual });         // no-floor-fire base; sweep surfaces the novel caution

console.log("── B. #6 FA860126Q00260001 (NO_BID precondition × window) ──");
const p6 = readProof("v3-FA860126Q00260001-result.json");
const f6 = findings(p6);
const isNoMove = (f: TypedFinding) => f.controllability === "no_one_can_move";
const isTemporal = (f: TypedFinding) => f.lens === "temporal_conflict";
const isWindow = (f: TypedFinding) =>
  (f as { sweepArchetype?: string }).sweepArchetype === "delivery_window" ||
  (/within 30|delivery within|production delivery window|30 (?:calendar )?days/i.test(`${f.requirement} ${f.excerpt}`) && f.controllability === "bidder_controls");
const nomoveIdx = f6.map((f, i) => (isNoMove(f) ? i : -1)).filter((i) => i >= 0);
const windowIdx = f6.map((f, i) => ((isWindow(f) || isTemporal(f)) ? i : -1)).filter((i) => i >= 0);
console.log(`  no_one_can_move findings (precondition+conflict): [${nomoveIdx.join(", ")}]`);
console.log(`  window+temporal-conflict findings: [${windowIdx.join(", ")}]`);
write("fa8601-complete.json", { ...p6, findings: f6 });                                    // as-is → NO_BID
write("fa8601-no-precondition.json", { ...p6, findings: f6.filter((f) => !isNoMove(f)) }); // drop all FAT-precondition show-stoppers → ≠NO_BID
write("fa8601-no-window.json", { ...p6, findings: f6.filter((f) => !(isWindow(f) || isTemporal(f))) }); // keep precondition, drop window+conflict

console.log("── #2 1240LP26Q0067 (BID negative control) ──");
const p2 = readProof("v3-1240LP26Q0067-result.json");
write("1240lp-bid.json", p2);

console.log("── C. #1 N4008526R0065 matrix (clause enumerator) ──");
const mc = readProof("stage6e-matrix-N4008526R0065.json");
const gold = parseGoldSet(JSON.parse(readFileSync("scripts/audit-ai/gold-sets/N4008526R0065.json", "utf8")));
const source: string = Object.values(mc.sectionText ?? {}).join("\n");
const CLAUSE_RE = /\b2?52\.\d{3}-\d{1,4}\b/g;
const matrixNums = new Set([...((mc.matrix as string).match(CLAUSE_RE) ?? [])].map(normClause));
const srcNums = new Set([...(source.match(CLAUSE_RE) ?? [])].map(normClause));
// DECIMATE: pick binding clauses present in BOTH the matrix (so removal lowers PRE) AND the
// source (so the deterministic enumerator can recover them) → POST > PRE, POST == 100%.
const candidates = gold.groundTruth.clauses
  .filter((c) => c.binding && matrixNums.has(normClause(c.number)) && srcNums.has(normClause(c.number)))
  .map((c) => c.number);
const K = 3;
const decimate = candidates.slice(0, K);
console.log(`  binding clauses present in BOTH matrix & source: ${candidates.length}; removing K=${decimate.length}: [${decimate.join(", ")}]`);
let decMatrix = mc.matrix as string;
for (const num of decimate) {
  // remove every occurrence of the clause token from the matrix string (PRE side only; source untouched)
  decMatrix = decMatrix.split(num).join("§DECIMATED§");
}
write("n4008-matrix-complete.json", mc);
write("n4008-matrix-decimated.json", { ...mc, matrix: decMatrix, _decimatedBinding: decimate });

console.log("\n✅ freeze complete →", OUT);
