// GROUNDING RECOMPUTE — ARC #747, CEO option A. Flag: AUDIT_GROUNDING_RECOMPUTE (default-OFF).
//
// THE DEFECT THIS CLOSES. `TypedFinding.grounded` is documented as "excerpt verified present in the source
// (deterministic grounding check)". It is not. Measured 2026-07-27: the field is written as a hardcoded
// `true` at 22 sites across 9 modules, and the only real verifier — `excerptInSource` — has exactly ONE
// production caller, on the model/panel path. Every deterministic emitter simply declares itself grounded.
//
// That is not a theoretical gap. `audit-sole-source-lock.ts` composed an excerpt out of the vendor's name
// when it could not find a real span, and `audit-decide.ts` passed it through beside `grounded: true` — a
// manufactured quotation, delivered to the customer as verbatim source. (That fallback is now deleted; this
// module is the general answer, so the next emitter cannot reintroduce it.)
//
// WHY A CHOKEPOINT AND NOT 22 EDITS. Editing each site would leave the INVARIANT unowned: nothing stops a
// new emitter from declaring `grounded: true` tomorrow. Recomputing once, at the boundary where the full
// source is in hand, makes groundedness a COMPUTED FACT rather than 22 promises — and it cannot be bypassed
// by adding an emitter, because every finding passes here.
//
// FAILURE DIRECTION. `grounded` becomes the computed value, never the declared one. A declaration of TRUE
// that the source does not support is DEMOTED to false; the finding is kept (never silently dropped — a
// dropped finding is its own failure mode) but it can no longer present itself as source-verified.
// Demotion is the safe direction: a finding that loses its grounding badge weakens a claim, whereas an
// ungrounded finding wearing the badge manufactures corroboration.
//
// SCOPE LIMIT, stated rather than implied: this verifies that the excerpt EXISTS in the source. It does not
// verify that the excerpt ENTAILS the finding — the relevance question the panel raised, where a detector
// fires on "to 45-60 days" and its span resolves perfectly. Existence is necessary, not sufficient. Naming
// that here so a later reader does not mistake this for the whole guard.
import { excerptInSource } from "./agentic-sections";
import type { TypedFinding } from "./audit-findings";

export interface GroundingRecomputeStats {
  total: number;              // findings carrying an excerpt
  declaredTrue: number;       // said grounded: true on arrival
  computedTrue: number;       // excerpt actually located in source
  demoted: number;            // declared true, source does not support it  ← the fabrication-adjacent set
  promoted: number;           // declared false/absent, but the excerpt IS present
  noExcerpt: number;          // nothing to verify
  demotedLenses: Record<string, number>;
}

export function recomputeGrounding(
  findings: TypedFinding[],
  source: string,
  opts: { enabled: boolean }
): { findings: TypedFinding[]; stats: GroundingRecomputeStats } {
  const stats: GroundingRecomputeStats = {
    total: 0, declaredTrue: 0, computedTrue: 0, demoted: 0, promoted: 0, noExcerpt: 0, demotedLenses: {},
  };

  const out = findings.map((f) => {
    const excerpt = typeof f.excerpt === "string" ? f.excerpt.trim() : "";
    if (!excerpt) {
      stats.noExcerpt++;
      // No excerpt at all cannot be grounded, whatever it claims. Under the flag this is corrected too —
      // an empty span with grounded:true is the same lie in a cheaper form.
      if (f.grounded === true) {
        stats.declaredTrue++; stats.demoted++;
        stats.demotedLenses[f.lens ?? "?"] = (stats.demotedLenses[f.lens ?? "?"] ?? 0) + 1;
        return opts.enabled ? { ...f, grounded: false } : f;
      }
      return f;
    }

    stats.total++;
    const declared = f.grounded === true;
    const computed = excerptInSource(excerpt, source);
    if (declared) stats.declaredTrue++;
    if (computed) stats.computedTrue++;
    if (declared && !computed) {
      stats.demoted++;
      stats.demotedLenses[f.lens ?? "?"] = (stats.demotedLenses[f.lens ?? "?"] ?? 0) + 1;
    }
    if (!declared && computed) stats.promoted++;

    // Flag-OFF must be byte-identical: measure, change nothing.
    if (!opts.enabled) return f;
    return computed === declared ? f : { ...f, grounded: computed };
  });

  return { findings: out, stats };
}
