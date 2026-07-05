// ── JUDGMENT-FIRST PATH (Brain cards 276/279) — PROPOSE → rail → DISPOSE ──────────────────────────────
// The pivot the CEO asked for: read the WHOLE solicitation and reason to a verdict + boardroom analysis the way
// pasting it into Claude does, then let the deterministic rail GATE it. This module is the deterministic wiring;
// both model-touching seams are INJECTED so the wiring is $0 unit-testable with stubs and paid-ready with the
// real callers. It adds NO new ladder guards — the rail (`rail` below = deriveVerdict over the proposed grounded
// findings, already enforcing I1–I8) is reused verbatim; this only sequences PROPOSE → rail → DISPOSE.
//
// Flag-gated: AUDIT_JUDGMENT_FIRST (default OFF ⇒ the ladder path is byte-identical). The proposer is PAID; the
// rail + DISPOSE are $0 deterministic.

import type { Verdict, Decision } from "./audit-decide";
import type { TypedFinding, BidderProfile } from "./audit-findings";
import { disposeVerdict, type DisposeResult } from "./audit-dispose";

export function judgmentFirstEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUDIT_JUDGMENT_FIRST === "true";
}

/** What the holistic proposer returns: a top-line verdict + the GROUNDED findings that support it + the boardroom
 *  analysis. The findings are the SAME TypedFinding contract the lenses emit, so the rail consumes them unchanged
 *  (and re-grounds them — a proposed finding whose excerpt isn't verbatim in source never survives, Rule 64/I3). */
export interface ProposedJudgment {
  verdict: Verdict;
  eligible: boolean | null;
  analysis: string;            // the boardroom-grade narrative (the product surface)
  reason: string;              // one-line verdict rationale
  findings: TypedFinding[];    // grounded findings the rail derives over
}

/** The PAID holistic proposer seam — reads the whole assembled source and proposes. Injected (stub in tests). */
export type ProposeFn = (input: JudgmentFirstInput) => Promise<ProposedJudgment>;

/** The deterministic RAIL seam — deriveVerdict over the proposed grounded findings (the full orchestrator rail
 *  pipeline in prod: re-ground → adversarial verify → completeness → deriveVerdict, enforcing I1–I8). Injected so
 *  the wiring is testable; in prod the caller passes the real rail. */
export type RailFn = (findings: TypedFinding[], input: JudgmentFirstInput) => Promise<Decision> | Decision;

export interface JudgmentFirstInput {
  fullSource: string;
  sections?: Record<string, string>;
  bidderProfile?: BidderProfile | null;
  noticeType?: string | null;
  naics?: string | null;
  setAside?: string | null;
}

export interface JudgmentFirstResult {
  disposed: DisposeResult;        // the FINAL verdict the customer sees — the rail's gated reconciliation
  proposed: ProposedJudgment;     // what the model proposed (telemetry / report analysis / proof)
  railDerived: Decision;          // the rail's independent derivation (telemetry / proof)
  analysis: string;               // the boardroom narrative (carried through from the proposer)
}

/** Run the judgment-first path: PROPOSE (holistic, paid) → rail (deterministic, I1–I8) → DISPOSE (gate authority).
 *  The disposed verdict is the customer-facing result; a committal pole survives ONLY on proposer↔rail agreement,
 *  every disagreement falls to honest-fail. Pure orchestration over the two injected seams. */
export async function runJudgmentFirst(input: JudgmentFirstInput, propose: ProposeFn, rail: RailFn): Promise<JudgmentFirstResult> {
  const proposed = await propose(input);
  const railDerived = await rail(proposed.findings, input);
  const disposed = disposeVerdict(
    { verdict: proposed.verdict, eligible: proposed.eligible, reason: proposed.reason },
    { verdict: railDerived.verdict, eligible: railDerived.eligible, reason: railDerived.reason },
  );
  return { disposed, proposed, railDerived, analysis: proposed.analysis };
}

// ── THE REAL HOLISTIC PROPOSER (PAID) ─────────────────────────────────────────────────────────────────
// One structured model call that reads the WHOLE assembled source and reasons to a verdict the way pasting a
// solicitation into Claude does. The structured caller is INJECTED (the anthropic-structured wrapper in prod, a
// stub in tests). The output is a PROPOSAL — every finding must carry a verbatim excerpt (Rule 64 / I3); the rail
// re-grounds and gates it downstream, so a hallucinated finding or an over-eager committal can never survive.
const VERDICT_ENUM = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE", "NEEDS_HUMAN_REVIEW", "INCOMPLETE"] as const;
const KIND_ENUM = ["eligibility_bar", "technical_spec", "pricing", "submission", "past_performance", "clause_flowdown", "boilerplate", "other"] as const;
const CONTROLLABILITY_ENUM = ["bidder_controls", "bidder_cannot_move", "no_one_can_move", "already_satisfied"] as const;

/** The strict structured-output schema for the proposal. A verbatim `excerpt` is REQUIRED on every finding. */
export const JUDGMENT_FIRST_SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdict", "analysis", "reason", "findings"],
  properties: {
    verdict: { type: "string", enum: VERDICT_ENUM },
    eligible: { type: ["boolean", "null"] },
    analysis: { type: "string", description: "The boardroom-grade bid/no-bid narrative a capture director would present." },
    reason: { type: "string", description: "One-line rationale for the proposed verdict." },
    findings: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["requirement", "citation", "excerpt", "kind", "controllability"],
      properties: {
        requirement: { type: "string" }, citation: { type: "string" },
        excerpt: { type: "string", description: "VERBATIM source span proving the requirement exists (Rule 64) — copied word-for-word from the solicitation." },
        kind: { type: "string", enum: KIND_ENUM },
        controllability: { type: "string", enum: CONTROLLABILITY_ENUM },
        requiredAttribute: { type: "string" }, curableInWindow: { type: "boolean" },
        severity: { type: "string", enum: ["P0", "P1", "P2"] },
      } } },
  },
} as const;

const PROPOSER_SYSTEM = [
  "You are a senior federal-contracting capture director. You are handed the FULL solicitation (every section and",
  "attachment). Read ALL of it and produce a boardroom-grade bid / no-bid analysis, then PROPOSE a verdict.",
  "GROUND every finding in a VERBATIM excerpt copied word-for-word from the source (never paraphrase an excerpt);",
  "a finding without a real verbatim excerpt will be dropped.",
  "Type each finding by controllability: bidder_controls (do-the-work gate), bidder_cannot_move (a PROFILE bar this",
  "firm may or may not hold — add requiredAttribute + curableInWindow), no_one_can_move (a UNIVERSAL impossibility",
  "disqualifying EVERY offeror), already_satisfied.",
  "VERDICT DISCIPLINE — the deterministic rail gates your proposal, so propose HONESTLY, never defensively:",
  "  • Propose NO_BID ONLY for a UNIVERSAL impossibility (the solicitation contradicts itself, or no offeror can",
  "    comply) — never for a who-can-win restriction (set-aside / NAICS size / clearance / QPL are not NO_BID).",
  "  • NEVER infer INELIGIBLE from SILENCE. If the solicitation does not state the firm holds an attribute, that is",
  "    UNKNOWN → propose NEEDS_HUMAN_REVIEW, not INELIGIBLE.",
  "  • A non-curable credential the firm must HOLD (CMMC level, clearance, ATO, a cert whose lead time exceeds the",
  "    response window) is a structural bar → NEEDS_HUMAN_REVIEW, not a soft caution.",
  "  • If the package is incomplete or you cannot ground the core, propose INCOMPLETE.",
  "  • Default to BID for a genuinely open, biddable solicitation; BID_WITH_CAUTION when a real caution attaches.",
  "Return ONLY the structured object.",
].join(" ");

/** Adapter contract for the injected paid structured caller (the anthropic-structured wrapper in prod). */
export type JudgmentStructuredCaller = (args: { model: string; system: string; user: string; schema: Record<string, unknown> }) => Promise<{ text: string; stopReason: string | null }>;

/** Project a raw model finding onto ONLY the schema-declared fields (card 282 adversarial hardening). This is a
 *  security boundary: it drops any out-of-schema field a prompt-injected model might emit to claim committal
 *  authority — universalDefect, verifiedBy, id, nmrGuard, grounded, lens, cautionFloor, etc. `grounded` is forced
 *  false (the rail owns grounding) and `lens` is stamped. The rail re-grounds + re-derives from here. */
function projectProposedFinding(f: Record<string, unknown>): TypedFinding {
  const out: TypedFinding = {
    requirement: typeof f.requirement === "string" ? f.requirement : "",
    citation: typeof f.citation === "string" ? f.citation : "",
    excerpt: typeof f.excerpt === "string" ? f.excerpt : "",
    kind: f.kind as TypedFinding["kind"],
    controllability: f.controllability as TypedFinding["controllability"],
    grounded: false,          // the rail SETS this from source — never the model
    lens: "judgment",
  };
  if (typeof f.requiredAttribute === "string") out.requiredAttribute = f.requiredAttribute;
  if (typeof f.curableInWindow === "boolean") out.curableInWindow = f.curableInWindow;
  if (f.severity === "P0" || f.severity === "P1" || f.severity === "P2") out.severity = f.severity;
  return out;
}

/** Build the real holistic ProposeFn. On a truncated (max_tokens) or unparseable response it THROWS — never a
 *  silent partial proposal (the audit boundary honest-fails, same no-swallow doctrine as the skeptic adapter). */
export function makeJudgmentFirstProposer(callStructured: JudgmentStructuredCaller, model: string): ProposeFn {
  return async (input: JudgmentFirstInput): Promise<ProposedJudgment> => {
    const profileLine = input.bidderProfile == null
      ? "Bidder profile: UNKNOWN (open-world — do NOT infer ineligibility from anything the firm does not explicitly hold)."
      : `Bidder profile attributes: ${(input.bidderProfile.satisfiedAttributes ?? []).join(", ") || "(none listed)"}${input.bidderProfile.closedWorld ? " [closed-world: complete profile]" : " [open-world: self-asserted]"}.`;
    const ctxLine = [input.naics ? `NAICS ${input.naics}` : "", input.setAside ? `set-aside ${input.setAside}` : "", input.noticeType ? `notice type ${input.noticeType}` : ""].filter(Boolean).join(" · ");
    const user = `${profileLine}${ctxLine ? `\nSolicitation facts: ${ctxLine}.` : ""}\n\n=== FULL SOLICITATION SOURCE ===\n${input.fullSource}`;
    const res = await callStructured({ model, system: PROPOSER_SYSTEM, user, schema: JUDGMENT_FIRST_SCHEMA as unknown as Record<string, unknown> });
    if (res.stopReason === "max_tokens") throw new Error(`judgment-first proposal truncated (max_tokens, model=${model}) — refusing a partial proposal`);
    let parsed: Partial<Omit<ProposedJudgment, "findings">> & { findings?: unknown[] };
    try { parsed = JSON.parse(res.text); } catch (e) { throw new Error(`judgment-first proposal unparseable (model=${model}): ${(e as Error)?.message ?? String(e)}`); }
    if (!parsed.verdict || !VERDICT_ENUM.includes(parsed.verdict as typeof VERDICT_ENUM[number])) throw new Error(`judgment-first proposal missing/invalid verdict (model=${model})`);
    return {
      verdict: parsed.verdict as Verdict,
      eligible: parsed.eligible ?? null,
      analysis: typeof parsed.analysis === "string" ? parsed.analysis : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      // grounded:false is DELIBERATE and load-bearing. `grounded===true` is the rail's source-truth control
      // (audit-decide.ts isVerifiedUniversalDefect / the verified floor TRUST it as "the real integrity control …
      // that stops a fabricated/hallucinated excerpt"), and it is only legitimate when SET by the deterministic
      // substring check in audit-expert.ts against the real assembled source. The proposer must NEVER self-assert
      // it — a model excerpt is a CLAIM, not a proof. The prod rail seam MUST run the re-grounding pass that
      // recomputes `grounded` from source before deriveVerdict; a hallucinated excerpt then stays ungrounded and
      // fails SAFE (dropped → NHR), never rides a forged flag into a committal verdict (Rule 64 / I3).
      //
      // FIELD-ALLOWLIST PROJECTION (adversarial security review, card 282): copy ONLY the schema-declared fields —
      // NOT a raw `{...f}` spread. The model's structured output is trusted for the schema shape, but a
      // prompt-injected model could emit OUT-OF-SCHEMA committal-authority fields (universalDefect, verifiedBy, id,
      // nmrGuard); those are all neutralized downstream (empty VERIFIER_ALLOWLIST → NHR), but projecting removes the
      // dependence on distant guards — the proposer boundary itself refuses to carry any committal-forcing field.
      findings: (Array.isArray(parsed.findings) ? parsed.findings : []).map((f) => projectProposedFinding((f ?? {}) as Record<string, unknown>)),
    };
  };
}
