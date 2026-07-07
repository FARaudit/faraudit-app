// $0 deterministic gate for T1-10 (truncated submit_findings coalesced to []).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-expert.ts
//
// A max_tokens stop can clip the submit_findings tool JSON so `findings` never
// parses to an array. The old `?? []` turned that into an empty findings set —
// indistinguishable from a genuine "lens found nothing" — so the lens converged
// and propped up a false COMPLETE. Fix: only an actual array is a valid submit;
// a truncated/undefined field returns findings:null → the loop ends converged:false
// → coverageComplete:false (honest INCOMPLETE). Drives the REAL callModel + loop.

import { makeAnthropicCallModel, runAgenticExpert } from "@/lib/audit-expert";
import type { CallModel } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const eq = (label: string, got: unknown, exp: unknown) => { JSON.stringify(got) === JSON.stringify(exp) ? pass++ : fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

const ctx = { fullSource: "SECTION L. Submit one volume. SECTION M. LPTA." } as AuditToolContext;
const spec = { key: "test_lens", system: "You are a test lens." };

// ── Level A: the coalesce fix in the REAL production callModel (mock SDK) ──
const mockClient = (content: unknown[]) => ({
  messages: { create: async () => ({ content, stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } }) },
});
const callWith = async (input: Record<string, unknown>) => {
  const cm = makeAnthropicCallModel(mockClient([{ type: "tool_use", id: "t1", name: "submit_findings", input }]) as never, "test-model");
  return cm({ system: "s", userTask: "u", priorToolResults: [], forceSubmit: true });
};

(async () => {
  const genuine = await callWith({ findings: [] });
  eq("T1-10 R1: genuine empty submit ({findings:[]}) → findings is an ARRAY (valid empty submission)", Array.isArray(genuine.findings), true);
  eq("T1-10 R2: genuine empty submit → findings length 0", genuine.findings?.length, 0);

  const truncatedMissing = await callWith({}); // findings field never emitted (clipped)
  eq("T1-10 R3: truncated submit (no findings field) → findings:null (NOT a clean empty)", truncatedMissing.findings, null);

  const truncatedNonArray = await callWith({ findings: "requirement: ..." }); // clipped mid-JSON → not an array
  eq("T1-10 R4: malformed submit (findings not an array) → findings:null", truncatedNonArray.findings, null);

  // ── Level B: the honest downstream consequence via the REAL react loop ──
  const alwaysEmpty: CallModel = async () => ({ toolCalls: [], findings: [] });
  const emptyRun = await runAgenticExpert(spec, ctx, { callModel: alwaysEmpty, maxTurns: 2 });
  eq("T1-10 R5: a genuine empty lens CONVERGES (converged:true, findings:[])", [emptyRun.converged, emptyRun.findings.length], [true, 0]);

  const alwaysTruncated: CallModel = async () => ({ toolCalls: [], findings: null });
  const truncRun = await runAgenticExpert(spec, ctx, { callModel: alwaysTruncated, maxTurns: 2 });
  eq("T1-10 R6: a lens that only ever truncates ends converged:FALSE (honest INCOMPLETE, not clean-empty)", truncRun.converged, false);
  ok("T1-10 R7: converged:false is distinguishable from the genuine empty (which is converged:true)", emptyRun.converged === true && truncRun.converged === false);

  console.log(`\nTier1 expert (T1-10): ${pass}/${pass + fails.length} PASS`);
  if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
})();
