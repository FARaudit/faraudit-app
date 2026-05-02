-- Track 1 platform intelligence — protest · CMMC · win probability · labor · subcon · billing.
-- Apply via Supabase Studio SQL editor on apex-production.
-- Idempotent: safe to re-run. Run AFTER 004_incumbent_capability.sql.

-- ─── WIN PROBABILITY on audits ─────────────────────────────────
ALTER TABLE audits ADD COLUMN IF NOT EXISTS win_probability NUMERIC(5, 2);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS win_probability_basis INT;
CREATE INDEX IF NOT EXISTS au_win_prob_idx ON audits (win_probability DESC NULLS LAST);

-- ─── GAO PROTEST DECISIONS cache ────────────────────────────────
-- Populated by /api/protest-intel from GAO public decisions; one row per
-- docket. Used to compute per-agency protest risk + sustained rate.
CREATE TABLE IF NOT EXISTS protest_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  docket TEXT NOT NULL UNIQUE,
  decision_date DATE,
  agency TEXT,
  protester TEXT,
  solicitation TEXT,
  ground TEXT,
  outcome TEXT, -- 'sustained' | 'denied' | 'dismissed' | 'withdrawn'
  decision_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protest_agency_idx   ON protest_decisions (agency);
CREATE INDEX IF NOT EXISTS protest_outcome_idx  ON protest_decisions (outcome);
CREATE INDEX IF NOT EXISTS protest_date_idx     ON protest_decisions (decision_date DESC NULLS LAST);

-- ─── REGULATORY UPDATES cache ───────────────────────────────────
-- Populated by /api/regulatory-updates pulling from acquisition.gov + Federal Register.
CREATE TABLE IF NOT EXISTS regulatory_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,        -- 'far' | 'dfars' | 'federal_register'
  clause TEXT,                 -- e.g. "FAR 52.219-14"
  title TEXT NOT NULL,
  summary TEXT,
  effective_date DATE,
  link TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  affects_clauses TEXT[] NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, link)
);
CREATE INDEX IF NOT EXISTS reg_clause_idx     ON regulatory_updates (clause);
CREATE INDEX IF NOT EXISTS reg_published_idx  ON regulatory_updates (published_at DESC NULLS LAST);

-- ─── SUBCONTRACT OPPORTUNITIES cache ───────────────────────────
CREATE TABLE IF NOT EXISTS subcontract_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prime_uei TEXT,
  prime_name TEXT NOT NULL,
  contract_value BIGINT,
  naics_code TEXT,
  agency TEXT,
  set_aside_required TEXT,
  sblo_name TEXT,
  sblo_email TEXT,
  sblo_phone TEXT,
  expiration DATE,
  source_url TEXT,
  notes TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prime_uei, naics_code, expiration)
);
CREATE INDEX IF NOT EXISTS sub_naics_idx   ON subcontract_opportunities (naics_code);
CREATE INDEX IF NOT EXISTS sub_agency_idx  ON subcontract_opportunities (agency);
CREATE INDEX IF NOT EXISTS sub_expiry_idx  ON subcontract_opportunities (expiration);

-- ─── LABOR RATE BENCHMARKS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS labor_rate_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naics_code TEXT,
  agency TEXT,
  contract_type TEXT,
  location TEXT,                -- ZIP / state / "national"
  labor_category TEXT NOT NULL, -- e.g. "Mechanical Engineer III"
  rate_low NUMERIC(8, 2),
  rate_median NUMERIC(8, 2),
  rate_high NUMERIC(8, 2),
  source TEXT,                  -- 'wage_determination' | 'corpus' | 'sca'
  source_ref TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS labor_naics_idx     ON labor_rate_benchmarks (naics_code);
CREATE INDEX IF NOT EXISTS labor_category_idx  ON labor_rate_benchmarks (labor_category);

-- ─── SUBSCRIPTIONS — Stripe billing ────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  tier TEXT,                    -- 'design_partner' | 'standard' | 'growth'
  status TEXT,                  -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  raw_event JSONB,              -- last full event payload for debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sub_user_idx      ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS sub_status_idx    ON subscriptions (status);
CREATE INDEX IF NOT EXISTS sub_period_idx    ON subscriptions (current_period_end);
