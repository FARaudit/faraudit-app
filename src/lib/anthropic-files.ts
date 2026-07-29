// DERIVED PARITY TWIN of agents/audit-ai/anthropic-files.ts (CANONICAL).
//
// PARITY NOTE: agents/audit-ai/anthropic-files.ts is the CANONICAL source.
// This file imports + re-exports its public surface so Vercel-side consumers
// via @/lib/anthropic-files get the same API without knowing about the
// cross-package import. Same one-way pattern as kSamNonPdfError /
// kImageResizeError. (The direction dates from the V1 Audit-AI Railway worker,
// whose container couldn't reach src/; that worker was deleted in 5dc9b18 —
// the re-export is harmless legacy structure, kept because it's tiny.)
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
