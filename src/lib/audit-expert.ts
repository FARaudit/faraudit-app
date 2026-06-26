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
export type CallModel = (args: { system: string; userTask: string; priorToolResults: ToolResult[][]; forceSubmit?: boolean }) => Promise<ModelTurn>;

export interface ExpertSpec { key: string; system: string; }

/** Deterministic grounding backstop: a finding is grounded iff its excerpt is literally in the source. */
export function isGrounded(ctx: AuditToolContext, f: RawFinding): boolean {
  if (!f.excerpt || f.excerpt.trim().length < 4) return false;
  return findInSource(ctx, f.excerpt).hits.length > 0;
}

/** Run ONE agentic expert as a tool-using react loop. Returns grounded TypedFindings (facts), or [] if it
 *  never converged. Pure control flow + deterministic grounding; the only nondeterminism is inside the
 *  injected model call, and its output is hard-gated by isGrounded before anything is accepted. */
export async function runAgenticExpert(
  spec: ExpertSpec,
  ctx: AuditToolContext,
  opts: { callModel: CallModel; maxTurns?: number },
): Promise<{ findings: TypedFinding[]; turns: number; dropped: number; converged: boolean }> {
  const maxTurns = opts.maxTurns ?? 8;
  const priorToolResults: ToolResult[][] = [];
  const userTask =
    "Audit THIS solicitation as your lens. Read ONLY the sections you need (a few tool calls — you have a " +
    `limited budget of about ${maxTurns} turns), GROUND every finding in a verbatim source excerpt, then call ` +
    "submit_findings PROMPTLY. Do not keep reading once you can state your findings. Do not cite a clause " +
    "lookup_clause reports absent. Each finding is a typed FACT (requirement, citation, verbatim excerpt, " +
    "kind, controllability), never a verdict.";

  for (let turn = 1; turn <= maxTurns; turn++) {
    // On the final allowed turn, FORCE submit_findings so a thorough expert that kept reading still produces
    // its findings instead of exhausting the turn cap with nothing (the 0-findings/INCOMPLETE failure mode).
    const out = await opts.callModel({ system: spec.system, userTask, priorToolResults, forceSubmit: turn === maxTurns });
    if (out.findings) {
      let dropped = 0;
      const findings: TypedFinding[] = [];
      for (const f of out.findings) {
        if (!isGrounded(ctx, f)) { dropped++; continue; } // deterministic backstop — ungrounded never survives
        findings.push({ requirement: f.requirement, citation: f.citation, excerpt: f.excerpt, kind: f.kind, controllability: f.controllability, grounded: true, lens: spec.key, requiredAttribute: f.requiredAttribute, curableInWindow: f.curableInWindow, severity: f.severity });
      }
      return { findings, turns: turn, dropped, converged: true };
    }
    // execute the tools the expert called, deterministically, and feed results back next turn.
    priorToolResults.push(out.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, input: tc.input, result: runAuditTool(ctx, tc.name, tc.input) })));
  }
  return { findings: [], turns: maxTurns, dropped: 0, converged: false };
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
type SdkClient = { messages: { create: (a: Record<string, unknown>) => Promise<{ content: SdkBlock[]; stop_reason?: string; usage?: SdkUsage }> } };

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
export function makeAnthropicCallModel(client: SdkClient, model: string, opts?: { maxTokens?: number; betaHeaders?: string }): CallModel {
  return async ({ system, userTask, priorToolResults, forceSubmit }) => {
    const messages: Array<Record<string, unknown>> = [{ role: "user", content: userTask }];
    for (const batch of priorToolResults) {
      messages.push({ role: "assistant", content: batch.map((b) => ({ type: "tool_use", id: b.id, name: b.name, input: b.input })) });
      messages.push({ role: "user", content: batch.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(b.result) })) });
    }
    const req: Record<string, unknown> = { model, max_tokens: opts?.maxTokens ?? 4096, system, tools: [...AUDIT_TOOLS, SUBMIT_FINDINGS_TOOL], messages };
    if (forceSubmit) req.tool_choice = { type: "tool", name: "submit_findings" }; // last turn → must produce findings
    const resp = await client.messages.create(req);
    if (_expertUsageSink && resp.usage) _expertUsageSink({ model, input_tokens: resp.usage.input_tokens ?? 0, output_tokens: resp.usage.output_tokens ?? 0, cache_write: resp.usage.cache_creation_input_tokens ?? 0, cache_read: resp.usage.cache_read_input_tokens ?? 0 });
    const toolUses = (resp.content ?? []).filter((b) => b.type === "tool_use");
    const submit = toolUses.find((b) => b.name === "submit_findings");
    if (submit) return { toolCalls: [], findings: (submit.input?.findings as RawFinding[]) ?? [] };
    return { toolCalls: toolUses.map((b) => ({ id: b.id!, name: b.name!, input: b.input ?? {} })), findings: null };
  };
}
