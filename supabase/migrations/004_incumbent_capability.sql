-- Tier 1 intelligence — incumbent enrichment + capability statements.
-- Apply via Supabase Studio SQL editor on apex-production.
-- Idempotent: safe to re-run. Run AFTER 003_intelligence_layer.sql.

-- ─── INCUMBENT FIELDS ON pending_audits + audits ────────────────
-- Populated by /api/incumbent/[notice_id] which queries USAspending.gov
-- and writes back to whichever row is active.
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS incumbent_name TEXT;
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS incumbent_award_value BIGINT;
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS incumbent_expiry DATE;
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS incumbent_uei TEXT;
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS incumbent_lookup_at TIMESTAMPTZ;

ALTER TABLE audits ADD COLUMN IF NOT EXISTS incumbent_name TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS incumbent_award_value BIGINT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS incumbent_expiry DATE;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS incumbent_uei TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS incumbent_lookup_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pa_incumbent_name_idx ON pending_audits (incumbent_name);
CREATE INDEX IF NOT EXISTS au_incumbent_name_idx ON audits         (incumbent_name);

-- ─── CAPABILITY STATEMENTS ──────────────────────────────────────
-- One per user. Auto-populated from NAICS/certifications + won audits.
CREATE TABLE IF NOT EXISTS capability_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  company_name TEXT,
  uei TEXT,
  cage_code TEXT,
  duns TEXT,
  naics_codes TEXT[] NOT NULL DEFAULT '{}',
  certifications TEXT[] NOT NULL DEFAULT '{}',
  -- Free-text sections, operator-edited.
  core_competencies TEXT,
  differentiators TEXT,
  -- Contact block.
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_website TEXT,
  contact_address TEXT,
  -- Past performance: list of {audit_id, agency, contract_value, period} objects.
  past_performance JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cap_user_idx ON capability_statements (user_id);

-- ─── BUDGET PROGRAM SNAPSHOTS (cache) ────────────────────────────
-- /api/budget caches USAspending agency-NAICS rollups here so the dashboard
-- isn't hammering the public API on every load. Refreshed daily.
CREATE TABLE IF NOT EXISTS budget_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INT NOT NULL,
  agency TEXT NOT NULL,
  naics_code TEXT,
  obligated_amount BIGINT NOT NULL DEFAULT 0,
  prior_year_amount BIGINT,
  delta_pct NUMERIC(6, 2),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT budget_snapshot_unique UNIQUE (fiscal_year, agency, naics_code)
);

CREATE INDEX IF NOT EXISTS budget_fy_idx       ON budget_snapshots (fiscal_year DESC);
CREATE INDEX IF NOT EXISTS budget_agency_idx   ON budget_snapshots (agency);
CREATE INDEX IF NOT EXISTS budget_naics_idx    ON budget_snapshots (naics_code);
