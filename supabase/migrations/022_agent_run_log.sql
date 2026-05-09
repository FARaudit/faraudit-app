-- Migration 022: agent_run_log table
-- One row per agent execution. Powers the Logs sub-view (agents-view-5) and
-- feeds the per-agent cost ledger (Phase B replacement for estimate-only
-- entries in agent_fleet_status.cost_per_day_usd).
-- Depends on 021_agent_fleet_status.sql.

CREATE TABLE IF NOT EXISTS public.agent_run_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name                  TEXT NOT NULL REFERENCES public.agent_fleet_status(agent_name) ON DELETE CASCADE,
  run_started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_completed_at            TIMESTAMPTZ,
  status                      TEXT NOT NULL CHECK (status IN ('success','failure','timeout','partial')),
  cost_usd                    NUMERIC(8,4) DEFAULT 0,
  input_tokens                INTEGER DEFAULT 0,
  output_tokens               INTEGER DEFAULT 0,
  model_used                  TEXT,
  error_message               TEXT,
  metadata                    JSONB DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.agent_run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_run_log_read_all ON public.agent_run_log;
CREATE POLICY agent_run_log_read_all ON public.agent_run_log
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_agent_run_log_agent_started
  ON public.agent_run_log (agent_name, run_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_run_log_started
  ON public.agent_run_log (run_started_at DESC);
