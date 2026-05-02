-- Bot-driven audits source column + nullable user_id.
--
-- The Audit AI Railway worker writes to the `audits` table with no
-- authenticated user (it runs as a service via SUPABASE_SERVICE_ROLE_KEY).
-- We need:
--   1. user_id nullable so bot inserts don't violate NOT NULL
--   2. audit_source column to distinguish CEO uploads from worker runs
--
-- Idempotent — safe to re-run.

-- 1. user_id → nullable (no-op if already nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'user_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE audits ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

-- 2. audit_source column
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS audit_source TEXT NOT NULL DEFAULT 'user';

COMMENT ON COLUMN audits.audit_source IS 'Origin of the row: user (CEO upload via /api/audit) | audit_ai (Railway worker) | future agents.';

CREATE INDEX IF NOT EXISTS audits_audit_source_idx ON audits (audit_source);
