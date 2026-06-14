-- FA-160: real-time stage progress telemetry on audits.
-- Stage keys mirror the UI progress indicator (5 stages):
--   retrieval → extraction → risk → verdict → assembly → complete
-- Additive + nullable: existing rows stay NULL (renderer falls back to stage 1).

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS current_stage text
    CHECK (current_stage IN ('retrieval','extraction','risk','verdict','assembly','complete')),
  ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz;

COMMENT ON COLUMN audits.current_stage IS
  'FA-160: real-time audit stage. retrieval→extraction→risk→verdict→assembly→complete. NULL on pre-FA-160 rows.';
