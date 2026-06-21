// Non-PDF attachment text extractor (.docx / .xlsx) — deterministic, no LLM.
//
// Bug (P0, 2026-06-20): the SAM document-set assembly skipped every .docx/.xlsx
// member as "non-PDF (not inlineable)". But §M Evaluation addenda, Price
// Schedules, ELIN/CLIN pricing, and wage tables are frequently delivered as
// .docx/.xlsx (FA301626R0018 §M came back blank; N4008526R0065 couldn't price
// because the ELINS .xlsx was dropped). Those documents are decision-critical.
//
// Approach: extract a .docx (mammoth) or .xlsx (exceljs) to PLAIN TEXT, then
// wrap that text in a minimal, valid PDF. The wrapped PDF rides the EXACT same
// ingestion path as a native PDF — V1 inlines it as media_type application/pdf,
// V2 reads it back via pdf-text-extractor — so the extracted text flows into the
// identical section-detection + clause-extraction code with NO engine change.
//
// Honest-fallback contract: a member that can't be extracted returns null and
// the caller flags it (never fabricated, never silently dropped).

export type NonPdfKind = "docx" | "xlsx" | null;

export function nonPdfKind(name: string): NonPdfKind {
  if (/\.docx$/i.test(name)) return "docx";
  if (/\.xlsx$/i.test(name)) return "xlsx";
  return null;
}

// .docx → plain text (mammoth's raw-text extractor; ignores styling).
async function extractDocxText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const out = await mammoth.extractRawText({ buffer });
  return String(out?.value ?? "").trim();
}

// .xlsx → tab-delimited text per sheet (exceljs). Each sheet is headed by its
// name; each row is its non-empty cell values joined by TAB so a price/ELIN/wage
// table stays row-aligned for the model + the deterministic extractors.
async function extractXlsxText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  // exceljs accepts a Node Buffer directly for xlsx.load.
  await wb.xlsx.load(buffer);
  const parts: string[] = [];
  wb.eachSheet((ws: unknown) => {
    const sheet = ws as {
      name?: string;
      eachRow?: (cb: (row: { eachCell?: (opts: unknown, cb: (cell: { value?: unknown }) => void) => void }) => void) => void;
    };
    const rows: string[] = [];
    sheet.eachRow?.((row) => {
      const cells: string[] = [];
      row.eachCell?.({ includeEmpty: false }, (cell) => {
        cells.push(cellToText(cell.value));
      });
      const line = cells.join("\t").trim();
      if (line) rows.push(line);
    });
    if (rows.length > 0) parts.push(`=== SHEET: ${sheet.name ?? "(unnamed)"} ===\n${rows.join("\n")}`);
  });
  return parts.join("\n\n").trim();
}

// exceljs cell values can be primitives, rich-text objects, formula objects,
// hyperlinks, or dates. Reduce each to a readable string (deterministic).
function cellToText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as Record<string, unknown>;
  if (typeof o.text === "string") return o.text; // hyperlink / simple text
  if (typeof o.result === "string" || typeof o.result === "number") return String(o.result); // formula result
  if (Array.isArray(o.richText)) return o.richText.map((r) => String((r as { text?: unknown })?.text ?? "")).join("");
  if (typeof o.formula === "string") return `=${o.formula}`;
  return "";
}

// Extract a non-PDF member to plain text. Returns null on any failure or an
// empty yield (honest fallback — caller flags, never fabricates).
export async function extractNonPdfText(name: string, buffer: Buffer): Promise<string | null> {
  const kind = nonPdfKind(name);
  if (!kind) return null;
  try {
    const text = kind === "docx" ? await extractDocxText(buffer) : await extractXlsxText(buffer);
    return text && text.length > 0 ? text : null;
  } catch (err) {
    console.warn(`[nonpdf-extractor] ${kind} extraction failed for ${name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Minimal, valid, single-stream PDF builder — wraps extracted text so a .docx /
// .xlsx flows through the native-PDF ingestion path (inline application/pdf for
// V1, pdf-parse for V2) with no engine change. Helvetica, simple line wrapping,
// multi-page. NOT a faithful render — it carries the TEXT, which is all the
// section/clause/fact extractors consume.
//
// Escapes the three PDF string metacharacters and drops control chars so the
// content stream can never corrupt the file structure.
function escapePdfText(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function textToPdfBuffer(text: string, title = ""): Buffer {
  const FONT = 10;            // pt
  const LEADING = 13;         // pt between lines
  const LEFT = 50;            // pt margin
  const TOP = 760;            // pt baseline of first line (US Letter 612x792)
  const BOTTOM = 50;          // pt
  const MAX_LINES = Math.floor((TOP - BOTTOM) / LEADING);
  const MAX_CHARS = 95;       // ~ wrap width at 10pt Helvetica on Letter

  // Wrap to fixed-width lines (preserve explicit newlines + tabs as spaces).
  const wrapped: string[] = [];
  const header = title ? [title, ""] : [];
  for (const raw of [...header, ...text.replace(/\t/g, "    ").split(/\r?\n/)]) {
    if (raw.length <= MAX_CHARS) { wrapped.push(raw); continue; }
    let rest = raw;
    while (rest.length > MAX_CHARS) {
      // break on the last space within the window, else hard-break
      let cut = rest.lastIndexOf(" ", MAX_CHARS);
      if (cut <= 0) cut = MAX_CHARS;
      wrapped.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\s+/, "");
    }
    wrapped.push(rest);
  }

  // Paginate.
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += MAX_LINES) pages.push(wrapped.slice(i, i + MAX_LINES));
  if (pages.length === 0) pages.push([""]);

  // Build content streams (one per page).
  const contentStreams = pages.map((lines) => {
    const body = lines
      .map((ln, idx) => {
        const esc = escapePdfText(ln);
        return idx === 0
          ? `BT /F1 ${FONT} Tf ${LEFT} ${TOP} Td ${LEADING} TL (${esc}) Tj`
          : `T* (${esc}) Tj`;
      })
      .join("\n") + "\nET";
    return body;
  });

  // Assemble the PDF objects with a correct xref table.
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, then per-page: Page + Content; last: Font.
  const pageObjStart = 3;
  const numPages = pages.length;
  const fontObjNum = pageObjStart + numPages * 2;

  const kids: number[] = [];
  for (let p = 0; p < numPages; p++) kids.push(pageObjStart + p * 2);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${numPages} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`;
  for (let p = 0; p < numPages; p++) {
    const pageNum = pageObjStart + p * 2;
    const contentNum = pageNum + 1;
    objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentNum} 0 R >>`;
    const stream = contentStreams[p];
    objects[contentNum] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  }
  objects[fontObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  // Serialize with byte-accurate offsets for the xref.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i <= fontObjNum; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  const total = fontObjNum + 1; // includes object 0
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i <= fontObjNum; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}
