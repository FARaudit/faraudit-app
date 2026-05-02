-- apex-production schema cleanup · 25 orphan objects
-- Generated 2026-05-02 by agents/audit-ai/schema-audit.ts
-- CEO authorized · drop all 25 (Path A — including 21+21 row tables)
--
-- Bulletproof variant: dispatches DROP TABLE / DROP VIEW / DROP MATERIALIZED
-- VIEW per-object based on pg_class.relkind, so no kind mismatch can roll the
-- transaction. Missing objects are skipped (NOTICE only). The DO block runs
-- atomically; any uncaught error aborts the whole batch.

BEGIN;

DO $$
DECLARE
  obj_name TEXT;
  obj_kind CHAR;
  drops TEXT[] := ARRAY[
    -- Priority drop: security-risk view (was UNRESTRICTED per CEO)
    'churn_risk_customers',

    -- Old FARaudit pipeline (faraudit-cron retiring today)
    'audit_corpus',
    'audit_logs',
    'agency_intelligence',

    -- Old Capital OS / Bullrize pre-pivot
    'cap_briefs',
    'cap_journal',
    'cap_signals',
    'cap_positions',
    'cap_macro_snapshots',
    'cap_weekly_thesis',
    'cap_watchlist',

    -- LexAnchor pre-pivot (parked per Month 6 strategy)
    'lex_reg_monitor',
    'lex_cases',
    'lex_analyses',
    'lex_legislation',
    'lex_documents',

    -- Old features / never-shipped
    'ceo_expenses',
    'ceo_news_flash',
    'support_tickets',
    'security_events',
    'customer_health',
    'onboarding_sequences',
    'content_queue',
    'user_progress',
    'intel_briefs'
  ];
BEGIN
  FOREACH obj_name IN ARRAY drops LOOP
    SELECT c.relkind INTO obj_kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = obj_name;

    IF obj_kind IS NULL THEN
      RAISE NOTICE 'skip   · % · does not exist in public schema', obj_name;
    ELSIF obj_kind IN ('r', 'p') THEN
      -- ordinary table or partitioned table
      EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', obj_name);
      RAISE NOTICE 'dropped TABLE              · %', obj_name;
    ELSIF obj_kind = 'v' THEN
      EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', obj_name);
      RAISE NOTICE 'dropped VIEW               · %', obj_name;
    ELSIF obj_kind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', obj_name);
      RAISE NOTICE 'dropped MATERIALIZED VIEW  · %', obj_name;
    ELSIF obj_kind = 'f' THEN
      EXECUTE format('DROP FOREIGN TABLE IF EXISTS public.%I CASCADE', obj_name);
      RAISE NOTICE 'dropped FOREIGN TABLE      · %', obj_name;
    ELSE
      RAISE NOTICE 'skip   · % · unknown relkind=% (manual review needed)', obj_name, obj_kind;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verification — should return exactly 14 rows after the drop:
--
-- SELECT c.relname AS name,
--        CASE c.relkind
--          WHEN 'r' THEN 'table'
--          WHEN 'v' THEN 'view'
--          WHEN 'm' THEN 'materialized view'
--          WHEN 'p' THEN 'partitioned table'
--          WHEN 'f' THEN 'foreign table'
--          ELSE c.relkind::text
--        END AS kind
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p','f')
--  ORDER BY c.relname;
--
-- Expected 14:
--   audits, ceo_affirmations, ceo_runway, ceo_session_memory,
--   fa_audit_findings, fa_audit_runs, fa_awards, fa_competitor_intel,
--   fa_intelligence_corpus, fa_outreach, fa_prospects, fa_solicitations,
--   ko_intelligence, pending_audits
