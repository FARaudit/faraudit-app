// ── AGENTIC VERIFICATION ENGINE · PRODUCTION ENTRYPOINT ───────────────────────────────────────────────
// Brain card 43 — the single call that REPLACES the stuffed legacy audit. It wires the full Anthropic stack:
//   • the agentic expert LENS PANEL (audit-lenses) running the react loop (audit-expert) over the real SDK
//     tool-use turn (makeAnthropicCallModel) — reason → read_section/lookup_clause/find_in_source → ground;
//   • the P2 ADVERSARIAL VERIFIER (audit-verifier) — a structured skeptic that overturns misclassifications;
//   • the ORCHESTRATOR (audit-orchestrator) running P0→P5 and DERIVING the verdict (audit-decide, pure).
// Models bind through the role registry (model-registry) — never a literal ID in engine logic.
//
// LIVE (2026-06-28): this is the SOLE production engine. executeAudit (audit-executor.ts) routes every
// customer audit here UNCONDITIONALLY — there is no engine selector, no fallback, and no escape-hatch env
// flag. The legacy V1 path (runAudit/runAuditV2) was fully purged from the codebase (A4); the only
// alternative to a complete agentic report is an honest, no-charge failure.

import { anthropic } from "./anthropic";
import { callStructuredClaude } from "./anthropic-structured";
import { modelFor } from "./model-registry";
import { makeAnthropicCallModel } from "./audit-expert";
import { auditLenses } from "./audit-lenses";
import { makeAgenticVerifier, makeStructuredSkeptic, makeTieredSkeptic, makeBatchedSkeptic, type SkepticFn, type SkepticVerdict } from "./audit-verifier";
import { runAgenticAudit, docRegions, type AuditResult } from "./audit-orchestrator";
import { judgmentLayerEnabled, type ReasonCaller, type EntailmentCaller, type ProducedFinding, type EntailmentState } from "./audit-judgment-layer";
import { makeJudgmentFirstProposer, makePerDocProposer, runJudgmentFirst, type JudgmentStructuredCaller, type JudgmentFirstInput, type JudgmentFirstResult, type RailFn } from "./audit-judgment-first";
import { makeSectionFinderCaller } from "./audit-section-finder";
import type { UsageCall } from "./audit-cost";
import type { AuditToolContext } from "./audit-tools";
import type { BidderProfile } from "./audit-findings";
import type { CallModel, ExpertSpec } from "./audit-expert";
import type { ConstructionManifest } from "./audit-construction-manifest";

export interface AuditPackageInput {
  fullSource: string;                       // assembled package source (every routed section + attachment)
  sections?: Record<string, string>;        // optional precomputed UCF section → text
  bidderProfile?: BidderProfile | null;     // known firm attributes (eligibility matching); null = unknown
  experts?: ExpertSpec[];                   // override the lens panel (default = AUDIT_LENSES)
  expertModel?: string;                     // default modelFor("lens")
  skepticBaseModel?: string;                // P2 base adversary — default modelFor("lens") (Sonnet)
  skepticEscalateModel?: string;            // P2 escalation on contested findings — default modelFor("judge") (Opus)
  maxTurns?: number;                        // per-expert react-loop bound (default 8)
  signal?: AbortSignal;                     // overall wall-clock budget — cancels in-flight paid calls on breach (no-op if absent)
  manifestComplete?: boolean;               // N8 — external "every posted doc ingested" signal; false caps a no-bar verdict to INCOMPLETE
  naics?: string | null;                    // Step 4a (plumb-only) — SAM-resolved NAICS fact, forwarded to the gate pipeline; null when absent
  setAside?: string | null;                 // Step 4a (plumb-only) — SAM-resolved set-aside fact, forwarded to the gate pipeline; null when absent
  noticeType?: string | null;               // Layer-2 (card 262) — SAM notice type; scopes the §L/§M INCOMPLETE requirement to solicitation-type buys
  formIdentified?: boolean;                  // Layer-2 (card 262) — whether a substantive primary form was recognized; corroborates body-absent
  constructionManifest?: ConstructionManifest; // Brain card 288 — sealed SF-1442/part36 binding-content manifest (full-text, pre-compression); the part36 completeness carrier reads it
  groundingSource?: string;                  // Brain card 291 — STORED FULL TEXT (pre-compression) for Rule-64 grounding; model reads the digest (fullSource), source grounds
  judgmentReasonModel?: string;             // J-1 producer tier — default modelFor("judge") (Opus, the reasoning core); overridable to lens (Sonnet) as the card-246 cost lever
  judgmentEntailModel?: string;             // J-2 the registered independent Opus entailment verifier (card 246) — default modelFor("judge")
  sectionFinderModel?: string;              // L3 (card 265/267) — grounded section-finder; default modelFor("finder") (Sonnet — the offset-match gate makes it fail-safe)
  onUsage?: (u: UsageCall) => void;         // per-run token tally (concurrency-safe); the prod executor records cost from it
}

// ── J-1/J-2 JUDGMENT-LAYER CALLER SEAMS (Brain card 246/247 prod-wire) ──────────────────────────────────
// Structured-output schemas for the two injected model seams. J-1 returns grounded produced findings (a
// universalDefect mark, if any, is later verbatim-gated + semantic-gated + J-2-verified in the layer, so a
// hallucinated mark can never reach a committal pole). J-2 returns the 3-state entailment verdict.
const J1_SCHEMA = { type: "object", additionalProperties: false, required: ["findings"], properties: {
  findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["requirement", "citation", "excerpt"], properties: {
    requirement: { type: "string" }, citation: { type: "string" }, excerpt: { type: "string" },
    universalDefect: { type: "string", enum: ["contradictory_mandatory_terms", "unmeetable_by_any_offeror"] },
    derivedFrom: { type: "array", items: { type: "string" } } } } } } } as const;
const J2_SCHEMA = { type: "object", additionalProperties: false, required: ["state", "evidence"], properties: {
  state: { type: "string", enum: ["VERIFIED", "UNVERIFIABLE", "REFUTED"] }, evidence: { type: "string" } } } as const;

/** Build the REAL J-1/J-2 model callers (same wiring pattern as makeTieredSkeptic/makeAgenticVerifier: bind a
 *  role model, close over the audit-level signal + onUsage tally, adapt callStructuredClaude's raw JSON to the
 *  typed contract). Both meter real tokens into the returned inTokens/outTokens (the layer's JudgmentCost ledger)
 *  AND forward usage to the executor's per-run tally so the paid run prices the layer. Fail-safe on malformed
 *  output: J-1 → no candidates; J-2 → UNVERIFIABLE (the NHR wall holds — a parse failure never fabricates a
 *  VERIFIED, never a false NO_BID). Constructed ONLY when the flag is on ⇒ never runs on the OFF path. */
function makeJudgmentCallers(
  apiKey: string, reasonModel: string, entailModel: string,
  signal?: AbortSignal, onUsage?: (u: UsageCall) => void,
): { judgmentReason: ReasonCaller; judgmentEntail: EntailmentCaller } {
  const judgmentReason: ReasonCaller = async ({ system, user }) => {
    let inTokens = 0, outTokens = 0, degraded = false, findings: ProducedFinding[] = [];
    try {
      const res = await callStructuredClaude({
        apiKey, model: reasonModel, system, userPrompt: user, schema: J1_SCHEMA, maxTokens: 4096, signal, label: "judgment-j1",
        onUsage: (u) => { inTokens += u.input_tokens; outTokens += u.output_tokens; onUsage?.(u); },
      });
      const p = JSON.parse(res.text) as { findings?: ProducedFinding[] }; if (Array.isArray(p.findings)) findings = p.findings;
    } catch (e) {
      if (signal?.aborted) throw e; // an intentional budget/wall-clock cancellation must propagate (honest-fail, not a degrade)
      // A transient call/parse failure on this ADDITIVE layer degrades to "no candidates" — same fail-safe as a
      // malformed parse (card 247). The base lens audit stays complete; a real defect is simply not surfaced here
      // (fail toward NOT-NO_BID). LOGGED + degraded flag persisted (card 248 decision-2), never silent.
      degraded = true;
      console.log(`[j1-degrade] J-1 producer call failed (${(e as Error)?.message ?? String(e)}) — producing no candidates (fail-safe: never a false NO_BID)`);
    }
    return { findings, inTokens, outTokens, degraded };
  };
  const judgmentEntail: EntailmentCaller = async ({ system, user }) => {
    let inTokens = 0, outTokens = 0, degraded = false, state: EntailmentState = "UNVERIFIABLE", evidence = "";
    try {
      const res = await callStructuredClaude({
        apiKey, model: entailModel, system, userPrompt: user, schema: J2_SCHEMA, maxTokens: 1024, signal, label: "judgment-j2",
        onUsage: (u) => { inTokens += u.input_tokens; outTokens += u.output_tokens; onUsage?.(u); },
      });
      const p = JSON.parse(res.text) as { state?: EntailmentState; evidence?: string };
      if (p.state === "VERIFIED" || p.state === "REFUTED" || p.state === "UNVERIFIABLE") state = p.state;
      if (typeof p.evidence === "string") evidence = p.evidence;
    } catch (e) {
      if (signal?.aborted) throw e; // intentional cancellation propagates (honest-fail)
      // A transient call/parse failure degrades to UNVERIFIABLE — the NHR wall holds, a universalDefect mark can
      // NEVER reach a committal NO_BID on a failed verify. Same fail-safe as a malformed parse. LOGGED + degraded
      // flag persisted (card 248 decision-2), never silent.
      degraded = true;
      console.log(`[j2-degrade] J-2 entailment call failed (${(e as Error)?.message ?? String(e)}) — UNVERIFIABLE (fail-safe: NHR wall holds, never a false VERIFIED)`);
    }
    return { state, evidence, inTokens, outTokens, degraded };
  };
  return { judgmentReason, judgmentEntail };
}

/** Parse + validate a raw skeptic response into typed verdicts. RULING 2 (Brain card 274): a truncated
 *  (max_tokens) or unparseable or verdicts-missing response THROWS — NEVER a silent {verdicts:[]} swallow. An
 *  empty verdict set would keep the lenient base type on a contested finding → verifier sound:true → FALSE BID.
 *  The throw propagates to makeAgenticVerifier's catch, which routes the run to sound:false → NHR (with the
 *  grounded/contested set attached). A max_tokens stop means the JSON is cut off — a partial verdict set is
 *  untrustworthy even if it happens to parse. Exported so the $0 regression gate exercises the real parser. */
export function parseSkepticResponse(res: { text: string; stopReason: string | null }, model: string): { verdicts: SkepticVerdict[] } {
  if (res.stopReason === "max_tokens") throw new Error(`skeptic response truncated (max_tokens, model=${model}) — refusing to trust a partial verdict set`);
  let parsed: { verdicts?: SkepticVerdict[] };
  try { parsed = JSON.parse(res.text) as { verdicts?: SkepticVerdict[] }; }
  catch (e) { throw new Error(`skeptic response unparseable (model=${model}) — refusing empty-swallow: ${(e as Error)?.message ?? String(e)}`); }
  if (!Array.isArray(parsed.verdicts)) throw new Error(`skeptic response missing verdicts[] (model=${model}) — refusing empty-swallow`);
  return { verdicts: parsed.verdicts };
}

/** Adapt callStructuredClaude (returns raw JSON text) to the skeptic's typed contract. The audit-level
 *  budget `signal` (if any) is closed over so an overall-budget breach also cancels the skeptic's calls. */
function structuredAdapter(apiKey: string, signal?: AbortSignal, onUsage?: (u: UsageCall) => void) {
  return async (args: { model: string; system: string; user: string; schema: Record<string, unknown> }): Promise<{ verdicts: SkepticVerdict[] }> => {
    const res = await callStructuredClaude({ apiKey, model: args.model, system: args.system, userPrompt: args.user, schema: args.schema, maxTokens: 4096, signal, onUsage });
    return parseSkepticResponse(res, args.model);
  };
}

/** Run the full agentic audit over a package and DERIVE the verdict. PAID. The SOLE engine (V1/V2 deleted). */
export async function auditPackage(input: AuditPackageInput): Promise<AuditResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropic || !apiKey) throw new Error("ANTHROPIC_API_KEY not configured — cannot run the agentic engine.");

  const ctx: AuditToolContext = { fullSource: input.fullSource, sections: input.sections, constructionManifest: input.constructionManifest };
  const callModel = makeAnthropicCallModel(anthropic as never, input.expertModel ?? modelFor("lens"), { onUsage: input.onUsage });
  // Capability-tiered P2 (Brain card-44 §4): Sonnet base over all findings, Opus only on the contested subset.
  const adapt = structuredAdapter(apiKey, input.signal, input.onUsage);
  // Card 285 Fix 1: batch the BASE skeptic behind AUDIT_VERIFIER_BATCHING so its O(findings) output can't truncate
  // on a realistic finding count (the claim-explosion root). Flag OFF ⇒ the single-call base, byte-identical.
  const baseSkeptic: SkepticFn = makeStructuredSkeptic(adapt, input.skepticBaseModel ?? modelFor("lens"));
  const skeptic = makeTieredSkeptic(
    process.env.AUDIT_VERIFIER_BATCHING === "true" ? makeBatchedSkeptic(baseSkeptic) : baseSkeptic,
    makeStructuredSkeptic(adapt, input.skepticEscalateModel ?? modelFor("judge")),
  );
  const verify = makeAgenticVerifier(skeptic);

  // J-1/J-2 JUDGMENT LAYER (Brain card 246/247) — construct the REAL callers ONLY when the flag is on. Flag OFF
  // ⇒ undefined ⇒ the orchestrator's `judgmentLayerEnabled() && caller` guard is inert ⇒ byte-identical. Flag ON
  // ⇒ both callers present ⇒ the layer runs LIVE end-to-end (no silent no-op — the "flag gates nothing" trap).
  // The boot coupling-lock (audit-judgment-layer.ts) has already thrown if the tristate isn't also on.
  const judgment = judgmentLayerEnabled()
    ? makeJudgmentCallers(
        apiKey,
        input.judgmentReasonModel ?? modelFor("judge"),
        input.judgmentEntailModel ?? modelFor("judge"),
        input.signal, input.onUsage,
      )
    : undefined;

  // L3 (Brain card 265/267) — grounded agentic section-finder. Constructed ONLY when AUDIT_SECTION_FINDER is on,
  // so flag-OFF ⇒ sectionFinder undefined ⇒ L3 never runs (byte-identical, no paid calls). The caller is a
  // LOCATE-only structured call; the offset-string-match gate in runSectionFinder makes a wrong locate fail-safe.
  const sectionFinder = process.env.AUDIT_SECTION_FINDER === "true"
    ? makeSectionFinderCaller(
        async (a) => (await callStructuredClaude({ apiKey, model: a.model, system: a.system, userPrompt: a.user, schema: a.schema as Record<string, unknown>, maxTokens: a.maxTokens, signal: a.signal, onUsage: input.onUsage, ...(a.cachedSystemPrefix ? { cachedSystemPrefix: a.cachedSystemPrefix } : {}) })).text,
        input.sectionFinderModel ?? modelFor("finder"),
        input.signal,
      )
    : undefined;

  return runAgenticAudit({
    ctx,
    experts: input.experts ?? auditLenses({ personaDiversity: process.env.AUDIT_PERSONA_DIVERSITY === "true" }),
    callModel,
    verify,
    sectionFinder,
    bidderProfile: input.bidderProfile ?? null,
    maxTurns: input.maxTurns,
    signal: input.signal,
    manifestComplete: input.manifestComplete,
    naics: input.naics ?? null,             // Step 4a — forward the fact; no consumer yet (verdict unchanged)
    setAside: input.setAside ?? null,
    noticeType: input.noticeType ?? null,   // Layer-2 (card 262) — scopes the §L/§M requirement to solicitation-type buys
    formIdentified: input.formIdentified,   // Layer-2 (card 262) — corroborates whether the §L/§M-bearing primary was ingested
    ...(judgment ? { judgmentReason: judgment.judgmentReason, judgmentEntail: judgment.judgmentEntail } : {}),
  });
}

// ── JUDGMENT-FIRST WIRING (Brain cards 276/279) — the thin adapter: real proposer + real rail behind the flag ──
// PROPOSE (one holistic Opus call reads the WHOLE source and reasons to a verdict, the way pasting a solicitation
// into Claude does) → the deterministic RAIL (runAgenticAudit over the re-grounded proposal, enforcing I1–I8) →
// DISPOSE (a committal pole survives only on proposer↔rail agreement). This wires both PAID seams to the real
// callers; the $0 unit tests inject stubs. It does NOT touch auditPackage/executeAudit — nothing calls it on the
// customer path yet (flag AUDIT_JUDGMENT_FIRST gates the eventual executor branch); the $0 proof-replay harness
// calls it directly to score judgment-first vs the ladder before any greenlit paid run.

/** Adapt callStructuredClaude → the proposer's JudgmentStructuredCaller seam (maps user→userPrompt; surfaces the
 *  raw text + stopReason so the proposer's own max_tokens/parse honest-fail runs). One holistic call, so the
 *  token ceiling is generous (the whole boardroom analysis + grounded findings). */
function judgmentStructuredCaller(apiKey: string, signal?: AbortSignal, onUsage?: (u: UsageCall) => void): JudgmentStructuredCaller {
  return ({ model, system, user, schema }) => callStructuredClaude({
    apiKey, model, system, userPrompt: user, schema, maxTokens: 8192, signal, label: "judgment-first", onUsage,
  });
}

/** The RailFn must NEVER be invoked with the expert lens loop in seed mode — runAgenticAudit skips P1 entirely
 *  when seedFindings is present, so callModel is dead. Guard it so a future refactor that reintroduces a lens call
 *  fails loud instead of silently making an unbudgeted paid call. */
const seedModeCallModelGuard: CallModel = () => { throw new Error("judgment-first rail: callModel must not run in seedFindings mode (the proposer replaces the lenses)"); };

/** Run the judgment-first path end-to-end with the REAL model + REAL rail. PAID (one proposer call + the rail's
 *  P2 adversarial verify). Returns the DISPOSED result — the disposed verdict is the customer-facing one; proposed
 *  + railDerived are carried for telemetry/proof. Same guard as auditPackage: throws if the SDK isn't configured. */
export async function runJudgmentFirstAudit(input: AuditPackageInput): Promise<JudgmentFirstResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropic || !apiKey) throw new Error("ANTHROPIC_API_KEY not configured — cannot run the judgment-first engine.");

  const ctx: AuditToolContext = { fullSource: input.fullSource, sections: input.sections, constructionManifest: input.constructionManifest, groundingSource: input.groundingSource };
  const adapt = structuredAdapter(apiKey, input.signal, input.onUsage);
  // Card 285 Fix 1: batch the BASE skeptic behind AUDIT_VERIFIER_BATCHING so its O(findings) output can't truncate
  // on a realistic finding count (the claim-explosion root). Flag OFF ⇒ the single-call base, byte-identical.
  const baseSkeptic: SkepticFn = makeStructuredSkeptic(adapt, input.skepticBaseModel ?? modelFor("lens"));
  const skeptic = makeTieredSkeptic(
    process.env.AUDIT_VERIFIER_BATCHING === "true" ? makeBatchedSkeptic(baseSkeptic) : baseSkeptic,
    makeStructuredSkeptic(adapt, input.skepticEscalateModel ?? modelFor("judge")),
  );
  const verify = makeAgenticVerifier(skeptic);

  const basePropose = makeJudgmentFirstProposer(judgmentStructuredCaller(apiKey, input.signal, input.onUsage), input.judgmentReasonModel ?? modelFor("judge"));
  // Brain card 291 — PER-DOC DECOMPOSITION (flag-gated). When on, wrap the holistic proposer so each binding document
  // also gets its own proposer pass (findings unioned) → per-doc attestation is satisfiable by construction; the rail
  // still DISPOSEs over the union. OFF ⇒ the single holistic proposer (byte-identical). Multi-doc packages only.
  const propose = process.env.AUDIT_PERDOC_DECOMP === "true" ? makePerDocProposer(basePropose, docRegions) : basePropose;

  // The RAIL: the full deterministic orchestrator over the re-grounded proposal. runAgenticAudit re-grounds the
  // seed (drops any ungrounded finding), runs the deterministic sweep/temporal/verify/completeness + every re-typing
  // guard, and DERIVES the verdict — I1–I8 enforced by the real rail, not a re-implementation. Returns its Decision.
  const rail: RailFn = async (findings) => (await runAgenticAudit({
    ctx,
    experts: [],
    callModel: seedModeCallModelGuard,
    verify,
    seedFindings: findings,
    bidderProfile: input.bidderProfile ?? null,
    signal: input.signal,
    manifestComplete: input.manifestComplete,
    naics: input.naics ?? null,
    setAside: input.setAside ?? null,
    noticeType: input.noticeType ?? null,
    formIdentified: input.formIdentified,
  })).decision;

  const jfInput: JudgmentFirstInput = {
    fullSource: input.fullSource,
    sections: input.sections,
    bidderProfile: input.bidderProfile ?? null,
    noticeType: input.noticeType ?? null,
    naics: input.naics ?? null,
    setAside: input.setAside ?? null,
    isConstruction: input.constructionManifest?.isConstruction, // Brain card 289 — construction-aware proposer
  };
  return runJudgmentFirst(jfInput, propose, rail);
}
