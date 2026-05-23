// DERIVED PARITY TWIN of agents/audit-ai/pdf.ts (which is the CANONICAL source).
//
// PARITY NOTE: agents/audit-ai/pdf.ts is the CANONICAL source for the
// kSamNonPdfError + kImageResizeError sentinel constants, the magic-byte +
// content-sniff format detector, the Content-Disposition filename parser,
// the OLE2 filename guard, and the maybeResizeImage() sharp-resize helper.
// This file mirrors the same logic with these intentional asymmetries:
// (a) sam.gov-only source (no local-fixture arm), (b) no fetchDocumentFromPath
// equivalent, (c) imports both sentinel constants from canonical pdf.ts and
// re-exports them so consumers via @/lib/sam-pdf get them without knowing
// about the cross-package import.
// Do not edit one without updating the other. Same api-key auth,
// redirect: "follow", 30s timeout, Content-Disposition filename plumbing,
// and image resize policy.
//
// Why duplicated, not imported wholesale: agents/audit-ai/ ships to Railway
// with Root Directory = agents/audit-ai/ — only that folder lands in the worker
// container, no /src/. Symmetrically, the Vercel build does not ship agents/.
// Cross-importing helpers between containers would break one or the other.
// The kSamNonPdfError + kImageResizeError CONSTANTS are the one exception: they
// import from the canonical pdf.ts (Vercel build can reach agents/, Railway
// cannot reach src/, so the one-way direction works). All other helpers are
// mirrored. Consolidating into a shared workspace package is P2 hygiene,
// separate from FA-1.
//
// Handles seven SAM.gov payload formats with magic-byte + content-sniff detection:
//   PDF   (%PDF / 25504446)        → base64 → Anthropic document block
//   DOCX  (PK\x03\x04 with word/)  → mammoth.extractRawText → text injected into prompt
//   XLSX  (PK\x03\x04 with xl/)    → exceljs sheet walk → text injected into prompt
//   JPEG  (FFD8FF prefix)          → maybeResizeImage → Anthropic image block (multimodal)
//   PNG   (89504E470D0A1A0A)       → maybeResizeImage → Anthropic image block (multimodal)
//   DOC   (OLE2 + filename .doc)   → word-extractor → text injected into prompt
//   TXT   (utf-8 sniff · no NULs)  → utf-8 string → text injected into prompt
// Anything else (.xls/.ppt/.pptx OLE2, encrypted ZIP, binary that is neither
// image nor text) throws kSamNonPdfError so the route catch can mark
// pdfSource="sam_unavailable" with a clear reason.
//
// Image-resize policy (FA-1.1 2026-05-17): raw bytes > IMAGE_RESIZE_THRESHOLD_BYTES
// trigger a 2-attempt sharp pipeline (2000px@q85 then 1500px@q75, always JPEG output)
// before the base64 conversion. PNG inputs are transcoded to JPEG on the resize
// path. Below threshold the original buffer + source mediaType pass through.
// If both attempts still exceed the threshold, throws kImageResizeError.
//
// SAM presigned URLs (the eventual S3 redirect target) carry an X-Amz-Expires
// of ~9 seconds — fine for `redirect: "follow"` GETs in a single request, but
// any HEAD-then-GET sequence will fail. Stick to GET.

import mammoth from "mammoth";
import ExcelJS from "exceljs";
import WordExtractor from "word-extractor";
import sharp from "sharp";
// Single-source-of-truth for the sentinel prefixes · canonical exports live in
// agents/audit-ai/pdf.ts. See "Why duplicated, not imported wholesale" above
// for the asymmetry rationale (these constants are the one allowed cross-import).
import { kSamNonPdfError, kImageResizeError } from "../../agents/audit-ai/pdf";
import { uploadPdfToFilesApi } from "./anthropic-files";

export { kSamNonPdfError, kImageResizeError };

const SAM_API_KEY = process.env.SAM_API_KEY;

export type DocumentFetchResult =
  | { kind: "pdf";   base64: string;        bytes: number; source: "sam.gov"; fileId?: string }
  | { kind: "image"; base64: string;        bytes: number; source: "sam.gov"; mediaType: "image/jpeg" | "image/png"; resized: boolean }
  | { kind: "text";  extractedText: string; bytes: number; source: "sam.gov"; format: "docx" | "xlsx" | "doc" | "txt" };

const PDF_MAGIC  = Buffer.from("%PDF", "ascii");
const ZIP_MAGIC  = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// Image resize threshold for sharp pipeline. Raw bytes ≤ this pass through
// unchanged. Above this, maybeResizeImage transcodes to JPEG via sharp.
// 3.5MB raw → ~4.66MB base64, safely under Anthropic's 5MB vision content cap.
const IMAGE_RESIZE_THRESHOLD_BYTES = 3_500_000;

// PDF size above which we route through the Anthropic Files API instead of
// inlining base64. 20MB raw → ~26MB base64, which approaches Anthropic's
// inline document-block limit. The Files API supports up to 500MB per file
// and lets all 4 audit calls reuse the same file_id (single upload). The
// returned fileId is carried on the pdf arm and consumed by audit-engine.ts.
const PDF_FILES_API_THRESHOLD_BYTES = 20_000_000;

function isPdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC);
}
function isZipContainer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(ZIP_MAGIC);
}
function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf.subarray(0, 3).equals(JPEG_MAGIC);
}
function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}
function isOle2(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(OLE2_MAGIC);
}

// Content sniff: utf-8 decodes cleanly · no NUL bytes in first 4KB · printable+whitespace ratio ≥ 0.95.
// Catches SAM text/plain wage determinations (e.g. tn190.txt) without locking to any specific
// magic-byte signature — works for any text/plain attachment SAM serves.
function isLikelyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(4096, buf.length));
  if (sample.length === 0) return false;
  if (sample.includes(0x00)) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    return false;
  }
  if (decoded.length === 0) return false;
  let printable = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d || c >= 0x80) {
      printable++;
    }
  }
  return printable / decoded.length >= 0.95;
}

function classifyOfficeFormat(buf: Buffer): "docx" | "xlsx" | "unknown" {
  const head = buf.subarray(0, Math.min(2000, buf.length)).toString("binary");
  if (head.includes("word/")) return "docx";
  if (head.includes("xl/"))   return "xlsx";
  return "unknown";
}

// Parse a Content-Disposition response header → filename string. Handles RFC 6266 forms:
//   filename="foo.doc"            (quoted · most common from SAM.gov)
//   filename=foo.doc              (unquoted)
//   filename*=UTF-8''foo.doc      (RFC 5987 encoded · Past Performance attachments use this)
function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const starMatch = header.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
  if (starMatch) {
    try { return decodeURIComponent(starMatch[1].trim()); } catch { /* fall through to plain match */ }
  }
  const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch) return quotedMatch[1];
  const bareMatch = header.match(/filename\s*=\s*([^;\s]+)/i);
  if (bareMatch) return bareMatch[1];
  return null;
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

// word-extractor accepts a Buffer (or filepath) and returns a Document with .getBody().
// Pure-JS · no native bindings. .doc only — caller must guard via filename extension
// before invoking (.xls/.ppt OLE2 will silently return garbage).
async function extractDocText(buf: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const extracted = await extractor.extract(buf);
  return extracted.getBody();
}

// Resize an image buffer if it exceeds IMAGE_RESIZE_THRESHOLD_BYTES. Below
// threshold: pass through the original buffer and mediaType unchanged. Above
// threshold: 2-attempt sharp pipeline (2000px@q85 → 1500px@q75), always
// transcoded to JPEG output. PNG-source inputs are converted to JPEG on the
// resize path because (a) PNG's lossless compression usually fails to bring
// scanned-page screenshots under the 5MB Anthropic cap, and (b) JPEG@85
// preserves enough text-readability for Claude vision to extract clauses.
// .rotate() applies any EXIF orientation tag so resize dimensions operate on
// the visible image rather than the stored pixel matrix.
// If both attempts still exceed the threshold, throws kImageResizeError.
async function maybeResizeImage(
  buf: Buffer,
  sourceMediaType: "image/jpeg" | "image/png"
): Promise<{ buffer: Buffer; mediaType: "image/jpeg" | "image/png"; resized: boolean }> {
  if (buf.length <= IMAGE_RESIZE_THRESHOLD_BYTES) {
    return { buffer: buf, mediaType: sourceMediaType, resized: false };
  }

  const attempts = [
    { width: 2000, quality: 85 },
    { width: 1500, quality: 75 }
  ];

  for (const { width, quality } of attempts) {
    const out = await sharp(buf)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length <= IMAGE_RESIZE_THRESHOLD_BYTES) {
      return { buffer: out, mediaType: "image/jpeg", resized: true };
    }
  }

  const last = attempts[attempts.length - 1];
  throw new Error(`${kImageResizeError}: raw=${buf.length} bytes · sharp 2x attempt (${last.width}px/q${last.quality} JPEG mozjpeg) still > ${IMAGE_RESIZE_THRESHOLD_BYTES} bytes`);
}

async function classifyAndReturn(buf: Buffer, filename: string | null): Promise<DocumentFetchResult> {
  if (isPdf(buf)) {
    if (buf.length > PDF_FILES_API_THRESHOLD_BYTES) {
      // FA-2: upload to Anthropic Files API; document block will reference file_id.
      const { fileId } = await uploadPdfToFilesApi(buf, filename);
      return { kind: "pdf", base64: "", bytes: buf.length, source: "sam.gov", fileId };
    }
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
    throw new Error(`${kSamNonPdfError}: ZIP container with unknown content (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
  }
  if (isJpeg(buf)) {
    const out = await maybeResizeImage(buf, "image/jpeg");
    return { kind: "image", base64: out.buffer.toString("base64"), bytes: out.buffer.length, source: "sam.gov", mediaType: out.mediaType, resized: out.resized };
  }
  if (isPng(buf)) {
    const out = await maybeResizeImage(buf, "image/png");
    return { kind: "image", base64: out.buffer.toString("base64"), bytes: out.buffer.length, source: "sam.gov", mediaType: out.mediaType, resized: out.resized };
  }
  if (isOle2(buf)) {
    // OLE2 is the compound-file binary format used by legacy .doc/.xls/.ppt and others.
    // word-extractor reliably handles .doc only; .xls/.ppt would silently return garbage
    // or throw cryptically. Use the SAM Content-Disposition filename as the discriminator
    // and reject the rest as data-quality failures.
    const lowerName = (filename || "").toLowerCase();
    if (lowerName.endsWith(".doc")) {
      return { kind: "text", extractedText: await extractDocText(buf), bytes: buf.length, source: "sam.gov", format: "doc" };
    }
      // FA-1.2 deferred: .xls OLE2 volume <1% of SAM attachments; SheetJS advisory risk > benefit at corpus scale. Revisit if .xls exceeds 5% of ingested rows.
    throw new Error(`${kSamNonPdfError}: OLE2 container with unsupported filename "${filename ?? "<unknown>"}" (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
  }
  if (isLikelyText(buf)) {
    return { kind: "text", extractedText: buf.toString("utf-8"), bytes: buf.length, source: "sam.gov", format: "txt" };
  }
  throw new Error(`${kSamNonPdfError} for unrecognized format (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
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
  const filename = parseContentDispositionFilename(res.headers.get("content-disposition"));
  const buf = Buffer.from(await res.arrayBuffer());
  return classifyAndReturn(buf, filename);
}
