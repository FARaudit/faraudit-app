-- Lock-in data fields for audits + document_type for opportunity feed.
-- Apply via Supabase Studio SQL editor on apex-production.
-- Idempotent: safe to re-run.

-- ── audits — operator-owned annotations + bid lifecycle ──
ALTER TABLE audits ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS ko_contacted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS ko_contact_date TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS bid_submitted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS bid_submit_date TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('won','lost','pending','no-bid'));
ALTER TABLE audits ADD COLUMN IF NOT EXISTS outcome_date TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS team_assignee TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;

-- ── pending_audits — document_type so the IDIQ filter has something to read ──
ALTER TABLE pending_audits ADD COLUMN IF NOT EXISTS document_type TEXT;

-- Helpful indexes for the new filterable columns.
CREATE INDEX IF NOT EXISTS audits_outcome_idx       ON audits (outcome);
CREATE INDEX IF NOT EXISTS audits_team_assignee_idx ON audits (team_assignee);
CREATE INDEX IF NOT EXISTS pa_document_type_idx     ON pending_audits (document_type);
