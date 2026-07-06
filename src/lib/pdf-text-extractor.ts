// Component 1 — PDF Text Extractor (Cycle 2 document-extraction rebuild)
//
// Brain ruling 2026-06-07: facts come from the document, not from the model.
// This module is the deterministic text-extraction layer that feeds the
// section-boundary-detector. No LLM involvement; same input → same output.
//
// Used by: section-boundary-detector, audit-engine (after Session 2 wiring).

export interface PageText {
  pageNum: number;
  text: string;
  lines: string[];
}

import { ocrPdfToText, looksGarbled } from "./pdf-ocr";

export interface ExtractedDocument {
  pages: PageText[];
  rawText: string;
  pageCount: number;
  extractionMethod: "pdf-parse" | "pdfjs" | "ocr" | "fallback";
  warnings: string[];
  // FA-INGEST (2026-07-06) — a multi-page doc whose extractable text sits on
  // only a MINORITY of pages is a mixed cover(text)+body(scanned) document: the
  // readable cover clears the whole-doc text floor and MASKS a scanned body the
  // text-only engine never receives. True here → the completeness contract must
  // read the doc as content-loss (honest INCOMPLETE), NOT green off the cover
  // text alone (see hasEngineText consumers in sam-attachments). Only ever set
  // from reliable per-page structure (pdf-parse v2 pages[]); OCR-recovered and
  // single-block reads leave it undefined (falsy).
  partialPageText?: boolean;
}

// Reliable per-page floor for the mixed cover+scanned detection above. A page
// under this many meaningful chars is treated as image-only (no readable text).
const MIN_PAGE_MEANINGFUL_CHARS = 10;

// Detect the mixed cover(text)+body(scanned) case from RELIABLE per-page text.
// Conservative by design — a false INCOMPLETE degrades UX, a false COMPLETE is
// catastrophic, so we require ≥3 pages AND a STRICT scanned majority: a normal
// doc with one blank signature/divider page (majority still text) never flags,
// but a 1-text-cover + N-scanned-body doc does. Callers MUST only pass pages
// from real per-page extraction (pdf-parse v2) — buildPageStructure drops empty
// pages, so a form-feed/single-block split cannot be trusted here.
export function isPartialPageText(pages: PageText[]): boolean {
  if (pages.length < 3) return false;
  const withText = pages.filter((p) => meaningfulCharCount(p.text) >= MIN_PAGE_MEANINGFUL_CHARS).length;
  return withText >= 1 && withText * 2 < pages.length;
}

// SINGLE SOURCE OF TRUTH for the text-vs-vision delivery decision (2026-06-21).
// A doc with at least this many MEANINGFUL extracted chars rides as a TEXT block
// (~text cost); below it it's treated as image-only and delivered as base64-PDF
// VISION. Both the engine (textForDocOrNull) and the assembly page budget
// (isTextDeliverable) MUST use these so the two decisions can never drift — a doc
// page-exempted in one place but delivered as vision in the other would silently
// re-break the FA-INGEST page-budget fix.
export const MIN_TEXT_CHARS_FOR_TEXT_BLOCK = 200;

// Meaningful-char measure: strip page-separator padding lines ("-- 3 of 50 --")
// that an image scan emits but carry no content.
export function meaningfulCharCount(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[\s\-–—=_·.*]*(?:page\s*)?\d+\s*(?:of|\/)\s*\d+[\s\-–—=_·.*]*$/i.test(l))
    .join("\n").length;
}

export async function extractText(pdfBuffer: Buffer): Promise<ExtractedDocument> {
  const warnings: string[] = [];

  try {
    // pdf-parse@^2.x exports default differently than v1; handle both.
    // v2 exposes a class-based PDFParse with getText(); v1 exposes a callable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseMod = require("pdf-parse");
    const PdfParseCtor = pdfParseMod?.PDFParse ?? pdfParseMod?.default ?? pdfParseMod;
    // [PDF-DIAG] (2026-07-06, temporary) — the audit-worker container read ALL attachments
    // has_text=false while this exact commit extracts them fine locally. Every doc (PDF + docx-
    // via-wrapped-PDF) funnels through pdf-parse here, so this pins the container failure:
    // module-load vs wrong-shape vs empty-yield vs throw. Remove once the cause is fixed.
    console.error(`[PDF-DIAG] require pdf-parse: mod=${typeof pdfParseMod} ctor=${typeof PdfParseCtor} bytes=${pdfBuffer.length} magic=${pdfBuffer.subarray(0, 5).toString("latin1")}`);
    let rawText = "";
    let pageCount = 1;

    if (typeof PdfParseCtor === "function") {
      // pdf-parse v2 returns { pages: Array<{ text, num }>, text, total }
      // pdf-parse v1 returns { text, numpages, ... } from a callable
      let pagesArr: Array<{ text?: string; num?: number }> | null = null;
      try {
        const inst = new PdfParseCtor({ data: pdfBuffer });
        if (typeof inst.getText === "function") {
          const out = await inst.getText();
          rawText = String(out?.text ?? "");
          if (Array.isArray(out?.pages)) pagesArr = out.pages;
          pageCount = Array.isArray(out?.pages) ? out.pages.length : Number(out?.numpages ?? 1);
        } else {
          const out = await PdfParseCtor(pdfBuffer);
          rawText = String(out?.text ?? "");
          pageCount = Number(out?.numpages ?? 1);
        }
      } catch {
        const out = await PdfParseCtor(pdfBuffer);
        rawText = String(out?.text ?? "");
        pageCount = Number(out?.numpages ?? 1);
      }

      if (!Number.isFinite(pageCount) || pageCount < 1) pageCount = 1;
      // FA-131 — page-separator/padding lines ("-- 3 of 50 --") are extractor
      // artifacts, not document text. A pure image scan can emit hundreds of
      // chars of them and defeat the <50 threshold, so measure meaningful
      // chars with separator lines stripped.
      const meaningfulLength = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/^[\s\-–—=_·.*]*(?:page\s*)?\d+\s*(?:of|\/)\s*\d+[\s\-–—=_·.*]*$/i.test(l))
        .join("\n").length;
      if (!rawText || meaningfulLength < 50) {
        warnings.push(`LOW_TEXT_YIELD: extracted only ${meaningfulLength} meaningful chars (${rawText.length} raw) — possible scanned/image PDF`);
      }

      // Prefer v2 per-page structure when available; fall back to form-feed
      // split or single-block reconstruction.
      const pages = pagesArr
        ? pagesArr.map((p, i) => {
            const text = String(p?.text ?? "").trim();
            return {
              pageNum: Number(p?.num ?? i + 1),
              text,
              lines: text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0),
            };
          })
        : buildPageStructure(rawText, pageCount);

      // Mixed cover(text)+body(scanned) detection — ONLY from pdf-parse's real
      // per-page text (pagesArr). buildPageStructure drops empty pages, so its
      // pages[] can't expose the scanned gaps and must not be trusted here.
      const partialFromPages = pagesArr ? isPartialPageText(pages) : false;

      // Stage-2 parse-tier OCR fallback (2026-06-22). The native layer is either
      // MISSING (true scan → low meaningful chars) or GARBLED (present but
      // unreadable font/encoding junk — N4008526R0065's CBA). In both cases OCR
      // recovers clean text for ~$0, removing the Opus-vision dependency. OCR is
      // attempted ONLY when needed, used ONLY when it's genuinely better, and is a
      // graceful no-op where the OCR binary is absent (e.g. serverless).
      // partialFromPages ALSO triggers OCR: a mixed cover+scanned doc clears the
      // whole-doc floor (cover text) so the first two conditions miss it, but its
      // scanned body still needs OCR to recover. Where OCR is a no-op (serverless,
      // binary absent) the flag rides through on the return below → honest INCOMPLETE.
      const needsOcr = meaningfulLength < MIN_TEXT_CHARS_FOR_TEXT_BLOCK || looksGarbled(rawText) || partialFromPages;
      if (needsOcr) {
        const ocrText = await ocrPdfToText(pdfBuffer);
        if (ocrText && meaningfulCharCount(ocrText) > meaningfulLength && !looksGarbled(ocrText)) {
          warnings.push(
            `OCR parse-tier applied: native text was ${looksGarbled(rawText) ? "garbled" : "missing"} (${meaningfulLength} meaningful chars) → recovered ${meaningfulCharCount(ocrText)} clean chars via self-host OCR.`
          );
          return {
            pages: buildPageStructure(ocrText, pageCount),
            rawText: ocrText,
            pageCount,
            extractionMethod: "ocr",
            warnings,
          };
        }
      }

      // Reached here means OCR did NOT recover (fits-under-floor whole read, or
      // OCR was a no-op / not better). If per-page text was partial, the scanned
      // body is genuinely lost — surface it so the completeness contract reads
      // content-loss instead of green off the cover.
      if (partialFromPages) {
        const withText = pages.filter((p) => meaningfulCharCount(p.text) >= MIN_PAGE_MEANINGFUL_CHARS).length;
        warnings.push(`PARTIAL_PAGE_TEXT: extractable text on only ${withText}/${pages.length} pages — likely a mixed cover+scanned PDF; the image-only body was not recovered (OCR unavailable) and is treated as content loss.`);
      }
      // [PDF-DIAG] (#157) — the live worker success probe; keep it after the partial-page
      // warning so the log line carries that warning too.
      console.error(`[PDF-DIAG] extractText OK: method=pdf-parse pages=${pageCount} rawLen=${rawText.length} meaningful=${meaningfulLength}${warnings.length ? ` warnings=[${warnings.join(" | ")}]` : ""}`);
      return { pages, rawText, pageCount, extractionMethod: "pdf-parse", warnings, partialPageText: partialFromPages };
    }
    throw new Error("pdf-parse module did not export a usable parser");
  } catch (err) {
    // [PDF-DIAG] — surface the swallowed failure in the worker logs (the pushed warning alone did
    // not print). "Cannot find module 'pdf-parse'" here would confirm the devDep pruned at runtime.
    console.error(`[PDF-DIAG] extractText THREW → empty placeholder: ${(err as Error).message}\n${(err as Error).stack}`);
    warnings.push(`pdf-parse failed: ${(err as Error).message}`);
  }

  // Fail-loud fallback — never silently emit nothing.
  warnings.push("All PDF parsers failed — returning empty placeholder. Downstream must treat as missing.");
  const placeholder = `[PDF_EXTRACTION_FAILED: ${pdfBuffer.length} bytes received]`;
  return {
    pages: [{ pageNum: 1, text: placeholder, lines: [placeholder] }],
    rawText: placeholder,
    pageCount: 0,
    extractionMethod: "fallback",
    warnings,
  };
}

function buildPageStructure(rawText: string, pageCount: number): PageText[] {
  // pdf-parse inserts form-feed (\f) between pages when available.
  const formFeedSplit = rawText.split("\f");
  if (formFeedSplit.length > 1 && formFeedSplit.length <= pageCount + 2) {
    return formFeedSplit
      .filter((s) => s.trim().length > 0)
      .map((text, i) => ({
        pageNum: i + 1,
        text: text.trim(),
        lines: text.trim().split("\n").filter((l) => l.trim().length > 0),
      }));
  }

  // No form feeds — treat as single document block. Downstream section
  // detection operates on line-by-line scan, which still works.
  return [
    {
      pageNum: 1,
      text: rawText.trim(),
      lines: rawText.trim().split("\n").filter((l) => l.trim().length > 0),
    },
  ];
}
