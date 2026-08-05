// ZERO-ATTESTATION REACHABILITY GATE — $0, deterministic, no model call, no paid run.
//
// ⚠ RED BY DESIGN AT PRODUCTION PARITY. A ruling is owed; do not "fix" this gate by narrowing it.
//   It is deliberately NOT in CI's glob (src/lib/*.test.ts) because the defect it names is unfixed.
//
// THE QUESTION (digest ENGINE-ZERO-ATTESTATION-REACH): can a REAL package reach the coverage
// gate's all-clear on ZERO sections? MEASURED 2026-08-05: yes. 2 of 47 banked run records reach
// gateV2Outcome → cap null, reason "Coverage complete (grade 100%)" having attested NOTHING.
// Both are Part-12 commercial (SF-18 / combined-synopsis).
//
// THE THREE CONDITIONS, all true in production:
//   1. buildManifest → []            — readSection presence is header-regex, and a commercial
//                                      package carries no UCF §B..§M headers.
//   2. coreMissingFor → []           — audit-orchestrator.ts:311 returns [] UNCONDITIONALLY for
//                                      part12-commercial when AUDIT_COMMERCIAL_CLAUSE_APPLICABILITY
//                                      is on, before any absence check. It is on in production.
//   3. gradeCoverageV2([]) → grade 1 — audit-gate-v2.ts:1118, `totalWeight === 0 ? 1`.
//
// AND THE V1 GUARD THAT WOULD CATCH IT IS DEAD. audit-orchestrator.ts:2751 computes
// `coverageComplete = ... && required.length > 0`, correctly FALSE here — but deriveVerdict's only
// two reads of it (audit-decide.ts:3319, :3614) both sit in the `else` of `if (inp.coverageV2)`,
// and coverageV2 is always present with GATE_V2 on. The guard is computed right and never read.
//
// WHAT IS **NOT** ESTABLISHED: a false COMMITTAL verdict. On both hits deriveVerdict still returned
// NEEDS_HUMAN_REVIEW — from a finding-driven eligibility gate, NOT from coverage (negative control:
// unsetting AUDIT_NOTICE_BODY_ELIG_FLOOR flipped neither). Coverage contributed ZERO protection on
// this class; the save came from elsewhere and is not guaranteed for a package without such a
// finding. Report this as a gate that cannot fail, NOT as a live false-BID path.
//
// Run it BOTH ways — a red carries no information until you have seen the other side:
//   clean:  npx tsx scripts/audit-ai/test-zero-attestation-reach.ts
//   parity: railway variables --service audit-worker --kv | grep -E '^AUDIT_' | grep -iE '=true$' \
//             > /tmp/prodflags.env && set -a && source /tmp/prodflags.env && set +a && npx tsx ...
//
// RECORDS_DIR overrides the corpus path — used to prove this gate CAN go green (falsifiability).
//
// Exit 1 iff at least one REAL banked package reaches the all-clear on zero attestations.

import fs from "node:fs";
import path from "node:path";
import { detectFormat, procurementPart, requiresProposalSections, type AuditToolContext } from "../../src/lib/audit-tools";
import { buildManifest, coreMissingFor, completenessOf } from "../../src/lib/audit-orchestrator";
import { gradeCoverageV2, gateV2Outcome, GATE_V2_ENABLED } from "../../src/lib/audit-gate-v2";
import { deriveVerdict } from "../../src/lib/audit-decide";
import { registerJudgmentVerifier } from "../../src/lib/audit-judgment-layer";

// The judgment allowlist starts EMPTY — without this a universalDefect probe trips FORK-5 and
// returns the right answer for the wrong reason. Register before any deriveVerdict call.
registerJudgmentVerifier();

const DIR = process.env.RECORDS_DIR ?? path.join(__dirname, "run-records");

type Row = {
  file: string; sol: string; part: string; format: string;
  formIdentified: boolean | undefined; requiredN: number; coreN: number;
  attsN: number; grade: number; cap: string | null; reason: string;
  allClear: boolean; cov: ReturnType<typeof gradeCoverageV2>;
};

// file → record, so a hit can be replayed end-to-end through deriveVerdict on its OWN inputs.
const byFile = new Map<string, any>();

function loadRecords(dir: string): Array<{ file: string; rec: any }> {
  const out: Array<{ file: string; rec: any }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...loadRecords(p)); continue; }
    if (!entry.name.endsWith(".json")) continue;
    let rec: any;
    try { rec = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    // Only true run records replay — a panel-findings bank has no input.fullSource.
    if (!rec?.input?.fullSource || !rec?.result?.findings) continue;
    out.push({ file: path.relative(DIR, p), rec });
  }
  return out;
}

const records = loadRecords(DIR);
if (records.length === 0) {
  console.error("FAIL — no replayable run records found under", DIR);
  console.error("       run-records/ is gitignored; copy it from the primary checkout (including _ua-cohort/).");
  process.exit(2);
}

const rows: Row[] = [];
for (const { file, rec } of records) {
  const ctx: AuditToolContext = {
    fullSource: rec.input.fullSource,
    sections: rec.input.sections,
    groundingSource: rec.input.groundingSource,
    ...(rec.input.noticeBodyText ? { noticeBodyText: rec.input.noticeBodyText } : {}),
  };
  const required = buildManifest(ctx);
  // Scope §L/§M exactly the way replay-run-record does — never widen what the run required.
  const coreMissing = coreMissingFor(ctx, {
    ...(rec.input.noticeType !== undefined ? { requiresLM: requiresProposalSections(rec.input.noticeType) } : {}),
    ...(rec.input.formIdentified !== undefined ? { formIdentified: rec.input.formIdentified } : {}),
  });
  const { attestations } = completenessOf(ctx, required, rec.result.findings, new Set(rec.result.sectionsRead ?? []));
  const cov = gradeCoverageV2(attestations);
  const out = gateV2Outcome(cov);
  // THE CLASS: nothing attested, nothing capped, and the gate says complete.
  const allClear = attestations.length === 0 && coreMissing.length === 0 && out.cap === null && cov.coverageGrade === 1;
  rows.push({
    file, sol: rec.meta?.sol ?? "(none)", part: procurementPart(ctx), format: String(detectFormat(ctx)),
    formIdentified: rec.input.formIdentified, requiredN: required.length, coreN: coreMissing.length,
    attsN: attestations.length, grade: cov.coverageGrade, cap: out.cap ?? null, reason: out.reason, allClear, cov,
  });
  byFile.set(file, rec);
}

const hits = rows.filter((r) => r.allClear);

console.log(`GATE_V2_ENABLED=${GATE_V2_ENABLED}  AUDIT_COMMERCIAL_CLAUSE_APPLICABILITY=${process.env.AUDIT_COMMERCIAL_CLAUSE_APPLICABILITY ?? "(unset)"}`);
console.log(`replayed ${rows.length} banked run records\n`);

// Print the zero-manifest population in full — the candidates — so a clean run is legible, not just a count.
const zeroManifest = rows.filter((r) => r.requiredN === 0);
console.log(`── zero-MANIFEST records (${zeroManifest.length}) — the candidate population ──`);
for (const r of zeroManifest) {
  console.log(
    `  req=${r.requiredN} atts=${r.attsN} core=${r.coreN} grade=${r.grade} cap=${r.cap ?? "null"}` +
    `  ${r.part}/${r.format} formIdentified=${r.formIdentified ?? "(unset)"}  ${r.file}`
  );
}

console.log(`\n── ZERO-ATTESTATION ALL-CLEAR (${hits.length}) ──`);
if (hits.length === 0) {
  console.log("  none — every banked package is either attested or capped.");
} else {
  for (const r of hits) {
    console.log(`  ${r.sol}  [${r.part}/${r.format}]  ${r.file}`);
    console.log(`      required=[] attestations=[] coreMissing=[] → grade ${r.grade}, cap ${r.cap}`);
    console.log(`      gate reason: ${r.reason}`);
    // END-TO-END: does the all-clear survive deriveVerdict, or does a later gate catch it?
    // The record's OWN banked VerdictInputs (production-shaped) with ONLY coverageV2 swapped for
    // the value this flag state computes — never a hand-built VerdictInputs, which would risk
    // exercising a legacy line production cannot reach.
    const rec = byFile.get(r.file)!;
    const inputs = { ...rec.result.inputs, coverageV2: r.cov };
    try {
      const v = deriveVerdict(inputs as Parameters<typeof deriveVerdict>[0]);
      console.log(`      → deriveVerdict: ${v.verdict}   (recorded at run time: ${rec.result.verdict})`);
      console.log(`      → reason: ${String(v.reason).slice(0, 220)}`);
    } catch (e) {
      console.log(`      → deriveVerdict THREW: ${(e as Error).message}`);
    }
  }
}

if (hits.length > 0) {
  console.error(`\nRED — ${hits.length} real banked package(s) reach the coverage all-clear having attested ZERO sections.`);
  process.exit(1);
}
console.log("\nGREEN — no banked package reaches the all-clear on zero attestations.");
