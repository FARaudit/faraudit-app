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
      // Try v2-style class constructor with getText()
      try {
        const inst = new PdfParseCtor({ data: pdfBuffer });
        if (typeof inst.getText === "function") {
          const out = await inst.getText();
          rawText = String(out?.text ?? "");
          pageCount = Number(out?.pages ?? out?.numpages ?? 1);
        } else {
          // Fallback: try calling as function (v1 style)
          const out = await PdfParseCtor(pdfBuffer);
          rawText = String(out?.text ?? "");
          pageCount = Number(out?.numpages ?? out?.pages ?? 1);
        }
      } catch {
        // Last resort: try callable form
        const out = await PdfParseCtor(pdfBuffer);
        rawText = String(out?.text ?? "");
        pageCount = Number(out?.numpages ?? out?.pages ?? 1);
      }
    } else {
      throw new Error("pdf-parse module did not export a usable parser");
    }

    if (!rawText || rawText.length < 50) {
      warnings.push(`LOW_TEXT_YIELD: extracted only ${rawText.length} chars — possible scanned/image PDF`);
    }

    const pages = buildPageStructure(rawText, pageCount);
    return { pages, rawText, pageCount, extractionMethod: "pdf-parse", warnings };
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
