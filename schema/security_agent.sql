-- Security Agent table + RPCs.
-- Apply against bullrize-production, apex-production (faraudit), and
-- lexanchor-production. Service role only — no user reads.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- security_metrics table (service-role only, no user-facing queries)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS security_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name  TEXT NOT NULL,
  status      TEXT NOT NULL,
  details     JSONB,
  severity    TEXT NOT NULL DEFAULT 'info',
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_metrics_check_idx ON security_metrics (check_name, created_at DESC);
CREATE INDEX IF NOT EXISTS security_metrics_severity_idx ON security_metrics (severity, resolved);

ALTER TABLE security_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only_security_metrics ON security_metrics;
CREATE POLICY service_role_only_security_metrics ON security_metrics
  FOR ALL USING (false);  -- no anon/authenticated reads; only service role bypasses RLS

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- rls_status_check — list public tables WITHOUT row-level security
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION rls_status_check()
RETURNS TABLE (tablename TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.tablename::text
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.rowsecurity = false;
$$;
REVOKE ALL ON FUNCTION rls_status_check() FROM PUBLIC;
-- Service role auto-bypasses; only the cron route calls it.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- auth_failures_24h — IPs with >1 failed login in last 24h
-- (cron filters to >10 client-side)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION auth_failures_24h()
RETURNS TABLE (ip_address TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    COALESCE(ip_address::text, 'unknown') AS ip_address,
    count(*) AS count
  FROM auth.audit_log_entries
  WHERE created_at > now() - interval '24 hours'
    AND payload->>'action' IN ('user_signedout', 'login', 'token_refreshed')
    AND (
      payload->>'error_message' IS NOT NULL
      OR payload->>'action' = 'user_signedout'
    )
  GROUP BY ip_address
  ORDER BY count DESC
  LIMIT 50;
$$;
REVOKE ALL ON FUNCTION auth_failures_24h() FROM PUBLIC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- new_users_24h — count of users created in last 24h
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION new_users_24h()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT count(*)::bigint
  FROM auth.users
  WHERE created_at > now() - interval '24 hours';
$$;
REVOKE ALL ON FUNCTION new_users_24h() FROM PUBLIC;
