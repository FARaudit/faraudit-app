// ── AGENTIC VERIFICATION ENGINE · Layer-1: the AGENTIC EXPERT REACT LOOP ──────────────────────────────
// This is the layer the engine never had — the thing that makes an "expert" an AGENT instead of a single
// source. The expert does NOT make one stuffed call. It runs Anthropic's loop: reason → call tools
// (read_section / lookup_clause / find_in_source) against the ACTUAL document → reflect on the results →
// iterate → emit TYPED findings only when each is grounded. Then a DETERMINISTIC grounding backstop drops
// any finding whose excerpt isn't literally in the source (Rule 64 — the model cannot launder an
// ungrounded claim past the harness). Findings only — never a verdict (that's Layer 2, deriveVerdict).
//
// The model call is INJECTED (CallModel) so the loop is unit-testable with a stub ($0); the default impl
// wraps the Anthropic SDK tool-use call. Running the real loop is PAID and gated.

import { AUDIT_TOOLS, runAuditTool, findInSource, type AuditToolContext } from "./audit-tools";
import type { TypedFinding, RequirementKind, Controllability } from "./audit-findings";

/** What the expert emits per requirement (pre-grounding) — facts, no verdict. */
export interface RawFinding {
  requirement: string; citation: string; excerpt: string;
  kind: RequirementKind; controllability: Controllability;
  requiredAttribute?: string; curableInWindow?: boolean; severity?: "P0" | "P1" | "P2";
}

/** One normalized turn of the loop: either the model called tools, or it submitted its final findings. */
export interface ModelTurn { toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; findings: RawFinding[] | null; }
/** A completed tool exchange — carries the original call (id/name/input) AND its result so the production
 *  model wrapper can reconstruct a PROTOCOL-VALID Anthropic transcript (assistant tool_use → user tool_result). */
export interface ToolResult { id: string; name: string; input: Record<string, unknown>; result: unknown; }
export type CallModel = (args: { system: string; userTask: string; priorToolResults: ToolResult[][]; forceSubmit?: boolean; signal?: AbortSignal }) => Promise<ModelTurn>;

export interface ExpertSpec { key: string; system: string; }

/** Deterministic grounding backstop: a finding is grounded iff its excerpt is literally in the source. */
export function isGrounded(ctx: AuditToolContext, f: RawFinding): boolean {
  if (!f.excerpt || f.excerpt.trim().length < 4) return false;
  // Brain card 291 — ground against the STORED FULL TEXT when present ("source grounds"), never the compressed digest;
  // else fall back to fullSource (byte-identical when groundingSource absent). Same normalized substring semantics.
  if (ctx.groundingSource && ctx.groundingSource !== ctx.fullSource) {
    return findInSource({ fullSource: ctx.groundingSource }, f.excerpt).hits.length > 0;
  }
  return findInSource(ctx, f.excerpt).hits.length > 0;
}

/** Run ONE agentic expert as a tool-using react loop. Returns grounded TypedFindings (facts), or [] if it
 *  never converged. Pure control flow + deterministic grounding; the only nondeterminism is inside the
 *  injected model call, and its output is hard-gated by isGrounded before anything is accepted. */
export async function runAgenticExpert(
  spec: ExpertSpec,
  ctx: AuditToolContext,
  opts: { callModel: CallModel; maxTurns?: number; signal?: AbortSignal },
): Promise<{ findings: TypedFinding[]; turns: number; dropped: number; converged: boolean; sectionsRead: string[]; trace: Array<{ turn: number; tools: Array<{ name: string; input: Record<string, unknown> }> }> }> {
  const maxTurns = opts.maxTurns ?? 8;
  const priorToolResults: ToolResult[][] = [];
  // PURE-OBSERVER trace (Brain card-48 guardrail 1): logging only, ZERO behavior change. Records every tool
  // the agent called per turn + the sections it read, so thin-vs-bug is adjudicated from the trace, not the verdict.
  const trace: Array<{ turn: number; tools: Array<{ name: string; input: Record<string, unknown> }> }> = [];
  const sectionsRead = new Set<string>();
  const userTask =
    "Audit THIS solicitation as your lens. Read ONLY the sections you need (a few tool calls — you have a " +
    `limited budget of about ${maxTurns} turns), GROUND every finding in a verbatim source excerpt, then call ` +
    "submit_findings PROMPTLY. Do not keep reading once you can state your findings. Do not cite a clause " +
    "lookup_clause reports absent. Each finding is a typed FACT (requirement, citation, verbatim excerpt, " +
    "kind, controllability), never a verdict.";

  for (let turn = 1; turn <= maxTurns; turn++) {
    // Wall-clock budget breach (overall withBudget aborted the signal) → throw so the
    // WHOLE audit rejects to a clean terminal failure. Never fall through to an empty
    // findings return, which would masquerade as a real INCOMPLETE/no-charge verdict.
    if (opts.signal?.aborted) throw new Error("agentic expert aborted: overall budget exceeded");
    // On the final allowed turn, FORCE submit_findings so a thorough expert that kept reading still produces
    // its findings instead of exhausting the turn cap with nothing (the 0-findings/INCOMPLETE failure mode).
    const out = await opts.callModel({ system: spec.system, userTask, priorToolResults, forceSubmit: turn === maxTurns, signal: opts.signal });
    if (out.findings) {
      let dropped = 0;
      const findings: TypedFinding[] = [];
      for (const f of out.findings) {
        if (!isGrounded(ctx, f)) { dropped++; continue; } // deterministic backstop — ungrounded never survives
        findings.push({ requirement: f.requirement, citation: f.citation, excerpt: f.excerpt, kind: f.kind, controllability: f.controllability, grounded: true, lens: spec.key, requiredAttribute: f.requiredAttribute, curableInWindow: f.curableInWindow, severity: f.severity });
      }
      return { findings, turns: turn, dropped, converged: true, sectionsRead: [...sectionsRead], trace };
    }
    // observe (pure logging) then execute the tools the expert called, deterministically, feeding results back.
    trace.push({ turn, tools: out.toolCalls.map((tc) => ({ name: tc.name, input: tc.input })) });
    for (const tc of out.toolCalls) if (tc.name === "read_section" && tc.input?.key) sectionsRead.add(String(tc.input.key).toUpperCase());
    // Only record a transcript batch when the turn ACTUALLY called tools. A text-only model turn
    // (no findings AND no tool_use — e.g. the model narrates instead of acting) must NOT push an empty
    // batch: the transcript rebuild (makeAnthropicCallModel) would emit an assistant message with
    // content:[] → Anthropic 400 → the shared Promise.all rejects the WHOLE paid audit. Skipping it lets
    // the loop advance a turn harmlessly (bounded by maxTurns + forceSubmit on the last turn).
    if (out.toolCalls.length > 0)
      priorToolResults.push(out.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, input: tc.input, result: runAuditTool(ctx, tc.name, tc.input) })));
  }
  return { findings: [], turns: maxTurns, dropped: 0, converged: false, sectionsRead: [...sectionsRead], trace };
}

/** The `submit_findings` tool — its input_schema FORCES a typed findings array (structured output via a
 *  strict tool). The expert calls it to terminate its loop; the harness parses the validated input. */
export const SUBMIT_FINDINGS_TOOL = {
  name: "submit_findings", description: "Submit your final typed findings (facts, not a verdict). Call ONLY after every finding is grounded in a verbatim source excerpt you confirmed with find_in_source / lookup_clause.",
  input_schema: { type: "object", additionalProperties: false, required: ["findings"], properties: { findings: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["requirement", "citation", "excerpt", "kind", "controllability"],
    properties: { requirement: { type: "string" }, citation: { type: "string" }, excerpt: { type: "string", description: "VERBATIM source span proving the requirement exists" },
      kind: { type: "string", enum: ["eligibility_bar", "technical_spec", "pricing", "submission", "past_performance", "clause_flowdown", "boilerplate", "other"] },
      controllability: { type: "string", enum: ["bidder_controls", "bidder_cannot_move", "no_one_can_move", "already_satisfied"], description: "bidder_controls=do-the-work gate; bidder_cannot_move=PROFILE-dependent bar THIS firm may/may not hold (needs requiredAttribute+curableInWindow); no_one_can_move=UNIVERSAL impossibility disqualifying EVERY bidder (e.g. 5-day delivery vs 90-day lead, passed deadline); already_satisfied=true now" },
      requiredAttribute: { type: "string", description: "for a disqualifying/eligibility bar: the qualification the firm must HOLD (e.g. naics:333120-small, clearance:secret-facility). REQUIRED whenever controllability=bidder_cannot_move." },
      curableInWindow: { type: "boolean", description: "for a disqualifying/eligibility bar (controllability=bidder_cannot_move): can a firm that LACKS the requiredAttribute obtain/satisfy it within the solicitation's response window? false=structural/non-curable (clearance lead-time, QPL listing) → not a soft caution; true=obtainable in time. REQUIRED for every bidder_cannot_move bar — omitting it forces human review." },
      severity: { type: "string", enum: ["P0", "P1", "P2"] } } } } } },
} as const;

type SdkBlock = { type: string; id?: string; name?: string; input?: Record<string, unknown> };
type SdkUsage = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
type SdkClient = { messages: { create: (a: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<{ content: SdkBlock[]; stop_reason?: string; usage?: SdkUsage }> } };

/** Opt-in usage capture for the expert tool-loop (mirrors anthropic-structured's setStructuredUsageSink so
 *  a proof run can total cost across BOTH the SDK expert loop AND the structured skeptic). NULL in prod. */
export interface ExpertUsage { model: string; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; }
let _expertUsageSink: ((u: ExpertUsage) => void) | null = null;
export function setExpertUsageSink(sink: ((u: ExpertUsage) => void) | null) { _expertUsageSink = sink; }

/** Production model call — the FULL Anthropic SDK tool-use turn. Reconstructs a PROTOCOL-VALID transcript
 *  from the loop's normalized history (assistant `tool_use` blocks → user `tool_result` blocks), gives the
 *  expert the audit tools + `submit_findings`, and returns either the tools it called or its parsed findings.
 *  Stateless → safe under the orchestrator's parallel experts (each expert run owns its own history). PAID.
 *  Extended thinking is intentionally OMITTED here: the loop reconstructs assistant turns from normalized
 *  state, and replaying tool-use turns WITH thinking blocks requires echoing them verbatim — out of scope
 *  for a stateless rebuild. Tool grounding (not CoT) is what makes this expert correct. */
export function makeAnthropicCallModel(client: SdkClient, model: string, opts?: { maxTokens?: number; betaHeaders?: string; onUsage?: (u: ExpertUsage) => void }): CallModel {
  return async ({ system, userTask, priorToolResults, forceSubmit, signal }) => {
    const messages: Array<Record<string, unknown>> = [{ role: "user", content: userTask }];
    for (const batch of priorToolResults) {
      if (batch.length === 0) continue; // defensive: never emit an assistant/user turn with content:[] → Anthropic 400
      messages.push({ role: "assistant", content: batch.map((b) => ({ type: "tool_use", id: b.id, name: b.name, input: b.input })) });
      messages.push({ role: "user", content: batch.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(b.result) })) });
    }
    // ── PROMPT CACHING (flag-gated, behavior-NEUTRAL — caching changes billing, not output) ──
    // The expert is a MULTI-TURN tool loop: each turn re-sends the whole stable prefix (tool
    // schemas + per-lens system + the growing tool-result transcript) UNCACHED, so an N-turn loop
    // re-bills turns 1..N-1 every turn — the dominant Sonnet input cost (Console CSV 2026-07-04:
    // $2.68 input, token_type=input_no_cache, ZERO cache hits). Mark three ephemeral breakpoints so
    // turn N READS turns 1..N-1 from cache (≈10% of input price) and pays fresh only for the delta:
    //   (1) the LAST tool schema  → caches the identical tool block set across every call & lens
    //   (2) the per-lens system   → caches across that lens's turns
    //   (3) the last message block → caches the transcript prefix turn-over-turn
    // Anthropic silently no-ops a breakpoint under the model minimum (~1024 tok), so this is safe.
    // Flag-OFF ⇒ req is BYTE-IDENTICAL to the prior prod shape (proven by test-expert-prompt-cache).
    // ONE unified flag AUDIT_PROMPT_CACHE governs all engine caching (this expert loop + the L3 finder).
    const cacheOn = process.env.AUDIT_PROMPT_CACHE === "true";
    const EPHEMERAL = { type: "ephemeral" as const };
    // cache_control on the LAST tool caches the whole tool-schema prefix (all tools before it).
    const tools = cacheOn
      ? [...AUDIT_TOOLS, { ...SUBMIT_FINDINGS_TOOL, cache_control: EPHEMERAL }]
      : [...AUDIT_TOOLS, SUBMIT_FINDINGS_TOOL];
    const systemField: unknown = cacheOn ? [{ type: "text", text: system, cache_control: EPHEMERAL }] : system;
    if (cacheOn && messages.length > 0) {
      const lastMsg = messages[messages.length - 1] as { role: string; content: unknown };
      if (Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
        const blocks = lastMsg.content as Array<Record<string, unknown>>;
        blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: EPHEMERAL };
      } else if (typeof lastMsg.content === "string") {
        lastMsg.content = [{ type: "text", text: lastMsg.content, cache_control: EPHEMERAL }];
      }
    }
    const req: Record<string, unknown> = { model, max_tokens: opts?.maxTokens ?? 4096, system: systemField, tools, messages };
    if (forceSubmit) req.tool_choice = { type: "tool", name: "submit_findings" }; // last turn → must produce findings
    // Pass the overall-budget signal so a breach cancels the in-flight paid call (stops
    // spend) instead of abandoning a Promise that keeps costing. Absent signal = no-op.
    // Per-run tally (opts.onUsage, concurrency-safe — each audit owns its own) AND the legacy global sink
    // (null in prod; kept for single-run proofs). Both are best-effort — never affects the returned findings.
    const tally = (r: { usage?: SdkUsage }) => {
      if (!r.usage) return;
      const u = { model, input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_write: r.usage.cache_creation_input_tokens ?? 0, cache_read: r.usage.cache_read_input_tokens ?? 0 };
      try { opts?.onUsage?.(u); } catch { /* never let cost capture break an audit */ }
      if (_expertUsageSink) _expertUsageSink(u);
    };
    let resp = await client.messages.create(req, signal ? { signal } : undefined);
    tally(resp);
    // STEP 1 (Brain card 221) — a max_tokens stop is SUSPECT output even when the tool JSON parses: the last
    // finding's `excerpt` may be clipped mid-clause (a valid-JSON trailing field). Retry the SAME request ONCE
    // at the 8k ceiling so the model has room to emit full excerpts. Both attempts' stop_reasons are logged
    // for cost/diagnostics; usage from BOTH is tallied. The deterministic P2.6 repair pass is the backstop for
    // any excerpt still clipped after the retry.
    const EXPERT_TOKEN_CEILING = 8000;
    if (resp.stop_reason === "max_tokens" && (req.max_tokens as number) < EXPERT_TOKEN_CEILING) {
      const resp2 = await client.messages.create({ ...req, max_tokens: EXPERT_TOKEN_CEILING }, signal ? { signal } : undefined);
      tally(resp2);
      console.log(`[expert] max_tokens retry: attempt1=max_tokens attempt2=${resp2.stop_reason ?? "?"} (max_tokens ${req.max_tokens as number}→${EXPERT_TOKEN_CEILING})`);
      // T0-3 (engine line-audit 2026-07-06) — prefer the retry (fuller excerpts) ONLY when it actually
      // re-produced submit_findings. If the retry narrates or reads a tool instead of re-submitting, KEEP
      // attempt-1's valid submit_findings rather than discarding it (an unconditional resp=resp2 silently
      // dropped a real finding set → the P2.6 repair pass backstops a merely-clipped excerpt).
      const hasSubmit = (r: typeof resp) => (r.content ?? []).some((b) => b.type === "tool_use" && b.name === "submit_findings");
      if (hasSubmit(resp2) || !hasSubmit(resp)) resp = resp2;
    }
    const toolUses = (resp.content ?? []).filter((b) => b.type === "tool_use");
    const submit = toolUses.find((b) => b.name === "submit_findings");
    if (submit) {
      // T1-10 — distinguish a GENUINE empty submit ({findings: []}) from a
      // TRUNCATED/malformed one (a max_tokens stop clipped the tool JSON so
      // `findings` never parsed to an array). Coalescing the latter to [] made a
      // clipped lens look like a clean "found nothing" → it converged and propped
      // up a false COMPLETE. Only an actual array is a valid submission; anything
      // else returns findings:null so the loop treats the turn as no-submit and,
      // if it never gets a valid one, ends converged:false → coverageComplete:false
      // (the honest INCOMPLETE), never a silent clean-empty.
      const f = submit.input?.findings;
      return Array.isArray(f) ? { toolCalls: [], findings: f as RawFinding[] } : { toolCalls: [], findings: null };
    }
    return { toolCalls: toolUses.map((b) => ({ id: b.id!, name: b.name!, input: b.input ?? {} })), findings: null };
  };
}
