// "HOW THIS CALL WAS REACHED" — pathway-narrative coherence (card #612-(3a)).
// Driver: LBJ 653570ea rendered a real BID_WITH_CAUTION verdict but the reasoning
// chain took the coverage-terminal branch ("the sequence stops here and no verdict
// is issued" + "Remaining checks — Not reached") because coverage.state was flagged
// INCOMPLETE (§L in coverage.missing). The chain then printed the BWC verdict two
// steps later — a self-contradiction. The terminal "no verdict issued" copy belongs
// ONLY to the genuine INCOMPLETE pole; a committal verdict must narrate the full chain.
// Run: npx tsx src/lib/v5-report/reasoning-coherence.test.ts
import { reasoningSteps } from "./render";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// minimal V4Data factory (only the fields reasoningSteps reads)
function data(over: any): any {
  return {
    verdict: { pole: "BID_WITH_CAUTION", band: "BID — WITH CAUTION", tone: "caution", noVerdict: false, eligible: null, rationale: "…", ...(over.verdict || {}) },
    coverage: { state: "COMPLETE", read: 5, total: 5, core: [], missing: [], ...(over.coverage || {}) },
    findings: { p0: [], p1: [], p2: [], ...(over.findings || {}) },
  };
}
const details = (steps: any[]) => steps.map((s) => `${s.label}: ${s.outcome} — ${s.detail}`).join("\n");
const hasStep = (steps: any[], label: RegExp) => steps.some((s) => label.test(s.label));

// ── the LBJ case: committal BWC with a flagged §L (coverage.state=INCOMPLETE) ──
{
  const steps = reasoningSteps(data({
    verdict: { pole: "BID_WITH_CAUTION", noVerdict: false, eligible: null },
    coverage: { state: "INCOMPLETE", read: 5, total: 5, missing: ["L"] },
    findings: { p1: [{ cite: "§L", req: "x", driver: false }] },
  }));
  const txt = details(steps);
  assert(!/the sequence stops here and no verdict is issued/i.test(txt), "LBJ: no 'sequence stops / no verdict issued' copy on a committal verdict");
  assert(!steps.some((s) => s.skip), "LBJ: no skip('Remaining checks') step — the checks WERE run");
  assert(hasStep(steps, /blocking conditions/i), "LBJ: blocking-conditions step present (full chain)");
  assert(hasStep(steps, /verdict/i), "LBJ: verdict step present");
  assert(/flagged for your confirmation/i.test(txt) && /rests on the record that was read/i.test(txt), "LBJ: coverage step is honest-but-non-terminal (§L flagged, decision rests on the read)");
  assert(/\bL\b/.test(steps[0].detail), "LBJ: the flagged section (L) is named in the coverage step");
}

// ── genuine INCOMPLETE pole: terminal copy + skip MUST remain ──
{
  const steps = reasoningSteps(data({
    verdict: { pole: "INCOMPLETE", band: "INCOMPLETE", tone: "slate", noVerdict: true },
    coverage: { state: "INCOMPLETE", read: 2, total: 5, missing: ["C"] },
  }));
  const txt = details(steps);
  assert(/the sequence stops here and no verdict is issued/i.test(txt), "INCOMPLETE: terminal partial-read copy preserved");
  assert(steps.some((s) => s.skip && /remaining checks/i.test(s.label)), "INCOMPLETE: skip('Remaining checks') preserved");
  assert(!hasStep(steps, /blocking conditions/i), "INCOMPLETE: full chain NOT narrated (terminal at coverage)");
}

// ── NHR pole (docs read, findings conflict): coverage is not the halt reason ──
{
  const steps = reasoningSteps(data({
    verdict: { pole: "NEEDS_HUMAN_REVIEW", band: "NEEDS HUMAN REVIEW", tone: "slate", noVerdict: true },
    coverage: { state: "INCOMPLETE", read: 5, total: 5, missing: [] },
    findings: { p1: [{ cite: "§C", req: "y", driver: true }] },
  }));
  const txt = details(steps);
  assert(!/the sequence stops here and no verdict is issued/i.test(txt), "NHR: does not blame coverage ('partial read') for the halt");
  assert(/see the next step/i.test(txt), "NHR: coverage step defers to the next (findings-reconciled) step");
  assert(steps.some((s) => /reconciled/i.test(s.label) || /reconcile/i.test(s.outcome || "")), "NHR: findings-reconciled terminal step present");
}

// ── clean committal COMPLETE: unchanged full chain, green coverage ──
{
  const steps = reasoningSteps(data({
    verdict: { pole: "BID", band: "BID", tone: "go", eligible: true },
    coverage: { state: "COMPLETE", read: 5, total: 5, missing: [] },
  }));
  const txt = details(steps);
  assert(steps[0].outcome === "Sufficient" && steps[0].tone === "go", "COMPLETE: coverage step is Sufficient/green");
  assert(hasStep(steps, /verdict/i) && !steps.some((s) => s.skip), "COMPLETE: full chain, no skip");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
