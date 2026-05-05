-- 014_audit_award_signals_security_definer.sql
-- Phase 1 of the Layer 3 unblock (May 5 2026).
--
-- Problem: emit_audit_award_signal() trigger (defined in migration 006)
-- fires AFTER UPDATE OF outcome on audits. When the customer drags an
-- audit card to AWARDED on /home#pipeline, PATCH /api/audit/[id]/lifecycle
-- updates audits.outcome='won' under the user's auth context. The
-- trigger then INSERTs into audit_award_signals — also under user auth.
-- That table has RLS enabled but no INSERT policy, so the insert is
-- denied with: "new row violates row-level security policy for table
-- audit_award_signals". Surfaces to user as 503 from /lifecycle.
--
-- Fix: re-create emit_audit_award_signal() as SECURITY DEFINER so it
-- runs as the function owner (postgres / table owner) and bypasses RLS.
-- This is safe because audit_award_signals is anonymized market signal
-- data (NAICS, agency, award value, awardee name from public solicitation
-- data) — no per-customer private fields. SET search_path = public is
-- the standard hardening to prevent SECURITY DEFINER search_path attacks.
--
-- Idempotent: CREATE OR REPLACE replaces the existing function in place.
-- Trigger binding does not need re-creation; the trigger references the
-- function by name and picks up the new body automatically.

CREATE OR REPLACE FUNCTION emit_audit_award_signal() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ov JSONB;
  company TEXT;
  award_val BIGINT;
BEGIN
  IF NEW.outcome = 'won' AND (OLD.outcome IS DISTINCT FROM NEW.outcome) THEN
    ov := COALESCE(NEW.overview_json, '{}'::jsonb);
    company := COALESCE(ov->>'awardee_name', ov->>'awarded_to', NULL);
    BEGIN
      award_val := NULLIF(ov->>'ceiling_value_estimate', '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      award_val := NULL;
    END;

    INSERT INTO audit_award_signals (
      audit_id, notice_id, agency, naics_code,
      award_company_name, award_value, award_date
    ) VALUES (
      NEW.id, NEW.notice_id, NEW.agency, NEW.naics_code,
      company, award_val, COALESCE(NEW.outcome_date, CURRENT_DATE)
    );
  END IF;
  RETURN NEW;
END;
$$;
