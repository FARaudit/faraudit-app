-- Migration 021: agent_fleet_status table
-- Source of truth for the digest Agents tab Fleet sub-view (panel-agents/agents-view-1).
-- One row per agent across live/queued/retired states.
-- Phase B Agents tab wiring · authored May 8 2026 evening.

CREATE TABLE IF NOT EXISTS public.agent_fleet_status (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name                  TEXT NOT NULL UNIQUE,
  status                      TEXT NOT NULL CHECK (status IN ('live','queued','retired')),
  vertical                    TEXT,
  last_tick_at                TIMESTAMPTZ,
  expected_cadence_seconds    INTEGER,
  cost_per_day_usd            NUMERIC(8,4) DEFAULT 0,
  skills_present              JSONB DEFAULT '[]'::jsonb,
  skills_missing              JSONB DEFAULT '[]'::jsonb,
  notes                       TEXT,
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_agent_fleet_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_fleet_status_updated_at ON public.agent_fleet_status;
CREATE TRIGGER agent_fleet_status_updated_at
  BEFORE UPDATE ON public.agent_fleet_status
  FOR EACH ROW EXECUTE FUNCTION public.set_agent_fleet_status_updated_at();

ALTER TABLE public.agent_fleet_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_fleet_status_read_all ON public.agent_fleet_status;
CREATE POLICY agent_fleet_status_read_all ON public.agent_fleet_status
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_agent_fleet_status_status_name
  ON public.agent_fleet_status (status, agent_name);
