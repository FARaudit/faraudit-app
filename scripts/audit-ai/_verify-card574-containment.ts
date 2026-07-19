/* Card #574 step-1 — $0 CONTAINMENT VERIFY (no LLM). Replays the REAL Goodfellow FA303026Q0020 chapel §M
 * finding set (pulled verbatim from the banked run-record, NOT a reconstructed specimen — ground-truth per
 * [[feedback_reprove_verify_ground_truth]]) through the PRODUCTION deriveVerdict path (which internally reads
 * AUDIT_MM_EVIDENCE_FACTOR_DEMOTION and applies demoteMmEvidenceFactor(f, inp.source) at audit-decide.ts:2868).
 * Reports the ACTUAL reason string flag-OFF (reproduces fabrication) and flag-ON (contained).
 * Run: npx tsx scripts/audit-ai/_verify-card574-containment.ts
 */
import { deriveVerdict } from "../../src/lib/audit-decide";
import { hasGroundedLeadTimeBasis, classifyMmEvidenceFactor } from "../../src/lib/mm-evidence-factor";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";
import fs from "fs";

const REC = "scripts/audit-ai/run-records/FA303026Q0020.56ef9717-132f-4f7d-9baf-8cf8632c8692.run-record.json";
const rec = JSON.parse(fs.readFileSync(REC, "utf8"));
const allFindings: TypedFinding[] = rec.result.inputs.findings;
const source: string = rec.result.inputs.source;

// The mis-typed non-curable §M chapel bars — the exact fabrication drivers, pulled verbatim from the record.
const chapelBars = allFindings.filter(
  (f) => /chapel/i.test(JSON.stringify(f)) && f.controllability === "bidder_cannot_move" && f.curableInWindow === false,
);
console.log(`Loaded ${chapelBars.length} REAL non-curable chapel §M bar(s) from ${REC}`);
chapelBars.forEach((f, i) => console.log(`  bar#${i}: kind=${f.kind} reqAttr=${f.requiredAttribute}\n    req="${f.requirement.slice(0, 90)}..."`));

const vi = (findings: TypedFinding[]): VerdictInputs => ({
  findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source,
});

// Sanity: the fabrication mechanic is UNGROUNDED for this finding set (no lead-time / possession basis).
console.log(`\nhasGroundedLeadTimeBasis(chapelBars) = ${hasGroundedLeadTimeBasis(chapelBars)}  (expect false → mechanic ungrounded)`);
chapelBars.forEach((f, i) =>
  console.log(`  classifyMmEvidenceFactor(bar#${i}) = ${classifyMmEvidenceFactor({ requirement: f.requirement, excerpt: f.excerpt, citation: f.citation }, source)}  (expect demote)`));

const run = (on: boolean) => {
  process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION = on ? "true" : "false";
  return deriveVerdict(vi(chapelBars));
};

const off = run(false);
const on = run(true);

const FAB = /lead time exceeds the response window/i;
console.log(`\n===== FLAG OFF (baseline — reproduces live fabrication) =====`);
console.log(`verdict: ${off.verdict}`);
console.log(`reason:  ${off.reason}`);
console.log(`carries fabricated mechanic? ${FAB.test(off.reason)}`);

console.log(`\n===== FLAG ON (AUDIT_MM_EVIDENCE_FACTOR_DEMOTION=true — contained) =====`);
console.log(`verdict: ${on.verdict}`);
console.log(`reason:  ${on.reason}`);
console.log(`carries fabricated mechanic? ${FAB.test(on.reason)}`);

const pass = !FAB.test(on.reason);
console.log(`\n===== VERDICT =====`);
console.log(pass
  ? `PASS — flag ON, the "lead time exceeds the response window" fabrication is GONE. Actual reason above.`
  : `FAIL — fabrication still present flag ON.`);
process.exit(pass ? 0 : 1);
