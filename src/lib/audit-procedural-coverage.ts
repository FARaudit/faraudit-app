// ── PART-12 PROCEDURAL-COVERAGE PASS (Brain card 208-B) ───────────────────────────────────────────────
// On a part12-commercial doc the substantive expert lenses ground the scope/clauses (§B/§C/§I) but
// systematically DON'T emit findings for the §L SUBMISSION-MECHANICS (52.212-1: how/where/when to quote) or
// the §M EVALUATION-METHODOLOGY (52.212-2: basis for award) — so completenessOf flags those obligations
// ungrounded → coverageComplete=false → INCOMPLETE (the SP3300 root, proven at $0 in cards 191/202).
//
// This pass grounds them. It reads the §L/§M-equivalent sections and emits `procedural_obligation` findings
// whose excerpt is a VERBATIM span of the section, so completenessOf's `covered_direct` fires and groundedBy
// clears WITHOUT any threshold change (grounding rules FROZEN).
//
// COVERAGE-ONLY / SEMANTICALLY INERT (card 208-B §2): every finding is controllability=bidder_controls,
// kind=procedural_obligation, NO cautionFloor, NO requiredAttribute → it is a gate-to-clear that can NEVER be
// a bar/showstopper, is NOT an eligibility gate, and is invisible to the 206-A eligibility guarantee
// (unverifiedGates keys on kind==="eligibility_bar") and to set-aside typing (keys on eligibility_bar). It only
// makes coverage complete; the verdict/eligible are still driven entirely by the substantive findings + 206-A.
//
// Model tier (role doctrine): the extractor is INJECTABLE. The shipped DEFAULT is DETERMINISTIC ($0 at runtime,
// guarantees the verbatim ≥4-word anchoring the card mandates, and needs no paid path this $0 envelope cannot
// validate). A cheap haiku-class model extractor can drop in via `opts.extract` after a live validation
// (est ~$0.005/audit — see makeModelProceduralExtractor). Rule-64: whatever the extractor returns, only quotes
// that are a verbatim ≥4-word span PRESENT in the section become findings — a model can never fabricate grounding.

import { readSection, procurementPart, type AuditToolContext } from "./audit-tools";
import type { TypedFinding } from "./audit-findings";

export const PROCEDURAL_SECTIONS = ["L", "M"] as const; // 52.212-1 instructions ≡ §L; 52.212-2 evaluation ≡ §M

export interface ProceduralCandidate { section: string; quote: string; label?: string; }
export type ProceduralExtractor = (sections: { key: string; text: string }[]) => Promise<ProceduralCandidate[]>;

const OBLIGATION_VERB_RE = /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i;
// MUST match completenessOf's norm EXACTLY (audit-orchestrator.ts) — otherwise a quote that passes this pass's
// Rule-64 gate could still fail covered_direct downstream (code-review: no dash-folding divergence).
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Deterministic default extractor — obligation sentences (≥4 words, obligation verb), verbatim from §L/§M.
 *  A NEW self-contained extractor (does NOT touch the frozen obligationsOf); it only proposes verbatim quotes
 *  which the pass then Rule-64-grounds. Mirrors obligationsOf's predicate so it targets the same sentences
 *  completenessOf checks. */
export const deterministicProceduralExtractor: ProceduralExtractor = async (sections) => {
  const out: ProceduralCandidate[] = [];
  for (const s of sections)
    for (const sent of s.text.split(/(?<=[.;\n])/).map((x) => x.trim())
      .filter((x) => x.split(/\s+/).filter(Boolean).length >= 4 && OBLIGATION_VERB_RE.test(x)).slice(0, 40))
      out.push({ section: s.key, quote: sent });
  return out;
};

/** Cheap (haiku-class) model extractor factory — AVAILABLE, not wired by default. `callJSON` runs a structured
 *  cheap-tier call returning `{ candidates: ProceduralCandidate[] }`. The pass Rule-64-grounds the output, so a
 *  paraphrased/hallucinated quote is dropped. Per-audit cost estimate ≈ $0.005 (haiku over ~6KB of §L/§M). */
export function makeModelProceduralExtractor(
  callJSON: (args: { system: string; user: string }) => Promise<{ candidates?: ProceduralCandidate[] }>,
): ProceduralExtractor {
  return async (sections) => {
    const sys = "You extract PROCEDURAL obligations from a U.S. federal Part-12 commercial solicitation's instructions (§L / 52.212-1) and evaluation (§M / 52.212-2) sections. Return ONLY a JSON object {\"candidates\":[{\"section\":\"L|M\",\"quote\":\"<VERBATIM sentence copied EXACTLY from the section, >=4 words>\"}]}. Every quote MUST be copied verbatim; do not paraphrase.";
    const user = sections.map((s) => `=== SECTION ${s.key} ===\n${s.text.slice(0, 8000)}`).join("\n\n");
    try { return (await callJSON({ system: sys, user })).candidates ?? []; } catch { return []; }
  };
}

/** The pass. Pure control flow; deterministic grounding gate; the only I/O is the injected extractor. */
export async function proceduralCoveragePass(ctx: AuditToolContext, opts?: { extract?: ProceduralExtractor }): Promise<TypedFinding[]> {
  if (procurementPart(ctx) !== "part12-commercial") return [];
  const sections = PROCEDURAL_SECTIONS.map((k) => ({ key: k as string, text: readSection(ctx, k).text })).filter((s) => s.text.trim());
  if (!sections.length) return [];
  const extract = opts?.extract ?? deterministicProceduralExtractor;
  let candidates: ProceduralCandidate[] = [];
  try { candidates = await extract(sections); } catch { candidates = []; }
  if (!Array.isArray(candidates)) candidates = [];                    // a misbehaving extractor must honest-fail, never crash the audit
  candidates = candidates.slice(0, 200);                             // bound an injected extractor (deterministic default is already ≤80)

  const secNormCache = new Map(sections.map((s) => [s.key, norm(s.text)])); // hoist per-section normalization out of the loop
  const out: TypedFinding[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const sec = sections.find((s) => s.key === (c.section || "").toUpperCase());
    if (!sec) continue;
    const q = (c.quote || "").trim();
    if (q.split(/\s+/).filter(Boolean).length < 4) continue;         // ≥4-word run
    const nq = norm(q);
    if (!secNormCache.get(sec.key)!.includes(nq)) continue;          // Rule-64: must be VERBATIM in the section
    if (seen.has(nq)) continue; seen.add(nq);
    out.push({
      requirement: `Procedural obligation (§${sec.key}): ${(c.label || q).slice(0, 120)}`,
      citation: `§${sec.key} (procedural coverage)`,
      excerpt: q,                                                     // verbatim span → completenessOf covered_direct fires
      kind: "procedural_obligation",
      controllability: "bidder_controls",                            // gate-to-clear — never a bar (coverage-only)
      grounded: true,
      lens: "procedural_coverage",
    });
  }
  return out;
}
