// ── AGENTIC VERIFICATION ENGINE · the ORCHESTRATOR (P0→P5 cycle) ──────────────────────────────────────
// Brain card 43, build #4. This is the conductor that replaces the single stuffed audit call. It runs the
// domain phases ON TOP of Anthropic's agentic loop — the moat that a Gemini/GPT one-shot cannot reproduce:
//   P0 Decompose      — build the binding-section manifest (what MUST be covered).
//   P1 Ground         — run the agentic experts (Layer 1) in parallel; each grounds its own findings.
//   P3 Reconcile      — dedup across lenses; flag unresolved material conflict on the decisive field.
//   P2 Cross-examine  — adversarial verification (injected; default = agentic skeptic) → verifierSound.
//   P4 Prove-complete — coverageComplete iff every binding section present in source has a grounded finding.
//   P5 Decide         — hand the typed facts to deriveVerdict (Layer 2, pure). The verdict is DERIVED.
// Everything that decides is deterministic; the only nondeterminism is inside the experts, and every claim
// they make is hard-gated by grounding (Layer 1) before it can reach the decision (Layer 2).
//
// callModel + verify are INJECTED → the whole cycle is unit-testable with stubs ($0). The real run is PAID.

import { runAgenticExpert, type CallModel, type ExpertSpec } from "./audit-expert";
import { readSection, type AuditToolContext } from "./audit-tools";
import { deriveVerdict, type Decision } from "./audit-decide";
import type { TypedFinding, BidderProfile, VerdictInputs } from "./audit-findings";

/** UCF sections that carry binding obligations — the ones completeness is measured against. */
export const BINDING_SECTIONS = ["B", "C", "H", "I", "L", "M"] as const;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface VerifyResult { sound: boolean; survived: TypedFinding[]; rejected: TypedFinding[]; }
/** P2 — adversarial cross-examination. Default impl is an agentic skeptic; injected as a stub in tests. */
export type VerifyFn = (ctx: AuditToolContext, findings: TypedFinding[]) => Promise<VerifyResult>;

export interface OrchestratorInput {
  ctx: AuditToolContext;
  experts: ExpertSpec[];
  callModel: CallModel;
  bidderProfile?: BidderProfile | null;
  verify?: VerifyFn;        // P2 — defaults to grounding-only soundness (no extra model) if absent
  maxTurns?: number;
}

export interface AuditResult {
  decision: Decision;
  inputs: VerdictInputs;
  findings: TypedFinding[];
  coverage: { required: string[]; covered: string[]; missing: string[] };
  perLens: Record<string, number>;
  conflict: boolean;
}

/** P0 — the manifest: binding UCF sections that are actually PRESENT (non-empty) in this package's source. */
export function buildManifest(ctx: AuditToolContext): string[] {
  return BINDING_SECTIONS.filter((k) => readSection(ctx, k).present);
}

/** P3 — dedup identical findings across lenses, preserving the first seen. The key INCLUDES controllability:
 *  two lenses that agree on the decisive field are duplicates and collapse; two that DISAGREE (cannot_move
 *  vs already_satisfied) are NOT duplicates — they must both survive so hasConflict can catch the clash. */
function dedup(findings: TypedFinding[]): TypedFinding[] {
  const seen = new Set<string>(); const out: TypedFinding[] = [];
  for (const f of findings) { const k = norm(f.requirement) + "|" + norm(f.citation) + "|" + f.controllability; if (seen.has(k)) continue; seen.add(k); out.push(f); }
  return out;
}

/** P3 — a material conflict = the SAME requirement asserted with directly contradictory controllability
 *  (one lens says bidder_cannot_move, another says already_satisfied). That contradiction on the decisive
 *  field cannot be silently averaged — it routes to NEEDS_HUMAN_REVIEW. */
function hasConflict(findings: TypedFinding[]): boolean {
  const byReq = new Map<string, Set<string>>();
  for (const f of findings) { const k = norm(f.requirement); if (!byReq.has(k)) byReq.set(k, new Set()); byReq.get(k)!.add(f.controllability); }
  for (const set of byReq.values()) if (set.has("bidder_cannot_move") && set.has("already_satisfied")) return true;
  return false;
}

/** P4 — a binding section is COVERED iff some grounded finding's excerpt lives inside that section's text. */
function coverageOf(ctx: AuditToolContext, required: string[], findings: TypedFinding[]): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  for (const sec of required) {
    const text = norm(readSection(ctx, sec).text);
    if (findings.some((f) => f.excerpt && text.includes(norm(f.excerpt)))) covered.push(sec);
  }
  return { covered, missing: required.filter((s) => !covered.includes(s)) };
}

/** Default P2 — with no skeptic injected, soundness rests on Layer-1 grounding: every finding is already
 *  grounded (ungrounded ones were dropped in the loop), so the set is sound and all survive. A real
 *  adversarial skeptic (agentic refuter) is injected via opts.verify for paid runs. */
const groundingOnlyVerify: VerifyFn = async (_ctx, findings) => ({ sound: true, survived: findings, rejected: [] });

/** Run the full agentic audit cycle and DERIVE the verdict. Pure orchestration over injected model/verify. */
export async function runAgenticAudit(opts: OrchestratorInput): Promise<AuditResult> {
  const { ctx, experts, callModel, bidderProfile = null, maxTurns } = opts;
  const verify = opts.verify ?? groundingOnlyVerify;

  // P0 — manifest of binding sections present in this package.
  const required = buildManifest(ctx);

  // P1 — run the agentic experts in parallel; each grounds its own findings.
  const perLens: Record<string, number> = {};
  const runs = await Promise.all(experts.map((spec) => runAgenticExpert(spec, ctx, { callModel, maxTurns })));
  let findings: TypedFinding[] = [];
  experts.forEach((spec, i) => { perLens[spec.key] = runs[i].findings.length; findings.push(...runs[i].findings); });
  const allConverged = runs.every((r) => r.converged);

  // P3 — reconcile: dedup + detect unresolved material conflict.
  findings = dedup(findings);
  const conflict = hasConflict(findings);

  // P2 — adversarial cross-examination → verifierSound + the surviving finding set.
  const ver = await verify(ctx, findings);
  findings = ver.survived;

  // P4 — completeness: every binding section present must have a grounded finding; experts must have converged.
  const { covered, missing } = coverageOf(ctx, required, findings);
  const coverageComplete = allConverged && missing.length === 0 && required.length > 0;

  // P5 — DECIDE deterministically from the typed grounded facts.
  const inputs: VerdictInputs = { findings, bidderProfile, coverageComplete, verifierSound: ver.sound, conflict };
  const decision = deriveVerdict(inputs);

  return { decision, inputs, findings, coverage: { required, covered, missing }, perLens, conflict };
}
