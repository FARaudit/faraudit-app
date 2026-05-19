ALTER TABLE audits ADD COLUMN IF NOT EXISTS in_pipeline boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_audits_in_pipeline ON audits(in_pipeline) WHERE in_pipeline = true;
