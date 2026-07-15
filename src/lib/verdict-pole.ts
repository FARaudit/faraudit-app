/**
 * verdict-pole.ts — Card #522 Item 4 (R3 recommendation-field retirement)
 *
 * Single source of truth for mapping compliance_json.v3.verdict (the
 * authoritative pole) → the legacy PROCEED/PROCEED_WITH_CAUTION/DECLINE/REVIEW
 * vocabulary that the rest of the UI still speaks.
 *
 * The `audits.recommendation` column is INERT going forward: writers no
 * longer populate it (audit-executor-v3.ts write removed), and all readers
 * call poleToRecommendation() instead of touching the column directly.
 * The column is left in the DB for backward-compatibility with old rows;
 * poleToRecommendation() falls back to it when v3.verdict is absent.
 */

/** The seven verdict strings the agentic-V3 engine can emit. */
export type V3Verdict =
  | "BID"
  | "BID_WITH_CAUTION"
  | "NO_BID"
  | "INELIGIBLE"
  | "NEEDS_HUMAN_REVIEW"
  | "INCOMPLETE"
  | "OUT_OF_SCOPE";

/** Legacy recommendation vocabulary (still used across the UI). */
export type LegacyRecommendation =
  | "PROCEED"
  | "PROCEED_WITH_CAUTION"
  | "DECLINE"
  | "REVIEW";

/**
 * Derive a LegacyRecommendation from an audit row.
 *
 * Priority:
 *   1. compliance_json.v3.verdict  (authoritative pole)
 *   2. row.recommendation          (stale column — fallback for pre-R3 rows)
 *   3. "REVIEW"                    (fail-safe)
 *
 * `row` can be any shape that carries one or both fields — the function
 * never throws; it defaults to "REVIEW" on unexpected input.
 */
export function poleToRecommendation(
  row: {
    compliance_json?: Record<string, unknown> | null | unknown;
    recommendation?: string | null;
    // Convenience: some callers pass a pre-extracted v3_verdict alias
    // (e.g. from a Supabase computed column) instead of the full JSON blob.
    v3_verdict?: string | null;
  }
): LegacyRecommendation {
  // 1. Try the pre-extracted alias first (lightweight path).
  const alias =
    typeof row.v3_verdict === "string" && row.v3_verdict.trim()
      ? row.v3_verdict.trim().toUpperCase()
      : null;

  // 2. Try the full compliance_json blob.
  const cj =
    row.compliance_json != null &&
    typeof row.compliance_json === "object" &&
    !Array.isArray(row.compliance_json)
      ? (row.compliance_json as Record<string, unknown>)
      : null;
  const v3 =
    cj?.v3 != null && typeof cj.v3 === "object" && !Array.isArray(cj.v3)
      ? (cj.v3 as Record<string, unknown>)
      : null;
  const fromV3 =
    v3 != null && typeof v3.verdict === "string" && v3.verdict.trim()
      ? v3.verdict.trim().toUpperCase()
      : null;

  const pole = alias ?? fromV3;

  if (pole) {
    if (pole === "BID") return "PROCEED";
    if (pole === "BID_WITH_CAUTION") return "PROCEED_WITH_CAUTION";
    if (pole === "NO_BID" || pole === "INELIGIBLE") return "DECLINE";
    if (
      pole === "NEEDS_HUMAN_REVIEW" ||
      pole === "INCOMPLETE" ||
      pole === "OUT_OF_SCOPE"
    )
      return "REVIEW";
    // Unknown future verdict — fail safe.
    return "REVIEW";
  }

  // 3. Fall back to the stale column (pre-R3 rows).
  const legacy =
    typeof row.recommendation === "string" && row.recommendation.trim()
      ? (row.recommendation.trim().toUpperCase() as string)
      : null;
  if (legacy === "PROCEED") return "PROCEED";
  if (legacy === "PROCEED_WITH_CAUTION") return "PROCEED_WITH_CAUTION";
  if (legacy === "DECLINE") return "DECLINE";
  if (legacy === "REVIEW") return "REVIEW";

  return "REVIEW";
}
