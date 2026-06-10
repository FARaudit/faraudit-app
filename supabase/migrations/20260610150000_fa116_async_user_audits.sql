-- FA-116 · async user-initiated audits (enqueue + poll).
--
-- pending_audits gains user-audit support:
--   1. user_id           — requesting user (attribution mirror; the audits row
--                          inserted at enqueue time under user RLS remains the
--                          authoritative owner record).
--   2. anthropic_file_id — Files API handle for uploaded PDFs (the worker has
--                          no access to the original multipart bytes).
--   3. pdf_filename      — sanitized original filename for uploaded PDFs.
--   4. claimed_at        — set when the audit-worker flips a user row to
--                          'processing'; drives the stale sweep (processing
--                          >30min → failed 'worker timeout'). created_at can't
--                          serve here: it's enqueue time, and a backlogged row
--                          claimed late would be swept the moment it started.
--
-- notice_id uniqueness is rescoped to non-user rows: a user may audit a notice
-- that sam-ingest/recompete/telegram already queued (or audit the same notice
-- twice), so source='user' rows are exempt. Uniqueness among cron-sourced rows
-- is preserved by the partial index. Transactional create-then-drop so the
-- table is never without the non-user uniqueness guarantee.
--
-- Writer adaptations shipped in the same commit (PostgREST cannot target a
-- partial index as an ON CONFLICT arbiter, and .maybeSingle() readers must
-- exclude user rows): agents/audit-ai/queue.ts (upsertPending rewrite +
-- fetchPending source scope), agents/sam-ingest/queue.ts (existence check),
-- src/app/api/telegram/route.ts, src/app/api/opportunities/[notice_id]/* ,
-- src/app/api/incumbent/[notice_id]/route.ts, src/app/api/audit/route.ts
-- (agency fallback).

BEGIN;

ALTER TABLE pending_audits
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS anthropic_file_id TEXT,
  ADD COLUMN IF NOT EXISTS pdf_filename TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_audits_notice_id_nonuser
  ON pending_audits(notice_id)
  WHERE source <> 'user';

ALTER TABLE pending_audits
  DROP CONSTRAINT IF EXISTS pending_audits_notice_id_key;

-- Worker claim scan: source='user' AND status='pending', ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_pending_audits_user_pending
  ON pending_audits(created_at)
  WHERE source = 'user' AND status = 'pending';

COMMIT;
