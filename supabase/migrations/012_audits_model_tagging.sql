-- 012 · audits.model_used + audits.model_version — model tagging for the
-- Sonnet 4.6 default rollout (audit-ai · May 4 2026 coordinated change).
--
-- Every persisted audit now records the model that produced it. Lets us
-- empirically validate Sonnet quality against any customer-flagged audit
-- without re-running the engine. retry_escalations (when present in
-- model_version) tells us which calls fell through to the Opus retry path —
-- expected to be ~2% of audits in steady state.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS model_used TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS model_version TEXT;

CREATE INDEX IF NOT EXISTS audits_model_used_idx ON audits (model_used);

NOTIFY pgrst, 'reload schema';
