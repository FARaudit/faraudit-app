ALTER TABLE pending_audits
  ADD COLUMN IF NOT EXISTS in_pipeline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watched     boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pending_audits_pipeline ON pending_audits(in_pipeline) WHERE in_pipeline = true;
CREATE INDEX IF NOT EXISTS idx_pending_audits_watched  ON pending_audits(watched)     WHERE watched = true;
