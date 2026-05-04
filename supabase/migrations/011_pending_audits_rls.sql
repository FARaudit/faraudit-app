-- 011 · pending_audits RLS + read policy.
-- pending_audits is the live SAM.gov solicitations queue (sam-ingest cron writes
-- here · /home + /audit consumers read here). RLS was enabled in production
-- (likely via Studio default-on toggle when the table was created in migration
-- 001) but no policies were ever defined — making the table invisible to
-- anon+session reads. Service role bypasses RLS so the cron continued writing,
-- but every authenticated user query returned 0 rows.
--
-- Same pattern: migrations 008 (capability_statements), 009 (budget_cache), 010
-- (defense_news_insights) all needed authenticated read policies after the
-- table was Studio-created.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

ALTER TABLE pending_audits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pending_audits'
      AND policyname = 'pending_audits_authenticated_read'
  ) THEN
    CREATE POLICY pending_audits_authenticated_read ON pending_audits
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pending_audits'
      AND policyname = 'pending_audits_service_role_all'
  ) THEN
    CREATE POLICY pending_audits_service_role_all ON pending_audits
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT ON pending_audits TO authenticated;
GRANT ALL ON pending_audits TO service_role;

NOTIFY pgrst, 'reload schema';
