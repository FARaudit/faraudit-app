// $0 proof for the overall-budget AbortSignal threading (limit d/N2).
// Run: npx tsx src/lib/audit-budget-signal.test.ts
//
// Invariants:
//  1. NO-OP equivalence — without a signal (how the gold-proof harness calls the
//     engine) behavior is byte-identical: same findings, same model-call count. This
//     is what keeps the 6/6 gold proofs valid WITHOUT a paid re-run.
//  2. Pre-aborted signal — the expert throws BEFORE calling the (paid) model, never
//     returns an empty-findings result that would masquerade as a real INCOMPLETE.
//  3. Mid-run abort — once the budget aborts the signal, the loop throws on the next
//     turn instead of running to maxTurns (stops spend promptly).

import { runAgenticExpert, type CallModel } from "./audit-expert";
import type { AuditToolContext } from "./audit-tools";

const ctx: AuditToolContext = {
  fullSource: "SECTION K — Representations. The offeror SHALL hold a Secret facility clearance. SECTION F — Deliveries. Delivery within 90 days ARO.",
};
const spec = { key: "eligibility", system: "you are the eligibility lens" };

// A grounded submit (excerpt is literally in fullSource → survives isGrounded).
const submitFindings = () => ({
  toolCalls: [],
  findings: [{ requirement: "facility clearance", citation: "§K", excerpt: "hold a Secret facility clearance", kind: "eligibility_bar" as const, controllability: "bidder_cannot_move" as const, requiredAttribute: "clearance:secret", curableInWindow: false }],
});

function counting(impl: CallModel): { fn: CallModel; calls: () => number } {
  let n = 0;
  const fn: CallModel = async (args) => { n++; return impl(args); };
  return { fn, calls: () => n };
}

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

(async () => {
  // 1 — no signal
  const c1 = counting(async () => submitFindings());
  const r1 = await runAgenticExpert(spec, ctx, { callModel: c1.fn });

  // 1b — non-aborted signal: identical result + identical call count (no-op equivalence)
  const c2 = counting(async () => submitFindings());
  const live = new AbortController();
  const r2 = await runAgenticExpert(spec, ctx, { callModel: c2.fn, signal: live.signal });
  check("T1 · no-signal vs non-aborted-signal → identical findings count", r1.findings.length === 1 && r2.findings.length === 1, `${r1.findings.length}/${r2.findings.length}`);
  check("T2 · no-signal vs non-aborted-signal → identical model-call count", c1.calls() === c2.calls() && c1.calls() === 1, `${c1.calls()} vs ${c2.calls()}`);
  check("T3 · non-aborted-signal findings are grounded + converged", r2.converged === true, `converged=${r2.converged}`);

  // 2 — pre-aborted signal: throws before the paid call, model never invoked
  const c3 = counting(async () => submitFindings());
  const pre = new AbortController(); pre.abort();
  let threw3 = false;
  try { await runAgenticExpert(spec, ctx, { callModel: c3.fn, signal: pre.signal }); }
  catch { threw3 = true; }
  check("T4 · pre-aborted signal → throws (no false-empty INCOMPLETE)", threw3, "did not throw");
  check("T5 · pre-aborted signal → paid model NEVER called", c3.calls() === 0, `calls=${c3.calls()}`);

  // 3 — mid-run abort: turn 1 reads a section, then the budget aborts; turn 2 throws.
  const mid = new AbortController();
  let n = 0;
  const midModel: CallModel = async () => {
    n++;
    if (n === 1) { mid.abort(); return { toolCalls: [{ id: "t1", name: "read_section", input: { key: "K" } }], findings: null }; }
    return submitFindings();
  };
  let threw6 = false;
  try { await runAgenticExpert(spec, ctx, { callModel: midModel, signal: mid.signal, maxTurns: 8 }); }
  catch { threw6 = true; }
  check("T6 · mid-run abort → throws on next turn (not run to maxTurns)", threw6, "did not throw");
  check("T7 · mid-run abort → stopped after exactly 1 model call", n === 1, `calls=${n}`);

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
