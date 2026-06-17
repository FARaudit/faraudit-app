-- FA-178 · multi-document async worker — store the whole uploaded set.
--
-- Before FA-178 the resident audit-worker was single-document by construction:
-- a pending_audits row carried exactly one document reference
-- (anthropic_file_id for uploads, pdf_url for SAM, pdf_path for the V2-shadow
-- bytes). Multi-file uploads therefore could NOT enqueue — the route forced
-- them down the synchronous path, which (a) skipped the live stages screen and
-- (b) TIMED OUT on large sets past the ~5-minute serverless function limit
-- (confirmed AOCSSB26R0039, a 5-file group-2 audit: no row, hard fail).
--
-- One additive column lets a single pending row carry the entire form-first
-- upload set:
--   upload_docs — JSONB array of { path, filename }. `path` is the Supabase
--                 Storage key (bucket "audit-pdfs") the enqueue route stashes
--                 each uploaded buffer under; `filename` is the original
--                 (sanitized) name. The worker downloads every member and runs
--                 the IDENTICAL form-first assembly (assembleUploadedDocumentSet)
--                 the sync route runs — same primary, same attachments, same
--                 ingestion-completeness meta — so multi-file uploads now take
--                 the async path with no fidelity loss.
--
-- Storage (not the Anthropic Files API) is the bytes channel: the Files API
-- refuses to download uploaded files back, and the worker must re-page-count
-- every member to reproduce the page-budget trim. Uploaded sets are capped
-- well under the inline budget, so the assembled primary + attachments inline
-- exactly as on the sync path (pdf_source="uploaded").
--
-- Additive + nullable: single-doc uploads, SAM runs, and every pre-FA-178 row
-- leave upload_docs NULL and follow the unchanged single-document path.

ALTER TABLE public.pending_audits
  ADD COLUMN IF NOT EXISTS upload_docs jsonb;

COMMENT ON COLUMN public.pending_audits.upload_docs IS
  'FA-178: multi-file upload set — JSONB array of {path, filename} (Storage keys in bucket audit-pdfs). NULL for single-doc uploads, SAM runs, and pre-FA-178 rows. Worker downloads all + reassembles form-first (assembleUploadedDocumentSet).';
