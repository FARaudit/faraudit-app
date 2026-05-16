-- 027_pending_audits_status_check.sql
-- P2-5: add CHECK constraint to pending_audits.status (Rule 33 hygiene)
--
-- Pre-migration live distribution (2026-05-16 03:39 UTC, RECON 6A):
--   processed: 328 · pending: 91 · failed: 14 · aborted: 11 · NULL: 0
-- All 444 rows already conform to the proposed allow-list — this migration
-- is a no-op against current data and only constrains future writes.
--
-- aborted is manual-cleanup-only (no agent code emits it as of 2026-05-16).
-- Preserved in the allow-list for SQL/PATCH cleanup operations on stuck rows.
--
-- Surfaced during P0-21 schema drift check (Rule 33) on 2026-05-16.

ALTER TABLE public.pending_audits
  ADD CONSTRAINT pending_audits_status_check
  CHECK (status IN ('pending', 'processed', 'failed', 'aborted'));
