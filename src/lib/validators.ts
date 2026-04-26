import { z } from "zod";

export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

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
