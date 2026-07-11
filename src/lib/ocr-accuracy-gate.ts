// Lever-3 STEP-2 — OCR-accuracy GATE: the layer-2 → layer-3 → layer-4 decision that says whether an OCR-recovered
// document may be TRUSTED (its `has_text` allowed to flip false→true, so its content counts toward a committal
// verdict) or must FAIL TOWARD NHR (stay content-loss → the completeness contract caps the verdict at INCOMPLETE,
// never committal). Brain ruling on Card #415: OPTION A — 2-tier fallback, vision RETAINED. Layer-1 (tesseract-TSV
// confidence) dropped as not load-bearing; the gate ships as:
//
//   LAYER 2 (ocr-token-validation.ts) — deterministic structural partition of decision-bearing tokens:
//              suspect_misread (structurally impossible → a CAUGHT OCR error) vs valid_format RESIDUAL (plausible but
//              NOT proven correct — the format-VALID-misread class: 52.212-1→52.212-7, $1,300→$1,800, a valid wrong date).
//   LAYER 3 (this module, vision injected) — a CAUGHT-token is untrustworthy by construction; the format-valid residual
//              is committal-critical and must be CONFIRMED by a narrow vision read of the SAME document. The deterministic
//              anchor runs FIRST; vision is a CONFIRMER of the residual, NEVER a co-equal second reader that votes
//              (Brain BUILD CONSTRAINT 1). Disagreement is not resolved by majority — it fails toward NHR.
//   LAYER 4 (this module) — fail-toward-NHR: any decision-bearing token left unresolved (caught, or residual that vision
//              did not confirm, or no vision available) → the doc is NOT trusted → routes to NHR/INCOMPLETE, never
//              committal (Brain BUILD CONSTRAINT 2). A false INCOMPLETE degrades UX; a false COMPLETE is catastrophic.
//
// The gate is PURE + $0-testable: `visionConfirm` is injected. The deterministic layers (2 + no-vision layer-4) run in
// the ingest path (pdf-text-extractor → sam-attachments has_text); the vision-confirm layer-3 runs in the executor,
// which owns model access + the doc base64 (see executeAgenticPrimary).

import { scanOcrExcerpt, validateToken, type ExcerptScan, type TokenVerdict } from "./ocr-token-validation";

export type OcrTrustReason =
  | "clean_no_decision_tokens" // no committal-critical token rides on the OCR read → trust it as-is
  | "suspect_caught" // LAYER 2 caught a structurally-impossible misread → never trust
  | "residual_no_vision" // format-valid residual, no vision confirmer available → conservative fail-toward-NHR
  | "vision_confirmed" // LAYER 3 vision confirmed every residual token → trust
  | "vision_disagreed" // vision read a different value / could not read a residual token → fail-toward-NHR
  | "vision_error"; // vision confirmer threw → fail-toward-NHR

export interface OcrGateVerdict {
  /** true → the OCR text may be TRUSTED (has_text allowed to flip true, content counts toward committal).
   *  false → FAIL TOWARD NHR (doc stays content-loss → completeness caps the verdict at INCOMPLETE). */
  trustOcrText: boolean;
  reason: OcrTrustReason;
  scan: ExcerptScan;
  /** Human-readable one-liner for the ingest warning + the audit trail. */
  detail: string;
}

/** One residual token re-read by vision: `token` is the OCR-read value we asked vision to confirm; `visionValue` is
 *  what vision actually read AT THAT LOCATION (null = vision could not locate/read it). */
export interface VisionTokenRead {
  token: string;
  visionValue: string | null;
}

/** Narrow vision confirmer: given the format-valid residual tokens (and the doc name for the prompt), read each one
 *  back from the document image and report what vision sees. Injected so the gate is deterministic + $0-testable. */
export type VisionConfirmer = (
  residual: TokenVerdict[],
  ctx: { docName: string },
) => Promise<VisionTokenRead[]>;

/** Canonicalise a token VALUE for the confirm comparison: strip $, commas, whitespace; upper-case; and for a pure
 *  decimal number drop a trailing bare "." and trailing decimal zeros so a cents-representation skew is not a false
 *  mismatch ($1,300 ≡ $1,300.00 ≡ $1,300.0 → "1300"; $1,300.50 → "1300.5"). A confirm is an EXACT canonical-value
 *  match — we check the OCR read against the vision read, never similarity (52.212-1 ≠ 52.212-7; $1,300 ≠ $1,800).
 *  Only pure decimals are decimal-normalised, so clause "52.212-1" and date "08/15/2027" are untouched. */
function canon(s: string): string {
  let t = s.replace(/[\s,$]/g, "").toUpperCase();
  if (/^\d+\.\d+$/.test(t)) t = t.replace(/\.?0+$/, "").replace(/\.$/, ""); // 1300.00→1300 · 1300.50→1300.5
  return t;
}

/** Reconcile residual tokens against vision reads and return the UNCONFIRMED subset. Matching is by EXACT RAW token
 *  string with CONSUMPTION (each vision read pairs to at most one token) — never by canonical value, so two distinct
 *  raw tokens that canonicalise alike ($1,300 vs $1300) can NEVER borrow each other's read (the false-COMPLETE the
 *  norm-keyed Map allowed). A token is CONFIRMED only when its paired read exists, is non-null, and canon-matches the
 *  token; a missing/null/different read → unconfirmed → fail-toward-NHR. */
function unconfirmedTokens(tokens: TokenVerdict[], reads: VisionTokenRead[]): TokenVerdict[] {
  const pool = reads.slice();
  const out: TokenVerdict[] = [];
  for (const v of tokens) {
    const i = pool.findIndex((r) => r.token === v.token);
    const r = i >= 0 ? pool.splice(i, 1)[0] : undefined;
    if (!r || r.visionValue == null || canon(r.visionValue) !== canon(v.token)) out.push(v);
  }
  return out;
}

/**
 * Decide whether an OCR-recovered document's text may be trusted for a committal verdict.
 * Deterministic when `visionConfirm` is omitted (ingest-path layers 2 + 4). With `visionConfirm`, adds layer-3.
 */
export async function gateOcrText(
  ocrText: string,
  opts: { docName: string; visionConfirm?: VisionConfirmer },
): Promise<OcrGateVerdict> {
  const scan = scanOcrExcerpt(ocrText);

  // LAYER 2 → LAYER 4. A structurally-impossible token (digit-slot letter, out-of-range date) is a CAUGHT misread.
  // Vision cannot rehabilitate a read we already know is broken — the whole OCR read of this doc is untrustworthy.
  if (scan.suspect.length > 0) {
    return {
      trustOcrText: false,
      reason: "suspect_caught",
      scan,
      detail: `layer-2 caught ${scan.suspect.length} structurally-impossible token(s) [${scan.suspect.slice(0, 3).map((s) => s.token).join(", ")}] → OCR read not trusted (fail-toward-NHR)`,
    };
  }

  // No committal-critical token rides on this OCR read → nothing to fabricate. Trust the clean text.
  if (scan.validUnverified.length === 0) {
    return { trustOcrText: true, reason: "clean_no_decision_tokens", scan, detail: "no decision-bearing tokens in OCR text → trusted" };
  }

  // LAYER 3. Format-valid residual is plausible but NOT proven — the format-valid-misread class. It is committal-
  // critical, so it MUST be confirmed by a vision read of the same document before the OCR text is trusted.
  if (!opts.visionConfirm) {
    // Conservative default (deterministic ingest path): no vision available → cannot confirm → fail-toward-NHR.
    return {
      trustOcrText: false,
      reason: "residual_no_vision",
      scan,
      detail: `${scan.validUnverified.length} format-valid committal-critical token(s) unconfirmed (no vision) → fail-toward-NHR`,
    };
  }

  let reads: VisionTokenRead[];
  try {
    reads = await opts.visionConfirm(scan.validUnverified, { docName: opts.docName });
  } catch (e) {
    return { trustOcrText: false, reason: "vision_error", scan, detail: `vision confirm threw → fail-toward-NHR: ${(e as Error).message}` };
  }

  // A residual token is CONFIRMED only when vision read the SAME value at that location. Missing read, null read, or
  // a DIFFERENT value → unconfirmed. Any unconfirmed committal-critical token → NHR. This is NOT a vote between two
  // readers: the deterministic anchor already passed; disagreement means we cannot CERTIFY, and uncertain
  // certification fails toward NHR (never committal). Exact-raw matching (unconfirmedTokens) so two tokens that
  // canonicalise alike can never cross-confirm.
  const unconfirmed = unconfirmedTokens(scan.validUnverified, reads);
  if (unconfirmed.length > 0) {
    return {
      trustOcrText: false,
      reason: "vision_disagreed",
      scan,
      detail: `vision did not confirm ${unconfirmed.length}/${scan.validUnverified.length} residual token(s) [${unconfirmed.slice(0, 3).map((v) => v.token).join(", ")}] → fail-toward-NHR`,
    };
  }

  return { trustOcrText: true, reason: "vision_confirmed", scan, detail: `vision confirmed all ${scan.validUnverified.length} residual token(s) → trusted` };
}

/** Deterministic ingest-path verdict (layers 2 + 4, NO vision) — the conservative default used where the model is not
 *  available (pdf-text-extractor / sam-attachments). Any decision-bearing token that is caught OR merely format-valid
 *  is treated as unresolved → the doc is a hard content-loss until the executor's layer-3 vision confirms the residual.
 *  Returns { hardFail, residual } so the executor knows which docs to escalate to vision. */
// Bound the residual array that is PERSISTED on the ingestion record. A crafted scanned doc dense in format-valid
// tokens would otherwise store a multi-thousand-element array. Anything above this already fails-toward-NHR (the
// vision confirmer caps its own read set and an over-cap doc holds content-loss), so the extra tokens carry no signal
// — dropping the residual to [] keeps hardFail=true (still a content-loss) while bounding storage. Kept ≥ the vision
// confirmer's per-call cap so a legitimately-recoverable doc is never truncated here.
export const MAX_STORED_RESIDUAL = 40;

export function ocrDeterministicGate(scan: ExcerptScan): { hardFail: boolean; residual: string[] } {
  // hardFail when ANYTHING decision-bearing is unresolved: a caught misread OR an unconfirmed format-valid residual.
  const hardFail = scan.suspect.length > 0 || scan.validUnverified.length > 0;
  // Only the RESIDUAL (format-valid, could be silently wrong) is vision-recoverable; caught misreads are not. An
  // over-cap residual set is itself suspicious → drop to [] so the doc hard-fails (content-loss) without vision and
  // without bloating storage.
  const residual = scan.suspect.length > 0 || scan.validUnverified.length > MAX_STORED_RESIDUAL
    ? []
    : scan.validUnverified.map((v) => v.token);
  return { hardFail, residual };
}

/** LAYER 3 (executor). Given the format-valid residual token strings a deterministic-gate doc is holding at
 *  has_text=false, ask vision to read each back and decide whether the OCR read may now be TRUSTED. Returns
 *  confirmed=true ONLY when vision confirms EVERY residual token (exact normalised match). Any missing / null /
 *  different vision read → confirmed=false → the doc stays content-loss (fail-toward-NHR). This is the CONFIRMER,
 *  not a co-voter — disagreement never resolves to committal. A residual token that is not a recognised decision
 *  class (should not happen — it came from layer-2) is treated as UNCONFIRMABLE → confirmed=false (safe). */
export async function confirmResidualTokens(
  residual: string[],
  visionConfirm: VisionConfirmer,
  ctx: { docName: string },
): Promise<{ confirmed: boolean; detail: string }> {
  if (residual.length === 0) return { confirmed: true, detail: "no residual tokens to confirm" };
  const verdicts: TokenVerdict[] = [];
  for (const t of residual) {
    const v = validateToken(t);
    // A residual token that no longer validates as format-valid is not confirmable by the narrow reader → unsafe.
    if (!v || v.status !== "valid_format") return { confirmed: false, detail: `residual token "${t}" is not a confirmable format-valid class → fail-toward-NHR` };
    verdicts.push(v);
  }
  let reads: VisionTokenRead[];
  try {
    reads = await visionConfirm(verdicts, ctx);
  } catch (e) {
    return { confirmed: false, detail: `vision confirm threw → fail-toward-NHR: ${(e as Error).message}` };
  }
  const unconfirmed = unconfirmedTokens(verdicts, reads);
  if (unconfirmed.length > 0) {
    return { confirmed: false, detail: `vision did not confirm ${unconfirmed.length}/${verdicts.length} residual token(s) [${unconfirmed.slice(0, 3).map((v) => v.token).join(", ")}] → fail-toward-NHR` };
  }
  return { confirmed: true, detail: `vision confirmed all ${verdicts.length} residual token(s) → OCR read trusted` };
}
