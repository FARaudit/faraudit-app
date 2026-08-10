// $0 READ-ONLY PROBE — stage 07 verdict-ladder challenge, 2026-08-06.
// Drives the REAL exported gateV2Outcome + deriveVerdict over the banked run record at production flag
// parity. No model call, no network, no write. Delete after the session.
import { readFileSync } from "node:fs";
import { gateV2Outcome } from "../../src/lib/audit-gate-v2";
import { deriveVerdict, registerJudgmentVerifier } from "../../src/lib/audit-decide";

// production parity — sourced from `railway variables --service audit-worker --kv` this session
const PROD: Record<string, string> = {
  AUDIT_ELIGIBLE_TRISTATE: "true",
  AUDIT_GATE_V2: "true",
  AUDIT_COVERAGE_CAP_NOT_MUTE: "true",
  AUDIT_INCOMPLETE_PRECEDENCE: "true",
  AUDIT_VERDICT_POLE_PRECEDENCE: "true",
  AUDIT_SELF_CLEARABLE_PACKAGE: "true",
  AUDIT_SOLE_SOURCE_LOCK: "true",
  AUDIT_SETASIDE_BACKSTOP: "true",
  AUDIT_MM_EVIDENCE_FACTOR_DEMOTION: "true",
  AUDIT_SCOPE_OPACITY_RECONCILE: "true",
  AUDIT_FABRICATION_INVARIANT: "true",
  AUDIT_SETASIDE_CONFLICT_GATE: "true",
};
for (const [k, v] of Object.entries(PROD)) process.env[k] = v;
for (const k of ["AUDIT_FOURWALLS_NOBID", "AUDIT_TEMPORAL_VERDICT", "AUDIT_ATTACHMENT_COVERAGE"]) delete process.env[k];

// mirror boot: the judgment verifier registers at startup (without it, FORK-5 trips for the wrong reason)
try { registerJudgmentVerifier(); } catch { /* already registered */ }

const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_ua-3b5bba30.json", "utf8"));
const inputs = rec.result.inputs;

console.log("=== A. gateV2Outcome on the banked coverageV2 ===");
const v2 = gateV2Outcome(inputs.coverageV2, { findings: inputs.findings });
console.log(`cap=${v2.cap}  kind=${v2.kind}`);
console.log(`disqualifierUncovered=${inputs.coverageV2.disqualifierUncovered.length} unreadable=${inputs.coverageV2.unreadable.length} attestedCount=${inputs.coverageV2.attestedCount}`);
console.log(`CAP-NOT-MUTE RELEASES? ${v2.cap === "NEEDS_HUMAN_REVIEW" && v2.kind === "uncovered_obligation"}`);

console.log("\n=== B. deriveVerdict replay at prod parity ===");
const d = deriveVerdict(inputs);
console.log(`verdict=${d.verdict}  eligible=${d.eligible}  cause=${(d as { noVerdictCause?: string }).noVerdictCause}`);
console.log(`banked verdict=${rec.result.verdict}  MATCH=${d.verdict === rec.result.verdict}`);

console.log("\n=== C. counterfactual: what does each input change alone? ===");
const flip = (patch: Record<string, unknown>, label: string) => {
  const d2 = deriveVerdict({ ...inputs, ...patch });
  console.log(`${label.padEnd(58)} → ${d2.verdict}`);
};
flip({ coverageV2: { ...inputs.coverageV2, disqualifierUncovered: [] } }, "disqualifierUncovered = []");
flip({ documentsComplete: true }, "documentsComplete = true");
flip({ manifestComplete: true }, "manifestComplete = true");
flip({ documentsComplete: true, manifestComplete: true }, "documentsComplete + manifestComplete = true");
flip({ coverageV2: { ...inputs.coverageV2, disqualifierUncovered: [] }, documentsComplete: true, manifestComplete: true }, "all three cleared");

console.log("\n=== D. kind classification of every uncovered obligation ===");
for (const o of inputs.coverageV2.disqualifierUncovered) {
  const one = gateV2Outcome({ ...inputs.coverageV2, disqualifierUncovered: [o] }, { findings: inputs.findings });
  console.log(`  ${String(one.kind).padEnd(24)} ${JSON.stringify(o.obligation).slice(0, 96)}`);
}
