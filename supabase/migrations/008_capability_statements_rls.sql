-- 008 · capability_statements RLS — F-37 fix.
-- Migration 004 created the table without RLS policies. RLS appears to have
-- been enabled in production after the fact (likely a manual Studio toggle),
-- causing all PATCH /api/capability-statement upserts to fail with:
--   "new row violates row-level security policy for table capability_statements"
-- The PATCH route authenticates via SSR (anon key + session cookie), so it
-- uses auth.uid() — not service_role bypass. We need a policy that lets each
-- authenticated user read/write their own row.
--
-- Idempotent: safe to re-run. Pattern mirrors 007_user_preferences_theme.sql.
-- Apply via Supabase Studio SQL editor on apex-production.

ALTER TABLE capability_statements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'capability_statements'
      AND policyname = 'capability_statements_self_select'
  ) THEN
    CREATE POLICY capability_statements_self_select ON capability_statements
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'capability_statements'
      AND policyname = 'capability_statements_self_write'
  ) THEN
    CREATE POLICY capability_statements_self_write ON capability_statements
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
