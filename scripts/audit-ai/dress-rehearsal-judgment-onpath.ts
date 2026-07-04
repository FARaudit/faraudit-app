// FLAG-ON $0 DRESS REHEARSAL — J-1/J-2 JUDGMENT LAYER, the ORCHESTRATOR seam (Brain card 247 verify step).
//   npx tsx scripts/audit-ai/dress-rehearsal-judgment-onpath.ts
//
// The layer's four-walls behaviour is already proven at the UNIT level (test-judgment-layer, 27 green). This
// rehearsal proves the *integration* the prod-wire adds: with AUDIT_JUDGMENT_LAYER=true (+ tristate) and the
// judgmentReason/judgmentEntail callers STUBBED through the SAME seam audit-package feeds (runAgenticAudit's
// OrchestratorInput), the ON-path runs END-TO-END — J-1 producer fires pre-P2 → J-2 3-state verifies at the P2
// seam → the four walls hold → deriveVerdict (sole authority) consumes the verified defect → judgmentCost
// surfaces on AuditResult. NO paid calls (callers stubbed). Flag OFF ⇒ byte-identical (no judgmentCost, no
// producer finding). Proves the "flag gates nothing" trap did NOT ship: ON genuinely runs the layer live.

import { runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel, type RawFinding } from "@/lib/audit-expert";
import { registerVerifier, _clearVerifiers } from "@/lib/audit-decide";
import {
  registerJudgmentVerifier, JUDGMENT_VERIFIER_ID,
  type ReasonCaller, type EntailmentCaller, type ProducedFinding, type EntailmentState,
} from "@/lib/audit-judgment-layer";
import type { AuditToolContext } from "@/lib/audit-tools";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) { pass++; } else { fails.push(label); console.log(`  [FAIL] ${label}`); } };

// A package carrying a genuine unmeetable-by-any-offeror defect: a 5-day delivery gated behind a 90-day
// non-waivable FAT (same defect the unit test uses). Two grounded §C tension findings ⇒ a Gap-B pair ⇒ J-1 fires.
const SRC = [
  "SECTION B - SUPPLIES AND PRICES",
  "Offerors shall submit a completed price schedule for all CLINs.",
  "SECTION C - STATEMENT OF WORK",
  "The contractor shall deliver all units within 5 days after receipt of order.",
  "A non-waivable first article test requiring 90 days must be completed before any delivery is authorized.",
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Submit a completed price schedule with the offer.",
  "SECTION M - EVALUATION FACTORS",
  "Award will be made on a lowest-priced technically acceptable basis.",
].join("\n");
const ctx: AuditToolContext = { fullSource: SRC };
const DEFECT_EXCERPT = "A non-waivable first article test requiring 90 days must be completed before any delivery is authorized.";

// Lens stub (same contract as makeAnthropicCallModel): first turn READS every binding section (so coverage
// completes), then submits grounded findings keyed by the lens system prompt. Two §C findings carry tension
// tokens (durations / "first article" / "non-waivable") so selectGapBPairs yields a pair → J-1 is invoked.
const READS = ["B", "C", "L", "M"];
const F: Record<string, RawFinding> = {
  price:    { requirement: "submit price schedule for all CLINs", citation: "§B", excerpt: "completed price schedule for all CLINs", kind: "submission", controllability: "bidder_controls" },
  delivery: { requirement: "deliver all units within 5 days after receipt of order", citation: "§C", excerpt: "deliver all units within 5 days after receipt of order", kind: "technical_spec", controllability: "bidder_controls" },
  fat:      { requirement: "non-waivable first article test requiring 90 days before delivery", citation: "§C", excerpt: "non-waivable first article test requiring 90 days must be completed before any delivery", kind: "technical_spec", controllability: "bidder_controls" },
  submit:   { requirement: "submit price schedule with the offer", citation: "§L", excerpt: "Submit a completed price schedule with the offer.", kind: "submission", controllability: "bidder_controls" },
  eval:     { requirement: "LPTA evaluation basis", citation: "§M", excerpt: "lowest-priced technically acceptable basis", kind: "other", controllability: "bidder_controls" },
};
const callModel: CallModel = async ({ priorToolResults }) =>
  priorToolResults.length === 0
    ? { toolCalls: READS.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
    : { toolCalls: [], findings: [F.price, F.delivery, F.fat, F.submit, F.eval] };
const experts = [{ key: "capture", system: "CAP" }];

// The STUBBED prod callers — the SAME typed contract audit-package's makeJudgmentCallers returns, minus the
// network. J-1 always emits the grounded unmeetable defect; J-2 returns the scenario's 3-state verdict. Tokens
// reported so judgmentCost is a realistic (non-est-fallback) sample.
const producedDefect: ProducedFinding = {
  requirement: "The 5-day delivery and the 90-day non-waivable FAT gate cannot both be satisfied by any offeror.",
  citation: "§C (cross-clause)", excerpt: DEFECT_EXCERPT, universalDefect: "unmeetable_by_any_offeror", derivedFrom: ["delivery", "fat"],
};
const reasonStub = (): ReasonCaller => async () => ({ findings: [producedDefect], inTokens: 1800, outTokens: 120 });
const entailStub = (state: EntailmentState): EntailmentCaller => async () => ({ state, evidence: `stub ${state}`, inTokens: 700, outTokens: 40 });

async function run(env: Record<string, string | undefined>, judgment: { reason?: ReasonCaller; entail?: EntailmentCaller }) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]!; }
  // Boot registration is env-gated; call it explicitly now that the flags are live (idempotent; no-op when off).
  try {
    _clearVerifiers();
    registerJudgmentVerifier(process.env); // registers the verifier + J-1 producer when the flag+tristate are on
    return await runAgenticAudit({
      ctx, experts, callModel,
      ...(judgment.reason ? { judgmentReason: judgment.reason } : {}),
      ...(judgment.entail ? { judgmentEntail: judgment.entail } : {}),
    });
  } finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]!; } }
}

const ON = { AUDIT_JUDGMENT_LAYER: "true", AUDIT_ELIGIBLE_TRISTATE: "true", AUDIT_GROUNDING_SWEEP: "false" };
const OFF = { AUDIT_JUDGMENT_LAYER: undefined, AUDIT_ELIGIBLE_TRISTATE: "true", AUDIT_GROUNDING_SWEEP: "false" };

(async () => {
  console.log("── FLAG-ON $0 DRESS REHEARSAL — judgment layer, orchestrator seam ──");

  // ── SCENARIO 1: flag ON, J-2 VERIFIED → the whole ON-path, all four walls, end-to-end ──
  const verified = await run(ON, { reason: reasonStub(), entail: entailStub("VERIFIED") });
  const mark = verified.findings.find((f) => f.universalDefect === "unmeetable_by_any_offeror");
  ok("ON: J-1 producer ran — a universalDefect finding is present (lens=judgment_producer, grounded)", !!mark && mark.lens === "judgment_producer" && mark.grounded === true);
  ok("ON: J-2 VERIFIED wrote verifiedBy from the REGISTERED verifier id + a real excerptHash", !!mark?.verifiedBy && mark.verifiedBy.verifierId === JUDGMENT_VERIFIER_ID && (mark.verifiedBy.excerptHash?.length ?? 0) > 0);
  ok("ON: judgmentCost surfaced on AuditResult (j1Calls≥1 AND j2Calls≥1)", (verified.judgmentCost?.j1Calls ?? 0) >= 1 && (verified.judgmentCost?.j2Calls ?? 0) >= 1);
  ok("ON: judgmentCost metered real reported tokens (not the est fallback)", (verified.judgmentCost?.j1InTokens ?? 0) >= 1800 && (verified.judgmentCost?.j2InTokens ?? 0) >= 700);
  ok("ON: walls held → deriveVerdict consumed the verified defect → NO_BID", verified.decision.verdict === "NO_BID");
  console.log(`  judgmentCost sample = ${JSON.stringify(verified.judgmentCost)}  → verdict=${verified.decision.verdict}`);

  // ── SCENARIO 2: flag ON, J-2 UNVERIFIABLE → the mark never verifies → NHR wall holds (fail-safe) ──
  const unver = await run(ON, { reason: reasonStub(), entail: entailStub("UNVERIFIABLE") });
  const uMark = unver.findings.find((f) => f.universalDefect === "unmeetable_by_any_offeror");
  ok("ON/UNVERIFIABLE: the producer finding is present but carries NO verifiedBy", !!uMark && !uMark.verifiedBy);
  ok("ON/UNVERIFIABLE: verdict is NOT NO_BID (the unverified-mark NHR wall holds end-to-end)", unver.decision.verdict !== "NO_BID");
  ok("ON/UNVERIFIABLE: judgmentCost still surfaced (J-2 spent a call to reach UNVERIFIABLE)", (unver.judgmentCost?.j2Calls ?? 0) >= 1);
  console.log(`  UNVERIFIABLE verdict=${unver.decision.verdict}`);

  // ── SCENARIO 3: flag OFF → byte-identical (no judgmentCost, no producer finding) ──
  const off = await run(OFF, { reason: reasonStub(), entail: entailStub("VERIFIED") });
  ok("OFF: judgmentCost absent from AuditResult", off.judgmentCost === undefined);
  ok("OFF: no judgment_producer finding entered the set (layer fully inert)", !off.findings.some((f) => f.lens === "judgment_producer"));
  ok("OFF: verdict is the un-augmented baseline (NOT NO_BID)", off.decision.verdict !== "NO_BID");
  console.log(`  OFF verdict=${off.decision.verdict}  judgmentCost=${off.judgmentCost}`);

  console.log(`\n${fails.length ? "❌" : "✅"} dress-rehearsal: ${pass} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); process.exit(1); }
})();
