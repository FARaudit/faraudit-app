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
  const per1k = commonHits / (sample.length / 1000);
  // Clean gov text ≈ 15–40 common words / 1k chars; garbled ≈ 0. 3 is a safe floor.
  return per1k < 3;
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
