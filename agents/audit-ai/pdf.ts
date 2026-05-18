// CANONICAL · cron worker document helpers.
//
// PARITY NOTE: src/lib/sam-pdf.ts is the parity-locked DERIVED twin of this
// file. This file is the CANONICAL source for: the kSamNonPdfError sentinel
// constant (sam-pdf.ts imports it), the magic-byte + content-sniff format
// detector, the Content-Disposition filename parser, and the OLE2 filename
// guard. sam-pdf.ts mirrors the same logic with these intentional asymmetries:
// (a) sam.gov-only source (no local-fixture arm), (b) no fetchDocumentFromPath
// equivalent, (c) re-exports kSamNonPdfError so consumers via @/lib/sam-pdf
// get it without knowing about the cross-package import direction.
// Do not edit one without updating the other. Same api-key auth,
// redirect: "follow", 30s timeout, Content-Disposition filename plumbing.
//
// Handles seven SAM.gov payload formats with magic-byte + content-sniff detection:
//   PDF   (%PDF / 25504446)        → base64 → Anthropic document block
//   DOCX  (PK\x03\x04 with word/)  → mammoth.extractRawText → text injected into prompt
//   XLSX  (PK\x03\x04 with xl/)    → exceljs sheet walk → text injected into prompt
//   JPEG  (FFD8FF prefix)          → base64 → Anthropic image block (multimodal)
//   PNG   (89504E470D0A1A0A)       → base64 → Anthropic image block (multimodal)
//   DOC   (OLE2 + filename .doc)   → word-extractor → text injected into prompt
//   TXT   (utf-8 sniff · no NULs)  → utf-8 string → text injected into prompt
// Anything else (.xls/.ppt/.pptx OLE2, encrypted ZIP, binary that is neither
// image nor text) throws kSamNonPdfError so index.ts:isDataQualityFailure()
// routes it to data-quality not engine-fail.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import WordExtractor from "word-extractor";

const SAM_API_KEY = process.env.SAM_API_KEY;

export type DocumentFetchResult =
  | { kind: "pdf";   base64: string;        bytes: number; source: "local" | "sam.gov" }
  | { kind: "image"; base64: string;        bytes: number; source: "local" | "sam.gov"; mediaType: "image/jpeg" | "image/png" }
  | { kind: "text";  extractedText: string; bytes: number; source: "local" | "sam.gov"; format: "docx" | "xlsx" | "doc" | "txt" };

const PDF_MAGIC  = Buffer.from("%PDF", "ascii");
const ZIP_MAGIC  = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);  // covers FFD8FFE0 (JFIF) + FFD8FFE1 (EXIF) + all SOI variants
const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

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
// Catches SAM text/plain wage determinations (e.g. tn190.txt, body opens with "General Decision Number")
// without locking to any specific magic-byte signature — works for any text/plain attachment SAM serves.
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
    // ASCII printable 0x20–0x7E · tab/LF/CR whitespace · any code point ≥ 0x80 (unicode text counts as printable)
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d || c >= 0x80) {
      printable++;
    }
  }
  return printable / decoded.length >= 0.95;
}

// DOCX entries always include "word/" prefix in their filenames; XLSX includes "xl/".
// Scan a 2KB window of the raw bytes — cheaper than full unzip; library does real parse.
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
        return "";  // unknown object shape → empty rather than "[object Object]"
      });
      // Dedupe consecutive identical cells (merged-cell artifacts)
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
// Pure-JS · no native bindings · safe in the Railway slim image. .doc only — caller must
// guard via filename extension before invoking (.xls/.ppt OLE2 will silently return garbage).
async function extractDocText(buf: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const extracted = await extractor.extract(buf);
  return extracted.getBody();
}

// Error-message prefix kept (constant name and value unchanged) so
// index.ts:isDataQualityFailure() substring match continues to fire without changes.
// Message text broadened: now also emitted for unsupported OLE2 subtypes and unrecognized binary.
export const kSamNonPdfError = "SAM.gov returned non-PDF";

async function classifyAndReturn(
  buf: Buffer,
  source: "local" | "sam.gov",
  filename: string | null
): Promise<DocumentFetchResult> {
  if (isPdf(buf)) {
    return { kind: "pdf", base64: buf.toString("base64"), bytes: buf.length, source };
  }
  if (isZipContainer(buf)) {
    const format = classifyOfficeFormat(buf);
    if (format === "docx") {
      const extractedText = await extractDocxText(buf);
      return { kind: "text", extractedText, bytes: buf.length, source, format: "docx" };
    }
    if (format === "xlsx") {
      const extractedText = await extractXlsxText(buf);
      return { kind: "text", extractedText, bytes: buf.length, source, format: "xlsx" };
    }
    throw new Error(`${kSamNonPdfError}: ZIP container with unknown content (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
  }
  if (isJpeg(buf)) {
    return { kind: "image", base64: buf.toString("base64"), bytes: buf.length, source, mediaType: "image/jpeg" };
  }
  if (isPng(buf)) {
    return { kind: "image", base64: buf.toString("base64"), bytes: buf.length, source, mediaType: "image/png" };
  }
  if (isOle2(buf)) {
    // OLE2 is the compound-file binary format used by legacy .doc/.xls/.ppt and others.
    // word-extractor reliably handles .doc only; .xls/.ppt would silently return garbage
    // or throw cryptically. Use the SAM Content-Disposition filename as the discriminator
    // and reject the rest as data-quality failures (kSamNonPdfError-prefixed so they hit
    // the dead-letter path in index.ts:isDataQualityFailure()).
    const lowerName = (filename || "").toLowerCase();
    if (lowerName.endsWith(".doc")) {
      const extractedText = await extractDocText(buf);
      return { kind: "text", extractedText, bytes: buf.length, source, format: "doc" };
    }
    throw new Error(`${kSamNonPdfError}: OLE2 container with unsupported filename "${filename ?? "<unknown>"}" (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
  }
  if (isLikelyText(buf)) {
    return { kind: "text", extractedText: buf.toString("utf-8"), bytes: buf.length, source, format: "txt" };
  }
  throw new Error(`${kSamNonPdfError} (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
}

export async function fetchDocumentFromPath(filePath: string): Promise<DocumentFetchResult> {
  const buf = await readFile(filePath);
  return classifyAndReturn(buf, "local", basename(filePath));
}

export async function fetchDocumentFromSam(url: string): Promise<DocumentFetchResult> {
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
  return classifyAndReturn(buf, "sam.gov", filename);
}
