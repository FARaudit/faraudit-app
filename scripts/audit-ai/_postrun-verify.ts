// POST-RUN VERIFICATION — staged BEFORE the flagship fire, predictions banked BEFORE the result exists.
//
//   npx tsx scripts/audit-ai/_postrun-verify.ts <audit-id-prefix>
//
// WHY THE PREDICTIONS ARE WRITTEN FIRST. A verifier authored after seeing the result grades the result
// against itself. These are pre-registered, so the run can FALSIFY them — which is the only way it can
// tell us anything. Every one of them is derived from a $0 measurement already on record.
//
// ⛔ TWO COVERAGE MEASURES, AND THEY ARE NOT THE SAME QUESTION. This is stated up front because the run
// will produce both and they will disagree, and a disagreement nobody predicted reads as a bug:
//
//   ENGINE COVERAGE (documentsCovered)  — "was this document READ?" A verbatim extraction span credits it,
//     by CEO ruling 2026-08-17: extraction output may credit coverage and may never reach the verdict.
//   ANALYSED (deriveDocumentCoverage)   — "was this document ANALYSED?" Only a grounded, decision-bearing
//     finding uniquely landing in it counts. This is the definition ruling R3 chose.
//
// With AUDIT_DOC_EXTRACTION on, the 28 specification documents can be READ (span-credited) without any
// finding grounded in them — so ENGINE COVERAGE should jump and ANALYSED may not. Both numbers are true.
// Reporting either one alone as "coverage" is the Rule 68 defect this arc exists to close.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { docRegions } from "../../src/lib/audit-orchestrator";
import { deriveDocumentCoverage, coverageDisclosure } from "../../src/lib/audit-coverage-definition";

const DIR = process.env.RUN_RECORDS_DIR || "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const prefix = process.argv[2];
if (!prefix) { console.error("usage: _postrun-verify.ts <audit-id-prefix>   (pull the record first with _ua-pull-records.ts)"); process.exit(2); }

const file = readdirSync(DIR).find((f) => f.includes(prefix));
if (!file) { console.error(`No banked record matching "${prefix}" in ${DIR}. Pull it first:\n  npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_ua-pull-records.ts ${prefix}`); process.exit(2); }
const rec = JSON.parse(readFileSync(join(DIR, file), "utf8"));

// ── PRE-REGISTERED PREDICTIONS (banked 2026-08-20, before the run existed) ────────────────────────────
const PRED = {
  documentsReceived: 52,        // deterministic — ingest already proved 52 of 52 with 0 fetch failures
  obligationCarrying: 48,       // deterministic — production countGroundableObligations over full text
  analysedBefore: 3,            // the pre-arc baseline under the R3 definition, run 3b5bba30
  engineCoveredBefore: 8,       // what the engine's own path said before the unique-excerpt fix
  specDocs: 28,                 // technical specifications routed to extraction
  busiestLaneOverBy: 0,         // AUDIT_LENS_MAX_TURNS RAISED TO 10 (CEO, 2026-08-20) ⇒ 9 reads; the
                                //   flagship's busiest lane owns 8 and is now WITHIN capacity. Re-measured
                                //   at the new budget before the fire: 1 of 50 packages remains beyond it
                                //   and this is not one of them. The prediction below was rewritten for the
                                //   config that will ACTUALLY run — a prediction banked against a superseded
                                //   setting grades the run on a question nobody asked.
};

const fullSource: string = rec?.input?.fullSource ?? "";
const findings: any[] = rec?.result?.findings ?? [];
const regions = docRegions(fullSource);
const cov = deriveDocumentCoverage(regions, findings as any);
const dc = rec?.result?.coverage?.docCoverage ?? {};
const engineCovered = Math.max(0, regions.filter((r) => r.name !== "SAM Notice Body").length - (dc.uncovered?.length ?? 0));
const hit = (label: string, actual: unknown, expected: unknown) =>
  console.log(`   ${String(actual) === String(expected) ? "= as predicted" : "≠ DIVERGES    "}  ${label.padEnd(38)} predicted ${expected}, actual ${actual}`);

console.log(`══ POST-RUN VERIFICATION — ${rec?.meta?.sol} · run ${String(rec?.meta?.runId).slice(0, 8)}`);
console.log(`   verdict           ${rec?.result?.verdict}${rec?.result?.noVerdictCause ? ` (${rec.result.noVerdictCause})` : ""}`);
console.log(`   findings          ${findings.length}`);

console.log(`\n── DID THE DENOMINATOR HOLD? (deterministic — a change here means ingest changed, not the engine)`);
hit("documents received", cov.received, PRED.documentsReceived);
hit("carrying an obligation", cov.obligationCarrying, PRED.obligationCarrying);

console.log(`\n── THE TWO MEASURES, NAMED APART (never quote either alone as "coverage")`);
console.log(`   ENGINE COVERAGE  — document was READ (extraction span counts)   ${engineCovered} of ${cov.received}   (was ${PRED.engineCoveredBefore})`);
console.log(`   ANALYSED         — a grounded finding uniquely landed in it     ${cov.analysed} of ${cov.received}   (was ${PRED.analysedBefore})`);
console.log(`   obligation-carrying AND analysed — the R6 four-week measure      ${cov.obligationCarryingAndAnalysed} of ${cov.obligationCarrying}`);
console.log(`   shared-excerpt credit withheld by the new rule                   ${cov.sharedExcerptCreditOnly.length}`);

console.log(`\n── DID EACH AXIS ACTUALLY FIRE? (a flag that is true and a code path that ran are different facts)`);
const usage: any[] = rec?.result?.usage ?? [];
const labels = usage.map((u) => String(u?.label ?? ""));
const extractionCalls = labels.filter((l) => /map|extract/i.test(l)).length;
const lensCalls = labels.filter((l) => /capture_strategist|contracts_attorney|pricing_analyst|former_ko|proposal_manager/.test(l)).length;
console.log(`   billed calls total                       ${usage.length}`);
console.log(`   …extraction-shaped                       ${extractionCalls}   (axis 2 — expect ~${PRED.specDocs} if it fired)`);
console.log(`   …lens-shaped                             ${lensCalls}`);
const perLens = rec?.result?.perLens ?? {};
console.log(`   per-lens keys present                    ${Object.keys(perLens).join(", ") || "(none)"}`);

console.log(`\n── WHY EACH DOCUMENT IS UNCOVERED (the recorder shipped this week)`);
const detail: Array<{ doc: string; reason: string }> = rec?.result?.diagnostics?.docUncoveredDetail ?? [];
const byReason = new Map<string, number>();
for (const d of detail) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
if (!detail.length) console.log(`   (none recorded — the run may predate the recorder, or coverage was complete)`);
for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${reason}`);

console.log(`\n── THE CUSTOMER-FACING SENTENCE THIS RUN WOULD SHOW`);
console.log(`   "${coverageDisclosure(cov, { maxNamed: 3 })}"`);

console.log(`\n── COST`);
const cost = rec?.billing ?? {};
console.log(`   ${JSON.stringify(cost).slice(0, 300)}`);

console.log(`\n✅ CAPACITY GOING IN: AUDIT_LENS_MAX_TURNS=10 ⇒ 9 reads. The busiest lane on this package owns 8,`);
console.log(`   so every owned document is reachable. If one still comes back unanalysed it is a REAL finding`);
console.log(`   about the lens, not arithmetic — which is exactly what raising the budget was for.`);
