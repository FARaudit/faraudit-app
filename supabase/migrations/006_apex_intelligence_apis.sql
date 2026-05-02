-- Apex Intelligence — full API utilization layer.
-- Apply via Supabase Studio SQL editor on apex-production.
-- Idempotent: safe to re-run. Run AFTER 005_platform_intelligence.sql.

-- ─── CONGRESSIONAL BUDGET ──────────────────────────────────────
-- Pulled from api.congress.gov by /api/congress.
CREATE TABLE IF NOT EXISTS congressional_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  congress INT NOT NULL,
  bill_type TEXT NOT NULL,        -- 'hr' | 's' | 'sjres'
  bill_number INT NOT NULL,
  title TEXT,
  sponsor_name TEXT,
  sponsor_party TEXT,
  introduced_date DATE,
  latest_action_date DATE,
  latest_action_text TEXT,
  is_ndaa BOOLEAN NOT NULL DEFAULT false,
  is_appropriations BOOLEAN NOT NULL DEFAULT false,
  defense_focus BOOLEAN NOT NULL DEFAULT false,
  url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cong_bill_unique UNIQUE (congress, bill_type, bill_number)
);
CREATE INDEX IF NOT EXISTS cong_ndaa_idx          ON congressional_bills (is_ndaa);
CREATE INDEX IF NOT EXISTS cong_approp_idx        ON congressional_bills (is_appropriations);
CREATE INDEX IF NOT EXISTS cong_latest_action_idx ON congressional_bills (latest_action_date DESC NULLS LAST);

-- ─── SAM.gov WAGE DETERMINATIONS ───────────────────────────────
-- Pulled from api.sam.gov/wages/v2 by /api/labor-rates.
CREATE TABLE IF NOT EXISTS wage_rate_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_number TEXT NOT NULL,        -- WD revision number, e.g. "1976-0153 (Rev-26)"
  state TEXT,
  county TEXT,
  naics_code TEXT,
  labor_category TEXT NOT NULL,
  hourly_rate NUMERIC(8, 2),
  fringe_rate NUMERIC(8, 2),
  effective_date DATE,
  expiration_date DATE,
  source_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wage_unique UNIQUE (wd_number, labor_category, state)
);
CREATE INDEX IF NOT EXISTS wage_naics_idx    ON wage_rate_cache (naics_code);
CREATE INDEX IF NOT EXISTS wage_state_idx    ON wage_rate_cache (state);
CREATE INDEX IF NOT EXISTS wage_category_idx ON wage_rate_cache (labor_category);

-- ─── FOUR-FACTOR SIGNAL HANDOFF ─────────────────────────────────
-- When a customer marks audits.outcome='won', a row is emitted here for
-- the Bullrize four-factor model to pick up. Bullrize polls this table,
-- runs ticker cross-reference + Form4/dark-pool/options confirmation,
-- and writes the resulting HIGH_CONVICTION signal back to its own
-- signal_corpus with factor_contract_award=true.
CREATE TABLE IF NOT EXISTS audit_award_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  notice_id TEXT,
  agency TEXT,
  naics_code TEXT,
  award_company_name TEXT,        -- best-effort extraction from audit_result
  award_company_ticker_hint TEXT, -- if we can guess a ticker; null otherwise
  award_value BIGINT,
  award_date DATE,
  cross_reference_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'no_match' | 'private_co'
  bullrize_signal_id UUID,        -- FK to bullrize.signal_corpus once confirmed (cross-DB, just an id reference)
  confirmed_factors INT NOT NULL DEFAULT 1,  -- contract_award alone = 1
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS aas_status_idx     ON audit_award_signals (cross_reference_status);
CREATE INDEX IF NOT EXISTS aas_audit_idx      ON audit_award_signals (audit_id);
CREATE INDEX IF NOT EXISTS aas_emitted_idx    ON audit_award_signals (emitted_at DESC);

-- Trigger: when audits.outcome flips to 'won', emit a pending signal row.
CREATE OR REPLACE FUNCTION emit_audit_award_signal() RETURNS TRIGGER AS $$
DECLARE
  ov JSONB;
  company TEXT;
  award_val BIGINT;
BEGIN
  IF NEW.outcome = 'won' AND (OLD.outcome IS DISTINCT FROM NEW.outcome) THEN
    ov := COALESCE(NEW.overview_json, '{}'::jsonb);
    company := COALESCE(ov->>'awardee_name', ov->>'awarded_to', NULL);
    BEGIN
      award_val := NULLIF(ov->>'ceiling_value_estimate', '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      award_val := NULL;
    END;

    INSERT INTO audit_award_signals (
      audit_id, notice_id, agency, naics_code,
      award_company_name, award_value, award_date
    ) VALUES (
      NEW.id, NEW.notice_id, NEW.agency, NEW.naics_code,
      company, award_val, COALESCE(NEW.outcome_date, CURRENT_DATE)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audits_emit_award_signal ON audits;
CREATE TRIGGER audits_emit_award_signal
  AFTER UPDATE OF outcome ON audits
  FOR EACH ROW
  EXECUTE FUNCTION emit_audit_award_signal();

-- ─── INCUMBENT SOURCE TRACKING ──────────────────────────────────
-- pending_audits + audits already have incumbent_* columns from migration 004.
-- Add a source-of-truth field so /api/incumbent can record whether the data
-- came from FPDS-NG (preferred) or USAspending (fallback).
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS incumbent_source TEXT;
ALTER TABLE audits         ADD COLUMN IF NOT EXISTS incumbent_source TEXT;
