-- 020 · pending_audits · risk_level + response_deadline.
-- Two columns added together because they're load-bearing for the same
-- view-time logic: classifyRisk persists a static verdict (DFARS keyword
-- hits, document_type, set-aside cross-checks) into risk_level; the UI
-- combines that with the live response_deadline to escalate ≤7d / ≤3d
-- rows at render time. Without the deadline column we'd ship the same
-- "stale at ingest" failure mode P0-A just fixed for compliance audits.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on
-- apex-production.

ALTER TABLE pending_audits
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pending_audits_risk_level
  ON pending_audits(risk_level)
  WHERE risk_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_audits_response_deadline
  ON pending_audits(response_deadline)
  WHERE response_deadline IS NOT NULL;

NOTIFY pgrst, 'reload schema';
