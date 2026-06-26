// ── AGENTIC VERIFICATION ENGINE · P2 ADVERSARIAL CROSS-EXAMINATION ────────────────────────────────────
// Brain card 43. The experts (Layer 1) already ground every finding in a verbatim excerpt; grounding is
// the deterministic floor. This layer adds the ADVERSARIAL pass: an independent skeptic challenges each
// surviving finding — not "does the excerpt exist" (already proven) but "is the CLASSIFICATION right?" The
// failure mode that grounding can't catch is misclassification: a bidder_controls spec mislabeled a
// disqualifier, or routine boilerplate mislabeled a gate. The skeptic tries to OVERTURN; overturned
// findings are dropped; if verification can't complete over the whole set, the run is not sound →
// deriveVerdict routes to NEEDS_HUMAN_REVIEW (honest fail, never a false green).
//
// The skeptic is INJECTED → unit-testable with a stub ($0). makeStructuredSkeptic wires the real model.

import { findInSource, type AuditToolContext } from "./audit-tools";
import type { VerifyFn, VerifyResult } from "./audit-orchestrator";
import type { TypedFinding } from "./audit-findings";

/** One skeptic ruling on a finding (by its index in the set). upheld=false ⇒ the finding is overturned. */
export interface SkepticVerdict { index: number; upheld: boolean; reason: string }
/** The adversarial challenger over the whole finding set. Returns a ruling per finding index. */
export type SkepticFn = (ctx: AuditToolContext, findings: TypedFinding[]) => Promise<SkepticVerdict[]>;

/** Build the P2 VerifyFn from a skeptic. Two gates: (1) deterministic defense-in-depth re-grounding —
 *  anything no longer literally in source is dropped regardless of the skeptic; (2) the skeptic overturns
 *  misclassified findings. SOUND iff the skeptic returned a ruling for every grounded finding (verification
 *  actually completed); an incomplete/failed challenge ⇒ not sound ⇒ human review. */
export function makeAgenticVerifier(skeptic: SkepticFn): VerifyFn {
  return async (ctx: AuditToolContext, findings: TypedFinding[]): Promise<VerifyResult> => {
    // (1) deterministic re-grounding — never trust a finding whose excerpt isn't in source.
    const grounded = findings.filter((f) => f.excerpt && findInSource(ctx, f.excerpt).hits.length > 0);
    const droppedUngrounded = findings.filter((f) => !grounded.includes(f));

    if (grounded.length === 0) return { sound: true, survived: [], rejected: droppedUngrounded };

    // (2) adversarial challenge.
    let verdicts: SkepticVerdict[];
    try { verdicts = await skeptic(ctx, grounded); }
    catch { return { sound: false, survived: grounded, rejected: droppedUngrounded }; } // challenge failed → not sound

    const ruledIdx = new Set(verdicts.map((v) => v.index));
    const complete = grounded.every((_, i) => ruledIdx.has(i)); // every finding actually got challenged
    const overturned = new Set(verdicts.filter((v) => !v.upheld).map((v) => v.index));

    const survived = grounded.filter((_, i) => !overturned.has(i));
    const rejected = [...droppedUngrounded, ...grounded.filter((_, i) => overturned.has(i))];
    return { sound: complete, survived, rejected };
  };
}

/** Production skeptic — a single structured model call that challenges the whole set at once (cost-bounded:
 *  O(1) calls, not O(findings)). Given each finding's requirement + verbatim excerpt + kind + controllability,
 *  it rules upheld/overturned with a reason. Strict JSON schema → the result is shape-guaranteed. PAID;
 *  invoked only on a real run. callStructured is injected (the existing anthropic-structured wrapper). */
export function makeStructuredSkeptic(
  callStructured: (args: { model: string; system: string; user: string; schema: Record<string, unknown> }) => Promise<{ verdicts: SkepticVerdict[] }>,
  model: string,
): SkepticFn {
  const SYSTEM = [
    "You are an adversarial federal-contracting skeptic cross-examining another analyst's findings.",
    "Each finding is ALREADY grounded in a verbatim source excerpt — do NOT re-litigate whether the text exists.",
    "Challenge ONLY the classification. Overturn a finding (upheld=false) when its controllability is wrong:",
    "  a requirement the bidder could satisfy by doing the work (source/price/configure/document/submit) that was",
    "  labeled bidder_cannot_move; OR routine standard FAR boilerplate labeled as a gate; OR an already_satisfied/",
    "  cannot_move call the excerpt does not support. Uphold (upheld=true) when the classification is defensible.",
    "Rule on EVERY finding by its index. Be specific in each reason.",
  ].join(" ");
  const SCHEMA = { type: "object", additionalProperties: false, required: ["verdicts"], properties: { verdicts: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["index", "upheld", "reason"],
    properties: { index: { type: "integer" }, upheld: { type: "boolean" }, reason: { type: "string" } } } } } };
  return async (_ctx, findings) => {
    const user = "Findings to cross-examine:\n" + findings.map((f, i) =>
      `[${i}] requirement="${f.requirement}" | kind=${f.kind} | controllability=${f.controllability} | citation="${f.citation}" | excerpt="${f.excerpt}"`).join("\n");
    const out = await callStructured({ model, system: SYSTEM, user, schema: SCHEMA });
    return out.verdicts ?? [];
  };
}
