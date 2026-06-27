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

/** Capability-tiered skeptic (Brain card-44 §4): a SINGLE Opus adversary is itself single-LLM-one-shot — the
 *  failure card 43 outlawed, re-armed at the verifier. So the BASE skeptic is Sonnet over everything; only the
 *  CONTESTED findings — the ones the base wants to OVERTURN (an overturn changes the finding set, so it's the
 *  high-stakes call) — are re-judged by the ESCALATION skeptic (Opus). Opus is spent only where the verdict is
 *  contested, never on the easy majority. Cost-bounded: at most one extra call, over the contested subset.
 *  (Knife-edge verdict-level escalation — BID↔CAUTION etc. — is a follow-on; this triggers on skeptic-overturn.) */
/** A finding sits on a verdict KNIFE-EDGE iff its classification, if wrong, would move the verdict off BID —
 *  i.e. it is typed as a disqualifying bar (bidder_cannot_move / no_one_can_move). These are the BID↔CAUTION /
 *  CAUTION↔NO_BID / →INELIGIBLE drivers (Brain card-44 §4 / card-49); everything else (bidder_controls /
 *  already_satisfied / boilerplate) can only ever clear, so it is never knife-edge. */
function isKnifeEdge(f: TypedFinding): boolean {
  return f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move";
}

export function makeTieredSkeptic(base: SkepticFn, escalate: SkepticFn): SkepticFn {
  return async (ctx, findings) => {
    const baseVerdicts = await base(ctx, findings);
    const overturned = baseVerdicts.filter((v) => !v.upheld).map((v) => v.index);     // base wants to overturn
    const knifeEdge = findings.map((f, i) => [f, i] as const).filter(([f]) => isKnifeEdge(f)).map(([, i]) => i); // verdict-decisive bars
    const contestedIdx = [...new Set([...overturned, ...knifeEdge])].sort((a, b) => a - b); // Opus reviews both, ONLY these
    if (!contestedIdx.length) return baseVerdicts;                                   // nothing contested/decisive → no Opus spend
    const contested = contestedIdx.map((i) => findings[i]).filter(Boolean);
    const escVerdicts = await escalate(ctx, contested);                             // Opus re-judges ONLY the contested subset
    const escByOrig = new Map<number, SkepticVerdict>();
    escVerdicts.forEach((v) => { const orig = contestedIdx[v.index]; if (orig !== undefined) escByOrig.set(orig, { index: orig, upheld: v.upheld, reason: v.reason }); });
    return baseVerdicts.map((v) => escByOrig.get(v.index) ?? v);                     // escalation wins where it ruled
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
    "BACKSTOP (Brain card-49) — OVERTURN any finding typed as a non-curable bar (bidder_cannot_move + curableInWindow=false)",
    "that is actually: a plain Total Small Business set-aside (52.219-6 — the bidder's POOL, already_satisfied); a standard",
    "self-cert rep (inverted-domestic-corp 52.209-10; telecom/security 52.240-91 / 252.204-7017-7018; EEO 52.222-36); or an",
    "obtainable registration (SAM 52.204-7). These are NEVER structural bars. Reserve non-curable for sole-source-to-named-OEM,",
    "a QPL/QML with lead>window, or an unobtainable clearance/facility cert.",
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
