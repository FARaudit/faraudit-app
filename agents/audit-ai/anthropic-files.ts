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

// ─── FA-147 · transient-failure taxonomy ────────────────────────────────────
// A 503/529/overloaded from Anthropic is a CAPACITY DIP, not a property of
// the solicitation — it must never be laundered into "document unavailable"
// (the a794ca3b incident: Files API 503 'File storage is temporarily
// unavailable' → pdfUnavailableReason → metadata-only audit shipped as
// complete). Typed error + classifier so every layer can route transient
// failures to the FA-149 release path instead of degrading the product.

export class AnthropicTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicTransientError";
  }
}

// True for transient Anthropic upstream failures, wherever they surface:
// - AnthropicTransientError (the typed exhaust from withAnthropicRetry)
// - SDK errors carrying status 503/529 or the overloaded_error type
// - audit-engine's raw-fetch throw format ("Claude API 503: …" / 529)
// - the literal file-storage outage message from the a794ca3b incident
export function isAnthropicTransient(err: unknown): boolean {
  if (err instanceof AnthropicTransientError) return true;
  const status = (err as { status?: unknown })?.status;
  if (status === 503 || status === 529) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    /Claude API (503|529)\b/.test(msg) ||
    /\boverloaded_error\b/i.test(msg) ||
    /file storage is temporarily unavailable/i.test(msg)
  );
}

// Bounded retry for transient 5xx. 3 attempts with 2s/4s backoff — the same
// numbers the engine's Messages-call retry has used in production since the
// 529 capacity dips of May 2026 (empirically enough for momentary dips). A
// longer outage SHOULD exhaust here: the worker then releases the claim
// (attempts+1) and the FA-149 poison-pill cap bounds total retries across
// containers — the right place to absorb a multi-minute outage is the queue,
// not a sleeping worker. backoffMs is parameterized for the test harness only.
export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  label: string,
  backoffMs: (attempt: number) => number = (a) => a * 2000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isAnthropicTransient(err)) throw err;
      if (attempt < 3) {
        const waitMs = backoffMs(attempt);
        console.warn(`[anthropic-files] ${label}: transient Anthropic failure attempt ${attempt}/3 — backing off ${waitMs}ms · ${err instanceof Error ? err.message.slice(0, 160) : err}`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new AnthropicTransientError(`${label}: Anthropic transient failure persisted across 3 attempts — ${msg.slice(0, 300)}`);
}

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
  // FA-147 — retry transient 5xx; exhaust throws AnthropicTransientError so
  // callers can never mistake a capacity dip for a missing document.
  const result = await withAnthropicRetry(
    () => client().beta.files.upload({ file: fileLike, betas: [FILES_API_BETA] }),
    "files-api upload"
  );
  return { fileId: result.id, sizeBytes: buffer.length };
}

// FA-132 NOTE — there is deliberately NO downloadPdfFromFilesApi here.
// Empirically verified 2026-06-12 (req_011CbytNVFqgY1KeB5HG8Rq2): the Files
// API returns 400 "File is not downloadable" for user-UPLOADED files — only
// API-created files (e.g. code-execution outputs) can be downloaded back.
// The worker upload arm gets its V2 bytes from Supabase Storage instead
// (bucket "audit-pdfs", pending_audits.pdf_path) — see enqueueAsyncAudit and
// worker buildInput.

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
