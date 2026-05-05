-- 015_audit_outcomes.sql
-- Phase 2 of the Layer 3 unblock (May 5 2026).
--
-- Layer 3 outcome corpus — the moat. Captures the rich, per-customer
-- data needed to train per-customer win-probability models and to
-- compound a proprietary outcome dataset over 2 years that doesn't
-- exist anywhere else in defense subcontracting:
--   - margin estimated vs actual
--   - CPARS rating
--   - customer relationship strength
--   - win/loss reasoning
--   - lessons learned
--
-- Separate from audit_award_signals (anonymized market data → Bullrize
-- four-factor cross-reference). Two tables, two purposes:
--   audit_award_signals : public-side signals, RLS bypass via trigger
--   audit_outcomes      : customer-private rich outcome data,
--                         RLS-protected by user_id = auth.uid()
--
-- One row per audit (UNIQUE on audit_id); UPSERT on conflict.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- Re-running this migration is safe.

CREATE TABLE IF NOT EXISTS audit_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),

  outcome text NOT NULL CHECK (outcome IN ('tracking','bidding','submitted','awarded','lost','withdrawn')),
  outcome_recorded_at timestamptz NOT NULL DEFAULT now(),

  margin_estimated_pct numeric(5,2),
  margin_actual_pct numeric(5,2),
  contract_value_actual numeric(14,2),

  cpars_rating int CHECK (cpars_rating BETWEEN 1 AND 5),
  customer_relationship_strength text CHECK (customer_relationship_strength IN ('cold','warm','strong','strategic')),

  win_reason text,
  lost_to_competitor text,
  lost_reason_category text CHECK (lost_reason_category IN ('price','technical','past_performance','timing','relationships','other')),
  lessons_learned text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_outcomes_audit_id_unique
  ON audit_outcomes(audit_id);

CREATE INDEX IF NOT EXISTS audit_outcomes_user_id_idx
  ON audit_outcomes(user_id);

CREATE INDEX IF NOT EXISTS audit_outcomes_outcome_idx
  ON audit_outcomes(outcome);

ALTER TABLE audit_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_outcomes_owner_select ON audit_outcomes;
CREATE POLICY audit_outcomes_owner_select ON audit_outcomes
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS audit_outcomes_owner_insert ON audit_outcomes;
CREATE POLICY audit_outcomes_owner_insert ON audit_outcomes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS audit_outcomes_owner_update ON audit_outcomes;
CREATE POLICY audit_outcomes_owner_update ON audit_outcomes
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS audit_outcomes_owner_delete ON audit_outcomes;
CREATE POLICY audit_outcomes_owner_delete ON audit_outcomes
  FOR DELETE USING (user_id = auth.uid());

-- updated_at maintenance trigger (kept private to this table; not using
-- the moddatetime extension to avoid an extension dependency).
CREATE OR REPLACE FUNCTION audit_outcomes_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_outcomes_updated_at ON audit_outcomes;
CREATE TRIGGER audit_outcomes_updated_at
  BEFORE UPDATE ON audit_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION audit_outcomes_set_updated_at();
