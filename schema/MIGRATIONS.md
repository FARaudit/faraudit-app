# FARaudit migration manifest

Apply these against **apex-production** (Supabase project) in this order. Each file is idempotent — safe to re-run.

```sql
-- 1. Existing tables (waitlist, audits, intel_briefs, etc.) already live.

-- 2. Apply new column migrations:
\i audits_doc_type.sql
\i audits_ko_email.sql

-- 3. Apply new table migrations:
\i fa_intelligence_v2.sql
\i model_runs.sql
\i security_agent.sql
```

## Apply via Supabase SQL Editor

1. Open https://supabase.com/dashboard/project/<apex-production>/sql/new
2. Paste each file in order above
3. Click "Run"

## Apply via CLI (if you've run `supabase login`)

```bash
cd ~/faraudit-app
supabase link --project-ref <apex-production-ref>
supabase db push
```

## Verify

```sql
-- All tables should exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- All user-scoped tables should have RLS enabled
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected output: empty (every table has RLS).

-- Security agent RPCs should exist
SELECT proname FROM pg_proc WHERE proname IN ('rls_status_check', 'auth_failures_24h', 'new_users_24h');
```
