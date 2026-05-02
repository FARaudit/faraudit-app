-- Intelligence layer — KO relationships + pre-sol/sources-sought feed.
-- Apply via Supabase Studio SQL editor on apex-production.
-- Idempotent: safe to re-run. Run AFTER 002_audits_lockin.sql.

-- ─── KO INTELLIGENCE ────────────────────────────────────────────
-- Auto-populated from audit results; updated by /api/ko-intelligence
-- and audit-ai when ko_email is extracted from a solicitation.
CREATE TABLE IF NOT EXISTS ko_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ko_email TEXT NOT NULL,
  ko_name TEXT,
  ko_phone TEXT,
  agency TEXT,
  agency_office TEXT,
  naics_codes TEXT[] DEFAULT '{}',
  -- Aggregate metrics, recomputed on every audit + email send.
  solicitations_issued INT NOT NULL DEFAULT 0,
  questions_asked INT NOT NULL DEFAULT 0,
  questions_answered INT NOT NULL DEFAULT 0,
  avg_response_days NUMERIC(6, 2),
  last_contact TIMESTAMPTZ,
  last_solicitation_id UUID,
  -- Operator notes — never overwritten by automation.
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ko_intelligence_email_unique UNIQUE (ko_email)
);

CREATE INDEX IF NOT EXISTS ko_intel_agency_idx       ON ko_intelligence (agency);
CREATE INDEX IF NOT EXISTS ko_intel_last_contact_idx ON ko_intelligence (last_contact DESC NULLS LAST);

-- ─── PRE-SOL / SOURCES-SOUGHT FEED ─────────────────────────────
-- sam-ingest writes one of: 'solicitation' | 'pre_sol' | 'sources_sought' | 'recompete'.
-- Existing rows default to 'solicitation'.
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS notice_type TEXT
  CHECK (notice_type IS NULL OR notice_type IN ('solicitation','pre_sol','sources_sought','recompete'));

UPDATE pending_audits SET notice_type = 'solicitation'
  WHERE notice_type IS NULL;

CREATE INDEX IF NOT EXISTS pa_notice_type_idx ON pending_audits (notice_type);

-- Recompete linkage — back-pointer to the won audit so the worker doesn't re-emit.
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS recompete_origin_audit UUID REFERENCES audits(id);
CREATE INDEX IF NOT EXISTS pa_recompete_origin_idx ON pending_audits (recompete_origin_audit);

-- ─── RFI RESPONSES (Pre-sol upstream) ───────────────────────────
CREATE TABLE IF NOT EXISTS rfi_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_audit_id UUID REFERENCES pending_audits(id) ON DELETE CASCADE,
  notice_id TEXT NOT NULL,
  notice_type TEXT,
  response_draft TEXT NOT NULL,
  -- When the final solicitation drops, audit-ai links it back here.
  matched_audit_id UUID REFERENCES audits(id),
  match_score NUMERIC(4, 2),
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfi_notice_idx     ON rfi_responses (notice_id);
CREATE INDEX IF NOT EXISTS rfi_user_idx       ON rfi_responses (user_id);
CREATE INDEX IF NOT EXISTS rfi_pending_idx    ON rfi_responses (pending_audit_id);
