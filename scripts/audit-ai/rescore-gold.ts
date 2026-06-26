/**
 * $0 RE-SCORE — re-grade a PERSISTED panel output against the (Brain-corrected) gold key with NO
 * MAP, NO panel, NO API, NO network. Proves the scorer fix (disposition-aware misfire + gold-key
 * correction + dropped 52.225 alias) flips the gold gate without re-paying. Brain authorized 2026-06-25.
 *
 * Clause source: the persisted `extraction` if present (future runs are self-contained); else parsed
 * from the matrix cache (this run pre-dates the extraction-persist change) — labeled honestly.
 *
 * Run: npx tsx scripts/audit-ai/rescore-gold.ts --sol N4008526R0065
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  parseGoldSet, scoreGoldSet, graduationGate,
  type EngineExtraction, type PanelVerdictLike, type RaisedGate,
} from "./gold-set-score";
import { mergeEnumeratedClauses } from "../../src/lib/agentic-map";
import { type ClauseItem, clauseNumberRegex } from "../../src/lib/section-extractors";

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const sol = arg("--sol") ?? "N4008526R0065";
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const gold = parseGoldSet(JSON.parse(readFileSync(path.join("scripts", "audit-ai", "gold-sets", `${sol}.json`), "utf8")));
const panelOut = JSON.parse(readFileSync(path.join("ceo", "proofs", `stage6e-panel-output-${sol}.json`), "utf8"));

// Panel verdict + raised gates WITH disposition (the persisted, exact paid-run output).
const raised: RaisedGate[] = (panelOut.panelists ?? []).flatMap((p: { output?: { named_hard_gates?: Array<{ gate: string; met: boolean; citation?: string }> } }) =>
  (p.output?.named_hard_gates ?? []).map((g) => ({ name: g.gate, met: g.met, cite: g.citation })));
const j = panelOut.judgment;
const pv: PanelVerdictLike = { verdict: j.verdict, eligible: j.eligible, showStoppers: (j.show_stoppers ?? []).length, raisedGates: raised };

// Clauses: persisted extraction (self-contained) OR parse the matrix cache (exact paid-run extraction text).
let aiClauses: string[];
let clauseSource: string;
if (panelOut.extraction?.clauses?.length) {
  aiClauses = panelOut.extraction.clauses;
  clauseSource = "persisted extraction";
} else {
  const mp = path.join("ceo", "proofs", `stage6e-matrix-${sol}.json`);
  const matrix: string = existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")).matrix ?? "" : "";
  aiClauses = [...new Set(matrix.match(clauseNumberRegex()) ?? [])];
  clauseSource = `matrix cache parse (${aiClauses.length} AI clause tokens — pre-dates extraction-persist)`;
}
// Brain #2/#3: apply the deterministic §I enumerator over the READ SOURCE so the table reflects the
// FIXED engine (the AI extract under-counted §I; the enumerator recovers the dropped clauses, $0).
const mp2 = path.join("ceo", "proofs", `stage6e-matrix-${sol}.json`);
const source: string = existsSync(mp2) ? Object.values((JSON.parse(readFileSync(mp2, "utf8")).sectionText ?? {}) as Record<string, string>).join("\n") : "";
const stub = (number: string): ClauseItem => ({ number, title: "", incorporated: "by_reference", effectiveDate: null, isTrap: false, trapReason: null });
const clauses = mergeEnumeratedClauses(aiClauses.map(stub), source).map((c) => c.number);
clauseSource += ` + §I enumerator over read source → ${clauses.length} clauses`;
const ext: EngineExtraction = { clauses, requirements: panelOut.extraction?.requirements ?? [], evalFactors: panelOut.extraction?.evalFactors ?? [], gates: raised.map((r) => r.name) };

const score = scoreGoldSet(ext, gold);
const grad = graduationGate(score, gold, pv, source); // source enables the fabrication check (2c)

console.log(`\n════════ SUBSTRATE RE-SCORE · ${sol} · $0 (no MAP, no panel, no API, no network) ════════`);
console.log(`clause source: ${clauseSource}`);
console.log(`raised gates: ${raised.length} (${raised.filter((r) => !r.met).length} unmet/disqualifying · ${raised.filter((r) => r.met).length} met)`);
console.log(`──────── SUBSTRATE HEALTH (hard checks) ────────`);
console.log(`FABRICATION (raised clause absent from source): ${grad.fabricatedClauses.length} ${grad.fabricatedClauses.length === 0 ? "✅" : "❌ " + grad.fabricatedClauses.join(", ")}`);
console.log(`decoy traps mis-fired as DISQUALIFYING gates  : ${grad.decoyMisfired.length} ${grad.decoyMisfired.length === 0 ? "✅" : "❌ " + grad.decoyMisfired.join(", ")}`);
console.log(`SUBSTRATE: ${grad.substrateClean ? "✅ CLEAN" : "❌ " + grad.failures.join(" · ")}`);
console.log(`──────── OBSERVABILITY ONLY (RETRACTED as graduation signals — Brain #1) ────────`);
console.log(`clause-list completeness : binding ${pct(grad.bindingClauseRecall)} · precision ${pct(grad.bindingClausePrecision)} · planted ${pct(grad.plantedHardRecall)} — tautological after the enumerator; NOT a quality signal`);
console.log(`named gold-gate recall   : ${pct(grad.gateRecall)}  (missed: ${grad.missedGates.join(", ") || "none"})  — non-blind, observability`);
console.log(`verdict vs (non-blind) key: ${grad.verdictMatch === null ? "n/a" : grad.verdictMatch ? "match" : "differ"}  (panel ${pv.verdict}/elig=${pv.eligible}/stoppers=${pv.showStoppers})`);
console.log(`\nGRADUATION: ⛔ ${grad.graduationBlockedReason}`);
