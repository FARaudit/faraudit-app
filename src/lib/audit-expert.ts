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
  requiredAttribute?: string; severity?: "P0" | "P1" | "P2";
}

/** One normalized turn of the loop: either the model called tools, or it submitted its final findings. */
export interface ModelTurn { toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; findings: RawFinding[] | null; }
export interface ToolResult { id: string; name: string; result: unknown; }
export type CallModel = (args: { system: string; userTask: string; priorToolResults: ToolResult[][] }) => Promise<ModelTurn>;

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
    "Audit THIS solicitation as your lens. Use the tools to READ the relevant sections and GROUND every " +
    "finding in a verbatim source excerpt before you assert it. Do not cite a clause lookup_clause reports " +
    "absent. When done, submit your findings — each a typed FACT (requirement, citation, verbatim excerpt, " +
    "kind, controllability), never a verdict.";

  for (let turn = 1; turn <= maxTurns; turn++) {
    const out = await opts.callModel({ system: spec.system, userTask, priorToolResults });
    if (out.findings) {
      let dropped = 0;
      const findings: TypedFinding[] = [];
      for (const f of out.findings) {
        if (!isGrounded(ctx, f)) { dropped++; continue; } // deterministic backstop — ungrounded never survives
        findings.push({ requirement: f.requirement, citation: f.citation, excerpt: f.excerpt, kind: f.kind, controllability: f.controllability, grounded: true, lens: spec.key, requiredAttribute: f.requiredAttribute, severity: f.severity });
      }
      return { findings, turns: turn, dropped, converged: true };
    }
    // execute the tools the expert called, deterministically, and feed results back next turn.
    priorToolResults.push(out.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, result: runAuditTool(ctx, tc.name, tc.input) })));
  }
  return { findings: [], turns: maxTurns, dropped: 0, converged: false };
}

/** Default model call — wraps the Anthropic SDK tool-use turn. The expert is given the audit tools plus a
 *  `submit_findings` tool whose schema forces a typed findings array (structured output via tool input).
 *  Returns either the tool calls it made or, when it calls submit_findings, the parsed findings. PAID. */
export function makeAnthropicCallModel(anthropic: { messages: { create: (a: unknown) => Promise<unknown> } }, model: string): CallModel {
  const SUBMIT = {
    name: "submit_findings", description: "Submit your final typed findings (facts, not a verdict). Call ONLY after every finding is grounded in a verbatim source excerpt.",
    input_schema: { type: "object", additionalProperties: false, required: ["findings"], properties: { findings: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["requirement", "citation", "excerpt", "kind", "controllability"],
      properties: { requirement: { type: "string" }, citation: { type: "string" }, excerpt: { type: "string", description: "VERBATIM source span" },
        kind: { type: "string", enum: ["eligibility_bar", "technical_spec", "pricing", "submission", "past_performance", "clause_flowdown", "boilerplate", "other"] },
        controllability: { type: "string", enum: ["bidder_controls", "bidder_cannot_move", "already_satisfied"] },
        requiredAttribute: { type: "string" }, severity: { type: "string", enum: ["P0", "P1", "P2"] } } } } } },
  };
  // The harness re-sends the full transcript each turn; for simplicity the default impl rebuilds messages
  // from priorToolResults. (Production wiring threads the real assistant/tool_result blocks; this is the seam.)
  return async ({ system, userTask, priorToolResults }) => {
    const messages: Array<Record<string, unknown>> = [{ role: "user", content: userTask }];
    for (const batch of priorToolResults) messages.push({ role: "user", content: batch.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(b.result) })) });
    const resp = (await anthropic.messages.create({ model, max_tokens: 4096, system, tools: [...AUDIT_TOOLS, SUBMIT], messages })) as { content: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }> };
    const toolUses = (resp.content ?? []).filter((b) => b.type === "tool_use");
    const submit = toolUses.find((b) => b.name === "submit_findings");
    if (submit) return { toolCalls: [], findings: (submit.input?.findings as RawFinding[]) ?? [] };
    return { toolCalls: toolUses.map((b) => ({ id: b.id!, name: b.name!, input: b.input ?? {} })), findings: null };
  };
}
