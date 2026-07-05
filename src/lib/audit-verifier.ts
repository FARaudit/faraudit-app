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
import type { VerifyFn, VerifyResult, CorrectedDrop } from "./audit-orchestrator";
import type { TypedFinding, BidderProfile, Controllability } from "./audit-findings";
import { knifeEdgeIndices } from "./audit-decide";

/** One skeptic ruling on a finding (by its index in the set). upheld=false ⇒ overturned (dropped). When
 *  `corrected` is present, the skeptic RE-TYPES the finding instead — escalation feeds deriveVerdict better
 *  inputs; it never re-derives the top-line itself (Brain card-54 point 3). */
export interface SkepticVerdict { index: number; upheld: boolean; reason: string; corrected?: { controllability?: Controllability; curableInWindow?: boolean } }
/** The adversarial challenger over the finding set. opts.escalateIdx = the knife-edge subset to scrutinize. */
export type SkepticFn = (ctx: AuditToolContext, findings: TypedFinding[], opts?: { escalateIdx?: number[] }) => Promise<SkepticVerdict[]>;

/** Build the P2 VerifyFn from a skeptic. Two gates: (1) deterministic defense-in-depth re-grounding —
 *  anything no longer literally in source is dropped regardless of the skeptic; (2) the skeptic overturns
 *  misclassified findings. SOUND iff the skeptic returned a ruling for every grounded finding (verification
 *  actually completed); an incomplete/failed challenge ⇒ not sound ⇒ human review. */
export function makeAgenticVerifier(skeptic: SkepticFn): VerifyFn {
  return async (ctx: AuditToolContext, findings: TypedFinding[], opts?: { bidderProfile?: BidderProfile | null }): Promise<VerifyResult> => {
    // (1) deterministic re-grounding — never trust a finding whose excerpt isn't in source.
    const grounded = findings.filter((f) => f.excerpt && findInSource(ctx, f.excerpt).hits.length > 0);
    const droppedUngrounded = findings.filter((f) => !grounded.includes(f));

    // VERIFIED-FLOOR positive precondition (Brain card 224 fork 1): soundness requires that ≥1 finding
    // SURVIVE a real challenge — not merely that the skeptic "ruled on every finding". Zero grounded findings
    // means nothing was verified (extraction produced nothing / every excerpt failed re-grounding), so the run
    // is NOT sound → deriveVerdict routes to NEEDS_HUMAN_REVIEW, never a default BID over an empty set.
    if (grounded.length === 0) return { sound: false, survived: [], rejected: droppedUngrounded };

    // (2) knife-edge selection (deterministic, over the SAME grounded array the skeptic sees — no index drift)
    //     + adversarial challenge. The skeptic re-types / overturns; the proven deriveVerdict runs downstream.
    const escalateIdx = knifeEdgeIndices(grounded, opts?.bidderProfile ?? null);
    let verdicts: SkepticVerdict[];
    try { verdicts = await skeptic(ctx, grounded, { escalateIdx }); }
    catch { return { sound: false, survived: grounded, rejected: droppedUngrounded }; } // challenge failed → not sound

    const byIdx = new Map(verdicts.map((v) => [v.index, v]));
    const survived: TypedFinding[] = []; const rejected: TypedFinding[] = [...droppedUngrounded];
    const correctedDrops: CorrectedDrop[] = [];
    // RESIDUE DOCTRINE (Brain card 285, Fix 1), flag-gated AUDIT_VERIFIER_BATCHING. An UNRESOLVED finding (the
    // skeptic returned no ruling for its index — truncation / claim-explosion residue) is classified:
    //   • VERDICT-DRIVING (bar-class OR knife-edge — could support/block a committal) → the run is NOT sound
    //     → NHR (a genuine honest fail). The finding is ATTACHED to survived (never silently dropped — Brain's
    //     forbidden fail-safe: a vanished disqualifier is a false-BID path).
    //   • INFORMATIONAL (everything else) → marked `unverified` (excluded from report claims) and KEPT, but it
    //     does NOT sink soundness. A stray informational finding the skeptic never reached must not honest-fail
    //     the whole clean audit — the customer-readiness gap card 285 closes.
    // Flag OFF ⇒ byte-identical to the pre-card-285 rule: unresolved ⇒ `complete=false` ⇒ not sound (whole-run NHR).
    const residueDoctrine = process.env.AUDIT_VERIFIER_BATCHING === "true";
    // CONSERVATIVE verdict-driving predicate (adversarial-review hardening, card 285). A finding is "informational"
    // (safe to leave UNRESOLVED without sinking soundness) ONLY when its KIND is one the engine defines as
    // structurally NEVER-a-bar: procedural_obligation (coverage-only, invisible to the verdict) or boilerplate
    // (routine standard T&C, explicitly NOT a gate). EVERYTHING ELSE unresolved is treated as verdict-driving → NHR.
    // Rationale (closes the catastrophic residue hole): the skeptic exists precisely to CORRECT a mis-typed
    // controllability, so we must NOT trust the lens's `controllability` to decide a finding is harmless — an
    // under-typed bar (real disqualifier the lens labeled bidder_controls, no lens-disagreement sibling → absent
    // from the knife-edge set) would otherwise be waved through as "informational" → false BID. Keying on the
    // never-a-bar KINDS (not on the contestable controllability) removes that trust. Residue is near-zero once the
    // batched skeptic rules every finding; this is the fail-SAFE fallback for the rare truncation tail.
    const SAFE_INFORMATIONAL_KINDS = new Set(["procedural_obligation", "boilerplate"]);
    const isVerdictDriving = (f: TypedFinding, _i: number): boolean => !SAFE_INFORMATIONAL_KINDS.has(f.kind);
    let unresolvedVerdictDriving = 0;
    grounded.forEach((f, i) => {
      const v = byIdx.get(i);
      // RE-TYPE requires a SUBSTANTIVE correction (Brain card 274 RULING 1). An empty/non-substantive
      // `corrected:{}` used to be truthy → the finding survived UNCHANGED even when the skeptic REFUTED it
      // (upheld=false) → false INELIGIBLE/NO_BID (the catastrophic ZERO-CONTRACT-LOSS hole). A correction only
      // counts when it carries controllability or curableInWindow; otherwise the upheld flag governs.
      const substantive = !!v?.corrected && (v.corrected.controllability !== undefined || v.corrected.curableInWindow !== undefined);
      if (substantive) {
        survived.push({ ...f, ...(v!.corrected!.controllability ? { controllability: v!.corrected!.controllability } : {}), ...(v!.corrected!.curableInWindow !== undefined ? { curableInWindow: v!.corrected!.curableInWindow } : {}) }); // RE-TYPE
      } else if (v && !v.upheld) {
        rejected.push(f); // overturned → drop (INCLUDES the empty-corrected:{} case that formerly resurrected)
        correctedDrops.push({ index: i, id: f.id, requirement: f.requirement, citation: f.citation, refutation: v.reason, dropReason: v.corrected ? "empty_corrected" : "overturned" });
      } else if (v) {
        survived.push(f); // upheld as-is (upheld=true, no substantive correction)
      } else if (residueDoctrine && !isVerdictDriving(f, i)) {
        survived.push({ ...f, unverified: true }); // UNRESOLVED informational → kept, marked, does not sink soundness
      } else {
        survived.push(f);                          // UNRESOLVED verdict-driving (or flag-off residue) → attached…
        if (isVerdictDriving(f, i)) unresolvedVerdictDriving++; // …and it sinks soundness → NHR
      }
    });
    if (correctedDrops.some((d) => d.dropReason === "empty_corrected"))
      console.log(`[verifier] dropped ${correctedDrops.filter((d) => d.dropReason === "empty_corrected").length} refuted finding(s) with empty corrected:{} (card 274 RULING 1 — no false resurrection): ${correctedDrops.filter((d) => d.dropReason === "empty_corrected").map((d) => `#${d.index} "${d.requirement}"`).join(", ")}`);
    // SOUND (Brain card 224 fork 1 + card 285): ≥1 finding survives AND no verdict-driving residue is unresolved.
    // Flag OFF: unresolvedVerdictDriving counts ANY unresolved finding (every non-ruled index takes the final else),
    //   reproducing the old `complete` gate exactly. Flag ON: only bar-class/knife-edge residue sinks the run; a
    //   truncated informational tail no longer honest-fails a clean audit. Total-overturn (survived=[]) is never sound.
    const unresolvedCount = residueDoctrine ? unresolvedVerdictDriving : grounded.filter((_, i) => !byIdx.has(i)).length;
    if (residueDoctrine && unresolvedVerdictDriving > 0)
      console.log(`[verifier] ${unresolvedVerdictDriving} VERDICT-DRIVING finding(s) unresolved after the skeptic pass → run NOT sound → NHR (card 285 residue doctrine; findings attached, never dropped)`);
    return { sound: unresolvedCount === 0 && survived.length > 0, survived, rejected, correctedDrops };
  };
}

/** BATCHED SKEPTIC (Brain card 285, Fix 1). Wraps a base skeptic so it challenges the material set in bounded
 *  BATCHES with a per-batch completeness check + retries — instead of one call whose O(findings) output truncates
 *  (the claim-explosion root: on 24–43 findings the single skeptic response clipped and left indices unruled →
 *  false honest-fail). Each batch is retried until every finding in it is ruled or `retries` is exhausted; any
 *  still-unruled finding is left ABSENT from the merged verdicts (the residue makeAgenticVerifier then classifies —
 *  verdict-driving → NHR, informational → unverified). Indices are remapped to the FULL set so downstream logic is
 *  unchanged. Pure orchestration over the injected base; adds no model of its own. */
export function makeBatchedSkeptic(base: SkepticFn, opts?: { batchSize?: number; retries?: number }): SkepticFn {
  const batchSize = Math.max(1, opts?.batchSize ?? 12);
  const retries = Math.max(0, opts?.retries ?? 2);
  return async (ctx, findings, _opts) => {
    if (findings.length <= batchSize) return base(ctx, findings, _opts); // no batching needed → identical single call
    const merged: SkepticVerdict[] = [];
    for (let start = 0; start < findings.length; start += batchSize) {
      const batch = findings.slice(start, start + batchSize);
      const ruled = new Map<number, SkepticVerdict>(); // local index → verdict
      for (let attempt = 0; attempt <= retries && ruled.size < batch.length; attempt++) {
        // Re-challenge ONLY the still-unruled remainder so a partial batch converges without re-spending on the resolved.
        const remainIdx = batch.map((_, i) => i).filter((i) => !ruled.has(i));
        const remain = remainIdx.map((i) => batch[i]);
        let vs: SkepticVerdict[];
        try { vs = await base(ctx, remain, _opts); } catch { break; } // a failed batch call → leave remainder unruled (residue)
        for (const v of vs) { const local = remainIdx[v.index]; if (local !== undefined && !ruled.has(local)) ruled.set(local, { ...v, index: local }); }
      }
      for (const [local, v] of ruled) merged.push({ ...v, index: start + local }); // remap to the full-set index
    }
    return merged;
  };
}

/** Capability-tiered skeptic (Brain card-44 §4 / card-54/55): a SINGLE Opus adversary is itself
 *  single-LLM-one-shot — the failure card 43 outlawed. So the BASE skeptic is Sonnet over everything; only
 *  the CONTESTED findings are re-judged by Opus. Contested = the deterministic KNIFE-EDGE set (opts.escalateIdx,
 *  computed by the verifier via knifeEdgeIndices — both edges: over-typed bar→caution AND under-typed bar via
 *  lens disagreement) UNION the base skeptic's own overturns. Opus is spent only here, never on the easy
 *  majority; it RE-TYPES the contested findings (corrected) and the proven deriveVerdict runs downstream. */
export function makeTieredSkeptic(base: SkepticFn, escalate: SkepticFn): SkepticFn {
  return async (ctx, findings, opts) => {
    const baseVerdicts = await base(ctx, findings);
    const overturned = baseVerdicts.filter((v) => !v.upheld).map((v) => v.index);     // base wants to overturn
    const knifeEdge = opts?.escalateIdx ?? [];                                        // deterministic edge set (both directions)
    const contestedIdx = [...new Set([...overturned, ...knifeEdge])].sort((a, b) => a - b);
    if (!contestedIdx.length) return baseVerdicts;                                   // nothing contested → no Opus spend
    const contested = contestedIdx.map((i) => findings[i]).filter(Boolean);
    const escVerdicts = await escalate(ctx, contested);                             // Opus re-judges/re-types ONLY the contested subset
    const escByOrig = new Map<number, SkepticVerdict>();
    escVerdicts.forEach((v) => { const orig = contestedIdx[v.index]; if (orig !== undefined) escByOrig.set(orig, { index: orig, upheld: v.upheld, reason: v.reason, corrected: v.corrected }); });
    // RULING 2 (Brain card 274) — NEVER pass through the lenient base (Sonnet) type on an UNRESOLVED knife-edge.
    // If the escalation returned no ruling for one or more contested findings (empty-return-on-contested-set, or a
    // partial cover), we cannot trust the base classification → THROW so makeAgenticVerifier's catch routes the run
    // to sound:false → NEEDS_HUMAN_REVIEW with the contested/grounded set attached. A truncation/parse-fail already
    // throws inside structuredAdapter; this closes the valid-but-incomplete escalation return.
    const unresolved = contestedIdx.filter((i) => !escByOrig.has(i));
    if (unresolved.length) {
      console.log(`[skeptic] escalation left ${unresolved.length}/${contestedIdx.length} contested finding(s) unresolved (idx ${unresolved.join(",")}) — refusing lenient pass-through → NHR (card 274 RULING 2)`);
      throw new Error(`escalation unresolved on ${unresolved.length}/${contestedIdx.length} contested finding(s) — no lenient pass-through`);
    }
    // MERGE base ∪ escalation over the UNION of ruled indices (adversarial-review hardening, card 285). The old
    // `baseVerdicts.map(...)` emitted ONLY base-ruled indices, so a contested finding the batched base left unruled
    // but the escalation DID rule was silently dropped — RULING-2's `escByOrig.has(i)` guard passes, yet the valid
    // Opus re-type vanished → the verifier saw it as residue → a spurious honest-fail. Emit every index either side
    // ruled; escalation wins where both did.
    const mergedByIdx = new Map<number, SkepticVerdict>();
    for (const v of baseVerdicts) mergedByIdx.set(v.index, v);
    for (const [i, v] of escByOrig) mergedByIdx.set(i, v);          // escalation overrides the lenient base
    return [...mergedByIdx.values()];
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
    "RE-TYPE when wrong (Brain card-54): instead of only overturning, return `corrected` with the right controllability",
    "(bidder_controls / bidder_cannot_move / no_one_can_move / already_satisfied) and, for a bidder_cannot_move bar,",
    "curableInWindow. Use this especially on the contested/knife-edge findings to fix an UNDER-typed genuine bar (a",
    "buried QPL/QML line, a restrictive brand-name 'or-equal', a clearance requirement) the lens mis-typed as a caution",
    "or comply-to-win. The deterministic decision layer re-runs on your corrected types — do NOT state a verdict.",
    "Rule on EVERY finding by its index. Be specific in each reason.",
  ].join(" ");
  const SCHEMA = { type: "object", additionalProperties: false, required: ["verdicts"], properties: { verdicts: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["index", "upheld", "reason"],
    properties: { index: { type: "integer" }, upheld: { type: "boolean" }, reason: { type: "string" },
      corrected: { type: "object", additionalProperties: false, minProperties: 1, properties: { // card 274 RULING 1 — an empty corrected:{} is never a valid re-type
        controllability: { type: "string", enum: ["bidder_controls", "bidder_cannot_move", "no_one_can_move", "already_satisfied"] },
        curableInWindow: { type: "boolean" } } } } } } } };
  return async (_ctx, findings, _opts) => {
    const user = "Findings to cross-examine:\n" + findings.map((f, i) =>
      `[${i}] requirement="${f.requirement}" | kind=${f.kind} | controllability=${f.controllability} | curableInWindow=${f.curableInWindow} | citation="${f.citation}" | excerpt="${f.excerpt}"`).join("\n");
    const out = await callStructured({ model, system: SYSTEM, user, schema: SCHEMA });
    return out.verdicts ?? [];
  };
}
