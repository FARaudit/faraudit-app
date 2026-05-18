// CANONICAL · Anthropic Files API helpers (FA-2 2026-05-17).
//
// PARITY NOTE: src/lib/anthropic-files.ts is the parity-locked DERIVED twin
// of this file. This file is the CANONICAL source for uploadPdfToFilesApi +
// deletePdfFromFilesApi + the FILES_API_BETA header constant. The derived
// twin re-exports them so Vercel-side consumers via @/lib/anthropic-files
// don't need to know about the cross-package import direction. Same pattern
// as kSamNonPdfError / kImageResizeError sharing across pdf.ts ↔ sam-pdf.ts.
// Do not edit one without updating the other.
//
// Used by the FA-2 oversize-PDF path: PDFs above PDF_FILES_API_THRESHOLD_BYTES
// (20MB · defined in pdf.ts / sam-pdf.ts) bypass the inline base64 document
// block and are uploaded to Anthropic's Files API once per audit. The returned
// file_id is referenced in the document content block as
//   { type: "document", source: { type: "file", file_id } }
// for all 4 model calls (classifier + overview + compliance + risks · single
// upload, four reuses). The file is deleted after the audit completes (success
// OR failure) via deletePdfFromFilesApi inside runAudit's finally{} block.
//
// Anthropic Files API limits (as of 2025-04-14 beta):
//   - Max file size: 500MB per upload
//   - Storage TTL: indefinite until explicitly deleted (hence the cleanup)
//   - Beta header required: "anthropic-beta: files-api-2025-04-14"
//   - The SDK passes this header automatically when { betas: [FILES_API_BETA] }
//     is in the request options.

import Anthropic, { toFile } from "@anthropic-ai/sdk";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
export const FILES_API_BETA = "files-api-2025-04-14";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  if (!_client) _client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  return _client;
}

export interface UploadedPdf {
  fileId: string;
  sizeBytes: number;
}

// Upload a PDF buffer to the Anthropic Files API and return the file_id.
// The SDK's toFile() helper wraps the Buffer into a File-like object the
// multipart upload expects — passing a raw Buffer triggers SDK validation
// errors. Filename is preserved when present (helps Anthropic's PDF parser
// hint the document name in logs); falls back to "sam-document.pdf" so
// the upload never fails on missing Content-Disposition.
export async function uploadPdfToFilesApi(
  buffer: Buffer,
  filename: string | null
): Promise<UploadedPdf> {
  const name = filename && filename.trim() ? filename : "sam-document.pdf";
  const fileLike = await toFile(buffer, name, { type: "application/pdf" });
  const result = await client().beta.files.upload({
    file: fileLike,
    betas: [FILES_API_BETA]
  });
  return { fileId: result.id, sizeBytes: buffer.length };
}

// Best-effort cleanup. Never throws — by the time this fires the audit has
// already returned its result, so a delete failure just leaves the file in
// Anthropic's storage (no functional impact, only a small storage-cost leak).
// Logged at warn level so observability tracks the leak rate without breaking
// the audit pipeline.
export async function deletePdfFromFilesApi(fileId: string): Promise<void> {
  try {
    await client().beta.files.delete(fileId, { betas: [FILES_API_BETA] });
  } catch (err) {
    console.warn(
      `[anthropic-files] delete failed for ${fileId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
