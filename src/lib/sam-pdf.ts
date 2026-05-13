// SAM.gov document downloader for the user-facing /api/audit Notice ID path.
//
// PARITY NOTE: agents/audit-ai/pdf.ts contains an intentionally-identical
// implementation. Both must stay in sync — same api-key auth, format detection,
// redirect: "follow", and 30s timeout. Do not edit one without updating the other.
//
// Handles three SAM.gov payload formats with magic-byte detection:
//   PDF  (%PDF / 25504446)         → passes base64 through to Anthropic document block
//   DOCX (PK\x03\x04 with word/)   → mammoth.extractRawText → text injected into prompt
//   XLSX (PK\x03\x04 with xl/)     → exceljs sheet walk      → text injected into prompt
//
// SAM presigned URLs (the eventual S3 redirect target) carry an X-Amz-Expires
// of ~9 seconds — fine for `redirect: "follow"` GETs in a single request, but
// any HEAD-then-GET sequence will fail. Stick to GET.

import mammoth from "mammoth";
import ExcelJS from "exceljs";

const SAM_API_KEY = process.env.SAM_API_KEY;

export type DocumentFetchResult =
  | { kind: "pdf";  base64: string;        bytes: number; source: "sam.gov" }
  | { kind: "text"; extractedText: string; bytes: number; source: "sam.gov"; format: "docx" | "xlsx" };

const PDF_MAGIC = Buffer.from("%PDF", "ascii");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function isPdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC);
}
function isZipContainer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(ZIP_MAGIC);
}

function classifyOfficeFormat(buf: Buffer): "docx" | "xlsx" | "unknown" {
  const head = buf.subarray(0, Math.min(2000, buf.length)).toString("binary");
  if (head.includes("word/")) return "docx";
  if (head.includes("xl/"))   return "xlsx";
  return "unknown";
}

async function extractDocxText(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

async function extractXlsxText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // exceljs @types lag — declares plain Buffer, but @types/node now uses
  // Buffer<ArrayBufferLike>. Runtime-identical. Remove suppression when
  // exceljs updates types (tsc will auto-flag).
  // @ts-expect-error exceljs Buffer<ArrayBuffer> vs node Buffer<ArrayBufferLike>
  await wb.xlsx.load(buf);
  const parts: string[] = [];
  for (const ws of wb.worksheets) {
    parts.push(`=== Sheet: ${ws.name} ===`);
    ws.eachRow({ includeEmpty: false }, row => {
      const cells = ((row.values as unknown[]) || []).slice(1).map(v => {
        if (v === null || v === undefined) return "";
        if (typeof v !== "object") return String(v);
        const obj = v as any;
        if (Array.isArray(obj.richText)) return obj.richText.map((rt: any) => rt.text).join("");
        if (typeof obj.text === "string") return obj.text;
        if (obj.result !== undefined) return String(obj.result);
        if (typeof obj.formula === "string") return `=${obj.formula}`;
        if (obj.hyperlink) return obj.hyperlink;
        if (obj.error) return obj.error;
        return "";
      });
      const deduped: string[] = [];
      let prev: string | null = null;
      for (const c of cells) {
        if (c !== prev || c === "") deduped.push(c);
        prev = c;
      }
      parts.push(deduped.join(" | "));
    });
  }
  return parts.join("\n");
}

async function classifyAndReturn(buf: Buffer): Promise<DocumentFetchResult> {
  if (isPdf(buf)) {
    return { kind: "pdf", base64: buf.toString("base64"), bytes: buf.length, source: "sam.gov" };
  }
  if (isZipContainer(buf)) {
    const format = classifyOfficeFormat(buf);
    if (format === "docx") {
      return { kind: "text", extractedText: await extractDocxText(buf), bytes: buf.length, source: "sam.gov", format: "docx" };
    }
    if (format === "xlsx") {
      return { kind: "text", extractedText: await extractXlsxText(buf), bytes: buf.length, source: "sam.gov", format: "xlsx" };
    }
    throw new Error(`SAM.gov returned non-PDF: ZIP container with unknown content (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
  }
  throw new Error(`SAM.gov returned non-PDF for unrecognized format (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
}

export async function fetchPdfFromSamUrl(url: string): Promise<DocumentFetchResult> {
  if (!SAM_API_KEY) throw new Error("SAM_API_KEY required to fetch from SAM.gov");
  const sep = url.includes("?") ? "&" : "?";
  const authedUrl = `${url}${sep}api_key=${SAM_API_KEY}`;
  const res = await fetch(authedUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`SAM PDF fetch ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return classifyAndReturn(buf);
}
