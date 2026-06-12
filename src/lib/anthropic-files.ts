// DERIVED PARITY TWIN of agents/audit-ai/anthropic-files.ts (CANONICAL).
//
// PARITY NOTE: agents/audit-ai/anthropic-files.ts is the CANONICAL source.
// This file imports + re-exports its public surface so Vercel-side consumers
// via @/lib/anthropic-files get the same API without knowing about the
// cross-package import. Same one-way pattern as kSamNonPdfError /
// kImageResizeError (Vercel build can reach agents/, Railway cannot reach src/,
// so re-export from the canonical side works).
//
// All implementation lives in the canonical file. This twin is intentionally
// tiny to minimize parity-drift surface area.

export {
  uploadPdfToFilesApi,
  deletePdfFromFilesApi,
  FILES_API_BETA,
  // FA-147 — transient-failure taxonomy (typed error + classifier + retry)
  AnthropicTransientError,
  isAnthropicTransient,
  withAnthropicRetry,
  type UploadedPdf
} from "../../agents/audit-ai/anthropic-files";
