import { z } from "zod";

// FA-2 (2026-05-17): raised 10MB → 500MB to match the Anthropic Files API
// per-upload limit. PDFs above PDF_FILES_API_THRESHOLD_BYTES (20MB · defined
// in src/app/api/audit/route.ts) are uploaded to the Files API instead of
// being inlined as base64; this cap survives as a sanity ceiling that mirrors
// agents/audit-ai/index.ts so the worker and the user-facing route agree on
// the maximum acceptable PDF size.
export const MAX_PDF_BYTES = 500 * 1024 * 1024; // 500 MB (Anthropic Files API cap)

// FA-122 — Vercel serverless functions reject request bodies above ~4.5MB
// with a 413 before the route handler runs. PDFs at or above this threshold
// must NOT be sent through the multipart /api/audit path; the client uploads
// them straight to Supabase Storage and posts only the storage path. Set a
// conservative 4MB trigger to stay clear of the hard ceiling.
export const STORAGE_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4 MB

// Notice IDs from SAM.gov are alphanumeric with optional hyphens (and sometimes
// dots in solicitation numbers — accept hyphens only per spec). Empty allowed
// when the user is uploading a PDF without a SAM.gov reference.
export const noticeIdSchema = z
  .string()
  .trim()
  .max(50, "Notice ID must be 50 characters or fewer")
  .regex(
    /^[A-Za-z0-9-]*$/,
    "Notice ID may only contain letters, digits, and hyphens"
  );

export const pdfFileSchema = z
  .instanceof(File)
  .refine((f) => f.type === "application/pdf", {
    message: "File must be application/pdf"
  })
  .refine(
    (f) => f.size > 0 && f.size <= MAX_PDF_BYTES,
    `PDF must be between 1 byte and ${MAX_PDF_BYTES / 1024 / 1024} MB`
  );

// Strips path separators, control chars, and other filename hazards.
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(0, 200) || "untitled.pdf";
}
