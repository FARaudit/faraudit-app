-- 017_audits_owner_policies.sql
-- Closes the IDOR exposure on public.audits verified 2026-05-05: the
-- existing `authenticated_read` policy USING (auth.role() = 'authenticated')
-- let any logged-in user read every user's audits. Replaces with
-- owner-scoped policies. Service-role policy left alone (Railway
-- workers continue to write/read via service_role).
--
-- Adds RLS + owner policies on public.subscriptions (was wide open —
-- billing data).
--
-- Sibling-table decisions (see diagnosis 2026-05-05):
--   pending_audits        — no user_id column; queue is system-owned.
--                           Migration 011's authenticated_read stays.
--   audit_outcomes        — already owner-scoped in 015. No-op.
--   audit_award_signals   — no user_id column (cross-customer signal
--                           pool, intentionally global). No-op.
--
-- Data-side note: 48 of 52 audits have user_id IS NULL (Audit-AI cron
-- corpus rows written via service_role). Post-migration those rows are
-- invisible to authenticated users by design — they are not
-- customer-owned. Service-role queries still see them.

-- ── public.audits ────────────────────────────────────────────────
DROP POLICY IF EXISTS authenticated_read   ON public.audits;
DROP POLICY IF EXISTS authenticated_insert ON public.audits;
DROP POLICY IF EXISTS authenticated_update ON public.audits;

CREATE POLICY audits_owner_read ON public.audits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY audits_owner_insert ON public.audits
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY audits_owner_update ON public.audits
  FOR UPDATE TO authenticated
  USING       (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

-- ── public.subscriptions ─────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_owner_read       ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_owner_insert     ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_owner_update     ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_service_role_all ON public.subscriptions;

CREATE POLICY subscriptions_owner_read ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subscriptions_owner_insert ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_owner_update ON public.subscriptions
  FOR UPDATE TO authenticated
  USING       (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

-- Stripe webhook writes via service_role; explicit ALL policy so the
-- table keeps working even if FORCE ROW LEVEL SECURITY is later set.
CREATE POLICY subscriptions_service_role_all ON public.subscriptions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
