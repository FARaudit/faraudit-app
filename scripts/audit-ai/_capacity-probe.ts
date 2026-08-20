// $0 — CAN THE PACKAGE BE READ AT ALL? The capacity question, asked as arithmetic on the engine's own limits.
//
// A lens gets `AUDIT_LENS_MAX_TURNS` turns (default 8) and the LAST one is forced to submit_findings, so it
// has at most 7 turns in which to call read_document. One read per turn. So a lens that OWNS 20 documents
// cannot read 20 documents — not slowly, not expensively: it structurally cannot, and today it fails at this
// silently by reading a few and saying nothing about the rest.
//
// This measures, over every banked package, how many documents the busiest lens owns after BOTH axes, and
// how many packages are beyond single-pass capacity. Deterministic, no model call, no network.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { docRegions } from "../../src/lib/audit-orchestrator";
import { ownerOf } from "../../src/lib/audit-doc-ownership";
import { isSpecBulk } from "../../src/lib/audit-doc-ownership";
import { NOTICE_BODY_DOC_NAME } from "../../src/lib/audit-coverage-definition";

const DIR = process.env.RUN_RECORDS_DIR || "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const MAX_TURNS = Number(process.env.AUDIT_LENS_MAX_TURNS) || 8;
const READ_TURNS = MAX_TURNS - 1;   // the last turn is forced to submit_findings
const LENSES = ["capture_strategist", "contracts_attorney", "pricing_analyst", "former_ko", "proposal_manager"];

type Row = { sol: string; docs: number; busiestLens: string; busiestDocs: number; specMoved: number };
const rows: Row[] = [];

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let d: any; try { d = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { continue; }
  const fullSource: string = d?.input?.fullSource; if (!fullSource) continue;
  const counts: Record<string, number> = {};
  let docs = 0, specMoved = 0;
  for (const r of docRegions(fullSource)) {
    if (r.name === NOTICE_BODY_DOC_NAME) continue;
    docs++;
    if (isSpecBulk(r.name)) { specMoved++; continue; }      // axis 2 — goes to extraction, not to a lens
    const { owner } = ownerOf(r.name);
    const key = owner === "RESIDUE" ? "former_ko" : owner;   // residue owner by rule
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if (!docs) continue;
  let busiestLens = LENSES[0], busiestDocs = 0;
  for (const l of LENSES) if ((counts[l] ?? 0) > busiestDocs) { busiestDocs = counts[l] ?? 0; busiestLens = l; }
  rows.push({ sol: d?.meta?.sol ?? f.slice(0, 18), docs, busiestLens, busiestDocs, specMoved });
}

const over = rows.filter((r) => r.busiestDocs > READ_TURNS);
const sorted = [...rows].map((r) => r.busiestDocs).sort((a, b) => a - b);
const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

console.log(`══ SINGLE-PASS CAPACITY — a lens has ${MAX_TURNS} turns, the last forced to submit ⇒ ${READ_TURNS} reads`);
console.log(`   packages measured                          ${rows.length}`);
console.log(`   busiest lens, documents owned — p50         ${p(0.5)}`);
console.log(`   busiest lens, documents owned — p90         ${p(0.9)}`);
console.log(`   busiest lens, documents owned — MAX         ${Math.max(...sorted)}`);
console.log(`   ⛔ packages BEYOND single-pass capacity     ${over.length} of ${rows.length}   (busiest lens owns > ${READ_TURNS})`);

console.log(`\n── the packages that cannot be read in one pass, worst first`);
for (const r of [...over].sort((a, b) => b.busiestDocs - a.busiestDocs).slice(0, 12)) {
  console.log(`   ${r.sol.slice(0, 22).padEnd(22)} ${String(r.docs).padStart(3)} docs · ${r.busiestLens.padEnd(19)} owns ${String(r.busiestDocs).padStart(3)} · ${String(r.specMoved).padStart(2)} spec docs already moved off`);
}

// The counterfactual: what does axis 2 buy on THIS measure?
let overWithoutAxis2 = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let d: any; try { d = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { continue; }
  const fullSource: string = d?.input?.fullSource; if (!fullSource) continue;
  const counts: Record<string, number> = {};
  let any = false;
  for (const r of docRegions(fullSource)) {
    if (r.name === NOTICE_BODY_DOC_NAME) continue;
    any = true;
    const { owner } = ownerOf(r.name);
    const key = owner === "RESIDUE" ? "former_ko" : owner;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if (!any) continue;
  if (Math.max(0, ...LENSES.map((l) => counts[l] ?? 0)) > READ_TURNS) overWithoutAxis2++;
}
console.log(`\n   beyond capacity WITHOUT axis 2 (spec bulk still on the lenses): ${overWithoutAxis2} of ${rows.length}`);
console.log(`   beyond capacity WITH axis 2:                                    ${over.length} of ${rows.length}`);

// ── FREE SWEEP: what would a different turn budget buy? (carried task #7, at $0)
// A capacity refusal is only honest if the budget it measures against is the right one. p90 sits AT the
// limit, so the population is knife-edge and the sweep is the difference between "too big to audit" and
// "budget set one notch too low".
console.log(`\n══ TURN-BUDGET SWEEP — packages beyond capacity at each budget`);
const busiestCounts = rows.map((r) => r.busiestDocs);
for (const turns of [8, 10, 12, 16, 24]) {
  const reads = turns - 1;
  const beyond = busiestCounts.filter((n) => n > reads).length;
  const flagship = rows.find((r) => r.sol.startsWith("W911SG27BA002"));
  const flagshipOver = flagship ? flagship.busiestDocs > reads : false;
  console.log(`   maxTurns ${String(turns).padStart(2)} (${String(reads).padStart(2)} reads)   beyond capacity: ${String(beyond).padStart(2)} of ${rows.length}   flagship: ${flagshipOver ? "STILL OVER" : "within"}`);
}
