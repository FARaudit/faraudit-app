// $0 — DERIVED COVERAGE + POST-ROUTING LOAD, measured with the PRODUCTION functions.
//
// Answers, by deterministic count and nothing else (doctrine rule 5: coverage is DERIVED, never recorded):
//   received · carrying an obligation · assigned · analysed · findings per document
// plus the NAMED residue and the post-routing per-lens token distribution.
//
// No model calls. Reads banked run records only. Every number here is reproducible by re-running this file.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { docRegions } from "../../src/lib/audit-orchestrator";
import { deriveDocumentCoverage, coverageDisclosure } from "../../src/lib/audit-coverage-definition";
import { ownerOf, type Owner } from "./_ownership-map-proposal";

// DATA, not code: the banked records live in the primary checkout and are gitignored. Reading them from
// there is safe; running CODE from there is the trap this file deliberately avoids by importing ../../src.
const DIR = process.env.RUN_RECORDS_DIR || "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const FLAGSHIP = process.env.FLAGSHIP_RECORD || "_ua-3b5bba30.json";
const CPT = 3.82;                       // chars per token, the ratio the ownership measurement already used
const CONTEXT_LIMIT_TOK = 200_000;      // "over context" threshold used by the 08-17 measurement
const NOTICE_BODY = "SAM Notice Body";
const LENSES: Owner[] = ["capture_strategist", "contracts_attorney", "pricing_analyst", "former_ko", "proposal_manager", "RESIDUE"];

const rec = JSON.parse(readFileSync(join(DIR, FLAGSHIP), "utf8"));
const fullSource: string = rec?.input?.fullSource ?? "";
const findings: any[] = rec?.result?.findings ?? [];

console.log(`══ DERIVED COVERAGE — ${rec?.meta?.sol} (run ${String(rec?.meta?.runId).slice(0, 8)}), $0, production functions`);

// ── EVERY FIGURE BELOW COMES FROM THE ONE DEFINITION. Nothing here recounts anything: a second
//    implementation of coverage is the Rule 68 defect this arc exists to close (ruling R3).
const cov = deriveDocumentCoverage(docRegions(fullSource), findings as any);
const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
console.log(`   binding documents received (posted)         ${cov.received}   [+1 notice body, UNIVERSAL, excluded by rule]`);
console.log(`   …carrying an obligation                     ${cov.obligationCarrying}`);
console.log(`   …assignable under the DOCUMENT-keyed map    ${cov.assigned}   (residue ${cov.residue.length} → former_ko BY RULE)`);
console.log(`   …ANALYSED (uniquely grounded finding in it) ${cov.analysed}   ${pct(cov.analysed, cov.received)} of received`);
console.log(`   …obligation-carrying AND analysed           ${cov.obligationCarryingAndAnalysed}   ${pct(cov.obligationCarryingAndAnalysed, cov.obligationCarrying)}  ← the R6 four-week measure`);
console.log(`   findings in the record                      ${findings.length}`);

console.log(`\n── FINDINGS PER DOCUMENT (uniquely grounded)`);
for (const d of cov.findingsPerDocument) console.log(`   ${String(d.findings).padStart(3)}  ${d.doc.slice(0, 92)}`);

console.log(`\n── ⛔ CREDITED BY A SHARED EXCERPT ONLY — covered by the LIVE predicate, analysed by neither (${cov.sharedExcerptCreditOnly.length})`);
for (const n of cov.sharedExcerptCreditOnly) console.log(`   · ${n.slice(0, 96)}`);

console.log(`\n── NAMED RESIDUE — no observed shape matched (${cov.residue.length})`);
for (const n of cov.residue) console.log(`   · ${n.slice(0, 96)}`);

console.log(`\n── OBLIGATION-CARRYING AND NEVER ANALYSED (${cov.unanalysedObligationCarrying.length}) — the gap the refusal must NAME`);
for (const n of cov.unanalysedObligationCarrying.slice(0, 10)) console.log(`   · ${n.slice(0, 96)}`);
if (cov.unanalysedObligationCarrying.length > 10) console.log(`   … and ${cov.unanalysedObligationCarrying.length - 10} more`);

console.log(`\n── THE CUSTOMER-VISIBLE DISCLOSURE, derived (doctrine rule 4 — refusal must NAME):`);
console.log(`   "${coverageDisclosure(cov, { maxNamed: 3 })}"`);

// ── POST-ROUTING PER-LENS LOAD across every banked record that carries a fullSource
console.log(`\n══ POST-ROUTING PER-LENS TOKEN DISTRIBUTION (chars/${CPT}), all banked records`);
const busiest: number[] = [];
let over = 0, pkgs = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let d: any; try { d = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { continue; }
  const fs2: string = d?.input?.fullSource; if (!fs2) continue;
  const load: Record<string, number> = {};
  for (const r of docRegions(fs2)) {
    if (r.name === NOTICE_BODY) continue;                 // universal — never enters the ownership map
    const { owner } = ownerOf(r.name);
    const key = owner === "RESIDUE" ? "former_ko" : owner; // residue owner IS former_ko, by rule
    load[key] = (load[key] ?? 0) + r.text.length;
  }
  const maxTok = Math.max(0, ...LENSES.map((l) => (load[l] ?? 0) / CPT));
  if (!Number.isFinite(maxTok) || maxTok === 0) continue;
  busiest.push(maxTok); pkgs++;
  if (maxTok > CONTEXT_LIMIT_TOK) over++;
}
const sorted = [...busiest].sort((a, b) => a - b);
const p = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
console.log(`   packages measured                 ${pkgs}`);
console.log(`   busiest lens, p50                 ${p(0.5).toLocaleString()} tok`);
console.log(`   busiest lens, p90                 ${p(0.9).toLocaleString()} tok`);
console.log(`   busiest lens, MAX                 ${Math.round(Math.max(...busiest)).toLocaleString()} tok`);
console.log(`   packages over ${CONTEXT_LIMIT_TOK.toLocaleString()} tok        ${over} of ${pkgs}`);
