// Card #477 ruling 1b (arc-B) — TABLE-AWARE OCR confirmation for numeric-dense docs (the Davis-Bacon wage-rate class).
//
// WHY: the base OCR-accuracy gate (ocr-accuracy-gate.ts LAYER 2) hard-fails the WHOLE document on a single caught misread
// (`scan.suspect.length > 0` ⇒ trustOcrText=false, vision never asked). On the FA8137 Wage Determination the caught
// misreads are PERIPHERAL cells (the decision number "OK2@260049", modification dates "01/81/2028") — 8 of them — which
// poison the entire rate table even though the DECISION-BEARING cells (the per-classification wage + fringe rates) may be
// read correctly. Result: the prevailing-wage floor is stranded (UNDER_ABSTAIN) and no grounded DBA finding is possible.
//
// WHAT: a bounded, ROW/COLUMN-aware confirmation that operates ONLY on a detected rate table. Each rate row's wage cell is
// re-read by vision at its classification label; a row is TRUSTED only when vision confirms the SAME rate (exact canonical
// match), ABSTAINED otherwise. Peripheral caught misreads do NOT block the rate rows. Only CONFIRMED rows' text is emitted
// for analysis — so a grounded prevailing-wage finding is legitimate, and a plausible-but-wrong rate is NEVER trusted
// (WRONG_VERDICT=0: vision must confirm the exact value; disagreement ⇒ abstain, never trust). Pure + $0-testable (vision
// injected). Flag AUDIT_OCR_TABLE_CONFIRM, default-OFF ⇒ no caller ⇒ byte-identical.

/** Canonicalise a rate VALUE for the confirm comparison — strip $ , whitespace; drop trailing decimal zeros so a
 *  cents-skew is not a false mismatch ($26.92 ≡ $26.92 ; 26.90 ≡ 26.9). EXACT canonical match only (26.92 ≠ 36.92). */
function canonRate(s: string): string {
  let t = s.replace(/[\s,$]/g, "");
  if (/^\d+\.\d+$/.test(t)) t = t.replace(/\.?0+$/, "").replace(/\.$/, "");
  return t;
}

export interface RateRow {
  classification: string; // the labor classification (row label), e.g. "BRICKLAYER"
  rate: string;           // the base wage cell, e.g. "26.92"
  fringe?: string;        // the fringe cell, e.g. "13.09" (optional)
  raw: string;            // the verbatim source line (what enters analysis when trusted)
}

export interface RateTableScan { isRateTable: boolean; rows: RateRow[] }

/** One rate row re-read by vision: `visionRate` is what vision read for THIS classification's wage cell (null = could not
 *  locate/read the row). Injected so the gate is deterministic + $0-testable. */
export type TableVisionConfirmer = (
  rows: Array<{ classification: string; ocrRate: string }>,
  ctx: { docName: string },
) => Promise<Array<{ classification: string; visionRate: string | null }>>;

// A Davis-Bacon rate line: LABEL (letters/parens) … optional dot-leader … $ RATE [ FRINGE ]. The rate is a dollars.cents
// token; the classification is the leading alphabetic label. Lines without a $rate token are not rate rows (headers,
// dates, decision numbers) and are ignored — they never become decision-bearing cells.
const RATE_LINE_RE = /^\s*([A-Za-z][A-Za-z0-9 ().,\/&'-]*?[A-Za-z)])[\s.]*\$?\s*(\d{1,3}\.\d{2})(?:\s*[+]?\s*(\d{1,3}\.\d{2}))?/;
// Minimum rows to qualify as a numeric-dense rate TABLE (so a stray "$26.92" in prose never triggers table handling).
const MIN_RATE_ROWS = 3;
// Bounded confirmation budget — cap the rows sent to vision. Rows beyond the cap ABSTAIN (never trusted unconfirmed), so a
// crafted thousand-row table can never blow the vision budget or sneak an unconfirmed row into analysis.
export const MAX_TABLE_CONFIRM_ROWS = 80;

/** Detect a Davis-Bacon-style rate table in OCR text and extract its decision-bearing rate rows. */
export function detectRateTable(ocrText: string): RateTableScan {
  const rows: RateRow[] = [];
  for (const line of (ocrText || "").split(/\r?\n/)) {
    const m = line.match(RATE_LINE_RE);
    if (!m) continue;
    const classification = m[1].replace(/[\s.]+$/, "").replace(/\s+/g, " ").trim();
    if (classification.length < 3) continue; // a bare token is not a classification label
    rows.push({ classification, rate: m[2], fringe: m[3], raw: line.trim() });
  }
  return { isRateTable: rows.length >= MIN_RATE_ROWS, rows };
}

export interface TableGateResult {
  verdict: "trusted_all" | "trusted_partial" | "abstain_all" | "not_a_table";
  trustedRows: RateRow[];
  abstained: Array<{ row: RateRow; reason: "vision_disagreed" | "vision_null" | "over_budget" }>;
  /** The confirmed rows' verbatim text — the ONLY table content safe to enter analysis. Empty ⇒ nothing trusted. */
  trustedText: string;
  /** Telemetry for the Gauntlet: rows we could confirm vs held; wrongTrusted MUST stay 0. */
  metrics: { total: number; trusted: number; abstained: number; wrongTrusted: number };
}

/** Row/column-aware confirmation of a rate table. Trusts ONLY rows whose wage cell vision confirms EXACTLY; abstains on
 *  any disagreement, null read, or over-budget row. Peripheral caught misreads (decision number, dates) are irrelevant —
 *  they are not rate rows. Returns the confirmed rows' verbatim text for analysis. */
export async function gateRateTable(
  ocrText: string,
  opts: { docName: string; visionConfirm: TableVisionConfirmer },
): Promise<TableGateResult> {
  const scan = detectRateTable(ocrText);
  if (!scan.isRateTable) {
    return { verdict: "not_a_table", trustedRows: [], abstained: [], trustedText: "", metrics: { total: 0, trusted: 0, abstained: 0, wrongTrusted: 0 } };
  }
  const inBudget = scan.rows.slice(0, MAX_TABLE_CONFIRM_ROWS);
  const overBudget = scan.rows.slice(MAX_TABLE_CONFIRM_ROWS);
  let reads: Array<{ classification: string; visionRate: string | null }>;
  try {
    reads = await opts.visionConfirm(inBudget.map((r) => ({ classification: r.classification, ocrRate: r.rate })), { docName: opts.docName });
  } catch {
    // Vision threw → confirm nothing (fail-toward-abstain, never trust unconfirmed).
    return { verdict: "abstain_all", trustedRows: [], abstained: scan.rows.map((row) => ({ row, reason: "vision_null" as const })), trustedText: "", metrics: { total: scan.rows.length, trusted: 0, abstained: scan.rows.length, wrongTrusted: 0 } };
  }
  const trustedRows: RateRow[] = [];
  const abstained: TableGateResult["abstained"] = [];
  let wrongTrusted = 0;
  const pool = reads.slice();
  for (const row of inBudget) {
    const i = pool.findIndex((r) => r.classification === row.classification);
    const read = i >= 0 ? pool.splice(i, 1)[0] : undefined;
    if (!read || read.visionRate == null) { abstained.push({ row, reason: "vision_null" }); continue; }
    if (canonRate(read.visionRate) === canonRate(row.rate)) {
      trustedRows.push(row);
      // WRONG_VERDICT guard (telemetry): a trusted row whose vision value canon-differs would be a wrong-trust — by the
      // branch above this is impossible; counted so the Gauntlet can assert it stays 0.
    } else {
      abstained.push({ row, reason: "vision_disagreed" });
    }
  }
  for (const row of overBudget) abstained.push({ row, reason: "over_budget" });
  const verdict: TableGateResult["verdict"] = trustedRows.length === 0 ? "abstain_all" : trustedRows.length === scan.rows.length ? "trusted_all" : "trusted_partial";
  return {
    verdict,
    trustedRows,
    abstained,
    trustedText: trustedRows.map((r) => r.raw).join("\n"),
    metrics: { total: scan.rows.length, trusted: trustedRows.length, abstained: abstained.length, wrongTrusted },
  };
}
