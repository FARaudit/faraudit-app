-- 009 · budget_cache — NAICS-keyed cache for /api/budget total + recipients + YoY.
-- Migration 004 already created budget_snapshots (keyed by FY+agency+NAICS) for
-- the agency-tier breakdown. budget_cache is the complementary table for the
-- single-row-per-NAICS shape the Defense Spending panel renders at the top:
-- total obligated DoD + top 10 prime recipients + YoY delta vs prior FY.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

CREATE TABLE IF NOT EXISTS public.budget_cache (
  naics_code     TEXT NOT NULL,
  fiscal_year    INTEGER NOT NULL,
  total_obligated NUMERIC(20, 2),
  top_recipients JSONB NOT NULL DEFAULT '[]',  -- [{ name, amount }]
  yoy_delta_pct  NUMERIC(8, 4),
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (naics_code, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_budget_cache_lookup
  ON public.budget_cache (naics_code, fiscal_year);

-- RLS — defense spending is public reference data. All authenticated users
-- read; only service_role writes (the /api/budget route uses anon+session
-- via SSR, so we expose SELECT to authenticated and write via service_role).
ALTER TABLE public.budget_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'budget_cache'
      AND policyname = 'budget_cache_authenticated_read'
  ) THEN
    CREATE POLICY budget_cache_authenticated_read ON public.budget_cache
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

GRANT SELECT ON public.budget_cache TO authenticated;
GRANT ALL ON public.budget_cache TO service_role;

NOTIFY pgrst, 'reload schema';
