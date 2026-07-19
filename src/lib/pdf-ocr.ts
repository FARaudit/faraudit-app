// Stage 2 — Parse-tier OCR fallback ($0 self-host, 2026-06-22).
//
// Why this exists: the native PDF text layer is sometimes MISSING (true image
// scan) or GARBLED (broken font/encoding — e.g. N4008526R0065's CBA extracted
// 48k chars of "ÿ12345621ÿ78…" junk). In both cases the engine previously fell
// back to expensive, page-limited Opus VISION to read the doc. A dedicated OCR
// tier reads those docs into CLEAN text for ~$0 (self-hosted Tesseract via
// ocrmypdf), removing the vision dependency, the page/size ceilings, and the
// garbled-text blind spot — all at once.
//
// Decoupling principle: Opus is the brain; reading is a tool's job. This is the
// reading tool. Production can swap ocrmypdf for a managed FedRAMP parser
// (AWS Textract) behind the same interface (ocrPdfToText) — see OCR_PROVIDER.
//
// Portability: ocrmypdf is a system binary present on the audit WORKER container
// only. Anywhere it's absent (Vercel serverless), ocrPdfToText returns null and
// the caller keeps the native text — never crashes, never blocks.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isEnvOn } from "./env-flags";

// Hard cap so a pathological scan can't hang the audit. OCR of a normal
// solicitation attachment finishes well under this.
const OCR_TIMEOUT_MS = 120_000;

// Common-English-word density: clean government prose carries many of these per
// 1k chars; a garbled font dump carries almost none. Used to detect a text layer
// that is technically present but unreadable (the CBA case).
const COMMON_WORDS_RE =
  /\b(?:the|and|of|to|for|in|on|by|with|shall|contract|agreement|services|or|is|are|be|this|that|all|as|will|not|any|per|from|under|section)\b/gi;

/** True when text is long enough to judge but reads as garbled (font/encoding
 *  junk) rather than real language — so we should OCR despite a "present" layer. */
export function looksGarbled(text: string): boolean {
  const sample = (text ?? "").slice(0, 20_000);
  const len = sample.replace(/\s+/g, "").length;
  if (len < 300) return false; // too short to judge here; the low-yield path handles it
  const commonHits = (sample.match(COMMON_WORDS_RE) || []).length;
  // DENOMINATOR (flag AUDIT_TXT_INGEST): the metric is "common words per 1k chars
  // of TEXT", but the legacy divisor is sample.length INCLUDING whitespace. A
  // clean columnar layout (SCA wage determinations, CLIN/price tables) is ~50-60%
  // whitespace padding, which halves the density and false-flags real text as
  // garbled — the exact defect that keeps CBP's wage determinations out. Whitespace
  // is not mojibake, so dividing by non-whitespace text length (`len`) is correct.
  // True mojibake has ~0 common words regardless of divisor, so the garble catch
  // is preserved. Flag-OFF ⇒ legacy divisor ⇒ byte-identical.
  const per1k = commonHits / ((isEnvOn(process.env.AUDIT_TXT_INGEST) ? len : sample.length) / 1000);
  // Clean gov text ≈ 15–40 common words / 1k chars; garbled ≈ 0. 3 is a safe floor.
  return per1k < 3;
}

// POSITIVE mojibake detector (Phase 3 Unit #12) — for the obligation garble FLOOR, where OVER-FIRE is the dangerous failure.
// `looksGarbled` keys on common-English-WORD density, which clean wage/CLIN/price tables, clause-number lists, and acronym
// blocks are LOW on BY NATURE (Gauntlet R1 F: it false-INCOMPLETEs exactly those clean classes). The right axis is a POSITIVE
// CORRUPTION signal that clean ASCII text scores ~0 on: the density of characters that clean gov text essentially never
// contains. Two arms, either fires:
//   (A) HARD-corruption chars — C0 controls (except tab), the C1 block 0x80–0x9f (never in valid UTF-8 prose), the replacement
//       char U+FFFD — at ≥2% density. Clean text (tables, codes, §/•/em-dash/accents) has 0% of these ⇒ ZERO over-fire.
//   (B) non-ASCII NON-LETTER symbol density ≥25% — INCOHERENCE, not density (Gauntlet R2): a printable-Latin-1 font-dump
//       ("¬þ Æ¢Ø¡™ ½¾¿ ×÷…") is a SYMBOL SALAD (¬¢¡™½¾¿×÷ are non-letter) ⇒ floors; but legit NON-LATIN CLEAN text (a
//       bilingual notice, Vietnamese "Nguyễn Thị Hương", accented names) is COHERENT LETTERS — non-ASCII but Unicode
//       letters — which are EXCLUDED from the count, so coherent foreign script NEVER floors (R2 P1/P2/P3 fix). A §/•/—/°/±
//       -sprinkled clean section stays well under 25% symbol density. A homoglyph that stays mostly clean Latin-1 letters is
//       a SAFE UNDER-fire (stays covered = status quo), the correct posture when the dangerous failure is over-fire.
// Independent of AUDIT_TXT_INGEST (no density denominator) ⇒ no cross-flag coupling. <300 non-ws chars ⇒ not judged (the
// relief valve is intended for genuinely-thin sections).
// LAYOUT/STRUCTURAL glyphs a clean document legitimately uses in tables, ToCs and typeset prose — box-drawing/block/geometric
// (table borders, ■□ checkboxes), general punctuation (en/em dash, curly quotes, bullets, ellipsis, dot leaders), arrows, and
// § ¶ ° · (Gauntlet R2-cert): EXCLUDED from arm B, because a clean box-drawing table or a dot-leader ToC is not a mojibake
// SALAD — real mojibake is Latin-1-symbols/math/currency/misc, not layout. (Coherent foreign LETTERS \p{L} are already excluded.)
const fdIsLayoutGlyph = (c: number): boolean =>
  c === 0xa7 || c === 0xb0 || c === 0xb6 || c === 0xb7 ||          // § ° ¶ ·
  (c >= 0x2000 && c <= 0x206f) ||                                  // general punctuation (dashes, curly quotes, bullets, ellipsis, dot leaders)
  (c >= 0x2190 && c <= 0x21ff) ||                                  // arrows
  (c >= 0x2500 && c <= 0x25ff);                                    // box-drawing + block elements + geometric shapes (borders/bullets/checkboxes)
export function looksMojibake(text: string): boolean {
  const chars = [...(text ?? "").replace(/\s+/g, "")];
  if (chars.length < 300) return false;
  let hard = 0, symGarble = 0;
  for (const ch of chars) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 && c !== 0x09) { hard++; continue; }               // C0 control (not tab)
    if (c <= 0x7e) continue;                                         // basic ASCII (clean tables/codes/prose)
    if ((c >= 0x80 && c <= 0x9f) || c === 0xfffd) { hard++; continue; } // C1 block / U+FFFD — never in valid prose
    if (fdIsLayoutGlyph(c)) continue;                               // legit table/ToC/typographic layout glyph — not a mojibake salad
    if (!/\p{L}/u.test(ch)) symGarble++;                            // non-ASCII NON-LETTER, NON-layout symbol (mojibake salad); coherent foreign LETTERS excluded
  }
  const n = chars.length;
  return hard / n >= 0.02 || symGarble / n >= 0.25;
}

let _ocrAvailable: boolean | null = null;
/** Probe whether the self-host OCR binary exists (cached). */
export async function ocrAvailable(): Promise<boolean> {
  if (_ocrAvailable !== null) return _ocrAvailable;
  _ocrAvailable = await new Promise<boolean>((resolve) => {
    execFile("ocrmypdf", ["--version"], { timeout: 10_000 }, (err) => resolve(!err));
  });
  return _ocrAvailable;
}

/**
 * OCR a PDF into clean text using self-hosted Tesseract (via ocrmypdf --sidecar).
 * Returns the OCR'd text, or null when OCR tooling is unavailable or fails
 * (caller keeps the native extraction — graceful, never throws).
 */
export async function ocrPdfToText(pdfBuffer: Buffer): Promise<string | null> {
  if (!(await ocrAvailable())) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "faocr-"));
    const inPdf = join(dir, "in.pdf");
    const outPdf = join(dir, "out.pdf");
    const sidecar = join(dir, "text.txt");
    await writeFile(inPdf, pdfBuffer);
    await new Promise<void>((resolve, reject) => {
      execFile(
        "ocrmypdf",
        // --force-ocr: re-OCR even when a (garbled) text layer exists.
        // --sidecar: write the recognized text to a file.
        // --output-type pdf + --optimize 0: fast, we only want the sidecar text.
        ["--force-ocr", "--sidecar", sidecar, "--output-type", "pdf", "--optimize", "0", inPdf, outPdf],
        { timeout: OCR_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    const text = await readFile(sidecar, "utf8");
    return text && text.trim().length > 0 ? text : null;
  } catch {
    return null; // unavailable / timeout / OCR error → caller keeps native text
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
