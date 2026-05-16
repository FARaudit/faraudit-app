-- 028_pending_audits_status_add_processing.sql
-- Adds 'processing' to pending_audits.status CHECK constraint allow-list.
-- Root cause: migration 027 (P2-5) restricted status to ('pending','processed','failed','aborted')
-- but audit-ai/queue.ts:58 writes status='processing' as intermediate claim state.
-- First post-027 audit-ai tick crashed at 2026-05-16 11:31 UTC with 23514 CHECK violation.
-- Atomic DROP + ADD in single transaction (PostgreSQL: see SQL standard ALTER TABLE).
-- 444 rows in pending_audits — full validation scan completes in <1s.

BEGIN;

ALTER TABLE pending_audits
  DROP CONSTRAINT pending_audits_status_check;

ALTER TABLE pending_audits
  ADD CONSTRAINT pending_audits_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'aborted'));

COMMIT;

-- Verify (run separately after commit):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'pending_audits'::regclass AND conname = 'pending_audits_status_check';
