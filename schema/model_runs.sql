-- Versioned intelligence table.
-- Every AI output anywhere in the empire writes a row here so we can:
--   1. Re-run historical analyses against a newer model and report delta
--   2. Audit which model produced a given conviction score / brief / classification
--   3. Cost / latency telemetry per provider over time
--
-- Apply against bullrize-production, apex-production (faraudit), and
-- lexanchor-production. Service-role writes; user-scoped reads.

CREATE TABLE IF NOT EXISTS model_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  surface       TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  prompt_hash   TEXT,
  input_tokens  INT,
  output_tokens INT,
  latency_ms    INT,
  output_text   TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS model_runs_user_idx ON model_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS model_runs_surface_idx ON model_runs (surface, created_at DESC);

ALTER TABLE model_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_read_own_runs ON model_runs;
CREATE POLICY users_read_own_runs ON model_runs
  FOR SELECT USING (auth.uid() = user_id);
