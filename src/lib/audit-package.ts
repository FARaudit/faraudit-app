// ── AGENTIC VERIFICATION ENGINE · PRODUCTION ENTRYPOINT ───────────────────────────────────────────────
// Brain card 43 — the single call that REPLACES the stuffed legacy audit. It wires the full Anthropic stack:
//   • the agentic expert LENS PANEL (audit-lenses) running the react loop (audit-expert) over the real SDK
//     tool-use turn (makeAnthropicCallModel) — reason → read_section/lookup_clause/find_in_source → ground;
//   • the P2 ADVERSARIAL VERIFIER (audit-verifier) — a structured skeptic that overturns misclassifications;
//   • the ORCHESTRATOR (audit-orchestrator) running P0→P5 and DERIVING the verdict (audit-decide, pure).
// Models bind through the role registry (model-registry) — never a literal ID in engine logic.
//
// HOLD (Brain card 43 + Rule 20): this is the PAID path. Nothing in the customer flow calls it yet — wiring
// to the front door is a SEPARATE gate after the gold-set proof. The guard below makes the hold explicit:
// the entrypoint refuses to run unless AUDIT_AGENTIC_V3=true is set, so it cannot fire by accident.

import { anthropic } from "./anthropic";
import { callStructuredClaude } from "./anthropic-structured";
import { modelFor } from "./model-registry";
import { makeAnthropicCallModel } from "./audit-expert";
import { auditLenses } from "./audit-lenses";
import { makeAgenticVerifier, makeStructuredSkeptic, makeTieredSkeptic, type SkepticVerdict } from "./audit-verifier";
import { runAgenticAudit, type AuditResult } from "./audit-orchestrator";
import type { AuditToolContext } from "./audit-tools";
import type { BidderProfile } from "./audit-findings";
import type { ExpertSpec } from "./audit-expert";

export interface AuditPackageInput {
  fullSource: string;                       // assembled package source (every routed section + attachment)
  sections?: Record<string, string>;        // optional precomputed UCF section → text
  bidderProfile?: BidderProfile | null;     // known firm attributes (eligibility matching); null = unknown
  experts?: ExpertSpec[];                   // override the lens panel (default = AUDIT_LENSES)
  expertModel?: string;                     // default modelFor("lens")
  skepticBaseModel?: string;                // P2 base adversary — default modelFor("lens") (Sonnet)
  skepticEscalateModel?: string;            // P2 escalation on contested findings — default modelFor("judge") (Opus)
  maxTurns?: number;                        // per-expert react-loop bound (default 8)
}

/** Adapt callStructuredClaude (returns raw JSON text) to the skeptic's typed contract. */
function structuredAdapter(apiKey: string) {
  return async (args: { model: string; system: string; user: string; schema: Record<string, unknown> }): Promise<{ verdicts: SkepticVerdict[] }> => {
    const res = await callStructuredClaude({ apiKey, model: args.model, system: args.system, userPrompt: args.user, schema: args.schema, maxTokens: 4096 });
    try { return JSON.parse(res.text) as { verdicts: SkepticVerdict[] }; } catch { return { verdicts: [] }; }
  };
}

/** Run the full agentic audit over a package and DERIVE the verdict. PAID. Held behind AUDIT_AGENTIC_V3. */
export async function auditPackage(input: AuditPackageInput): Promise<AuditResult> {
  if (process.env.AUDIT_AGENTIC_V3 !== "true")
    throw new Error("agentic engine v3 is HELD (Brain card 43): set AUDIT_AGENTIC_V3=true to enable the paid path after the gold-set proof.");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropic || !apiKey) throw new Error("ANTHROPIC_API_KEY not configured — cannot run the agentic engine.");

  const ctx: AuditToolContext = { fullSource: input.fullSource, sections: input.sections };
  const callModel = makeAnthropicCallModel(anthropic as never, input.expertModel ?? modelFor("lens"));
  // Capability-tiered P2 (Brain card-44 §4): Sonnet base over all findings, Opus only on the contested subset.
  const adapt = structuredAdapter(apiKey);
  const skeptic = makeTieredSkeptic(
    makeStructuredSkeptic(adapt, input.skepticBaseModel ?? modelFor("lens")),
    makeStructuredSkeptic(adapt, input.skepticEscalateModel ?? modelFor("judge")),
  );
  const verify = makeAgenticVerifier(skeptic);

  return runAgenticAudit({
    ctx,
    experts: input.experts ?? auditLenses({ personaDiversity: process.env.AUDIT_PERSONA_DIVERSITY === "true" }),
    callModel,
    verify,
    bidderProfile: input.bidderProfile ?? null,
    maxTurns: input.maxTurns,
  });
}
