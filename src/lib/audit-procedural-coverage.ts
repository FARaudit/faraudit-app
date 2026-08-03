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

import { sectionFullText, procurementPart, type AuditToolContext } from "./audit-tools";
import type { TypedFinding } from "./audit-findings";

export const PROCEDURAL_SECTIONS = ["L", "M"] as const; // 52.212-1 instructions ≡ §L; 52.212-2 evaluation ≡ §M

export interface ProceduralCandidate { section: string; quote: string; label?: string; }
export type ProceduralExtractor = (sections: { key: string; text: string }[]) => Promise<ProceduralCandidate[]>;

const OBLIGATION_VERB_RE = /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i;
// MUST match completenessOf's norm EXACTLY (audit-orchestrator.ts) — otherwise a quote that passes this pass's
// Rule-64 gate could still fail covered_direct downstream (code-review: no dash-folding divergence).
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// ── OBLIGATION SEGMENTATION (Brain card-215 Fork A — truncation defect fix) ───────────────────────────
// The prior extractor split on /(?<=[.;\n])/ → truncated obligations at decimals ("$1.04"), email/URL tokens
// ("michael.s.french@dla.mil"), and mid-sentence PDF soft line-wraps. Fix (Brain-ruled): segment on
// LIST-MARKERS + NEWLINES first (the source is (1)/(2)/(3) numbered), REJOINING soft line-wraps WITHIN a unit
// so each numbered obligation stays whole; a guarded sentence-splitter is the FALLBACK for non-list prose.
// The guard set is a FROZEN, VERSIONED constant with one test per class — future additions bump the version
// (supersede), never silently append (Brain card 215).
export const PROCEDURAL_SENTENCE_GUARDS = {
  version: 1,
  decimal: /(\d)\.(\d)/g,                                                                         // 1.04 · $1.039
  emailUrl: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:gov|mil|com|org|net|edu)\b/gi,
  abbrev: /\b(?:U\.S\.?|Nos?\.|Inc\.|Corp\.|Ltd\.|Co\.|e\.g\.|i\.e\.|etc\.|vs\.|Mr\.|Mrs\.|Ms\.|Dr\.|St\.|Jr\.|Sr\.|Fig\.|Sec\.|Art\.|No\.|para\.|approx\.|Dept\.)/gi,
} as const;

const GUARD_DOT = ""; // U+E000 Private Use Area — cannot occur in real solicitation text (code-review card 215) // a period temporarily masked inside a guarded token; restored after splitting
/** Split prose into sentences WITHOUT breaking guarded tokens (decimals · abbreviations · email/URL). */
export function splitSentencesGuarded(text: string): string[] {
  let m = text.replace(PROCEDURAL_SENTENCE_GUARDS.decimal, (_x, a, b) => `${a}${GUARD_DOT}${b}`);
  m = m.replace(PROCEDURAL_SENTENCE_GUARDS.emailUrl, (t) => t.replace(/\./g, GUARD_DOT));
  m = m.replace(PROCEDURAL_SENTENCE_GUARDS.abbrev, (t) => t.replace(/\./g, GUARD_DOT));
  return m.split(/(?<=[.!?])\s+(?=[A-Z("'])/).map((p) => p.split(GUARD_DOT).join(".").trim()).filter(Boolean);
}

const LIST_MARKER = /\n[ \t]*(?:\((?:\d{1,2}|[a-z]|[ivxlcdm]+)\)|\d{1,2}\.|[a-z]\.)[ \t]+/gi;
const STARTS_WITH_MARKER = /^\s*(?:\((?:\d{1,2}|[a-z]|[ivxlcdm]+)\)|\d{1,2}\.|[a-z]\.)\s/i;
/** Segment a section into obligation units: list-markers primary (each numbered/lettered item kept WHOLE,
 *  soft line-wraps rejoined into one line), guarded-sentence fallback for the non-list prose runs. */
export function segmentObligations(text: string): string[] {
  const SB = ""; // U+E001 Private Use Area — cannot occur in real solicitation text (code-review card 215) // unit boundary inserted before each line-start list marker
  const marked = text.replace(LIST_MARKER, (mk) => SB + mk.replace(/^\n[ \t]*/, ""));
  const units: string[] = [];
  for (const chunk of marked.split(SB)) {
    const unwrapped = chunk.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!unwrapped) continue;
    if (STARTS_WITH_MARKER.test(unwrapped)) units.push(unwrapped);           // whole numbered/lettered obligation
    else units.push(...splitSentencesGuarded(unwrapped));                    // prose fallback
  }
  return units;
}

/** Deterministic default extractor — obligation UNITS (≥4 words, obligation verb), verbatim from §L/§M.
 *  A NEW self-contained extractor (does NOT touch the frozen obligationsOf); it only proposes verbatim quotes
 *  which the pass then Rule-64-grounds. Units are whole (list-marker segmentation) — no mid-sentence truncation. */
export const deterministicProceduralExtractor: ProceduralExtractor = async (sections) => {
  const out: ProceduralCandidate[] = [];
  for (const s of sections)
    for (const unit of segmentObligations(s.text)
      .filter((x) => x.split(/\s+/).filter(Boolean).length >= 4 && OBLIGATION_VERB_RE.test(x)).slice(0, 40))
      out.push({ section: s.key, quote: unit });
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
    try { return (await callJSON({ system: sys, user })).candidates ?? []; } catch (err) {
      console.error("[procedural-coverage] model extractor call failed", {
        sections: sections.map((s) => s.key),
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  };
}

/** The pass. Pure control flow; deterministic grounding gate; the only I/O is the injected extractor. */
export async function proceduralCoveragePass(ctx: AuditToolContext, opts?: { extract?: ProceduralExtractor }): Promise<TypedFinding[]> {
  if (procurementPart(ctx) !== "part12-commercial") return [];
  // T0-8 (engine line-audit 2026-07-06) — read the FULL section, not readSection's SECTION_READ_CAP (12k) HEAD.
  // The capped head made this pass emit covered_direct findings grounded only in the head, which short-circuit
  // completenessOf's covered_direct check (audit-orchestrator.ts:452-456) BEFORE its lensTruncated INCOMPLETE
  // guard (:488) — so a long §L/§M's unread tail read COMPLETE. Reading the full section lets the pass ground the
  // tail's obligations too (completenessOf already grounds against sectionFullText), closing the head-only bypass.
  const sections = PROCEDURAL_SECTIONS.map((k) => ({ key: k as string, text: sectionFullText(ctx, k) })).filter((s) => s.text.trim());
  if (!sections.length) return [];
  const extract = opts?.extract ?? deterministicProceduralExtractor;
  let candidates: ProceduralCandidate[] = [];
  // Behaviour here is deliberately unchanged: this pass EMITS covered_direct
  // findings, so an extractor failure yields fewer of them and pushes the verdict
  // toward INCOMPLETE. That is the safe direction, and it is the reason this catch
  // is not the Rule 61 defect the others in this sweep were. What it lacked was a
  // cause — a run that lost every procedural obligation to a thrown extractor was
  // indistinguishable from a solicitation that stated none.
  try { candidates = await extract(sections); } catch (err) {
    console.error("[procedural-coverage] extractor threw; no procedural obligations proposed", {
      sections: sections.map((s) => s.key),
      error: err instanceof Error ? err.message : String(err),
    });
    candidates = [];
  }
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
    const label = c.label || q;
    // Display cap at a WORD boundary + ellipsis (never a mid-word/mid-sentence cut — the excerpt below stays whole).
    const disp = label.length > 150 ? label.slice(0, 150).replace(/\s+\S*$/, "") + "…" : label;
    out.push({
      requirement: `Procedural obligation (§${sec.key}): ${disp}`,
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
