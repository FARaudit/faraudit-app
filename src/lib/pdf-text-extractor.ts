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

export interface ExtractedDocument {
  pages: PageText[];
  rawText: string;
  pageCount: number;
  extractionMethod: "pdf-parse" | "pdfjs" | "fallback";
  warnings: string[];
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

      return { pages, rawText, pageCount, extractionMethod: "pdf-parse", warnings };
    }
    throw new Error("pdf-parse module did not export a usable parser");
  } catch (err) {
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
