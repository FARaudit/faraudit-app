-- FARaudit Audit Corpus
-- The data moat. Every audit result stored permanently.
-- This table compounds in value with every audit run.

CREATE TABLE IF NOT EXISTS audit_corpus (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  audit_date              DATE NOT NULL,
  solicitation_number     TEXT NOT NULL UNIQUE,
  agency                  TEXT,
  contracting_office      TEXT,
  naics_code              TEXT,
  contract_vehicle        TEXT,
  set_aside_type          TEXT,
  estimated_value         NUMERIC,
  issue_date              DATE,
  close_date              DATE,
  product_service_code    TEXT,
  ko_name                 TEXT,
  ko_email                TEXT,
  ko_phone                TEXT,
  ko_response_rate        NUMERIC,
  document_type           TEXT,
  clin_count              INTEGER,
  clin_types              JSONB,
  ambiguities_found       INTEGER DEFAULT 0,
  ambiguity_details       JSONB,
  dfars_clauses_detected  TEXT[],
  far_clauses_detected    TEXT[],
  compliance_traps_count  INTEGER DEFAULT 0,
  compliance_traps        JSONB,
  risk_score_p0           INTEGER DEFAULT 0,
  risk_score_p1           INTEGER DEFAULT 0,
  risk_score_p2           INTEGER DEFAULT 0,
  executive_risk_summary  TEXT,
  section_l_requirements  JSONB,
  section_m_factors       JSONB,
  audit_duration_seconds  NUMERIC,
  model_used              TEXT DEFAULT 'claude-sonnet-4-20250514',
  award_date              DATE,
  award_amount            NUMERIC,
  awardee_name            TEXT,
  awardee_naics           TEXT,
  win_loss                TEXT,
  source                  TEXT DEFAULT 'autonomous',
  customer_id             UUID
);

CREATE INDEX IF NOT EXISTS idx_corpus_agency ON audit_corpus(agency);
CREATE INDEX IF NOT EXISTS idx_corpus_naics ON audit_corpus(naics_code);
CREATE INDEX IF NOT EXISTS idx_corpus_set_aside ON audit_corpus(set_aside_type);
CREATE INDEX IF NOT EXISTS idx_corpus_close_date ON audit_corpus(close_date);
CREATE INDEX IF NOT EXISTS idx_corpus_ko_email ON audit_corpus(ko_email);
CREATE INDEX IF NOT EXISTS idx_corpus_source ON audit_corpus(source);

CREATE TABLE IF NOT EXISTS ko_intelligence (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ko_email        TEXT UNIQUE NOT NULL,
  ko_name         TEXT,
  agency          TEXT,
  contracting_office TEXT,
  total_solicitations INTEGER DEFAULT 0,
  questions_answered  INTEGER DEFAULT 0,
  response_rate   NUMERIC GENERATED ALWAYS AS (
    CASE WHEN total_solicitations > 0
    THEN questions_answered::NUMERIC / total_solicitations
    ELSE 0 END
  ) STORED,
  avg_response_days NUMERIC,
  last_active     DATE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agency_intelligence (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency          TEXT UNIQUE NOT NULL,
  total_solicitations INTEGER DEFAULT 0,
  small_business_pct  NUMERIC,
  most_common_naics   TEXT[],
  most_common_dfars   TEXT[],
  avg_contract_value  NUMERIC,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE ko_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read corpus" ON audit_corpus
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      source = 'autonomous' OR
      customer_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access audit_corpus" ON audit_corpus
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read ko_intelligence" ON ko_intelligence
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access ko_intelligence" ON ko_intelligence
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read agency_intelligence" ON agency_intelligence
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access agency_intelligence" ON agency_intelligence
  USING (auth.role() = 'service_role');

COMMENT ON TABLE audit_corpus IS 'FARaudit data moat. Every audit result stored permanently. Compounds in intelligence value with every audit run.';
