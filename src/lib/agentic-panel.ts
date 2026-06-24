// STAGE 6 — Agentic Expert-Panel Judge: the PURE, no-API core (manifest gate + rubric
// grader). Built FIRST (Brain-validated build order 2026-06-24) so the fail-fast guard
// and the quality measure exist + are gate-proven BEFORE any persona prompt or spend.
//
// Two pure pieces here:
//   1) checkManifest      — the MANDATORY PRE-SYNTHESIS GATE. The panel must NOT fire on
//      an incomplete document set (Brain's #1 risk: §M missing → the evaluator emits
//      fluent output against an empty section → a verdict built on fabricated analysis).
//      Hard stop, NOT a rubric dimension. The FA-170 fix at the intelligence layer.
//   2) gradePanelOutput   — the 10-dimension board-room QUALITY rubric. Eligibility (Dim 3)
//      is BINARY (no partial credit on NAICS/size/ostensible-sub/SAM). Ships to a paying
//      customer ONLY if the manifest passed AND eligible AND every quality-GATE dim ≥4 AND
//      the quality-dim average ≥4 — else honest-failure / no-charge.
//
// Live wiring (panelists → verifier → chief judge) lands in 6B/6C; this file stays pure.
// See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 6.

// ── 1) PRE-SYNTHESIS MANIFEST GATE ──────────────────────────────────────────────
/** Binding sections the panel needs to render a TRUSTWORTHY verdict. Missing any ⇒ the
 *  panel does not fire (a verdict without §M/§L is built on nothing). Keys match the
 *  engine's section-detection set (the same that powers decideCoverageChip). */
export const REQUIRED_PANEL_SECTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "C", label: "§C SOW/PWS/SOO (the work)" },
  { key: "L", label: "§L submission instructions" },
  { key: "M", label: "§M evaluation factors" },
  { key: "B", label: "§B CLINs / pricing schedule" },
];

export interface ManifestResult {
  /** TRUE only when every required binding section was detected. */
  ok: boolean;
  /** Section labels that are MISSING — surfaced verbatim in the INCOMPLETE verdict. */
  missing: string[];
  /** The honest banner the chief judge emits when !ok (panel suppressed). */
  statement: string;
}

/** Pure pre-flight check. `detectedSections` = the engine's detected binding-section keys
 *  (e.g. new Set(["C","L","M","B"])). No I/O, no model — gate-testable. */
export function checkManifest(detectedSections: Set<string>): ManifestResult {
  const missing = REQUIRED_PANEL_SECTIONS.filter((s) => !detectedSections.has(s.key)).map((s) => s.label);
  const ok = missing.length === 0;
  return {
    ok,
    missing,
    statement: ok
      ? "All binding sections present — panel may evaluate."
      : `INCOMPLETE — MISSING ${missing.join(" · ")}. Panel suppressed: a verdict cannot be rendered on an incomplete document set (no charge).`,
  };
}

// ── 2) 10-DIMENSION BOARD-ROOM QUALITY RUBRIC ───────────────────────────────────
/** The 10 dimensions. `kind`:
 *  - "eligibility" = Dim 3, BINARY pass/fail (no partial credit; a fail ⇒ INELIGIBLE).
 *  - "gate"        = a 1–5 dim that MUST be ≥4 to ship (auto-fail triggers floor it to 1).
 *  - "quality"     = a 1–5 dim; the quality AVERAGE must be ≥4 to ship. */
export type DimKind = "eligibility" | "gate" | "quality";
export interface RubricDimension {
  id: number;
  key: string;
  name: string;
  kind: DimKind;
  autoFail: string; // the trigger that hard-floors this dim (for the persona prompts in 6A-ii)
}

export const RUBRIC: ReadonlyArray<RubricDimension> = [
  { id: 1, key: "eval_scheme_read", name: "§M evaluation-scheme read", kind: "gate", autoFail: "procurement-type mismatch (LPTA scored as best-value tradeoff or vice versa)" },
  { id: 2, key: "compliance_completeness", name: "§L compliance completeness", kind: "gate", autoFail: "an orphaned 'shall' or a missed page-limit that could trigger non-evaluation" },
  { id: 3, key: "eligibility_detection", name: "Hard-gate / eligibility detection", kind: "eligibility", autoFail: "a present hard gate the bidder cannot meet is not flagged (BINARY — fail ⇒ INELIGIBLE)" },
  { id: 4, key: "risk_identification", name: "Risk identification (the bid-losers)", kind: "quality", autoFail: "" },
  { id: 5, key: "pricing_terms_risk", name: "Pricing & terms risk", kind: "quality", autoFail: "never reads the WD / option-year line items (the banned summarization shortcut)" },
  { id: 6, key: "grounding", name: "Grounding / anti-fabrication", kind: "gate", autoFail: "any fabricated requirement or nonexistent-clause citation (hard-floor to 1)" },
  { id: 7, key: "verdict_justification", name: "Verdict justification quality", kind: "quality", autoFail: "" },
  { id: 8, key: "honest_gaps", name: "Honest handling of gaps", kind: "gate", autoFail: "a partial analysis that claims completeness" },
  { id: 9, key: "actionability", name: "Actionability", kind: "quality", autoFail: "" },
  // Dim 10 — Brain-added 2026-06-24: small businesses are eliminated on ADMIN grounds
  // before technical eval; §L (#2) is proposal STRUCTURE, this is submission MECHANICS.
  { id: 10, key: "submission_logistics", name: "Submission-logistics completeness", kind: "quality", autoFail: "" },
];

const GATE_SHIP_MIN = 4;     // every quality-GATE dim must be ≥ this
const QUALITY_AVG_MIN = 4;   // the quality-dim AVERAGE must be ≥ this

export interface DimScore {
  key: string;
  /** 1–5 for "gate"/"quality" dims. */
  score?: number;
  /** for the BINARY eligibility dim (Dim 3) only. */
  pass?: boolean;
  /** if the auto-fail trigger fired, this dim is hard-floored to 1 (gate dims). */
  autoFailed?: boolean;
}

export interface PanelGrade {
  /** Ships to a paying customer? manifest ok AND eligible AND gates ≥4 AND quality avg ≥4. */
  ships: boolean;
  /** BINARY eligibility (Dim 3). false ⇒ INELIGIBLE verdict overrides everything. */
  eligible: boolean;
  /** quality-gate dims that fell below 4 (or auto-failed) — the blockers, named. */
  failedGates: string[];
  qualityAverage: number;
  /** the customer-facing outcome line. */
  verdict: "SHIP" | "INELIGIBLE" | "HONEST_FAILURE";
  reason: string;
}

/** Grade a panel's per-dimension scores against the rubric. Pure. `manifestOk` is the
 *  result of checkManifest (a failed manifest can NEVER ship — short-circuits). */
export function gradePanelOutput(scores: DimScore[], manifestOk: boolean): PanelGrade {
  const byKey = new Map(scores.map((s) => [s.key, s]));
  const eff = (d: RubricDimension): number => {
    const s = byKey.get(d.key);
    if (!s) return 0;                 // unscored dim = treat as a miss, never a free pass
    if (s.autoFailed) return 1;       // auto-fail trigger hard-floors to 1
    return s.score ?? 0;
  };

  // Dim 3 — binary eligibility.
  const elig = byKey.get("eligibility_detection");
  const eligible = elig?.pass === true;

  // Quality-gate dims (must each be ≥4).
  const gateDims = RUBRIC.filter((d) => d.kind === "gate");
  const failedGates = gateDims.filter((d) => eff(d) < GATE_SHIP_MIN).map((d) => d.name);

  // Quality dims (average ≥4).
  const qualityDims = RUBRIC.filter((d) => d.kind === "quality");
  const qualityAverage = qualityDims.length
    ? qualityDims.reduce((sum, d) => sum + eff(d), 0) / qualityDims.length
    : 0;

  let verdict: PanelGrade["verdict"];
  let reason: string;
  if (!manifestOk) {
    verdict = "HONEST_FAILURE";
    reason = "Pre-synthesis manifest gate failed — incomplete document set, panel suppressed (no charge).";
  } else if (!eligible) {
    verdict = "INELIGIBLE";
    reason = "Hard-gate/eligibility (Dim 3) = FAIL — INELIGIBLE regardless of all other dimensions.";
  } else if (failedGates.length > 0) {
    verdict = "HONEST_FAILURE";
    reason = `Quality-gate dimension(s) below ${GATE_SHIP_MIN}: ${failedGates.join(" · ")} — honest failure, no charge.`;
  } else if (qualityAverage < QUALITY_AVG_MIN) {
    verdict = "HONEST_FAILURE";
    reason = `Quality average ${qualityAverage.toFixed(2)} < ${QUALITY_AVG_MIN} — not board-room grade, honest failure (no charge).`;
  } else {
    verdict = "SHIP";
    reason = `Board-room grade: eligible · all gates ≥${GATE_SHIP_MIN} · quality avg ${qualityAverage.toFixed(2)}.`;
  }

  return { ships: verdict === "SHIP", eligible, failedGates, qualityAverage, verdict, reason };
}
